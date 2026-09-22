package com.travelplaner.nativepreview

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.travelplaner.nativepreview.data.TripDatabase
import com.travelplaner.nativepreview.data.TripEntity
import com.travelplaner.nativepreview.data.RoomTripRepository
import com.travelplaner.nativepreview.domain.TripDocument
import com.travelplaner.nativepreview.domain.TripDraft
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class RoomPersistenceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val draft = TripDraft("오사카 여행", "일본", "2026-10-10", "2026-10-11")

    @Test fun fullContractSurvivesRealDatabaseCloseReopenAndEditing() = runBlocking {
        val name = "persistence-${UUID.randomUUID()}.db"
        val original = TripDocument.parse(InstrumentationRegistry.getInstrumentation().context.assets.open("trip.json").bufferedReader().use { it.readText() })
        var db = TripDatabase.open(context, name)
        try {
            RoomTripRepository(db).save(original)
            db.close()
            db = TripDatabase.open(context, name)
            val repository = RoomTripRepository(db)
            assertEquals(original.json, repository.list().single().json)
            repository.edit(original.id, draft.copy(name = "교토도 함께", endDate = "2026-10-12"))
            db.close()
            db = TripDatabase.open(context, name)
            val restored = RoomTripRepository(db).list().single()
            assertEquals("교토도 함께", restored.name)
            assertEquals(original.json["futureField"], restored.json["futureField"])
            assertEquals(original.json["createdAt"], restored.json["createdAt"])
            assertEquals(original.json["expenses"], restored.json["expenses"])
            assertEquals(3, restored.dayCount)
        } finally { db.close(); context.deleteDatabase(name) }
    }

    @Test fun failedTransactionKeepsOriginalAndCanBeRetried() = runBlocking {
        val name = "failure-${UUID.randomUUID()}.db"
        val db = TripDatabase.open(context, name)
        try {
            val repository = RoomTripRepository(db)
            val trip = repository.create(draft, "stable-id")
            db.openHelper.writableDatabase.execSQL("CREATE TRIGGER fail_write BEFORE UPDATE ON trips BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END")
            val result = runCatching { repository.edit(trip.id, draft.copy(name = "수정")) }
            assertTrue(result.isFailure)
            assertEquals(trip.json, repository.list().single().json)
            db.openHelper.writableDatabase.execSQL("DROP TRIGGER fail_write")
            repository.edit(trip.id, draft.copy(name = "수정"))
            assertEquals("수정", repository.list().single().name)
        } finally { db.close(); context.deleteDatabase(name) }
    }

    @Test fun malformedRecordFailsReadWithoutResettingAnyRows() = runBlocking {
        val name = "corruption-${UUID.randomUUID()}.db"
        var db = TripDatabase.open(context, name)
        try {
            RoomTripRepository(db).create(draft, "valid")
            db.trips().insert(TripEntity("broken", "{not-json", 99))
            assertTrue(runCatching { RoomTripRepository(db).list() }.isFailure)
            db.close()
            db = TripDatabase.open(context, name)
            assertTrue(runCatching { RoomTripRepository(db).list() }.isFailure)
            assertEquals(2, db.trips().list().size)
            assertEquals("{not-json", db.trips().find("broken")!!.json)
            assertEquals("오사카 여행", TripDocument.parse(db.trips().find("valid")!!.json).name)
        } finally { db.close(); context.deleteDatabase(name) }
    }

    @Test fun retryingSameCreateIdIsIdempotentAfterReopen() = runBlocking {
        val name = "retry-${UUID.randomUUID()}.db"
        var db = TripDatabase.open(context, name)
        try {
            val original = RoomTripRepository(db).create(draft, "operation-id")
            db.close()
            db = TripDatabase.open(context, name)
            val repository = RoomTripRepository(db)
            repository.create(draft.copy(name = "재시도"), "operation-id")
            val trip = repository.list().single()
            assertEquals("operation-id", trip.id)
            assertEquals(original.json["createdAt"], trip.json["createdAt"])
            assertEquals("재시도", trip.name)
        } finally { db.close(); context.deleteDatabase(name) }
    }

    @Test fun expenseMutationRoundTripsAndPreservesUneditedTripFields() = runBlocking {
        val name = "expense-${UUID.randomUUID()}.db"
        var db = TripDatabase.open(context, name)
        try {
            val repository = RoomTripRepository(db)
            val trip = repository.create(draft, "expense-trip")
            val saved = repository.upsertExpense(trip.id, "expense-1", buildJsonObject {
                put("amount", 1200); put("currency", "JPY"); put("amountKRW", 10800); put("category", "food")
                put("payerId", "self"); put("participantIds", buildJsonArray { add("self") }); put("futureExpenseField", "keep")
            })
            assertEquals("keep", saved.json["expenses"]!!.jsonArray.single().jsonObject["futureExpenseField"]!!.jsonPrimitive.content)
            assertEquals(trip.json["futureField"], saved.json["futureField"])
            db.close(); db = TripDatabase.open(context, name)
            val reopened = RoomTripRepository(db)
            assertEquals(1, reopened.list().single().json["expenses"]!!.jsonArray.size)
            reopened.deleteExpense(trip.id, "expense-1")
            assertEquals(0, reopened.list().single().json["expenses"]!!.jsonArray.size)
        } finally { db.close(); context.deleteDatabase(name) }
    }
}
