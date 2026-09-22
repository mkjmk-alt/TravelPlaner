package com.travelplaner.nativepreview

import androidx.lifecycle.SavedStateHandle
import com.travelplaner.nativepreview.data.TripRepository
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.ui.TripBackupViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.*
import org.junit.Assert.*
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class TripBackupViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }
    private class Repository : TripRepository {
        override suspend fun listSavedPlaces() = emptyList<SavedPlaceDocument>()
        override suspend fun savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String): SavedPlaceDocument = error("unused")
        override suspend fun deleteSavedPlace(id: String): Unit = error("unused")
        override suspend fun list() = emptyList<TripDocument>()
        override suspend fun create(draft: TripDraft, id: String): TripDocument = error("unused")
        override suspend fun edit(id: String, draft: TripDraft): TripDocument = error("unused")
        override suspend fun applyMemoryChange(tripID: String, change: MemoryChange): TripDocument = error("unused")
        override suspend fun applySchedule(tripID: String, change: ScheduleChange): TripDocument = error("unused")
        override suspend fun upsertExpense(tripID: String, expenseID: String, fields: JsonObject): TripDocument = error("unused")
        override suspend fun deleteExpense(tripID: String, expenseID: String): TripDocument = error("unused")
        override suspend fun updateBudgetSettings(tripID: String, values: JsonObject): TripDocument = error("unused")
        override suspend fun updateSettlementParticipants(tripID: String, participants: JsonArray): TripDocument = error("unused")
        override suspend fun prepareImport(candidate: ImportCandidate) = ImportPreview(candidate, ImportDisposition.NewTrip, candidate.trip.id, null, null)
        override suspend fun commitImport(preview: ImportPreview, decision: ImportDecision): ImportOutcome = throw IOException("disk full")
    }
    @Test fun importPreviewDoesNotWriteAndFailureKeepsCandidate() = runTest(dispatcher) {
        val model = TripBackupViewModel(Repository(), io = dispatcher)
        model.selectFile { contractBytes("legacy-trip-backup.json") }; advanceUntilIdle()
        assertNotNull(model.state.value.preview); assertNull(model.state.value.message)
        model.confirmImport(); advanceUntilIdle()
        assertNotNull(model.state.value.error); assertNotNull(model.state.value.preview); assertNull(model.state.value.message)
        assertFalse(model.state.value.busy)
        model.cancelPreview(); assertNull(model.state.value.preview)
        model.selectFile { "bad".encodeToByteArray() }; advanceUntilIdle()
        assertNotNull(model.state.value.error); assertNull(model.state.value.preview)
    }
    @Test fun exportOnlyReportsSuccessAfterWriterAndCancellationDoesNotSucceed() = runTest(dispatcher) {
        val model = TripBackupViewModel(Repository(), io = dispatcher)
        val trip = TripBackup.decode(contractBytes("schedule-edit.json")).trip
        model.requestExport(trip); advanceUntilIdle()
        assertTrue(model.state.value.exportReady); assertNull(model.state.value.message)
        model.cancelExport(); assertNull(model.state.value.message)
        model.requestExport(trip); advanceUntilIdle()
        model.writeExport { throw IOException("write failed") }; advanceUntilIdle()
        assertNotNull(model.state.value.error); assertNull(model.state.value.message)
        model.writeExport { assertEquals(trip.json, TripBackup.decode(it).trip.json) }; advanceUntilIdle()
        assertNotNull(model.state.value.message)
    }
}
