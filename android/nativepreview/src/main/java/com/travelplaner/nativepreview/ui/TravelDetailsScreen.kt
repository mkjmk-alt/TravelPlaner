package com.travelplaner.nativepreview.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Composable
fun TravelDetailsScreen(trip: TripDocument, onBack: () -> Unit, onChange: (MemoryChange) -> Unit) {
    val source = trip.json["travelDetails"]?.jsonObject ?: JsonObject(emptyMap())
    var departure by rememberSaveable { mutableStateOf(source["departure"]?.jsonPrimitive?.contentOrNull.orEmpty()) }
    var arrival by rememberSaveable { mutableStateOf(source["arrival"]?.jsonPrimitive?.contentOrNull.orEmpty()) }
    var flight by rememberSaveable { mutableStateOf(source["flightNumber"]?.jsonPrimitive?.contentOrNull.orEmpty()) }
    var stayName by rememberSaveable { mutableStateOf(source["stayName"]?.jsonPrimitive?.contentOrNull.orEmpty()) }
    var stayAddress by rememberSaveable { mutableStateOf(source["stayAddress"]?.jsonPrimitive?.contentOrNull.orEmpty()) }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ScreenHeader("항공·숙소 정보", onBack)
        OutlinedTextField(departure, { departure = it }, Modifier.fillMaxWidth().testTag("travel-details-departure"), label = { Text("출발지") })
        OutlinedTextField(arrival, { arrival = it }, Modifier.fillMaxWidth(), label = { Text("도착지") })
        OutlinedTextField(flight, { flight = it }, Modifier.fillMaxWidth(), label = { Text("항공편") })
        OutlinedTextField(stayName, { stayName = it }, Modifier.fillMaxWidth(), label = { Text("숙소 이름") })
        OutlinedTextField(stayAddress, { stayAddress = it }, Modifier.fillMaxWidth(), label = { Text("숙소 주소") })
        Button(onClick = {
            val values = mapOf("departure" to departure, "arrival" to arrival, "flightNumber" to flight, "stayName" to stayName, "stayAddress" to stayAddress)
            val expected = values.keys.associateWith { source[it]?.jsonPrimitive?.contentOrNull.orEmpty() }
            onChange(MemoryChange.SetTravelDetails(values, expected))
        }, modifier = Modifier.fillMaxWidth()) { Text("저장") }
    }
}
