package com.travelplaner.nativepreview.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*

@Composable
fun ItineraryContent(trip: TripDocument, state: TripUiState, selected:Int, onSelectDay:(Int)->Unit, listState:LazyListState,
    onEdit: (ScheduleSection, ItemKey?) -> Unit, onChange: (ScheduleChange) -> Unit, onShowMap:(ItemKey)->Unit, onSave:(ScheduleSection,ItemKey)->Unit) {
    var pendingDelete by remember { mutableStateOf<ItemKey?>(null) }
    val section = if (selected == 0) ScheduleSection.Reserve else ScheduleSection.Day(selected.coerceAtMost(trip.dayCount))
    val result = runCatching { TripSchedule.items(section, trip) }
    Column(Modifier.fillMaxSize()) {
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items((0..trip.dayCount).toList()) { day ->
                FilterChip(selected = selected == day, onClick = { onSelectDay(day) }, label = { Text(if (day == 0) "예비 목록" else "${day}일차") }, modifier = Modifier.testTag(if (day == 0) "section-reserve" else "section-day-$day"))
            }
        }
        LazyColumn(Modifier.fillMaxSize().testTag("itinerary-list"), state=listState, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item(key="add") {
                Button(onClick = { onEdit(section, null) }, enabled = !state.scheduleBusy, modifier = Modifier.fillMaxWidth().testTag("addPlace")) { Text("장소 직접 추가") }
                Text("지도 탭에서 검색한 장소도 일정에 추가할 수 있어요.", style = MaterialTheme.typography.bodySmall)
            }
            state.scheduleError?.let { item { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("schedule-error")) } }
            result.exceptionOrNull()?.let { item { Text(it.message ?: "일정을 읽지 못했어요.", color = MaterialTheme.colorScheme.error) } }
            val list = result.getOrDefault(emptyList())
            if (list.isEmpty()) item { Text("아직 장소가 없어요.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(list.size,key={index -> runCatching { ItemKey.from(list[index].getValue("id")).token }.getOrDefault("invalid:$index") }) { index ->
                val item = list[index]; val key = runCatching { ItemKey.from(item.getValue("id")) }.getOrNull()
                val draft = PlaceDraft.from(item); var menu by remember { mutableStateOf(false) }
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(draft.emoji, style = MaterialTheme.typography.headlineSmall)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(draft.displayName.ifEmpty { draft.name }, style = MaterialTheme.typography.titleMedium)
                            if (draft.time.isNotEmpty()) Text(draft.time, color = MaterialTheme.colorScheme.primary)
                            if (draft.loc.isNotEmpty()) Text(draft.loc, style = MaterialTheme.typography.bodySmall)
                            if (draft.memo.isNotEmpty()) Text(draft.memo)
                        }
                        if (key != null) Box {
                            TextButton(onClick = { menu = true }, enabled = !state.scheduleBusy, modifier = Modifier.testTag("placeActions")) { Text("⋯") }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text={Text("지도에서 보기")},onClick={menu=false; onShowMap(key)})
                                DropdownMenuItem(text={Text("저장 장소에 추가")},onClick={menu=false; onSave(section,key)})
                                DropdownMenuItem(text = { Text("장소 편집") }, onClick = { menu = false; onEdit(section, key) })
                                DropdownMenuItem(text = { Text("위로 이동") }, enabled = index > 0, onClick = { menu = false; onChange(ScheduleChange.Shift(section, key, -1)) })
                                DropdownMenuItem(text = { Text("아래로 이동") }, enabled = index < list.lastIndex, onClick = { menu = false; onChange(ScheduleChange.Shift(section, key, 1)) })
                                (0..trip.dayCount).filter { it != section.token }.forEach { target ->
                                    DropdownMenuItem(text = { Text(if (target == 0) "예비 목록으로 이동" else "${target}일차로 이동") }, onClick = { menu = false; onChange(ScheduleChange.Move(section, key, if (target == 0) ScheduleSection.Reserve else ScheduleSection.Day(target))) })
                                }
                                DropdownMenuItem(text = { Text("장소 삭제") }, onClick = { menu = false; pendingDelete = key })
                            }
                        }
                    }
                }
            }
            item { OutlinedButton(onClick = { onChange(ScheduleChange.SortByTime(section)) }, enabled = !state.scheduleBusy) { Text("시간순 정렬") } }
        }
    }
    pendingDelete?.let { key ->
        AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text("장소를 삭제할까요?") }, text = { Text("일정의 장소만 제거합니다. 지출 기록은 삭제하지 않습니다.") },
            confirmButton = { TextButton(onClick = { pendingDelete = null; onChange(ScheduleChange.Remove(section, key)) }) { Text("삭제") } },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("취소") } })
    }
}
