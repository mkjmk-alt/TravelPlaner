package com.travelplaner.nativepreview.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.travelplaner.nativepreview.data.BackupFileAccess
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*

@Composable
fun TripBackupScreen(model: TripBackupViewModel, trips: List<TripDocument>, initialTripID: String, onBack: () -> Unit, onImported: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val resolver = LocalContext.current.contentResolver
    var selected by rememberSaveable(initialTripID) { mutableStateOf(initialTripID) }
    var choosing by rememberSaveable { mutableStateOf(false) }
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) model.selectFile { BackupFileAccess.read(resolver, uri) } }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri -> if (uri == null) model.cancelExport() else model.writeExport { BackupFileAccess.write(resolver, uri, it) } }
    LaunchedEffect(state.exportReady) { if (state.exportReady) { exporter.launch(state.exportName); model.acknowledgeExportLaunch() } }
    LaunchedEffect(state.message) { if (state.message != null) onImported() }
    BackHandler(enabled = !state.busy && !choosing) { onBack() }
    LazyColumn(Modifier.fillMaxSize().testTag("backup-list"), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            TextButton(onClick = onBack, modifier = Modifier.testTag("trip-back")) { Text("뒤로") }
            Text("여행 백업", style = MaterialTheme.typography.headlineMedium)
        }
        item {
            Button(onClick = { importer.launch(arrayOf("application/json", "application/octet-stream", "*/*")) }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().testTag("backupImport")) { Text("JSON 파일 선택") }
            Text("웹·기존 앱에서 내보낸 여행 1개의 JSON 파일을 선택해주세요. 계정 전체와 전역 즐겨찾기는 포함되지 않습니다.", style = MaterialTheme.typography.bodySmall)
            Text("최대 20 MiB · 장소 10,000개 · 원본은 기기 내부 보존", style = MaterialTheme.typography.bodySmall)
        }
        if (state.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("import-error")) } }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.testTag("backup-result")) } }
        state.preview?.let { preview ->
            item {
                val trip = preview.candidate.trip
                Text("가져오기 미리보기", style = MaterialTheme.typography.titleLarge)
                Text(trip.name, modifier = Modifier.testTag("import-preview"))
                Text("${trip.country} · ${trip.startDate} ~ ${trip.endDate}")
                val count = trip.json.getValue("itinerary").jsonArray.sumOf { it.jsonObject.getValue("items").jsonArray.size }
                Text("일정 ${count}곳 · 예비 ${trip.json.getValue("reserveItems").jsonArray.size}곳 · 지출 ${trip.json.getValue("expenses").jsonArray.size}건")
                Text(when (preview.disposition) {
                    ImportDisposition.Conflict -> "같은 ID의 다른 여행이 있습니다. 취소하거나 별도 여행으로 보관하세요. 기존 여행은 덮어쓰지 않습니다."
                    ImportDisposition.PreviouslyDeleted -> "이전에 가져온 여행이 삭제되었습니다. 복원하면 새 여행으로 저장합니다."
                    ImportDisposition.AlreadyImported -> "이미 가져온 파일입니다. 중복 생성이나 이후 수정한 내용의 덮어쓰기는 하지 않습니다."
                    ImportDisposition.IdenticalExisting -> "기존 여행과 같습니다. 중복 없이 가져오기 이력만 저장합니다."
                    ImportDisposition.NewTrip -> "확인하면 새 여행을 저장합니다."
                })
            }
            val warnings = preview.candidate.warnings
            items(minOf(warnings.size, 100)) { Text(warnings[it], style = MaterialTheme.typography.bodySmall) }
            if (warnings.size > 100) item { Text("그 외 ${warnings.size - 100}개 누락 항목을 보완했습니다.") }
            item {
                TextButton(onClick = model::cancelPreview, enabled = !state.busy) { Text("취소") }
                Button(onClick = model::confirmImport, enabled = !state.busy, modifier = Modifier.testTag(if (preview.disposition == ImportDisposition.Conflict) "keepBothImport" else "confirmImport")) {
                    Text(when (preview.disposition) { ImportDisposition.Conflict -> "별도 여행으로 가져오기"; ImportDisposition.PreviouslyDeleted -> "새 여행으로 복원"; ImportDisposition.AlreadyImported -> "가져온 여행 확인"; else -> "확인 후 가져오기" })
                }
            }
        }
        item {
            HorizontalDivider(); Text("여행 백업 내보내기", style = MaterialTheme.typography.titleLarge)
            Text("전역 저장 장소는 포함되지 않습니다. 새 Google 검색 장소는 직접 입력한 이름·메모와 장소 ID만 내보냅니다. 현재 웹 가져오기는 이 참조의 지도 위치를 자동 복원하지 않습니다.",style=MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = { choosing = true }, enabled = trips.isNotEmpty() && !state.busy) { Text(trips.find { it.id == selected }?.name ?: "내보낼 여행 선택") }
            Button(onClick = { trips.find { it.id == selected }?.let(model::requestExport) }, enabled = !state.busy && trips.any { it.id == selected }, modifier = Modifier.fillMaxWidth().testTag("backupExport")) { Text("JSON 파일로 내보내기") }
            Text("공유 연결·관리 권한 정보는 내보내지 않습니다.", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (choosing) AlertDialog(onDismissRequest = { choosing = false }, title = { Text("내보낼 여행") }, text = {
        LazyColumn { items(trips.size) { index -> TextButton(onClick = { selected = trips[index].id; choosing = false }) { Text(trips[index].name) } } }
    }, confirmButton = { TextButton(onClick = { choosing = false }) { Text("취소") } })
}
