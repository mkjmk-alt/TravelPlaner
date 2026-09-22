package com.travelplaner.nativepreview.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.map.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import java.util.UUID
import kotlin.math.roundToInt

@Composable
fun TripWorkspaceScreen(trip:TripDocument,state:TripUiState,onBack:()->Unit,onEdit:(ScheduleSection,ItemKey?)->Unit,onChange:(ScheduleChange)->Unit,
    onSave:suspend (PlaceSelection,PlaceDraft,String)->Unit) {
    BackHandler { onBack() }
    val prefs=LocalContext.current.getSharedPreferences("native.workspace",0); val key="workspace.${trip.id}."
    var ratio by rememberSaveable(trip.id) { mutableDoubleStateOf(SplitLayout.commit(prefs.getFloat(key+"ratio",0.5f).toDouble())) }
    var interior by rememberSaveable(trip.id) { mutableDoubleStateOf(SplitLayout.restore(prefs.getFloat(key+"interior",0.5f).toDouble())) }
    var selected by rememberSaveable(trip.id) { mutableIntStateOf(prefs.getInt(key+"day",1).coerceIn(0,trip.dayCount)) }
    var cameraValues by rememberSaveable(trip.id) { mutableStateOf(prefs.getString(key+"camera","")!!.split(',').mapNotNull(String::toDoubleOrNull)) }
    val map=rememberNativeMap(); val mapState by map.state.collectAsState(); val scope=rememberCoroutineScope()
    val projection=TripMapProjection.make(trip,emptyList(),mapState.resolved)
    val references=TripMapProjection.googlePlaceIDs(trip,emptyList())
    val listState=rememberLazyListState()
    var selectedMarker by remember { mutableStateOf<MapMarker?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    fun setRatio(value:Double) {
        ratio=SplitLayout.commit(value); if(ratio>0 && ratio<1) interior=ratio
        prefs.edit().putFloat(key+"ratio",ratio.toFloat()).putFloat(key+"interior",interior.toFloat()).apply()
    }
    fun section()=if(selected==0) ScheduleSection.Reserve else ScheduleSection.Day(selected)
    fun showMap(itemKey:ItemKey) {
        if(ratio==0.0) setRatio(SplitLayout.restore(interior))
        projection.markers.firstOrNull { it.itemKey==itemKey }?.let { map.focus(it.coordinate) } ?: map.fit(emptyList())
    }
    fun saveItem(section:ScheduleSection,itemKey:ItemKey) {
        val item=runCatching { TripSchedule.items(section,trip).first { ItemKey.from(it.getValue("id"))==itemKey } }.getOrNull() ?: return
        scope.launch {
            try { onSave(PlaceSelection(PlaceReference.Existing,item,trip.id,itemKey),PlaceDraft.from(item),UUID.randomUUID().toString()); notice="저장 장소에 추가했습니다." }
            catch(error:kotlinx.coroutines.CancellationException) {throw error}
            catch(error:Exception) {notice=error.message ?: "장소를 저장하지 못했어요."}
        }
    }
    LaunchedEffect(references) { map.resolveReferences(references) }
    LaunchedEffect(selected) { prefs.edit().putInt(key+"day",selected).apply() }
    LaunchedEffect(trip.id) {
        val token=prefs.getString(key+"scroll",null)
        val items=runCatching {TripSchedule.items(section(),trip)}.getOrDefault(emptyList())
        val index=items.indexOfFirst {runCatching {ItemKey.from(it.getValue("id")).token==token}.getOrDefault(false)}
        if(index>=0) listState.scrollToItem(index+1)
        snapshotFlow {listState.layoutInfo.visibleItemsInfo.firstOrNull()?.key as? String}.distinctUntilChanged().collect { token ->
            if(token!=null) prefs.edit().putString(key+"scroll",token).apply()
        }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.heightIn(min=44.dp)) {
            TextButton(onClick=onBack,modifier=Modifier.testTag("trip-back")) {Text("뒤로")}
            Text("일정·지도",style=MaterialTheme.typography.titleLarge,modifier=Modifier.padding(8.dp))
        }
        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
            val horizontal=SplitLayout.isHorizontal(maxWidth.value.toDouble(),maxHeight.value.toDouble())
            val density=LocalDensity.current
            val dividerPx=with(density) {44.dp.roundToPx()}
            val extent=with(density) {(if(horizontal) maxWidth else maxHeight).toPx()}-dividerPx
            val currentRatio by rememberUpdatedState(ratio)
            Layout(modifier=Modifier.fillMaxSize(),content={
                Column(Modifier.clipToBounds().then(if(ratio==0.0) Modifier.clearAndSetSemantics {} else Modifier)) {
                    NativeMapPane(projection,mapState.cameraCommand,active=ratio>0,onSelect={ marker ->
                        when(val kind=marker.kind) {is MapMarker.Kind.Day->selected=kind.number;MapMarker.Kind.Reserve->selected=0;else->Unit}
                        selectedMarker=marker
                        scope.launch {
                            val index=runCatching {TripSchedule.items(if(selected==0) ScheduleSection.Reserve else ScheduleSection.Day(selected),trip).indexOfFirst {ItemKey.from(it.getValue("id"))==marker.itemKey}}.getOrDefault(-1)
                            if(index>=0) listState.scrollToItem(index+1)
                        }
                    },modifier=Modifier.fillMaxWidth().weight(1f),initialCamera=MapCameraSnapshot.from(cameraValues),onCameraIdle={camera ->
                        cameraValues=camera.values;prefs.edit().putString(key+"camera",camera.values.joinToString(",")).apply()
                    })
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                        TextButton(onClick={map.fit(projection.markers.map {it.coordinate})}) {Text("전체 장소 보기",style=MaterialTheme.typography.labelSmall)}
                        TextButton(onClick=map::locate) {Text("현재 위치",style=MaterialTheme.typography.labelSmall)}
                    }
                    if(projection.unlocatedItemCount>0) TextButton(onClick={map.resolveReferences(references)}) {Text("위치 미확인 ${projection.unlocatedItemCount}곳 · 다시 조회",style=MaterialTheme.typography.labelSmall)}
                    mapState.error?.let {Text(it,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.error)}
                }
                @Composable fun controls() {
                    IconButton(onClick={setRatio(1.0)},modifier=Modifier.size(44.dp).testTag("splitMapFull")) {Icon(Icons.Outlined.Map,"지도 전체 화면")}
                    Box(Modifier.size(44.dp).testTag("splitHandle").semantics {
                        contentDescription="지도와 일정 크기 조절";stateDescription="지도 ${(ratio*100).roundToInt()}%"
                        progressBarRangeInfo=ProgressBarRangeInfo(ratio.toFloat(),0f..1f,0)
                        setProgress {setRatio(it.toDouble());true}
                        customActions=listOf(CustomAccessibilityAction("지도 영역 10% 늘리기") {setRatio(currentRatio+0.1);true},CustomAccessibilityAction("일정 영역 10% 늘리기") {setRatio(currentRatio-0.1);true})
                    }.pointerInput(horizontal,extent) {
                        var start=0.5;var delta=0.0;var latest=0.5
                        detectDragGestures(onDragStart={start=currentRatio;latest=start;delta=0.0},onDragEnd={setRatio(latest)},onDragCancel={setRatio(latest)}) {change,amount ->
                            change.consume();delta+=if(horizontal) amount.x else amount.y
                            latest=SplitLayout.resize(start,delta,extent.toDouble());ratio=latest
                        }
                    },contentAlignment=androidx.compose.ui.Alignment.Center) {Icon(Icons.Outlined.DragHandle,null)}
                    IconButton(onClick={setRatio(SplitLayout.restore(interior))},modifier=Modifier.size(44.dp).testTag("splitRestore")) {Icon(Icons.Outlined.Splitscreen,"분할 복원")}
                    IconButton(onClick={setRatio(0.0)},modifier=Modifier.size(44.dp).testTag("splitListFull")) {Icon(Icons.Outlined.List,"일정 전체 화면")}
                }
                Surface {
                    if(horizontal) Column(Modifier.fillMaxHeight(),verticalArrangement=Arrangement.Center) {controls()}
                    else Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center) {controls()}
                }
                Box(Modifier.clipToBounds().then(if(ratio==1.0) Modifier.clearAndSetSemantics {} else Modifier)) {
                    ItineraryContent(trip,state,selected,{selected=it},listState,onEdit,onChange,::showMap,::saveItem)
                }
            }) {measurables,constraints ->
                val width=constraints.maxWidth;val height=constraints.maxHeight
                val usable=((if(horizontal) width else height)-dividerPx).coerceAtLeast(0)
                val mapExtent=(usable*ratio).roundToInt();val listExtent=usable-mapExtent
                val mapPlace=measurables[0].measure(Constraints.fixed(if(horizontal) mapExtent else width,if(horizontal) height else mapExtent))
                val divider=measurables[1].measure(Constraints.fixed(if(horizontal) dividerPx else width,if(horizontal) height else dividerPx))
                val list=measurables[2].measure(Constraints.fixed(if(horizontal) listExtent else width,if(horizontal) height else listExtent))
                layout(width,height) {mapPlace.place(0,0);divider.place(if(horizontal) mapExtent else 0,if(horizontal) 0 else mapExtent);list.place(if(horizontal) mapExtent+dividerPx else 0,if(horizontal) 0 else mapExtent+dividerPx)}
            }
        }
    }
    selectedMarker?.let {marker -> AlertDialog(onDismissRequest={selectedMarker=null},title={Text(marker.label)},text={Text("일정의 순서는 바뀌지 않습니다.")},
        confirmButton={TextButton(onClick={marker.itemKey?.let(::showMap);selectedMarker=null}) {Text("지도에서 보기")}},
        dismissButton={TextButton(onClick={marker.itemKey?.let {saveItem(section(),it)};selectedMarker=null}) {Text("저장 장소에 추가")}}) }
    notice?.let {AlertDialog(onDismissRequest={notice=null},text={Text(it)},confirmButton={TextButton(onClick={notice=null}) {Text("확인")}})}
}
