package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.MemoryChange
import com.travelplaner.nativepreview.domain.MemoryPhotoDraft
import com.travelplaner.nativepreview.domain.MemoryRowSelector
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class MemoryPhotoDraftTest {
    @Test fun stagedPhotoAddsOnlyTheNativeFileReference() {
        val entry = buildJsonObject {
            put("id", "journal-1")
            put("title", "공원")
            put("customField", "keep-me")
        }
        val change = MemoryPhotoDraft.attach(
            MemoryChange.AddJournal("operation-1", entry),
            "photo.png",
        )

        assertNotNull(change)
        val result = change as MemoryChange.AddJournal
        assertEquals("photo.png", result.entry["imageFileName"]!!.jsonPrimitive.content)
        assertEquals("keep-me", result.entry["customField"]!!.jsonPrimitive.content)
    }

    @Test fun stagedPhotoCanReplaceAnEditedJournalPhoto() {
        val entry = buildJsonObject {
            put("id", "journal-1")
            put("title", "공원")
            put("imageFileName", "old.png")
            put("customField", "keep-me")
        }
        val change = MemoryPhotoDraft.attach(
            MemoryChange.EditJournal(
                MemoryRowSelector.string("journal-1", entry),
                buildJsonObject { put("title", "새 공원") },
                entry,
            ),
            "new.png",
        )

        val result = change as MemoryChange.EditJournal
        assertEquals("new.png", result.changes["imageFileName"]!!.jsonPrimitive.content)
        assertEquals(JsonNull, result.changes["imageDataUrl"])
        assertEquals("새 공원", result.changes["title"]!!.jsonPrimitive.content)
        assertEquals("keep-me", result.expected["customField"]!!.jsonPrimitive.content)
    }
}
