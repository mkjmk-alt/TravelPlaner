package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/** Adds an app-private media reference without rewriting the rest of a journal entry. */
object MemoryPhotoDraft {
    fun attach(change: MemoryChange, fileName: String): MemoryChange {
        require(fileName.matches(Regex("[A-Za-z0-9-]+\\.(jpg|jpeg|png)"))) { "사진 참조가 올바르지 않습니다." }
        return when (change) {
            is MemoryChange.AddJournal -> MemoryChange.AddJournal(
                change.operationId,
                JsonObject(change.entry + ("imageFileName" to JsonPrimitive(fileName))),
            )
            is MemoryChange.EditJournal -> {
                val changes = buildJsonObject {
                    change.changes.forEach { (key, value) -> put(key, value) }
                    put("imageFileName", JsonPrimitive(fileName))
                    put("imageDataUrl", JsonNull)
                }
                MemoryChange.EditJournal(change.selector, changes, change.expected)
            }
            else -> error("사진은 여행 기록에만 첨부할 수 있습니다.")
        }
    }
}
