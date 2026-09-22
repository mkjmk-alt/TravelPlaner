package com.travelplaner.nativepreview

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.room.testing.MigrationTestHelper
import com.travelplaner.nativepreview.data.*
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class TripImportTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    @get:Rule val migration = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), TripDatabase::class.java)
    private fun candidate(name: String = "legacy-trip-backup.json") = TripBackup.decode(InstrumentationRegistry.getInstrumentation().context.assets.open(name).use { it.readBytes() })
    @Test fun importReopenAndRepeatKeepLocalEditsAndReceipt() = runBlocking {
        val name = "import-${UUID.randomUUID()}.db"; var db = TripDatabase.open(context, name)
        try {
            val c = candidate(); var repo = RoomTripRepository(db)
            val first = repo.commitImport(repo.prepareImport(c), ImportDecision.ConfirmNew)
            repo.edit(first.tripID, c.trip.draft.copy(name = "내 수정"))
            db.close(); db = TripDatabase.open(context, name); repo = RoomTripRepository(db)
            assertEquals(ImportDisposition.AlreadyImported, repo.prepareImport(c).disposition)
            val again = repo.commitImport(repo.prepareImport(c), ImportDecision.ConfirmNew)
            assertEquals(first.tripID, again.tripID); assertTrue(again.alreadyImported)
            assertEquals("내 수정", repo.list().single().name)
            assertArrayEquals(c.sourceBytes, db.receipts().find(c.sourceHash)!!.sourceBytes)
        } finally { db.close(); context.deleteDatabase(name) }
    }
    @Test fun conflictKeepBothDeletedRestoreAndStale() = runBlocking {
        val name = "conflict-${UUID.randomUUID()}.db"; val db = TripDatabase.open(context, name)
        try {
            val c = candidate("schedule-edit.json"); val repo = RoomTripRepository(db)
            val stale = repo.prepareImport(c); repo.save(c.trip.edit(c.trip.draft.copy(name = "기존 여행")))
            assertTrue(runCatching { repo.commitImport(stale, ImportDecision.ConfirmNew) }.isFailure)
            val preview = repo.prepareImport(c); assertEquals(ImportDisposition.Conflict, preview.disposition)
            assertTrue(runCatching { repo.commitImport(preview, ImportDecision.ConfirmNew) }.isFailure)
            val copy = repo.commitImport(preview, ImportDecision.KeepBoth)
            assertNotEquals(c.trip.id, copy.tripID); assertEquals(2, repo.list().size)
            assertEquals(copy.tripID, repo.commitImport(repo.prepareImport(c), ImportDecision.ConfirmNew).tripID)
            db.trips().delete(copy.tripID)
            val deleted = repo.prepareImport(c); assertEquals(ImportDisposition.PreviouslyDeleted, deleted.disposition)
            assertTrue(runCatching { repo.commitImport(deleted, ImportDecision.ConfirmNew) }.isFailure)
            val restored = repo.commitImport(deleted, ImportDecision.RestoreDeleted)
            assertNotEquals(copy.tripID, restored.tripID); assertEquals(2, repo.list().size)
            assertTrue(db.receipts().find(c.sourceHash)!!.previousTargetIDs.contains(copy.tripID))
        } finally { db.close(); context.deleteDatabase(name) }
    }
    @Test fun receiptFailureRollsBackTripAndRetryWorks() = runBlocking {
        val name = "atomic-${UUID.randomUUID()}.db"; val db = TripDatabase.open(context, name)
        try {
            val c = candidate(); val repo = RoomTripRepository(db); val preview = repo.prepareImport(c)
            db.openHelper.writableDatabase.execSQL("CREATE TRIGGER fail_receipt BEFORE INSERT ON import_receipts BEGIN SELECT RAISE(ABORT, 'injected'); END")
            assertTrue(runCatching { repo.commitImport(preview, ImportDecision.ConfirmNew) }.isFailure)
            assertTrue(repo.list().isEmpty()); assertNull(db.receipts().find(c.sourceHash))
            db.openHelper.writableDatabase.execSQL("DROP TRIGGER fail_receipt")
            assertTrue(repo.commitImport(preview, ImportDecision.ConfirmNew).created)
        } finally { db.close(); context.deleteDatabase(name) }
    }
    @Test fun migrationPreservesOldPayload() = runBlocking {
        val name = "migration-${UUID.randomUUID()}.db"; val trip = candidate("schedule-edit.json").trip
        migration.createDatabase(name, 1).apply {
            execSQL("INSERT INTO trips(id,json,updatedAt) VALUES(?,?,?)", arrayOf(trip.id, trip.toJson(), trip.updatedAt)); close()
        }
        migration.runMigrationsAndValidate(name, 2, true, TripDatabase.MIGRATION_1_2).close()
        val db = TripDatabase.open(context, name)
        try { assertEquals(trip.json, RoomTripRepository(db).list().single().json) }
        finally { db.close(); context.deleteDatabase(name) }
    }
    @Test fun scheduleReopenAndUnknownSchemaNeverResetData() = runBlocking {
        val name = "schedule-store-${UUID.randomUUID()}.db"; var db = TripDatabase.open(context, name)
        try {
            val trip = candidate("schedule-edit.json").trip; val repo = RoomTripRepository(db)
            repo.save(trip)
            repo.applySchedule(trip.id, ScheduleChange.Move(ScheduleSection.Day(1), ItemKey.Integer(1), ScheduleSection.Reserve))
            repo.applySchedule(trip.id, ScheduleChange.Edit(ScheduleSection.Reserve, ItemKey.Integer(1), PlaceDraft(name = "보존", time = "13:30", memo = "재실행")))
            db.close(); db = TripDatabase.open(context, name)
            val restored = RoomTripRepository(db).list().single()
            assertEquals("재실행", PlaceDraft.from(TripSchedule.items(ScheduleSection.Reserve, restored).last()).memo)
            assertEquals(trip.json["expenses"], restored.json["expenses"])
            db.close()
            android.database.sqlite.SQLiteDatabase.openDatabase(context.getDatabasePath(name).path, null, 0).use { it.execSQL("PRAGMA user_version = 99") }
            db = TripDatabase.open(context, name)
            assertTrue(runCatching { RoomTripRepository(db).list() }.isFailure)
            db.close()
            android.database.sqlite.SQLiteDatabase.openDatabase(context.getDatabasePath(name).path, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY).use { sqlite ->
                sqlite.rawQuery("SELECT json FROM trips WHERE id = ?", arrayOf(trip.id)).use { cursor -> assertTrue(cursor.moveToFirst()); assertEquals(restored.json, TripDocument.parse(cursor.getString(0)).json) }
            }
        } finally { db.close(); context.deleteDatabase(name) }
    }
}
