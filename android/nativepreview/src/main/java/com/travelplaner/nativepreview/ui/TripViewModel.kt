package com.travelplaner.nativepreview.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.travelplaner.nativepreview.data.TravelMediaStore
import com.travelplaner.nativepreview.data.TravelMediaReference
import com.travelplaner.nativepreview.data.MemoryDraftStore
import com.travelplaner.nativepreview.data.TripRepository
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.util.UUID

data class EditorState(val draft: TripDraft, val saving: Boolean = false, val error: String? = null, val savedTripId: String? = null)
data class PlaceEditorState(val tripID: String, val section: ScheduleSection, val itemKey: ItemKey?, val newID: String, val draft: PlaceDraft, val saving: Boolean = false, val error: String? = null, val saved: Boolean = false)
data class TripUiState(val trips: List<TripDocument> = emptyList(), val loading: Boolean = true, val readError: String? = null, val editors: Map<String, EditorState> = emptyMap(), val placeEditors: Map<String, PlaceEditorState> = emptyMap(), val scheduleError: String? = null, val scheduleBusy: Boolean = false,
    val savedPlaces: List<SavedPlaceDocument> = emptyList(), val savedLoadError: String? = null, val savedLoading: Boolean = true,
    val expenseError: String? = null, val expenseBusy: Boolean = false)
class TripViewModel(private val repository: TripRepository, private val savedState: SavedStateHandle, private val mediaStore: TravelMediaStore? = null, private val memoryDraftStore: MemoryDraftStore? = null) : ViewModel() {
    private val mutableState = MutableStateFlow(TripUiState())
    val state = mutableState.asStateFlow()
    private val operations = Mutex()

    init { refresh() }

    fun refreshSavedPlaces() {
        viewModelScope.launch {
            try { val rows=repository.listSavedPlaces(); mutableState.update { it.copy(savedPlaces=rows,savedLoadError=null,savedLoading=false) } }
            catch(error:CancellationException) { throw error }
            catch(_:Exception) { mutableState.update { it.copy(savedLoadError="저장 장소를 읽지 못했어요. 원본은 보존됩니다.",savedLoading=false) } }
        }
    }
    suspend fun saveFavorite(selection:PlaceSelection,draft:PlaceDraft,id:String):SavedPlaceDocument = operations.withLock {
        val row=repository.savePlace(selection,draft,id)
        val rows=repository.listSavedPlaces(); mutableState.update { it.copy(savedPlaces=rows,savedLoadError=null) }; row
    }
    suspend fun deleteFavorite(id:String) = operations.withLock {
        repository.deleteSavedPlace(id); val rows=repository.listSavedPlaces(); mutableState.update { it.copy(savedPlaces=rows) }
    }
    suspend fun attachPlace(tripID:String,section:ScheduleSection,id:String,draft:PlaceDraft,selection:PlaceSelection) = operations.withLock {
        val trip=repository.applySchedule(tripID,ScheduleChange.AddPlace(section,id,draft,selection))
        mutableState.update { it.copy(trips=it.trips.filterNot { old -> old.id==tripID }+trip) }
    }

    fun openPlace(key: String, tripID: String, section: ScheduleSection, itemKey: ItemKey?) {
        if (key in state.value.placeEditors) return
        val restored = savedState.get<ArrayList<String>>("place:$key")?.takeIf { it.size == 7 }
        val draft = restored?.let { PlaceDraft(it[0], it[1], it[2], it[3], it[4], it[5]) } ?: if (itemKey == null) PlaceDraft() else {
            val trip = state.value.trips.find { it.id == tripID } ?: return
            val item = runCatching { TripSchedule.items(section, trip).single { ItemKey.from(it.getValue("id")) == itemKey } }.getOrNull() ?: return
            PlaceDraft.from(item)
        }
        val editor = PlaceEditorState(tripID, section, itemKey, restored?.get(6) ?: UUID.randomUUID().toString(), draft)
        rememberPlace(key, editor)
        mutableState.update { it.copy(placeEditors = it.placeEditors + (key to editor)) }
    }
    fun changePlace(key: String, draft: PlaceDraft) {
        val editor = state.value.placeEditors[key]?.takeUnless { it.saving } ?: return
        val next = editor.copy(draft = draft, error = null); rememberPlace(key, next)
        mutableState.update { it.copy(placeEditors = it.placeEditors + (key to next)) }
    }
    fun savePlace(key: String) {
        val editor = state.value.placeEditors[key]?.takeUnless { it.saving || it.saved } ?: return
        mutableState.update { it.copy(placeEditors = it.placeEditors + (key to editor.copy(saving = true, error = null))) }
        viewModelScope.launch {
            operations.withLock {
                try {
                    val change = editor.itemKey?.let { ScheduleChange.Edit(editor.section, it, editor.draft) } ?: ScheduleChange.Add(editor.section, editor.newID, editor.draft)
                    val trip = repository.applySchedule(editor.tripID, change)
                    mutableState.update { it.copy(trips = it.trips.filterNot { old -> old.id == trip.id } + trip, placeEditors = it.placeEditors + (key to editor.copy(saved = true))) }
                } catch (error: CancellationException) {
                    mutableState.update { it.copy(placeEditors = it.placeEditors + (key to editor.copy(saving = false))) }; throw error
                } catch (error: Exception) {
                    mutableState.update { it.copy(placeEditors = it.placeEditors + (key to editor.copy(error = error.message ?: "저장을 완료하지 못했어요. 입력은 보관되어 있어요."))) }
                }
            }
        }
    }
    fun acknowledgePlace(key: String) {
        savedState.remove<ArrayList<String>>("place:$key")
        mutableState.update { it.copy(placeEditors = it.placeEditors - key) }
    }
    fun applySchedule(tripID: String, change: ScheduleChange) {
        if (state.value.scheduleBusy) return
        mutableState.update { it.copy(scheduleBusy = true, scheduleError = null) }
        viewModelScope.launch {
            operations.withLock {
                try {
                    val trip = repository.applySchedule(tripID, change)
                    mutableState.update { it.copy(trips = it.trips.filterNot { old -> old.id == tripID } + trip, scheduleBusy = false) }
                } catch (error: CancellationException) { mutableState.update { it.copy(scheduleBusy = false) }; throw error }
                catch (error: Exception) { mutableState.update { it.copy(scheduleBusy = false, scheduleError = error.message ?: "변경을 저장하지 못했어요.") } }
            }
        }
    }
    fun upsertExpense(tripID: String, expenseID: String, fields: JsonObject) = mutateExpense { repository.upsertExpense(tripID, expenseID, fields) }
    fun deleteExpense(tripID: String, expenseID: String) = mutateExpense { repository.deleteExpense(tripID, expenseID) }
    fun updateBudgetSettings(tripID: String, values: JsonObject) = mutateExpense { repository.updateBudgetSettings(tripID, values) }
    fun updateParticipants(tripID: String, participants: JsonArray) = mutateExpense { repository.updateSettlementParticipants(tripID, participants) }
    fun applyMemoryChange(tripID: String, change: MemoryChange, photoBytes: ByteArray? = null, stagedPhotoFileName: String? = null, onComplete: (Boolean) -> Unit = {}) {
        if (state.value.expenseBusy) return
        mutableState.update { it.copy(expenseBusy = true, expenseError = null) }
        viewModelScope.launch {
            operations.withLock {
                var transientReference: TravelMediaReference? = null
                try {
                    val prepared = if (stagedPhotoFileName != null) {
                        val store = requireNotNull(mediaStore) { "사진 저장소를 사용할 수 없어요." }
                        withContext(Dispatchers.IO) { store.read(store.reference(tripID, stagedPhotoFileName)) }
                        MemoryPhotoDraft.attach(change, stagedPhotoFileName)
                    } else if (photoBytes == null) change else {
                        val store = requireNotNull(mediaStore) { "사진 저장소를 사용할 수 없어요." }
                        transientReference = withContext(Dispatchers.IO) { store.write(photoBytes, tripID) }
                        MemoryPhotoDraft.attach(change, transientReference!!.fileName)
                    }
                    val trip = repository.applyMemoryChange(tripID, prepared)
                    mutableState.update { it.copy(trips = it.trips.filterNot { old -> old.id == tripID } + trip, expenseBusy = false, expenseError = null) }
                    onComplete(true)
                } catch (error: CancellationException) {
                    mutableState.update { it.copy(expenseBusy = false) }; throw error
                } catch (error: Exception) {
                    transientReference?.let { reference -> runCatching { mediaStore?.remove(reference) } }
                    mutableState.update { it.copy(expenseBusy = false, expenseError = error.message ?: "여행 기록을 저장하지 못했어요.") }
                    onComplete(false)
                }
            }
        }
    }

    fun stageMemoryPhoto(bytes: ByteArray, tripID: String, onComplete: (TravelMediaReference?) -> Unit) {
        viewModelScope.launch {
            try {
                val reference = withContext(Dispatchers.IO) {
                    requireNotNull(mediaStore) { "사진 저장소를 사용할 수 없어요." }.write(bytes, tripID)
                }
                onComplete(reference)
            } catch (_: Exception) {
                onComplete(null)
            }
        }
    }

    suspend fun memoryPhotoBytes(tripID: String, fileName: String): ByteArray? = withContext(Dispatchers.IO) {
        runCatching {
            val store = requireNotNull(mediaStore) { "사진 저장소를 사용할 수 없어요." }
            store.read(store.reference(tripID, fileName))
        }.getOrNull()
    }

    fun removeMemoryPhoto(tripID: String, fileName: String) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                runCatching {
                    val store = requireNotNull(mediaStore) { "사진 저장소를 사용할 수 없어요." }
                    store.remove(store.reference(tripID, fileName))
                }
            }
        }
    }

    fun saveMemoryDraft(draft: JournalEditorDraft) {
        viewModelScope.launch {
            operations.withLock { withContext(Dispatchers.IO) { memoryDraftStore?.saveJournal(draft) } }
        }
    }

    fun saveMemoryDraftAlias(draft: JournalEditorDraft, draftId: String) {
        viewModelScope.launch {
            operations.withLock { withContext(Dispatchers.IO) { memoryDraftStore?.saveJournal(draft, draftId) } }
        }
    }

    suspend fun loadMemoryDraft(tripID: String, draftID: String): JournalEditorDraft? = operations.withLock {
        withContext(Dispatchers.IO) { memoryDraftStore?.loadJournal(tripID, draftID) }
    }

    suspend fun removeMemoryDraft(tripID: String, draftID: String) = operations.withLock {
        withContext(Dispatchers.IO) { memoryDraftStore?.removeJournal(tripID, draftID) }
    }

    fun discardMemoryDrafts(tripID: String, draftID: String, preservingPhotoFileName: String? = null) {
        viewModelScope.launch {
            operations.withLock {
                withContext(Dispatchers.IO) {
                    val draftStore = memoryDraftStore
                    val media = mediaStore
                    val ids = setOf(draftID, "new")
                    if (draftStore != null && media != null) {
                        ids.forEach { id ->
                            val staged = draftStore.loadJournal(tripID, id)?.stagedPhotoFileName
                            if (staged != null && staged != preservingPhotoFileName) {
                                runCatching { media.remove(media.reference(tripID, staged)) }
                            }
                        }
                    }
                    ids.forEach { id -> draftStore?.removeJournal(tripID, id) }
                }
            }
        }
    }
    fun clearExpenseError() { mutableState.update { it.copy(expenseError = null) } }
    private fun mutateExpense(operation: suspend () -> TripDocument) {
        if (state.value.expenseBusy) return
        mutableState.update { it.copy(expenseBusy = true, expenseError = null) }
        viewModelScope.launch {
            operations.withLock {
                try {
                    val trip = operation()
                    mutableState.update { it.copy(trips = it.trips.filterNot { old -> old.id == trip.id } + trip, expenseBusy = false) }
                } catch (error: CancellationException) {
                    mutableState.update { it.copy(expenseBusy = false) }; throw error
                } catch (error: Exception) {
                    mutableState.update { it.copy(expenseBusy = false, expenseError = error.message ?: "지출 정보를 저장하지 못했어요.") }
                }
            }
        }
    }
    private fun rememberPlace(key: String, editor: PlaceEditorState) {
        val draft = editor.draft
        savedState["place:$key"] = arrayListOf(draft.name, draft.displayName, draft.loc, draft.time, draft.memo, draft.emoji, editor.newID)
    }

    fun refresh() {
        refreshSavedPlaces()
        viewModelScope.launch {
            operations.withLock {
                mutableState.update { it.copy(loading = true) }
                try {
                    val trips = repository.list()
                    mutableState.update { it.copy(trips = trips, loading = false, readError = null) }
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    mutableState.update { it.copy(loading = false, readError = "여행을 불러오지 못했어요. 저장된 데이터는 초기화하지 않았어요. 다시 시도해 주세요.") }
                }
            }
        }
    }

    fun openDraft(key: String) {
        if (state.value.editors.containsKey(key)) return
        val restored = savedState.get<ArrayList<String>>("draft:" + key)?.takeIf { it.size == 4 }
        val draft = restored?.let { TripDraft(it[0], it[1], it[2], it[3]) }
            ?: if (isNewDraftKey(key)) {
                val today = LocalDate.now().toString()
                TripDraft("", "", today, today)
            } else state.value.trips.find { it.id == key }?.draft ?: return
        if (isNewDraftKey(key) && !savedState.contains(newTripIDKey(key))) {
            savedState[newTripIDKey(key)] = UUID.randomUUID().toString()
        }
        rememberDraft(key, draft)
        mutableState.update { it.copy(editors = it.editors + (key to EditorState(draft))) }
    }

    fun changeDraft(key: String, draft: TripDraft) {
        val editor = state.value.editors[key] ?: return
        if (editor.saving) return
        rememberDraft(key, draft)
        mutableState.update { it.copy(editors = it.editors + (key to editor.copy(draft = draft, error = null))) }
    }

    fun saveDraft(key: String) {
        val editor = state.value.editors[key] ?: return
        if (editor.saving || editor.savedTripId != null) return
        mutableState.update { it.copy(editors = it.editors + (key to editor.copy(saving = true, error = null))) }
        viewModelScope.launch {
            operations.withLock {
                try {
                    TripDocument.validate(editor.draft)
                    val trip = if (isNewDraftKey(key)) {
                        repository.create(editor.draft, checkNotNull(savedState.get<String>(newTripIDKey(key))))
                    } else repository.edit(key, editor.draft)
                    val trips = repository.list()
                    // Keep the draft until both the transaction and the DB re-read succeed.
                    mutableState.update { it.copy(
                        trips = trips,
                        loading = false,
                        readError = null,
                        editors = it.editors + (key to editor.copy(saving = false, savedTripId = trip.id)),
                    ) }
                } catch (error: CancellationException) {
                    mutableState.update { it.copy(editors = it.editors + (key to editor.copy(saving = false))) }
                    throw error
                } catch (error: Exception) {
                    val message = if (error is IllegalArgumentException) error.message ?: "입력 내용을 확인해 주세요."
                        else "저장을 완료하지 못했어요. 입력 내용은 남아 있어요. 다시 시도해 주세요."
                    mutableState.update { it.copy(editors = it.editors + (key to editor.copy(saving = false, error = message))) }
                }
            }
        }
    }

    fun acknowledgeSave(key: String) {
        savedState.remove<ArrayList<String>>("draft:" + key)
        if (isNewDraftKey(key)) savedState.remove<String>(newTripIDKey(key))
        mutableState.update { it.copy(editors = it.editors - key) }
    }

    private fun isNewDraftKey(key: String): Boolean = key == "new" || key.startsWith("draft-new:")
    private fun newTripIDKey(key: String): String = if (key == "new") "newTripId" else "newTripId:$key"

    private fun rememberDraft(key: String, draft: TripDraft) {
        savedState["draft:" + key] = arrayListOf(draft.name, draft.country, draft.startDate, draft.endDate)
    }
}
