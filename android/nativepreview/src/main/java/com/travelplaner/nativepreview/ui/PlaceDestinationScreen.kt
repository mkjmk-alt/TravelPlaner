package com.travelplaner.nativepreview.ui
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun PlaceDestinationScreen(model:TripViewModel,state:TripUiState,selection:PlaceSelection,draft:PlaceDraft,activeTripID:String,onActiveTrip:(String)->Unit,onBack:()->Unit,onAdded:()->Unit=onBack) {
    var tripID by rememberSaveable { mutableStateOf(activeTripID.takeIf { id -> state.trips.any { it.id==id } } ?: "") }
    var day by rememberSaveable { mutableIntStateOf(0) }; val operationID=rememberSaveable { UUID.randomUUID().toString() }
    val newDraftKey = rememberSaveable { "draft-new:" + UUID.randomUUID().toString() }
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var tripMenu by remember { mutableStateOf(false) }; var dayMenu by remember { mutableStateOf(false) }
    val scope=rememberCoroutineScope()
    var creating by rememberSaveable { mutableStateOf(false) }
    if(creating) {
        LaunchedEffect(newDraftKey) { model.openDraft(newDraftKey) }
        val editor=state.editors[newDraftKey]
        LaunchedEffect(editor?.savedTripId) { editor?.savedTripId?.let { id -> tripID=id; day=0; model.acknowledgeSave(newDraftKey); creating=false } }
        BackHandler(enabled=editor?.saving != true) { creating=false }
        if(editor!=null) TripEditor(true,editor,{creating=false},{model.changeDraft(newDraftKey,it)},{model.saveDraft(newDraftKey)})
        return
    }
    BackHandler(enabled=!busy) { onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        TextButton(onClick=onBack,enabled=!busy) { Text("뒤로") }
        Text("일정에 추가",style=MaterialTheme.typography.headlineMedium)
        Box {
            OutlinedButton(onClick={tripMenu=true},modifier=Modifier.testTag("destinationTrip")) { Text(state.trips.firstOrNull { it.id==tripID }?.name ?: "여행 선택") }
            DropdownMenu(tripMenu,{tripMenu=false}) { state.trips.forEach { trip ->
                DropdownMenuItem(text={Text(trip.name)},onClick={tripID=trip.id; day=0; tripMenu=false})
            } }
        }
        TextButton(onClick={creating=true},enabled=!busy) { Text("새 여행 만들기") }
        state.trips.firstOrNull { it.id==tripID }?.let { trip ->
            Box {
                OutlinedButton(onClick={dayMenu=true},modifier=Modifier.testTag("destinationDay")) { Text(if(day==0) "예비 목록" else "${day}일차") }
                DropdownMenu(dayMenu,{dayMenu=false}) {
                    (0..trip.dayCount).forEach { number -> DropdownMenuItem(text={Text(if(number==0) "예비 목록" else "${number}일차")},onClick={day=number; dayMenu=false}) }
                }
            }
        }
        Text(draft.name)
        Text("저장 장소는 그대로 두고 일정에 복사합니다.",style=MaterialTheme.typography.bodySmall)
        error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        Button(onClick={
            if(!busy) { busy=true; scope.launch {
                try {
                    model.attachPlace(tripID,if(day==0) ScheduleSection.Reserve else ScheduleSection.Day(day),operationID,draft,selection)
                    onActiveTrip(tripID); onAdded()
                } catch(cancel:CancellationException) { throw cancel }
                catch(issue:Exception) { error=issue.message ?: "추가하지 못했어요. 다시 확인해주세요." }
                finally { busy=false }
            } }
        },enabled=tripID.isNotEmpty() && !busy,modifier=Modifier.fillMaxWidth().testTag("destinationConfirm")) { Text("선택한 일정에 추가") }
    }
}
