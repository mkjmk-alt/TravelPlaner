package com.travelplaner.nativepreview.map
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import com.travelplaner.nativepreview.domain.*
import kotlinx.coroutines.delay

fun nativeMapsKey(context:Context):String? = MapConfiguration.key(
    context.packageManager.getApplicationInfo(context.packageName,PackageManager.GET_META_DATA).metaData?.getString("com.google.android.geo.API_KEY"))
@Composable
fun NativeMapPane(projection:MapProjection,command:CameraCommand?,active:Boolean=true,onSelect:(MapMarker)->Unit={},modifier:Modifier=Modifier,initialCamera:MapCameraSnapshot?=null,onCameraIdle:(MapCameraSnapshot)->Unit={}) {
    val context=LocalContext.current
    val key=remember(context) { nativeMapsKey(context) }
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    var ready by remember { mutableStateOf(false) }; var delayed by remember { mutableStateOf(false) }; var retry by remember { mutableIntStateOf(0) }
    Box(modifier.clipToBounds()) {
        if(key==null) {
            Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainerLow).padding(16.dp).testTag("nativeMapUnavailable"),
                verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally) {
                Text("지도 연결 준비 중",style=MaterialTheme.typography.titleMedium)
                Text("네이티브 지도 키가 필요합니다. 일정과 저장 장소는 계속 사용할 수 있어요.",style=MaterialTheme.typography.bodySmall)
            }
        } else {
            key(retry) { GoogleMapSurface(projection,command,active,onSelect,{ready=true; delayed=false},Modifier.fillMaxSize(),initialCamera,onCameraIdle) }
            if(delayed) Surface(Modifier.align(Alignment.TopCenter).padding(8.dp),tonalElevation=4.dp) {
                Row(verticalAlignment=Alignment.CenterVertically) {
                    Text("지도 불러오기 지연",style=MaterialTheme.typography.bodySmall)
                    TextButton(onClick={ready=false; delayed=false; retry++}) { Text("다시 시도") }
                }
            }
            LaunchedEffect(active,lifecycle,retry) {
                if(active && lifecycle.isAtLeast(Lifecycle.State.RESUMED) && !ready) { delay(15000); if(!ready) delayed=true }
            }
        }
    }
}
