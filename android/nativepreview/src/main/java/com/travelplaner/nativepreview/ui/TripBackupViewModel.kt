package com.travelplaner.nativepreview.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.travelplaner.nativepreview.data.TravelMediaReference
import com.travelplaner.nativepreview.data.TravelMediaStore
import com.travelplaner.nativepreview.data.TripRepository
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

data class BackupUiState(val busy: Boolean = false, val preview: ImportPreview? = null, val error: String? = null, val message: String? = null, val exportReady: Boolean = false, val exportName: String = "trip-backup.json", val operationID: String? = null)
class TripBackupViewModel(private val repository: TripRepository, private val mediaStore: TravelMediaStore? = null, private val io: CoroutineDispatcher = Dispatchers.IO) : ViewModel() {
    private val mutableState = MutableStateFlow(BackupUiState())
    val state = mutableState.asStateFlow()
    // Bounded file data stays outside SavedStateHandle/Bundle. After process death select again.
    private var exportBytes: ByteArray? = null
    fun selectFile(read: suspend () -> ByteArray) {
        if (state.value.busy) return
        mutableState.value = BackupUiState(busy = true, operationID = UUID.randomUUID().toString())
        viewModelScope.launch {
            try {
                val preview = withContext(io) { repository.prepareImport(TripBackup.decode(read())) }
                mutableState.update { it.copy(busy = false, preview = preview) }
            } catch (error: CancellationException) { mutableState.update { it.copy(busy = false) }; throw error }
            catch (error: Exception) { fail(error) }
        }
    }
    fun cancelPreview() { if (!state.value.busy) mutableState.update { it.copy(preview = null, error = null) } }
    fun confirmImport() {
        val preview = state.value.preview ?: return
        if (state.value.busy) return
        mutableState.update { it.copy(busy = true, error = null, message = null) }
        val decision = when (preview.disposition) { ImportDisposition.Conflict -> ImportDecision.KeepBoth; ImportDisposition.PreviouslyDeleted -> ImportDecision.RestoreDeleted; else -> ImportDecision.ConfirmNew }
        viewModelScope.launch {
            try {
                val result = withContext(io) { repository.commitImport(preview, decision) }
                mutableState.update { it.copy(busy = false, preview = null, message = if (result.alreadyImported) "이미 가져온 여행입니다. 이후 수정한 내용은 유지했습니다." else "여행을 기기에 저장했습니다. 내 여행에서 확인할 수 있어요.") }
            } catch (error: CancellationException) { mutableState.update { it.copy(busy = false) }; throw error }
            catch (error: Exception) { fail(error) }
        }
    }
    fun requestExport(trip: TripDocument) {
        if (state.value.busy) return
        mutableState.update { it.copy(busy = true, error = null, message = null, operationID = UUID.randomUUID().toString()) }
        viewModelScope.launch {
            try {
                exportBytes = withContext(io) {
                    mediaStore?.let { store ->
                        MemoryBackup.encode(trip) { fileName -> store.read(TravelMediaReference(trip.id, fileName, 0)) }
                    } ?: TripBackup.encode(trip)
                }
                mutableState.update { it.copy(busy = false, exportReady = true, exportName = TripBackup.filename(trip.name)) }
            } catch (error: CancellationException) { mutableState.update { it.copy(busy = false) }; throw error }
            catch (error: Exception) { fail(error) }
        }
    }
    fun acknowledgeExportLaunch() { mutableState.update { it.copy(exportReady = false) } }
    fun cancelExport() { exportBytes = null; mutableState.update { it.copy(exportReady = false) } }
    fun writeExport(write: suspend (ByteArray) -> Unit) {
        val bytes = exportBytes
        if (bytes == null) { fail(IllegalStateException("앱이 다시 시작되었어요. 내보낼 여행을 다시 선택해주세요.")); return }
        if (state.value.busy) return
        mutableState.update { it.copy(busy = true, exportReady = false, error = null, message = null) }
        viewModelScope.launch {
            try {
                withContext(io) { write(bytes) }
                exportBytes = null
                mutableState.update { it.copy(busy = false, message = "선택한 위치에 백업을 저장했습니다.") }
            } catch (error: CancellationException) { mutableState.update { it.copy(busy = false) }; throw error }
            catch (error: Exception) { fail(error) }
        }
    }
    private fun fail(error: Exception) { mutableState.update { it.copy(busy = false, exportReady = false, error = error.message ?: "파일 처리를 완료하지 못했어요. 기존 여행은 보존되어 있어요.") } }
}
