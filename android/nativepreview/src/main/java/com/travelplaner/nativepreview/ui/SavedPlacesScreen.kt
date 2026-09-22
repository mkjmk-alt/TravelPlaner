package com.travelplaner.nativepreview.ui
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
fun SavedPlacesScreen(model:TripViewModel,state:TripUiState,activeTripID:String,onActiveTrip:(String)->Unit) {
    var creating by rememberSaveable { mutableStateOf(false) }
    var selectedID by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { model.refreshSavedPlaces() }
    when {
        creating -> SavedPlaceEditorScreen(model,onBack={creating=false},onSaved={creating=false})
        selectedID!=null -> PlaceDetailScreen(model,state,selectedID!!,activeTripID,onActiveTrip,onBack={selectedID=null})
        else -> LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
            item { Text("저장 장소",style=MaterialTheme.typography.headlineLarge) }
            item { Button(onClick={creating=true},modifier=Modifier.fillMaxWidth().testTag("savedPlaceAddManual")) { Text("장소 직접 등록") } }
            item { OutlinedTextField(query,{query=it},label={Text("내 이름·메모 검색")},modifier=Modifier.fillMaxWidth(),singleLine=true) }
            when {
                state.savedLoading -> item { CircularProgressIndicator() }
                state.savedLoadError!=null -> item { Text(state.savedLoadError,color=MaterialTheme.colorScheme.error); TextButton(onClick=model::refreshSavedPlaces) { Text("다시 불러오기") } }
                else -> {
                    val filtered=state.savedPlaces.filter { query.isBlank() || it.draft.name.contains(query,true) || it.draft.memo.contains(query,true) }
                    if(filtered.isEmpty()) item { Text(if(state.savedPlaces.isEmpty()) "여행 없이도 마음에 드는 장소를 저장할 수 있어요." else "검색 결과가 없습니다.") }
                    items(filtered,key={it.id}) { row ->
                        Card(onClick={selectedID=row.id},modifier=Modifier.fillMaxWidth().testTag("saved-row-"+row.id)) {
                            Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                                Row { Text(row.draft.emoji); Spacer(Modifier.width(8.dp)); Text(row.draft.name,style=MaterialTheme.typography.titleMedium) }
                                if(row.draft.memo.isNotBlank()) Text(row.draft.memo,maxLines=2)
                            }
                        }
                    }
                }
            }
        }
    }
}
@Composable
fun SavedPlaceEditorScreen(model:TripViewModel,googlePlaceID:String?=null,onBack:()->Unit,onSaved:()->Unit,onContinue:((PlaceSelection,PlaceDraft)->Unit)?=null) {
    var name by rememberSaveable { mutableStateOf("") }; var memo by rememberSaveable { mutableStateOf("") }
    var address by rememberSaveable { mutableStateOf("") }; var emoji by rememberSaveable { mutableStateOf("📍") }
    var latitude by rememberSaveable { mutableStateOf("") }; var longitude by rememberSaveable { mutableStateOf("") }
    val operationID=rememberSaveable { UUID.randomUUID().toString() }
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    val scope=rememberCoroutineScope()
    BackHandler(enabled=!busy) { onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(14.dp)) {
        TextButton(onClick=onBack,enabled=!busy) { Text("취소") }
        Text(if(onContinue==null) "장소 저장" else "일정에 추가할 장소",style=MaterialTheme.typography.headlineMedium)
        OutlinedTextField(name,{name=it},label={Text("내가 붙일 이름")},modifier=Modifier.fillMaxWidth().testTag("savedPlaceName"),enabled=!busy)
        if(googlePlaceID!=null) Text("검색 결과를 참고해 직접 이름을 입력해주세요. Google 이름·주소·좌표는 백업에 저장하지 않습니다.",style=MaterialTheme.typography.bodySmall)
        OutlinedTextField(memo,{memo=it},label={Text("메모")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
        OutlinedTextField(emoji,{emoji=it},label={Text("아이콘")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
        if(googlePlaceID==null) {
            OutlinedTextField(address,{address=it},label={Text("주소 (선택)")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
            OutlinedTextField(latitude,{latitude=it},label={Text("위도 (선택)")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
            OutlinedTextField(longitude,{longitude=it},label={Text("경도 (선택)")},modifier=Modifier.fillMaxWidth(),enabled=!busy)
            Text("좌표는 두 값 모두 입력하거나 모두 비워주세요.",style=MaterialTheme.typography.bodySmall)
        }
        error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        Button(onClick={
            if(!busy) { busy=true; scope.launch {
                try {
                    val reference=when {
                        googlePlaceID!=null -> PlaceReference.Google(googlePlaceID)
                        latitude.isBlank() && longitude.isBlank() -> PlaceReference.Unlocated
                        else -> PlaceReference.Manual(Coordinate(latitude.trim().toDoubleOrNull() ?: throw IllegalArgumentException("위도를 확인해주세요."),longitude.trim().toDoubleOrNull() ?: throw IllegalArgumentException("경도를 확인해주세요.")))
                    }
                    val draft=PlaceDraft(name=name,memo=memo,loc=address,emoji=emoji)
                    if(onContinue!=null) { draft.validate(); onContinue(PlaceSelection(reference),draft) }
                    else { model.saveFavorite(PlaceSelection(reference),draft,operationID); onSaved() }
                } catch(cancel:CancellationException) { throw cancel }
                catch(issue:Exception) { error=issue.message ?: "저장하지 못했어요. 입력 내용은 유지됩니다." }
                finally { busy=false }
            } }
        },enabled=!busy,modifier=Modifier.fillMaxWidth().testTag("savedPlaceSave")) { Text(if(busy) "저장 중…" else "저장") }
    }
}
