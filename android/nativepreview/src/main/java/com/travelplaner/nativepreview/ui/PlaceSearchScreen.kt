package com.travelplaner.nativepreview.ui
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.map.*

@Composable
fun PlaceSearchScreen(model:TripViewModel,state:TripUiState,activeTripID:String,onActiveTrip:(String)->Unit) {
    val map=rememberNativeMap(); val mapState by map.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var savingID by rememberSaveable { mutableStateOf<String?>(null) }
    var scheduleID by rememberSaveable { mutableStateOf<String?>(null) }
    var tripMarker by remember { mutableStateOf<MapMarker?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var savedID by rememberSaveable { mutableStateOf<String?>(null) }
    var tripMenu by remember { mutableStateOf(false) }
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val scope=rememberCoroutineScope()
    val references=TripMapProjection.googlePlaceIDs(state.trips.firstOrNull {it.id==activeTripID},state.savedPlaces)
    val showingChild=savingID!=null || savedID!=null || scheduleID!=null
    LaunchedEffect(lifecycle,showingChild,references) {
        if(!lifecycle.isAtLeast(Lifecycle.State.STARTED) || showingChild) {query="";map.deactivate()}
        else map.resolveReferences(references)
    }
    if(savingID!=null) { SavedPlaceEditorScreen(model,savingID,{savingID=null},{savingID=null}); return }
    if(scheduleID!=null) { GoogleScheduleScreen(model,state,scheduleID!!,activeTripID,onActiveTrip,{scheduleID=null}); return }
    if(savedID!=null) { PlaceDetailScreen(model,state,savedID!!,activeTripID,onActiveTrip,{savedID=null}); return }
    val trip=state.trips.firstOrNull { it.id==activeTripID }
    val projection=TripMapProjection.make(trip,state.savedPlaces,mapState.resolved)
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal=16.dp)) {
            OutlinedTextField(query,{query=it; map.search(it)},label={Text("장소 검색")},modifier=Modifier.weight(1f).testTag("placeSearch"),singleLine=true)
            TextButton(onClick={query=""; map.cancelSearch()}) { Text("취소") }
        }
        Box {
            TextButton(onClick={tripMenu=true}) { Text(trip?.name ?: "여행 미선택") }
            DropdownMenu(tripMenu,{tripMenu=false}) {
                DropdownMenuItem(text={Text("여행 미선택")},onClick={onActiveTrip(""); tripMenu=false})
                state.trips.forEach { DropdownMenuItem(text={Text(it.name)},onClick={onActiveTrip(it.id); tripMenu=false}) }
            }
        }
        if(mapState.results.isNotEmpty()) LazyColumn(Modifier.heightIn(max=200.dp).padding(horizontal=16.dp)) {
            items(mapState.results,key={it.placeID}) { prediction -> TextButton(onClick={map.select(prediction.placeID)}) { Text(prediction.text) } }
            item { GooglePlacesAttribution() }
        }
        mapState.selected?.let { selected ->
            LazyColumn(Modifier.heightIn(max=220.dp).padding(horizontal=16.dp)) {
                item { GooglePlaceReference(selected) }
                item { TextButton(onClick={map.focus(selected.coordinate)}) { Text("지도에서 보기") } }
                item { Button(onClick={savingID=selected.placeID}) { Text("내 장소로 저장") } }
                item { OutlinedButton(onClick={scheduleID=selected.placeID}) {Text("일정에 추가")} }
            }
        }
        NativeMapPane(projection,mapState.cameraCommand,onSelect={marker -> if(marker.favoriteID!=null) savedID=marker.favoriteID else tripMarker=marker},modifier=Modifier.fillMaxWidth().weight(1f))
        Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.SpaceBetween) {
            TextButton(onClick={map.fit(projection.markers.map { it.coordinate })}) { Text("전체 장소 보기") }
            TextButton(onClick=map::locate) { Text("현재 위치") }
        }
        if(mapState.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        if(projection.unlocatedItemCount>0) TextButton(onClick={map.resolveReferences(references)}) {Text("위치 미확인 ${projection.unlocatedItemCount}곳 · 다시 조회",style=MaterialTheme.typography.labelSmall)}
        mapState.error?.let { Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall,modifier=Modifier.padding(horizontal=16.dp)) }
        saveError?.let {Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)}
        if(mapState.locationOutcome!=null && mapState.locationOutcome !is LocationOutcome.Granted)
            Text("위치 권한·연결을 확인해주세요. 검색과 직접 등록은 계속 사용할 수 있어요.",style=MaterialTheme.typography.bodySmall,modifier=Modifier.padding(horizontal=16.dp))
    }
    tripMarker?.let {marker -> AlertDialog(onDismissRequest={tripMarker=null},title={Text(marker.label)},text={Text("일정 장소입니다. 저장하거나 지도에서 확인할 수 있어요.")},
        confirmButton={TextButton(onClick={map.focus(marker.coordinate);tripMarker=null}) {Text("지도에서 보기")}},
        dismissButton={TextButton(onClick={
            val source=state.trips.firstOrNull {it.id==marker.tripID}
            val sections=source?.let {listOf(ScheduleSection.Reserve)+(1..it.dayCount).map {day->ScheduleSection.Day(day)}} ?: emptyList()
            val item=source?.let {trip -> sections.flatMap {runCatching {TripSchedule.items(it,trip)}.getOrDefault(emptyList())}.firstOrNull {runCatching {ItemKey.from(it.getValue("id"))==marker.itemKey}.getOrDefault(false)}}
            if(source!=null && item!=null) scope.launch {
                try {model.saveFavorite(PlaceSelection(PlaceReference.Existing,item,source.id,marker.itemKey),PlaceDraft.from(item),java.util.UUID.randomUUID().toString());tripMarker=null}
                catch(cancel:kotlinx.coroutines.CancellationException) {throw cancel}
                catch(_:Exception) {saveError="저장하지 못했어요. 다시 시도해주세요.";tripMarker=null}
            }
        }) {Text("저장 장소에 추가")}}) }
}
