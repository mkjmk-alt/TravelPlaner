package com.travelplaner.nativepreview.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.data.BackupFileAccess
import com.travelplaner.nativepreview.data.TravelMediaReference
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

@Composable
fun TravelMemoryScreen(trip: TripDocument, model: TripViewModel, onBack: () -> Unit, onChange: (MemoryChange, ByteArray?, String?, (Boolean) -> Unit) -> Unit) {
    var date by rememberSaveable { mutableStateOf("") }
    var title by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }
    var photoBytes by remember { mutableStateOf<ByteArray?>(null) }
    var stagedPhotoFileName by remember { mutableStateOf<String?>(null) }
    var photoError by remember { mutableStateOf<String?>(null) }
    var editingIndex by remember { mutableStateOf<Int?>(null) }
    var editingExpected by remember { mutableStateOf<JsonObject?>(null) }
    var removePhoto by remember { mutableStateOf(false) }
    var pendingDeleteIndex by remember { mutableStateOf<Int?>(null) }
    var restoringDraft by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }

    val resolver = LocalContext.current.contentResolver
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val bytes = BackupFileAccess.readImage(resolver, uri)
                val previous = stagedPhotoFileName
                model.stageMemoryPhoto(bytes, trip.id) { reference ->
                    if (reference == null) {
                        photoError = "사진을 임시 저장하지 못했어요."
                    } else {
                        if (previous != null) model.removeMemoryPhoto(trip.id, previous)
                        photoBytes = bytes
                        stagedPhotoFileName = reference.fileName
                        photoError = null
                        removePhoto = false
                    }
                }
            } catch (error: Exception) {
                val failure = BackupFileAccess.imageSelectionFailure(photoBytes, stagedPhotoFileName, error.message ?: "사진을 읽지 못했어요.")
                photoBytes = failure.bytes
                stagedPhotoFileName = failure.fileName
                photoError = failure.error
            }
        }
    }

    val entries = (trip.json["journalEntries"] as? JsonArray) ?: JsonArray(emptyList())
    val isEditing = editingIndex != null
    val hasExistingPhoto = editingExpected?.let { expected ->
        listOf("imageFileName", "imageDataUrl").any { key -> expected[key] != null && expected[key] !is JsonNull }
    } == true
    val hasText = title.isNotBlank() || body.isNotBlank()
    val canSave = hasText || photoBytes != null || (isEditing && hasExistingPhoto && !removePhoto)
    val draftID = if (isEditing) "edit:" + (editingExpected?.get("id")?.jsonPrimitive?.contentOrNull ?: "index-$editingIndex") else "new"
    val hasDraftContent = isEditing || date.isNotBlank() || title.isNotBlank() || body.isNotBlank() || removePhoto || stagedPhotoFileName != null

    LaunchedEffect(trip.id) {
        restoringDraft = true
        val draft = model.loadMemoryDraft(trip.id, "new")
        if (draft != null) {
            date = draft.date
            title = draft.title
            body = draft.body
            removePhoto = draft.removePhoto
            stagedPhotoFileName = draft.stagedPhotoFileName
            if (draft.stagedPhotoFileName != null) {
                photoBytes = model.memoryPhotoBytes(trip.id, draft.stagedPhotoFileName)
                if (photoBytes == null) stagedPhotoFileName = null
            }
            if (draft.mode == JournalEditorMode.EDIT && draft.entryId != null) {
                val index = entries.indexOfFirst { it.jsonObject["id"]?.jsonPrimitive?.contentOrNull == draft.entryId }
                if (index >= 0) {
                    editingIndex = index
                    editingExpected = entries[index].jsonObject
                } else {
                    model.discardMemoryDrafts(trip.id, "new")
                }
            }
        }
        restoringDraft = false
    }

    LaunchedEffect(date, title, body, editingIndex, removePhoto, stagedPhotoFileName) {
        if (!restoringDraft && hasDraftContent) {
            val draft = JournalEditorDraft(
                tripId = trip.id,
                draftId = draftID,
                mode = if (isEditing) JournalEditorMode.EDIT else JournalEditorMode.NEW,
                entryId = editingExpected?.get("id")?.jsonPrimitive?.contentOrNull,
                date = date,
                title = title,
                body = body,
                removePhoto = removePhoto,
                stagedPhotoFileName = stagedPhotoFileName,
                updatedAt = System.currentTimeMillis().toDouble(),
            )
            model.saveMemoryDraft(draft)
            if (isEditing) model.saveMemoryDraftAlias(draft, "new")
        }
    }

    fun clearEditing() {
        editingIndex = null
        editingExpected = null
        removePhoto = false
    }
    fun clearForm() {
        date = ""
        title = ""
        body = ""
        photoBytes = null
        stagedPhotoFileName = null
        photoError = null
        saveError = null
        clearEditing()
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        ScreenHeader("여행 기록", onBack)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
            item {
                Card {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(if (isEditing) "기록 편집" else "새 기록", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(value = date, onValueChange = { value -> date = value }, modifier = Modifier.fillMaxWidth().testTag("memory-date"), label = { Text("날짜 (선택)") }, singleLine = true)
                        OutlinedTextField(value = title, onValueChange = { value -> title = value }, modifier = Modifier.fillMaxWidth().testTag("memory-title"), label = { Text("제목") }, singleLine = true)
                        OutlinedTextField(value = body, onValueChange = { value -> body = value }, modifier = Modifier.fillMaxWidth().testTag("memory-body"), label = { Text("내용") }, minLines = 3)

                        if (photoBytes != null) {
                            Text("새 사진이 선택되었습니다.", color = MaterialTheme.colorScheme.primary)
                        } else if (isEditing && hasExistingPhoto && !removePhoto) {
                            Text("기존 사진이 첨부되어 있습니다.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }

                        OutlinedButton(
                            onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                            modifier = Modifier.fillMaxWidth().testTag("memory-photo"),
                        ) { Text(if (photoBytes == null) "사진 선택" else "사진 선택됨") }
                        photoError?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("memory-photo-error")) }

                        if (isEditing && hasExistingPhoto && !removePhoto) {
                            TextButton(onClick = { removePhoto = true }, modifier = Modifier.fillMaxWidth().testTag("memory-remove-photo")) {
                                Text("기존 사진 제거")
                            }
                        }

                        if (isEditing) {
                            OutlinedButton(
                                onClick = {
                                    model.discardMemoryDrafts(trip.id, draftID)
                                    clearForm()
                                },
                                modifier = Modifier.fillMaxWidth().testTag("memory-edit-cancel"),
                            ) { Text("편집 취소") }
                        }

                        Button(
                            onClick = {
                                val index = editingIndex
                                val expected = editingExpected
                                val submittedDraftID = draftID
                                if (index != null && expected != null && entries.indices.contains(index)) {
                                    val row = entries[index].jsonObject
                                    val changes = buildJsonObject {
                                        put("date", date.trim())
                                        put("title", title.trim())
                                        put("body", body.trim())
                                        if (removePhoto) {
                                            put("imageFileName", JsonNull)
                                            put("imageDataUrl", JsonNull)
                                        }
                                    }
                                    saving = true
                                    val submittedStagedPhoto = stagedPhotoFileName
                                    onChange(MemoryChange.EditJournal(memorySelector(row, index, entries), changes, expected), if (submittedStagedPhoto == null) photoBytes else null, submittedStagedPhoto) { success ->
                                        saving = false
                                        if (success) {
                                            model.discardMemoryDrafts(trip.id, submittedDraftID, submittedStagedPhoto)
                                            clearForm()
                                        } else saveError = "저장하지 못했어요. 입력 내용은 그대로 보관되어 있어요."
                                    }
                                } else {
                                    val now = System.currentTimeMillis()
                                    val entry = buildJsonObject {
                                        put("id", UUID.randomUUID().toString())
                                        put("date", date.trim())
                                        put("title", title.trim())
                                        put("body", body.trim())
                                        put("createdAt", now)
                                        put("updatedAt", now)
                                    }
                                    saving = true
                                    val submittedStagedPhoto = stagedPhotoFileName
                                    onChange(MemoryChange.AddJournal(UUID.randomUUID().toString(), entry), if (submittedStagedPhoto == null) photoBytes else null, submittedStagedPhoto) { success ->
                                        saving = false
                                        if (success) {
                                            model.discardMemoryDrafts(trip.id, submittedDraftID, submittedStagedPhoto)
                                            clearForm()
                                        } else saveError = "저장하지 못했어요. 입력 내용은 그대로 보관되어 있어요."
                                    }
                                }
                            },
                            enabled = canSave && !saving,
                            modifier = Modifier.fillMaxWidth().testTag(if (isEditing) "memory-edit-save" else "memory-save"),
                        ) { Text(if (isEditing) "기록 수정" else "기록 저장") }
                        saveError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    }
                }
            }

            if (entries.isEmpty()) item { Text("아직 기록이 없습니다.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            itemsIndexed(entries) { index, element ->
                val row = element.jsonObject
                Card(modifier = Modifier.fillMaxWidth().testTag("memory-row-$index")) {
                    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(row["title"]?.jsonPrimitive?.contentOrNull ?: "제목 없음", style = MaterialTheme.typography.titleMedium)
                            Text(row["date"]?.jsonPrimitive?.contentOrNull.orEmpty(), style = MaterialTheme.typography.labelSmall)
                            Text(row["body"]?.jsonPrimitive?.contentOrNull.orEmpty(), maxLines = 3)
                            if (row["imageFileName"] != null || row["imageDataUrl"] != null) {
                                Text("사진 첨부됨", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        IconButton(
                            onClick = {
                                if (stagedPhotoFileName != null) model.removeMemoryPhoto(trip.id, stagedPhotoFileName!!)
                                editingIndex = index
                                editingExpected = row
                                date = row["date"]?.jsonPrimitive?.contentOrNull.orEmpty()
                                title = row["title"]?.jsonPrimitive?.contentOrNull.orEmpty()
                                body = row["body"]?.jsonPrimitive?.contentOrNull.orEmpty()
                                photoBytes = null; stagedPhotoFileName = null; photoError = null; removePhoto = false
                            },
                            modifier = Modifier.testTag("memory-edit-$index"),
                        ) { Icon(Icons.Outlined.Edit, "편집") }
                        IconButton(onClick = { pendingDeleteIndex = index }, modifier = Modifier.testTag("memory-delete-$index")) {
                            Icon(Icons.Outlined.Delete, "삭제")
                        }
                    }
                }
            }
        }
    }

    pendingDeleteIndex?.let { index ->
        if (entries.indices.contains(index)) {
            AlertDialog(
                onDismissRequest = { pendingDeleteIndex = null },
                title = { Text("이 기록을 삭제할까요?") },
                text = { Text("삭제한 기록은 복구할 수 없습니다.") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val submittedDraftID = draftID
                            onChange(MemoryChange.RemoveJournal(memorySelector(entries[index].jsonObject, index, entries)), null, null) { success ->
                                if (success) {
                                    model.discardMemoryDrafts(trip.id, submittedDraftID)
                                    if (editingIndex == index) clearForm()
                                } else saveError = "삭제하지 못했어요."
                            }
                            pendingDeleteIndex = null
                        },
                        modifier = Modifier.testTag("memory-delete-confirm"),
                    ) { Text("삭제") }
                },
                dismissButton = { TextButton(onClick = { pendingDeleteIndex = null }) { Text("취소") } },
            )
        }
    }
}

private fun memorySelector(row: JsonObject, index: Int, rows: JsonArray): MemoryRowSelector = row["id"]?.jsonPrimitive?.let { id ->
    val key = if (id.isString) MemoryItemKey.StringKey(id.content) else id.intOrNull?.let { value -> MemoryItemKey.IntKey(value) }
    MemoryRowSelector(key, index, row, if (key == null) rows else null)
} ?: MemoryRowSelector(null, index, row, rows)
