package com.travelplaner.nativepreview.ui
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import com.travelplaner.nativepreview.domain.*

/** Only placeID and user-written draft strings survive navigation/process restoration. */
@Composable
fun GoogleScheduleScreen(model:TripViewModel,state:TripUiState,placeID:String,activeTripID:String,onActiveTrip:(String)->Unit,onClose:()->Unit) {
    var fields by rememberSaveable(placeID) { mutableStateOf(listOf<String>()) }
    var choosing by rememberSaveable(placeID) { mutableStateOf(false) }
    val holder=rememberSaveableStateHolder()
    if(choosing && fields.size==6) {
        val draft=PlaceDraft(fields[0],fields[1],fields[2],fields[3],fields[4],fields[5])
        PlaceDestinationScreen(model,state,PlaceSelection(PlaceReference.Google(placeID)),draft,activeTripID,onActiveTrip,{choosing=false},onClose)
    } else {
        BackHandler { onClose() }
        holder.SaveableStateProvider("draft") {
            SavedPlaceEditorScreen(model,placeID,onClose,{},onContinue={_,draft ->
                fields=listOf(draft.name,draft.displayName,draft.loc,draft.time,draft.memo,draft.emoji); choosing=true
            })
        }
    }
}
