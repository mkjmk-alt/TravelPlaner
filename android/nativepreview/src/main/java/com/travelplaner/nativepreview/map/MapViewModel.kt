package com.travelplaner.nativepreview.map
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.UUID

data class PlacePrediction(val placeID:String,val text:String,val attribution:List<String>)
interface PlacesClient {
    suspend fun autocomplete(query:String,sessionID:String):List<PlacePrediction>
    suspend fun details(placeID:String,sessionID:String?):ResolvedPlace
    fun endSession()
}
sealed interface LocationOutcome {
    data class Granted(val coordinate:Coordinate,val approximate:Boolean):LocationOutcome
    data object Denied:LocationOutcome
    data object Restricted:LocationOutcome
    data object Unavailable:LocationOutcome
    data object TimedOut:LocationOutcome
}
interface LocationClient { suspend fun requestCurrent():LocationOutcome; fun cancel() }
sealed interface CameraTarget {
    data class Center(val coordinate:Coordinate,val zoom:Float):CameraTarget
    data class Fit(val coordinates:List<Coordinate>):CameraTarget
}
data class CameraCommand(val id:String=UUID.randomUUID().toString(),val target:CameraTarget)
class CameraQueue {
    private var pending:CameraCommand?=null; private var consumed:String?=null
    fun enqueue(command:CameraCommand) { if(command.id!=consumed) pending=command }
    fun cancelPending() { pending?.let { consumed=it.id }; pending=null }
    fun consume(ready:Boolean,sink:(CameraCommand)->Unit) {
        if(!ready) return
        val command=pending ?: return; pending=null; consumed=command.id; sink(command)
    }
}
data class MapState(val results:List<PlacePrediction> = emptyList(),val selected:ResolvedPlace?=null,val resolved:Map<String,ResolvedPlace> = emptyMap(),
    val markers:List<MapMarker> = emptyList(),val loading:Boolean=false,val error:String?=null,val locationOutcome:LocationOutcome?=null,val cameraCommand:CameraCommand?=null)
class MapViewModel(private val places:PlacesClient?,private val location:LocationClient,private val scope:CoroutineScope) {
    private val mutable=MutableStateFlow(MapState()); val state=mutable.asStateFlow()
    var sessionID:String?=null; private set
    private var generation=0L; private var searchJob:Job?=null; private var locationJob:Job?=null
    private val expiryJobs=mutableMapOf<String,Job>()
    private var resolutionGeneration=0L
    private var resolutionJob:Job?=null
    fun search(query:String) {
        searchJob?.cancel(); val token=++generation
        val trimmed=query.trim()
        mutable.update { it.copy(results=emptyList(),error=null,loading=false) }
        if(trimmed.codePointCount(0,trimmed.length) !in 2..200) { cancelSearch(); return }
        val client=places ?: run { mutable.update { it.copy(error="지도 검색 키가 설정되지 않았습니다. 직접 장소를 등록할 수 있어요.") }; return }
        val session=sessionID ?: UUID.randomUUID().toString().also { sessionID=it }
        mutable.update { it.copy(loading=true) }
        searchJob=scope.launch {
            try {
                delay(300)
                val result=withTimeout(10000) { client.autocomplete(trimmed,session) }
                if(token==generation && isActive) mutable.update { it.copy(results=result,loading=false) }
            } catch(error:Exception) {
                if(token==generation && (error !is CancellationException || error is TimeoutCancellationException)) {
                    mutable.update { it.copy(loading=false,error="장소를 불러오지 못했어요. 다시 검색해주세요.") }; sessionID=null; client.endSession()
                }
            }
        }
    }
    fun cancelSearch() {
        searchJob?.cancel(); searchJob=null; generation++; sessionID=null; places?.endSession()
        mutable.update { it.copy(results=emptyList(),loading=false) }
    }
    fun select(placeID:String) {
        searchJob?.cancel(); val token=++generation; val session=sessionID
        val client=places ?: run { mutable.update { it.copy(error="지도 검색 키가 설정되지 않았습니다.") }; return }
        mutable.update { it.copy(loading=true,error=null,selected=null) }
        searchJob=scope.launch {
            try {
                val detail=withTimeout(10000) { client.details(placeID,session) }
                if(token==generation && isActive) {
                    if(detail.placeID!=placeID) {
                        mutable.update { it.copy(loading=false,error="장소 참조가 변경되었어요. 검색에서 다시 확인해주세요.") }
                        sessionID=null; client.endSession(); return@launch
                    }
                    mutable.update { it.copy(selected=detail,resolved=it.resolved+(detail.placeID to detail),results=emptyList(),loading=false) }
                    sessionID=null; client.endSession(); expiryJobs.remove(detail.placeID)?.cancel()
                    expiryJobs[detail.placeID]=scope.launch {
                        delay(300000)
                        mutable.update { it.copy(resolved=it.resolved-detail.placeID,selected=it.selected?.takeUnless { it.placeID==detail.placeID }) }
                        expiryJobs.remove(detail.placeID)
                    }
                }
            } catch(error:Exception) {
                if(token==generation && (error !is CancellationException || error is TimeoutCancellationException)) {
                    mutable.update { it.copy(loading=false,error="장소 상세를 불러오지 못했어요. 다시 시도해주세요.") }; sessionID=null; client.endSession()
                }
            }
        }
    }
    fun applyMarkers(markers:List<MapMarker>) { mutable.update { it.copy(markers=markers) } }
    fun resolveReferences(ids:List<String>) {
        resolutionJob?.cancel(); val token=++resolutionGeneration
        val client=places ?: return
        resolutionJob=scope.launch {
            for(id in ids.distinct().sorted()) {
                val old=state.value.resolved[id]
                if(old!=null && System.currentTimeMillis()-old.fetchedAt in 0 until 300000) continue
                try {
                    val detail=withTimeout(10000) { client.details(id,null) }
                    if(token!=resolutionGeneration || !isActive) return@launch
                    if(detail.placeID!=id) { mutable.update { it.copy(error="장소 참조가 변경되었어요. 검색에서 다시 확인해주세요.") }; continue }
                    mutable.update { it.copy(resolved=it.resolved+(id to detail)) }
                    expiryJobs.remove(id)?.cancel()
                    expiryJobs[id]=scope.launch {
                        delay(300000); mutable.update { it.copy(resolved=it.resolved-id,selected=it.selected?.takeUnless { it.placeID==id }) }; expiryJobs.remove(id)
                    }
                } catch(error:Exception) {
                    if(token!=resolutionGeneration || !isActive) return@launch
                    if(error !is CancellationException || error is TimeoutCancellationException)
                        mutable.update { it.copy(error="일부 장소의 위치를 조회하지 못했어요. 위치 다시 조회를 눌러 재시도할 수 있어요.") }
                }
            }
        }
    }
    fun focus(coordinate:Coordinate) { mutable.update { it.copy(cameraCommand=CameraCommand(target=CameraTarget.Center(coordinate,16f))) } }
    fun fit(coordinates:List<Coordinate>) {
        if(coordinates.isEmpty()) { mutable.update { it.copy(error="표시할 위치가 없습니다.") }; return }
        mutable.update { it.copy(cameraCommand=CameraCommand(target=if(coordinates.size==1) CameraTarget.Center(coordinates[0],16f) else CameraTarget.Fit(coordinates))) }
    }
    fun locate() {
        if(locationJob?.isActive==true) return
        locationJob=scope.launch {
            val outcome=location.requestCurrent()
            mutable.update { it.copy(locationOutcome=outcome) }
            if(outcome is LocationOutcome.Granted) focus(outcome.coordinate)
        }
    }
    fun deactivate() {
        resolutionGeneration++; resolutionJob?.cancel()
        cancelSearch(); location.cancel(); locationJob?.cancel(); expiryJobs.values.forEach { it.cancel() }; expiryJobs.clear()
        mutable.update { it.copy(selected=null,resolved=emptyMap(),cameraCommand=null) }
    }
}
