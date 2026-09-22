package com.travelplaner.nativepreview

import androidx.lifecycle.SavedStateHandle
import com.travelplaner.nativepreview.data.TripRepository
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.ui.TripViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class TripViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private class FailingRepository : TripRepository {
        override suspend fun listSavedPlaces() = emptyList<SavedPlaceDocument>()
        override suspend fun savePlace(selection: PlaceSelection, draft: PlaceDraft, id: String): SavedPlaceDocument = throw IOException("disk full")
        override suspend fun deleteSavedPlace(id: String): Unit = throw IOException("disk full")
        var failRead = false
        override suspend fun list(): List<TripDocument> {
            if (failRead) throw IOException("read failure")
            return emptyList()
        }
        override suspend fun create(draft: TripDraft, id: String): TripDocument = throw IOException("disk full")
        override suspend fun edit(id: String, draft: TripDraft): TripDocument = throw IOException("disk full")
        override suspend fun applyMemoryChange(tripID: String, change: MemoryChange): TripDocument = throw IOException("disk full")
        override suspend fun applySchedule(tripID: String, change: ScheduleChange): TripDocument = throw IOException("disk full")
        override suspend fun upsertExpense(tripID: String, expenseID: String, fields: JsonObject): TripDocument = throw IOException("disk full")
        override suspend fun deleteExpense(tripID: String, expenseID: String): TripDocument = throw IOException("disk full")
        override suspend fun updateBudgetSettings(tripID: String, values: JsonObject): TripDocument = throw IOException("disk full")
        override suspend fun updateSettlementParticipants(tripID: String, participants: JsonArray): TripDocument = throw IOException("disk full")
        override suspend fun prepareImport(candidate: ImportCandidate): ImportPreview = throw IOException("disk full")
        override suspend fun commitImport(preview: ImportPreview, decision: ImportDecision): ImportOutcome = throw IOException("disk full")
    }

    @Test fun placeFailureKeepsDraftAndRestoresFromSavedState() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        val model = TripViewModel(FailingRepository(), handle); advanceUntilIdle()
        val key = "place-operation"
        model.openPlace(key, "trip", ScheduleSection.Day(1), null)
        val draft = PlaceDraft(name = "보존", time = "09:30", memo = "원본")
        model.changePlace(key, draft); model.savePlace(key); advanceUntilIdle()
        val editor = model.state.value.placeEditors.getValue(key)
        assertEquals(draft, editor.draft); assertNotNull(editor.error); assertFalse(editor.saved); assertFalse(editor.saving)
        val restored = TripViewModel(FailingRepository(), handle); advanceUntilIdle()
        restored.openPlace(key, "trip", ScheduleSection.Day(1), null)
        assertEquals(draft, restored.state.value.placeEditors.getValue(key).draft)
    }

    @Test fun failedWriteKeepsDraftAndDoesNotSignalSaved() = runTest(dispatcher) {
        val model = TripViewModel(FailingRepository(), SavedStateHandle())
        advanceUntilIdle()
        model.openDraft("new")
        val draft = TripDraft("작성 중", "대한민국", "2026-10-01", "2026-10-03")
        model.changeDraft("new", draft)
        model.saveDraft("new")
        advanceUntilIdle()
        val editor = model.state.value.editors.getValue("new")
        assertEquals(draft, editor.draft)
        assertNotNull(editor.error)
        assertNull(editor.savedTripId)
        assertFalse(editor.saving)
        assertTrue(model.state.value.trips.isEmpty())
    }

    @Test fun initialReadErrorRemainsVisibleAndRetryDoesNotResetData() = runTest(dispatcher) {
        val repository = FailingRepository().apply { failRead = true }
        val model = TripViewModel(repository, SavedStateHandle())
        advanceUntilIdle()
        assertNotNull(model.state.value.readError)
        assertFalse(model.state.value.loading)
        model.refresh()
        advanceUntilIdle()
        assertNotNull(model.state.value.readError)
        repository.failRead = false
        model.refresh()
        advanceUntilIdle()
        assertNull(model.state.value.readError)
    }

    @Test fun draftAndCreateOperationIdSurviveSavedStateRestoration() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        val model = TripViewModel(FailingRepository(), handle)
        advanceUntilIdle()
        model.openDraft("new")
        val draft = TripDraft("회전해도 보존", "일본", "2026-11-01", "2026-11-02")
        model.changeDraft("new", draft)
        val snapshot = handle.keys().associateWith { handle.get<Any?>(it) }
        val restoredHandle = SavedStateHandle(snapshot)
        val restored = TripViewModel(FailingRepository(), restoredHandle)
        advanceUntilIdle()
        restored.openDraft("new")
        assertEquals(draft, restored.state.value.editors.getValue("new").draft)
        assertEquals(handle.get<String>("newTripId"), restoredHandle.get<String>("newTripId"))
    }

    @Test fun nestedNewDraftUsesIndependentSavedStateKey() = runTest(dispatcher) {
        val handle = SavedStateHandle()
        val model = TripViewModel(FailingRepository(), handle)
        advanceUntilIdle()

        model.openDraft("new")
        model.openDraft("draft-new:destination-1")

        val destination = model.state.value.editors["draft-new:destination-1"]
        assertNotNull(destination)
        assertNotNull(handle.get<String>("newTripId"))
        assertNotNull(handle.get<String>("newTripId:draft-new:destination-1"))
        assertNotEquals(
            handle.get<String>("newTripId"),
            handle.get<String>("newTripId:draft-new:destination-1"),
        )

        model.changeDraft("new", TripDraft("일반 초안", "", "2026-10-01", "2026-10-01"))
        model.changeDraft("draft-new:destination-1", TripDraft("장소 연결 초안", "", "2026-11-01", "2026-11-01"))
        assertEquals("일반 초안", model.state.value.editors.getValue("new").draft.name)
        assertEquals("장소 연결 초안", model.state.value.editors.getValue("draft-new:destination-1").draft.name)
    }

    @Test fun validationFailureKeepsDraftAndShowsActionableError() = runTest(dispatcher) {
        val model = TripViewModel(FailingRepository(), SavedStateHandle())
        advanceUntilIdle()
        model.openDraft("new")
        model.changeDraft("new", TripDraft("  ", "", "2026-10-01", "2026-10-01"))
        model.saveDraft("new")
        advanceUntilIdle()
        assertTrue(model.state.value.editors.getValue("new").error!!.contains("이름"))
    }
}
