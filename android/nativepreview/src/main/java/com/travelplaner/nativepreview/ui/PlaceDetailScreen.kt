package com.travelplaner.nativepreview.ui
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.map.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@Composable
fun PlaceDetailScreen(model:TripViewModel,state:TripUiState,savedID:String,activeTripID:String,onActiveTrip:(String)->Unit,onBack:()->Unit) {
    val row=state.savedPlaces.firstOrNull { it.id==savedID }
    val map=rememberNativeMap(); val mapState by map.state.collectAsState()
    var destination by rememberSaveable { mutableStateOf(false) }; var showMap by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    val scope=rememberCoroutineScope()
    if(destination && row!=null) {
        PlaceDestinationScreen(model,state,row.selection,row.draft,activeTripID,onActiveTrip,{destination=false}); return
    }
    BackHandler(enabled=!busy) { onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        TextButton(onClick=onBack) { Text("뒤로") }
        if(row==null) Text("저장 장소가 삭제되었거나 변경되었습니다.")
        else {
            Text(row.draft.name,style=MaterialTheme.typography.headlineMedium)
            if(row.draft.loc.isNotBlank()) Text(row.draft.loc)
            if(row.draft.memo.isNotBlank()) Text(row.draft.memo)
            val googleID=(row.payload["placeId"] as? JsonPrimitive)?.content?.takeIf { (row.payload["nativePlaceSource"] as? JsonPrimitive)?.content=="google" }
            if(googleID!=null) {
                mapState.resolved[googleID]?.let { GooglePlaceReference(it) } ?: Text("위치는 연결 후 확인할 수 있어요.")
                TextButton(onClick={map.select(googleID)}) { Text("위치 다시 조회") }
            }
            val projection=TripMapProjection.make(null,listOf(row),mapState.resolved)
            OutlinedButton(onClick={showMap=true; projection.markers.firstOrNull()?.let { map.focus(it.coordinate) }}) { Text("지도에서 보기") }
            if(showMap) NativeMapPane(projection,mapState.cameraCommand,modifier=Modifier.fillMaxWidth().height(260.dp))
            Button(onClick={destination=true}) { Text("일정에 추가") }
            TextButton(onClick={deleting=true},enabled=!busy) { Text("저장 장소 삭제",color=MaterialTheme.colorScheme.error) }
            (error ?: mapState.error)?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        }
    }
    if(deleting) AlertDialog(onDismissRequest={if(!busy) deleting=false},title={Text("저장 장소를 삭제할까요?")},
        text={Text("이미 복사한 여행 일정은 그대로 남습니다.")},
        confirmButton={TextButton(onClick={ if(!busy) { busy=true; scope.launch {
            try { model.deleteFavorite(savedID); deleting=false; onBack() }
            catch(cancel:CancellationException) { throw cancel }
            catch(issue:Exception) { error=issue.message }
            finally { busy=false }
        } } },enabled=!busy) { Text("삭제") }},
        dismissButton={TextButton(onClick={deleting=false},enabled=!busy) { Text("취소") }})
}
@Composable
fun GooglePlaceReference(place:ResolvedPlace) {
    Column(verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Text(place.displayName,style=MaterialTheme.typography.titleMedium); Text(place.address)
        place.attribution.forEach { Text(it,style=MaterialTheme.typography.bodySmall) }
        GooglePlacesAttribution()
    }
}
@Composable
fun GooglePlacesAttribution() {
    val resource=if(isSystemInDarkTheme()) com.google.android.libraries.places.R.drawable.places_powered_by_google_dark else com.google.android.libraries.places.R.drawable.places_powered_by_google_light
    Image(painterResource(resource),"Google Maps",Modifier.height(18.dp))
}
