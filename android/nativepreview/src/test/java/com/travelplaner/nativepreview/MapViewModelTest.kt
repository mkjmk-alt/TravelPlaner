package com.travelplaner.nativepreview
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.map.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

@OptIn(ExperimentalCoroutinesApi::class)
class MapViewModelTest {
    class Places: PlacesClient {
        val requests=mutableMapOf<String,Continuation<List<PlacePrediction>>>()
        val sessions=mutableListOf<String>()
        override suspend fun autocomplete(query:String,sessionID:String):List<PlacePrediction> {
            sessions.add(sessionID); return suspendCoroutine { requests[query]=it }
        }
        val detailRequests=mutableMapOf<String,Continuation<ResolvedPlace>>()
        override suspend fun details(placeID:String,sessionID:String?):ResolvedPlace = suspendCoroutine { detailRequests[placeID]=it }
        override fun endSession() {}
        fun complete(query:String,items:List<PlacePrediction>) { requests.remove(query)!!.resume(items) }
    }
    class Location: LocationClient {
        var calls=0
        override suspend fun requestCurrent():LocationOutcome { calls++; return LocationOutcome.Denied }
        override fun cancel() {}
    }
    @Test fun referenceResolutionDoesNotSelectOrMoveAndDropsLateResponse() = runTest {
        val absent=MapViewModel(null,Location(),backgroundScope)
        absent.resolveReferences(listOf("a")); runCurrent(); assertNull(absent.state.value.error)
        val client=Places(); val model=MapViewModel(client,Location(),backgroundScope)
        model.resolveReferences(listOf("a","a")); runCurrent()
        val place=ResolvedPlace("a",Coordinate(35.0,139.0),"Provider only","Transient",emptyList(),System.currentTimeMillis())
        client.detailRequests.remove("a")!!.resume(place); runCurrent()
        assertEquals(1,model.state.value.resolved.size); assertNull(model.state.value.selected); assertNull(model.state.value.cameraCommand)
        model.resolveReferences(listOf("b")); runCurrent(); model.deactivate()
        client.detailRequests.remove("b")!!.resume(place); runCurrent(); assertTrue(model.state.value.resolved.isEmpty())
    }
    @Test fun staleSearchDebounceAndCancel() = runTest {
        val places=Places(); val state=MapViewModel(places,Location(),backgroundScope)
        state.search("tok"); runCurrent(); advanceTimeBy(299); runCurrent(); assertTrue(places.requests.isEmpty())
        advanceTimeBy(1); runCurrent(); assertTrue(places.requests.containsKey("tok"))
        state.search("tokyo"); advanceTimeBy(300); runCurrent()
        val b=PlacePrediction("b","Tokyo",emptyList())
        places.complete("tokyo",listOf(b)); runCurrent()
        places.complete("tok",listOf(PlacePrediction("a","Tok",emptyList()))); runCurrent()
        assertEquals(listOf(b),state.state.value.results); assertEquals(1,places.sessions.toSet().size)
        state.cancelSearch(); assertTrue(state.state.value.results.isEmpty()); assertNull(state.sessionID)
    }
    @Test fun locationDeniedStillAllowsSearchNoAutomaticRequest() = runTest {
        val places=Places(); val location=Location(); val model=MapViewModel(places,location,backgroundScope)
        assertEquals(0,location.calls); model.locate(); runCurrent()
        assertEquals(LocationOutcome.Denied,model.state.value.locationOutcome)
        model.applyMarkers(emptyList()); assertEquals(1,location.calls)
        model.search("서울"); advanceTimeBy(300); runCurrent()
        places.complete("서울",listOf(PlacePrediction("s","서울",emptyList()))); runCurrent()
        assertEquals(1,model.state.value.results.size); assertEquals(1,location.calls)
    }
    @Test fun absentKeyNeverCallsFactoryCameraMovesOnlyOnce() {
        var calls=0
        listOf("","  ","\$(TRIPPLOT_MAPS_API_KEY)","YOUR_RESTRICTED_KEY").forEach {
            assertNull(MapConfiguration.makeIfConfigured(it) { calls++; 1 })
        }
        assertEquals(0,calls)
        val queue=CameraQueue(); val moves=mutableListOf<CameraCommand>()
        val command=CameraCommand(target=CameraTarget.Center(Coordinate(35.0,139.0),16f))
        queue.enqueue(command); queue.consume(false) { moves.add(it) }; assertTrue(moves.isEmpty())
        queue.consume(true) { moves.add(it) }; queue.enqueue(command); queue.consume(true) { moves.add(it) }
        assertEquals(1,moves.size)
        queue.enqueue(CameraCommand(target=CameraTarget.Fit(emptyList()))); queue.cancelPending(); queue.consume(true) { moves.add(it) }
        assertEquals(1,moves.size)
    }
}
