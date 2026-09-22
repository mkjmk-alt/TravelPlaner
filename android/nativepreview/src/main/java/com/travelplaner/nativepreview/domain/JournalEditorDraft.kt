package com.travelplaner.nativepreview.domain

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

enum class JournalEditorMode { NEW, EDIT }

data class JournalEditorDraft(
    val tripId: String,
    val draftId: String,
    val mode: JournalEditorMode,
    val entryId: String? = null,
    val date: String,
    val title: String,
    val body: String,
    val removePhoto: Boolean = false,
    val stagedPhotoFileName: String? = null,
    val updatedAt: Double,
) {
    fun toJson(): JsonObject = buildJsonObject {
        put("tripId", JsonPrimitive(tripId))
        put("draftId", JsonPrimitive(draftId))
        put("mode", JsonPrimitive(mode.name.lowercase()))
        if (entryId == null) put("entryId", JsonNull) else put("entryId", JsonPrimitive(entryId))
        put("date", JsonPrimitive(date))
        put("title", JsonPrimitive(title))
        put("body", JsonPrimitive(body))
        put("removePhoto", JsonPrimitive(removePhoto))
        if (stagedPhotoFileName == null) put("stagedPhotoFileName", JsonNull) else put("stagedPhotoFileName", JsonPrimitive(stagedPhotoFileName))
        put("updatedAt", JsonPrimitive(updatedAt))
    }

    companion object {
        fun fromJson(json: JsonObject): JournalEditorDraft {
            fun text(key: String) = json[key]?.jsonPrimitive?.contentOrNull.orEmpty()
            val mode = when (text("mode")) {
                "edit" -> JournalEditorMode.EDIT
                else -> JournalEditorMode.NEW
            }
            return JournalEditorDraft(
                tripId = text("tripId"),
                draftId = text("draftId"),
                mode = mode,
                entryId = json["entryId"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull,
                date = text("date"),
                title = text("title"),
                body = text("body"),
                removePhoto = json["removePhoto"]?.jsonPrimitive?.booleanOrNull ?: false,
                stagedPhotoFileName = json["stagedPhotoFileName"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull,
                updatedAt = json["updatedAt"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            )
        }
    }
}
