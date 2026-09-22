package com.travelplaner.nativepreview.map
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import com.travelplaner.nativepreview.domain.Coordinate
import kotlinx.coroutines.*
import kotlin.coroutines.resume

class CurrentLocationClient(private val context:Context,private val requestPermission:suspend ()->Boolean):LocationClient {
    private val manager=context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var listener:LocationListener?=null
    private var pending:CancellableContinuation<LocationOutcome>?=null
    private fun granted(permission:String)=context.checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED
    override suspend fun requestCurrent():LocationOutcome {
        if(pending!=null) return LocationOutcome.Unavailable
        if(!granted(Manifest.permission.ACCESS_COARSE_LOCATION) && !granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            if(!requestPermission()) return LocationOutcome.Denied
        }
        val approximate=!granted(Manifest.permission.ACCESS_FINE_LOCATION)
        val providers=manager.getProviders(true).filter { it==LocationManager.NETWORK_PROVIDER || (!approximate && it==LocationManager.GPS_PROVIDER) }
        if(providers.isEmpty()) return LocationOutcome.Unavailable
        fun valid(value:Location):LocationOutcome? {
            val age=(android.os.SystemClock.elapsedRealtimeNanos()-value.elapsedRealtimeNanos)/1000000
            if(age !in 0..30000 || !value.hasAccuracy() || value.accuracy < 0) return null
            return runCatching { LocationOutcome.Granted(Coordinate(value.latitude,value.longitude),approximate) }.getOrNull()
        }
        return try {
            providers.mapNotNull { manager.getLastKnownLocation(it) }.sortedByDescending { it.elapsedRealtimeNanos }.firstNotNullOfOrNull(::valid)?.let { return it }
            withTimeoutOrNull(10000) {
                suspendCancellableCoroutine { continuation ->
                    pending=continuation
                    val callback=object:LocationListener {
                        override fun onLocationChanged(location:Location) { valid(location)?.let { finish(it) } }
                        override fun onProviderDisabled(provider:String) {}
                        override fun onProviderEnabled(provider:String) {}
                        @Deprecated("Platform callback") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?) {}
                    }
                    listener=callback
                    continuation.invokeOnCancellation { stop() }
                    providers.forEach { manager.requestLocationUpdates(it,0L,0f,callback,Looper.getMainLooper()) }
                }
            } ?: LocationOutcome.TimedOut
        } catch(error:SecurityException) { LocationOutcome.Denied }
        catch(error:IllegalArgumentException) { LocationOutcome.Unavailable }
        finally { stop() }
    }
    private fun stop() { listener?.let { manager.removeUpdates(it) }; listener=null; pending=null }
    private fun finish(value:LocationOutcome) { val continuation=pending; stop(); if(continuation?.isActive==true) continuation.resume(value) }
    override fun cancel() { val continuation=pending; stop(); continuation?.cancel() }
}
