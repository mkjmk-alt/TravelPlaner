package com.travelplaner.nativepreview.map
import android.content.Context
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalContext
import com.google.android.gms.maps.*
import com.google.android.gms.maps.model.*
import com.travelplaner.nativepreview.domain.*

@Composable
fun GoogleMapSurface(projection:MapProjection,command:CameraCommand?,active:Boolean,onSelect:(MapMarker)->Unit,onReady:()->Unit,modifier:Modifier=Modifier,initialCamera:MapCameraSnapshot?=null,onCameraIdle:(MapCameraSnapshot)->Unit={}) {
    val context=LocalContext.current
    val owner=LocalLifecycleOwner.current
    val currentActive by rememberUpdatedState(active)
    val controller=remember(context) { MapSurfaceController(context,initialCamera) }
    DisposableEffect(controller,owner) {
        controller.view.onCreate(null)
        controller.view.getMapAsync { map -> controller.attach(map) }
        val observer=LifecycleEventObserver { _,_ -> controller.lifecycle(owner.lifecycle.currentState,currentActive) }
        owner.lifecycle.addObserver(observer); controller.lifecycle(owner.lifecycle.currentState,active)
        onDispose { owner.lifecycle.removeObserver(observer); controller.destroy() }
    }
    SideEffect { controller.lifecycle(owner.lifecycle.currentState,active) }
    AndroidView(factory={controller.view},modifier=modifier,update={
        controller.update(projection,command,active,onSelect,onReady,onCameraIdle)
    })
}
private class MapSurfaceController(context:Context,private val initialCamera:MapCameraSnapshot?) {
    val view=MapView(context,GoogleMapOptions().mapToolbarEnabled(false).zoomControlsEnabled(false).compassEnabled(true))
    private var map:GoogleMap?=null
    private val markers=mutableMapOf<String,Marker>()
    private val values=mutableMapOf<String,MapMarker>()
    private var routes=emptyList<List<Coordinate>>()
    private var lines=emptyList<Polyline>()
    private val queue=CameraQueue()
    private var projection=MapProjection(emptyList(),0,emptyList())
    private var active=true; private var started=false; private var resumed=false; private var destroyed=false
    private var select:(MapMarker)->Unit={}; private var ready:()->Unit={}
    private var cameraIdle:(MapCameraSnapshot)->Unit={}
    init { view.addOnLayoutChangeListener { _,_,_,_,_,_,_,_,_ -> consume() } }
    fun attach(map:GoogleMap) {
        if(destroyed) return
        this.map=map
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(35.0,135.0),3f))
        initialCamera?.values?.let {v -> map.moveCamera(CameraUpdateFactory.newCameraPosition(CameraPosition(LatLng(v[0],v[1]),v[2].toFloat(),v[4].toFloat(),v[3].toFloat()))) }
        map.setOnCameraIdleListener {
            val p=map.cameraPosition
            MapCameraSnapshot.from(listOf(p.target.latitude,p.target.longitude,p.zoom.toDouble(),p.bearing.toDouble(),p.tilt.toDouble()))?.let(cameraIdle)
        }
        map.setOnMapLoadedCallback { ready(); consume() }
        map.setOnMarkerClickListener { marker -> (marker.tag as? String)?.let(values::get)?.let(select); true }
        map.setOnCameraMoveStartedListener { reason -> if(reason==GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE) queue.cancelPending() }
        reconcile(); consume()
    }
    fun update(projection:MapProjection,command:CameraCommand?,active:Boolean,onSelect:(MapMarker)->Unit,onReady:()->Unit,onCameraIdle:(MapCameraSnapshot)->Unit) {
        this.projection=projection; this.active=active; select=onSelect; ready=onReady
        cameraIdle=onCameraIdle
        if(!active) queue.cancelPending() else command?.let(queue::enqueue)
        reconcile(); consume()
    }
    private fun reconcile() {
        val map=map ?: return
        val desired=projection.markers.associateBy { it.key }
        markers.keys.filter { it !in desired }.forEach { markers.remove(it)?.remove(); values.remove(it) }
        projection.markers.forEach { value ->
            if(values[value.key]!=value) {
                val point=LatLng(value.coordinate.latitude,value.coordinate.longitude)
                val marker=markers[value.key] ?: map.addMarker(MarkerOptions().position(point)) ?: return@forEach
                marker.position=point; marker.title=value.label; marker.tag=value.key
                marker.setIcon(BitmapDescriptorFactory.defaultMarker(if(value.kind==MapMarker.Kind.Saved) BitmapDescriptorFactory.HUE_ROSE else BitmapDescriptorFactory.HUE_CYAN))
                markers[value.key]=marker; values[value.key]=value
            }
        }
        val next=projection.routes.map { route -> route.markers.map { it.coordinate } }
        if(next!=routes) {
            lines.forEach { it.remove() }
            lines=next.map { points -> map.addPolyline(PolylineOptions().addAll(points.map { LatLng(it.latitude,it.longitude) }).color(android.graphics.Color.rgb(65,108,98)).width(5f)) }
            routes=next
        }
    }
    private fun consume() {
        val map=map ?: return
        queue.consume(active && view.width>0 && view.height>0) { command ->
            when(val target=command.target) {
                is CameraTarget.Center -> map.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(target.coordinate.latitude,target.coordinate.longitude),target.zoom))
                is CameraTarget.Fit -> MapBounds.fit(target.coordinates)?.let {
                    val bounds=LatLngBounds(LatLng(it.south,it.west),LatLng(it.north,it.east))
                    val padding=(32*view.resources.displayMetrics.density).toInt().coerceAtMost(minOf(view.width,view.height)/4)
                    map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds,padding))
                }
            }
        }
    }
    fun lifecycle(state:Lifecycle.State,active:Boolean) {
        if(destroyed) return
        val shouldStart=state.isAtLeast(Lifecycle.State.STARTED)
        val shouldResume=state.isAtLeast(Lifecycle.State.RESUMED) && active
        if(resumed && !shouldResume) { view.onPause(); resumed=false }
        if(started && !shouldStart) { view.onStop(); started=false }
        if(!started && shouldStart) { view.onStart(); started=true }
        if(!resumed && shouldResume) { view.onResume(); resumed=true }
    }
    fun destroy() {
        if(destroyed) return
        lifecycle(Lifecycle.State.CREATED,false); destroyed=true
        map?.setOnMarkerClickListener(null); map?.setOnMapLoadedCallback(null); map?.setOnCameraMoveStartedListener(null)
        map?.setOnCameraIdleListener(null)
        markers.values.forEach { it.remove() }; lines.forEach { it.remove() }; markers.clear(); values.clear()
        view.onDestroy(); map=null
    }
}
