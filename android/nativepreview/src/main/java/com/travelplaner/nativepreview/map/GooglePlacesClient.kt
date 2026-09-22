package com.travelplaner.nativepreview.map
import android.content.Context
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.AutocompleteSessionToken
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest
import com.google.android.libraries.places.api.net.FetchPlaceRequest
import com.google.android.gms.tasks.Task
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class GooglePlacesClient(context:Context,key:String):PlacesClient {
    init { if(!Places.isInitialized()) Places.initializeWithNewPlacesApiEnabled(context.applicationContext,key) }
    private val client=Places.createClient(context.applicationContext)
    private var sessionID:String?=null; private var token:AutocompleteSessionToken?=null
    private fun session(id:String?):AutocompleteSessionToken? {
        if(id==null) return null
        if(sessionID!=id) { sessionID=id; token=AutocompleteSessionToken.newInstance() }
        return token
    }
    override fun endSession() { token=null; sessionID=null }
    override suspend fun autocomplete(query:String,sessionID:String):List<PlacePrediction> = withTimeout(10000) {
        val request=FindAutocompletePredictionsRequest.builder().setQuery(query).setSessionToken(session(sessionID)).build()
        client.findAutocompletePredictions(request).awaitNative().autocompletePredictions.map {
            PlacePrediction(it.placeId,it.getFullText(null).toString(),emptyList())
        }
    }
    override suspend fun details(placeID:String,sessionID:String?):ResolvedPlace = withTimeout(10000) {
        // Attributions arrive with the place; this SDK has no ATTRIBUTIONS field mask.
        val fields=listOf(Place.Field.ID,Place.Field.DISPLAY_NAME,Place.Field.FORMATTED_ADDRESS,Place.Field.LOCATION)
        val request=FetchPlaceRequest.builder(placeID,fields).setSessionToken(session(sessionID)).build()
        val place=client.fetchPlace(request).awaitNative().place
        val point=requireNotNull(place.location) { "장소 좌표를 확인하지 못했어요." }
        ResolvedPlace(place.id ?: placeID,Coordinate(point.latitude,point.longitude),place.displayName ?: "",place.formattedAddress ?: "",place.attributions ?: emptyList(),System.currentTimeMillis())
    }
}
private suspend fun <T> Task<T>.awaitNative():T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { if(continuation.isActive) continuation.resume(it) }
    addOnFailureListener { if(continuation.isActive) continuation.resumeWithException(it) }
    addOnCanceledListener { continuation.cancel() }
}
