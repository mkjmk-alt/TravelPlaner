package com.travelplaner.nativepreview.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import java.util.UUID

@Composable
fun TravelPrepScreen(trip: TripDocument, onBack: () -> Unit, onChange: (MemoryChange) -> Unit) {
    var label by rememberSaveable { mutableStateOf("") }
    val rows = (trip.json["checklist"] as? JsonArray) ?: JsonArray(emptyList())
    Column(Modifier.fillMaxSize().padding(20.dp)) {
        ScreenHeader("여행 준비", onBack)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(label, { label = it }, Modifier.weight(1f).testTag("checklist-input"), label = { Text("준비 항목") }, singleLine = true); Button(onClick = { onChange(MemoryChange.AddChecklist(UUID.randomUUID().toString(), buildJsonObject { put("id", UUID.randomUUID().toString()); put("label", label.trim()); put("checked", false) })); label = "" }, enabled = label.isNotBlank()) { Icon(Icons.Outlined.Add, null); Text("추가") } }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
            itemsIndexed(rows) { index, element ->
                val row = element.jsonObject; val checked = row["checked"]?.jsonPrimitive?.booleanOrNull == true
                Row(Modifier.fillMaxWidth().testTag("checklist-row-$index"), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Checkbox(checked, { onChange(MemoryChange.SetChecklistChecked(prepSelector(row, index, rows), !checked)) })
                    Text(row["label"]?.jsonPrimitive?.contentOrNull ?: "항목", Modifier.weight(1f).padding(top = 12.dp))
                    IconButton(onClick = { onChange(MemoryChange.RemoveChecklist(prepSelector(row, index, rows))) }) { Icon(Icons.Outlined.Delete, "삭제") }
                }
            }
        }
    }
}

private fun prepSelector(row: JsonObject, index: Int, rows: JsonArray): MemoryRowSelector = row["id"]?.jsonPrimitive?.let { id ->
    val key = if (id.isString) MemoryItemKey.StringKey(id.content) else id.intOrNull?.let { value -> MemoryItemKey.IntKey(value) }
    MemoryRowSelector(key, index, row, if (key == null) rows else null)
} ?: MemoryRowSelector(null, index, row, rows)
