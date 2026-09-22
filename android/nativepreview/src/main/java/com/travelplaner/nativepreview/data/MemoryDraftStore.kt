package com.travelplaner.nativepreview.data

import com.travelplaner.nativepreview.domain.TripBackup
import com.travelplaner.nativepreview.domain.JournalEditorDraft
import kotlinx.serialization.json.*
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID

class MemoryDraftStore(private val root: File) {
    companion object { const val defaultJournalMaxAgeMillis = 30 * 24 * 60 * 60 * 1000.0 }
    init { require(root.mkdirs() || root.isDirectory) }
    fun save(payload: JsonObject, tripId: String, feature: String, draftId: String) {
        val file = file(tripId, feature, draftId)
        val parent = checkNotNull(file.parentFile)
        require(parent.mkdirs() || parent.isDirectory)
        val temporary = File(parent, ".${file.name}.${UUID.randomUUID()}.tmp")
        try {
            temporary.writeText(payload.toString())
            try {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            } catch (_: AtomicMoveNotSupportedException) {
                Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
        } finally {
            if (temporary.exists()) temporary.delete()
        }
    }
    fun load(tripId: String, feature: String, draftId: String): JsonObject? = file(tripId, feature, draftId).takeIf(File::exists)?.let { Json.parseToJsonElement(it.readText()).jsonObject }
    fun remove(tripId: String, feature: String, draftId: String) { file(tripId, feature, draftId).takeIf(File::exists)?.delete() }
    fun saveJournal(draft: JournalEditorDraft, draftIdOverride: String? = null) = save(draft.toJson(), draft.tripId, "journal-editor", draftIdOverride ?: draft.draftId)
    fun loadJournal(tripId: String, draftId: String): JournalEditorDraft? = load(tripId, "journal-editor", draftId)?.let(JournalEditorDraft::fromJson)
    fun removeJournal(tripId: String, draftId: String) = remove(tripId, "journal-editor", draftId)
    fun removeStaleJournals(nowMillis: Double = System.currentTimeMillis().toDouble(), maxAgeMillis: Double = defaultJournalMaxAgeMillis): List<JournalEditorDraft> {
        require(maxAgeMillis >= 0)
        val cutoff = nowMillis - maxAgeMillis
        return root.walkTopDown()
            .filter { it.isFile && it.extension == "json" }
            .mapNotNull { candidate ->
                val draft = runCatching { Json.parseToJsonElement(candidate.readText()).jsonObject.let(JournalEditorDraft::fromJson) }.getOrNull()
                if (draft == null || draft.tripId.isBlank() || draft.draftId.isBlank() || draft.updatedAt >= cutoff || !candidate.delete()) null else draft
            }
            .sortedWith(compareBy<JournalEditorDraft> { it.updatedAt }.thenBy { it.draftId })
            .toList()
    }
    private fun file(tripId: String, feature: String, draftId: String): File = File(File(root, digest(tripId)), digest(feature) + File.separator + digest(draftId) + ".json")
    private fun digest(value: String) = TripBackup.hash(value.encodeToByteArray())
}
