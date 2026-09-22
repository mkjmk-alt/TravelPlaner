package com.travelplaner.nativepreview.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.PlaceDraft

@Composable
fun PlaceEditorScreen(editor: PlaceEditorState, onBack: () -> Unit, onChange: (PlaceDraft) -> Unit, onSave: () -> Unit) {
    val draft = editor.draft; val focus = LocalFocusManager.current
    BackHandler(enabled = !editor.saving) { onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = onBack, enabled = !editor.saving, modifier = Modifier.testTag("trip-back")) { Text("뒤로") }
        Text(if (editor.itemKey == null) "장소 추가" else "장소 편집", style = MaterialTheme.typography.headlineMedium)
        Text(editor.section.title)
        PlaceField("장소 이름", draft.name, "placeName", editor.saving) { onChange(draft.copy(name = it)) }
        PlaceField("표시 이름 (선택)", draft.displayName, "placeDisplayName", editor.saving) { onChange(draft.copy(displayName = it)) }
        PlaceField("주소 (선택)", draft.loc, "placeAddress", editor.saving) { onChange(draft.copy(loc = it)) }
        PlaceField("시간 (09:30 또는 미정)", draft.time, "placeTime", editor.saving) { onChange(draft.copy(time = it)) }
        PlaceField("메모 (선택)", draft.memo, "placeMemo", editor.saving, multiline = true) { onChange(draft.copy(memo = it)) }
        PlaceField("아이콘", draft.emoji, "placeEmoji", editor.saving) { onChange(draft.copy(emoji = it)) }
        editor.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("place-error")) }
        Button(onClick = { focus.clearFocus(); onSave() }, enabled = !editor.saving, modifier = Modifier.fillMaxWidth().testTag("savePlace")) { Text(if (editor.saving) "저장 중…" else "장소 저장") }
        Text("뒤로 가거나 탭을 바꿔도 작성 내용은 남아 있어요. 시간만 바꾸면 순서는 유지됩니다.", style = MaterialTheme.typography.bodySmall)
    }
}
@Composable
private fun PlaceField(label: String, value: String, tag: String, saving: Boolean, multiline: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, enabled = !saving, singleLine = !multiline, minLines = if (multiline) 2 else 1, maxLines = if (multiline) 8 else 1, modifier = Modifier.fillMaxWidth().testTag(tag))
}
