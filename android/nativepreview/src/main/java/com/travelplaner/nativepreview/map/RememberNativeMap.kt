package com.travelplaner.nativepreview.map
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

@Composable
fun rememberNativeMap():MapViewModel {
    val context=LocalContext.current; val scope=rememberCoroutineScope()
    var permission by remember { mutableStateOf<CancellableContinuation<Boolean>?>(null) }
    val launcher=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val pending=permission; permission=null
        if(pending?.isActive==true) pending.resume(grants.values.any { it })
    }
    val model=remember(context,scope) {
        val location=CurrentLocationClient(context) {
            suspendCancellableCoroutine { continuation ->
                permission=continuation
                continuation.invokeOnCancellation { permission=null }
                launcher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION))
            }
        }
        MapViewModel(nativeMapsKey(context)?.let { GooglePlacesClient(context,it) },location,scope)
    }
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    DisposableEffect(model,lifecycle) {
        val observer=LifecycleEventObserver { _,event -> if(event==Lifecycle.Event.ON_STOP) model.deactivate() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); permission?.cancel(); model.deactivate() }
    }
    return model
}
