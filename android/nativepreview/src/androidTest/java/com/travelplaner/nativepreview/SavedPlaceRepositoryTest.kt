package com.travelplaner.nativepreview
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.room.testing.MigrationTestHelper
import com.travelplaner.nativepreview.data.*
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class SavedPlaceRepositoryTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    @get:Rule val migration = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(),TripDatabase::class.java)
    private fun candidate() = TripBackup.decode(InstrumentationRegistry.getInstrumentation().context.assets.open("legacy-trip-backup.json").use { it.readBytes() })
    @Test fun reopenDedupeCopyDeleteAndRetry() = runBlocking {
        val name="saved-${UUID.randomUUID()}.db"; var db=TripDatabase.open(context,name)
        try {
            var repo=RoomTripRepository(db); val trip=candidate().trip; repo.save(trip)
            val selection=PlaceSelection(PlaceReference.Google("place-a")); val draft=PlaceDraft(name="集合場所",memo="사용자 메모")
            val first=repo.savePlace(selection,draft,UUID.randomUUID().toString())
            val again=repo.savePlace(selection,draft.copy(memo="덮어쓰면 안됨"),UUID.randomUUID().toString())
            assertEquals(first.id,again.id); assertEquals("사용자 메모",again.draft.memo)
            repo.savePlace(PlaceSelection(PlaceReference.Google("place-b")),draft,UUID.randomUUID().toString())
            assertEquals(2,repo.listSavedPlaces().size)
            val copyID=UUID.randomUUID().toString()
            val change=ScheduleChange.AddPlace(ScheduleSection.Day(2),copyID,first.draft,first.selection)
            val attached=repo.applySchedule(trip.id,change)
            val item=TripSchedule.items(ScheduleSection.Day(2),attached).last()
            assertEquals("place-a",item["placeId"]!!.jsonPrimitive.content); assertNull(item["lat"]); assertNull(item["lng"])
            assertEquals(attached.json,repo.applySchedule(trip.id,change).json)
            assertTrue(runCatching { repo.applySchedule(trip.id,change.copy(draft=draft.copy(name="conflict"))) }.isFailure)
            repo.deleteSavedPlace(first.id); assertEquals(1,repo.listSavedPlaces().size)
            db.close(); db=TripDatabase.open(context,name); repo=RoomTripRepository(db)
            assertEquals(1,repo.listSavedPlaces().size); assertEquals(attached.json,repo.list().single().json)
            assertEquals(trip.json["expenses"],repo.list().single().json["expenses"])
        } finally { db.close(); context.deleteDatabase(name) }
    }
    @Test fun migrationsFromBothSchemasKeepExactReceiptBytes() = runBlocking {
        for (version in listOf(1,2)) {
            val name="saved-migration-${UUID.randomUUID()}.db"; val c=candidate()
            migration.createDatabase(name,version).apply {
                execSQL("INSERT INTO trips(id,json,updatedAt) VALUES(?,?,?)",arrayOf(c.trip.id,c.trip.toJson(),c.trip.updatedAt))
                if(version==2) execSQL("INSERT INTO import_receipts(sourceHash,sourceBytes,targetID,previousTargetIDs,importedAt) VALUES(?,?,?,?,?)",arrayOf(c.sourceHash,c.sourceBytes,c.trip.id,"[\"old-target\"]",123L))
                close()
            }
            migration.runMigrationsAndValidate(name,3,true,TripDatabase.MIGRATION_1_2,TripDatabase.MIGRATION_2_3).close()
            val db=TripDatabase.open(context,name)
            try {
                val repo=RoomTripRepository(db); assertEquals(c.trip.json,repo.list().single().json)
                if(version==2) {
                    val receipt=db.receipts().find(c.sourceHash)!!
                    assertArrayEquals(c.sourceBytes,receipt.sourceBytes); assertEquals("[\"old-target\"]",receipt.previousTargetIDs); assertEquals(123L,receipt.importedAt)
                    assertEquals(ImportDisposition.AlreadyImported,repo.prepareImport(c).disposition)
                }
                assertTrue(repo.listSavedPlaces().isEmpty())
                repo.savePlace(PlaceSelection(PlaceReference.Unlocated),PlaceDraft(name="이전 이후"),UUID.randomUUID().toString())
                assertEquals(1,repo.listSavedPlaces().size)
            } finally { db.close(); context.deleteDatabase(name) }
        }
    }
    @Test fun failedWriteLeavesOldDataAndRetryWorks() = runBlocking {
        val name="saved-failure-${UUID.randomUUID()}.db"; val db=TripDatabase.open(context,name)
        try {
            val repo=RoomTripRepository(db); val trip=candidate().trip; repo.save(trip)
            db.openHelper.writableDatabase.execSQL("CREATE TRIGGER reject_saved BEFORE INSERT ON saved_places BEGIN SELECT RAISE(ABORT, 'injected'); END")
            val id=UUID.randomUUID().toString()
            assertTrue(runCatching { repo.savePlace(PlaceSelection(PlaceReference.Unlocated),PlaceDraft(name="실패"),id) }.isFailure)
            assertTrue(repo.listSavedPlaces().isEmpty()); assertEquals(trip.json,repo.list().single().json)
            db.openHelper.writableDatabase.execSQL("DROP TRIGGER reject_saved")
            repo.savePlace(PlaceSelection(PlaceReference.Unlocated),PlaceDraft(name="재시도"),id)
            assertEquals(1,repo.listSavedPlaces().size)
            assertTrue(runCatching { repo.savePlace(PlaceSelection(PlaceReference.Google("different")),PlaceDraft(name="다름"),id) }.isFailure)
        } finally { db.close(); context.deleteDatabase(name) }
    }
}
