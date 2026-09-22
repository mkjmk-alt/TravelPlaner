package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.data.MemoryDraftStore
import com.travelplaner.nativepreview.domain.JournalEditorDraft
import com.travelplaner.nativepreview.domain.JournalEditorMode
import com.travelplaner.nativepreview.data.TravelMediaStore
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.nio.file.Files

class MemoryFileStoreTest {
    @Test fun photoAndDraftPersistByTripIdentity() {
        val root = Files.createTempDirectory("trip-media").toFile()
        try {
            val media = TravelMediaStore(root.resolve("media"))
            val bytes = byteArrayOf(0x89.toByte(),0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1)
            val reference = media.write(bytes, "trip-1")
            assertArrayEquals(bytes, media.read(reference))
            val drafts = MemoryDraftStore(root.resolve("drafts"))
            drafts.save(buildJsonObject { put("title", "초안") }, "trip-1", "journal", "draft-1")
            assertEquals("초안", drafts.load("trip-1", "journal", "draft-1")!!["title"]!!.toString().trim('"'))
        } finally { root.deleteRecursively() }
    }

    @Test fun journalEditorDraftPersistsByTripAndDraftIdentityAndCanBeDiscarded() {
        val root = Files.createTempDirectory("journal-draft").toFile()
        try {
            val drafts = MemoryDraftStore(root.resolve("drafts"))
            val draft = JournalEditorDraft(
                tripId = "trip-a",
                draftId = "edit:journal-a",
                mode = JournalEditorMode.EDIT,
                entryId = "journal-a",
                date = "2026-10-10",
                title = "기록 초안",
                body = "앱을 종료해도 남아야 해요.",
                removePhoto = true,
                stagedPhotoFileName = "photo.png",
                updatedAt = 10.0,
            )

            drafts.saveJournal(draft)

            assertEquals(draft, drafts.loadJournal("trip-a", "edit:journal-a"))
            assertNull(drafts.loadJournal("trip-b", "edit:journal-a"))
            assertNull(drafts.loadJournal("trip-a", "new"))

            drafts.removeJournal("trip-a", "edit:journal-a")
            assertNull(drafts.loadJournal("trip-a", "edit:journal-a"))
        } finally {
            root.deleteRecursively()
        }
    }

    @Test fun journalEditorDraftCarriesStagedPhotoReferenceAcrossPersistence() {
        val draft = JournalEditorDraft(
            tripId = "trip-a",
            draftId = "new",
            mode = JournalEditorMode.NEW,
            date = "2026-10-10",
            title = "사진 기록",
            body = "사진을 고른 직후 종료되어도 복구되어야 해요.",
            stagedPhotoFileName = "photo.png",
            updatedAt = 20.0,
        )
        assertEquals("photo.png", draft.toJson()["stagedPhotoFileName"]?.toString()?.trim('"'))
    }

    @Test fun journalDraftStoreRemovesOnlyDraftsOlderThanRetentionWindow() {
        val root = Files.createTempDirectory("journal-retention").toFile()
        try {
            val drafts = MemoryDraftStore(root.resolve("drafts"))
            val now = 2_000_000_000_000.0
            val old = JournalEditorDraft("trip-a", "old", JournalEditorMode.NEW, date = "", title = "오래된 초안", body = "", updatedAt = now - 31 * 24 * 60 * 60 * 1000.0)
            val fresh = JournalEditorDraft("trip-a", "fresh", JournalEditorMode.NEW, date = "", title = "최근 초안", body = "", updatedAt = now - 1 * 24 * 60 * 60 * 1000.0)
            drafts.saveJournal(old)
            drafts.saveJournal(fresh)

            val removed = drafts.removeStaleJournals(now, 30 * 24 * 60 * 60 * 1000.0)

            assertEquals(listOf("old"), removed.map { it.draftId })
            assertNull(drafts.loadJournal("trip-a", "old"))
            assertNotNull(drafts.loadJournal("trip-a", "fresh"))
        } finally {
            root.deleteRecursively()
        }
    }

    @Test fun imageInputReadsSupportedBytesWithoutUsingBackupLimit() {
        val bytes = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x2a)

        assertArrayEquals(bytes, com.travelplaner.nativepreview.data.BackupFileAccess.readImage(ByteArrayInputStream(bytes)))
    }

    @Test fun imageInputRejectsUnsupportedAndOversizeProviderContent() {
        assertThrows(IllegalArgumentException::class.java) {
            com.travelplaner.nativepreview.data.BackupFileAccess.readImage(ByteArrayInputStream(byteArrayOf(1, 2, 3)))
        }
        assertThrows(IllegalArgumentException::class.java) {
            val oversized = ByteArray(TravelMediaStore.maxImageBytes + 1)
            oversized[0] = 0x89.toByte(); oversized[1] = 0x50; oversized[2] = 0x4e; oversized[3] = 0x47
            oversized[4] = 0x0d; oversized[5] = 0x0a; oversized[6] = 0x1a; oversized[7] = 0x0a
            com.travelplaner.nativepreview.data.BackupFileAccess.readImage(ByteArrayInputStream(oversized))
        }
    }

    @Test fun imageSelectionFailurePreservesPreviouslyStagedPhoto() {
        val previous = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

        val state = com.travelplaner.nativepreview.data.BackupFileAccess.imageSelectionFailure(previous, "previous.png", "읽기 실패")

        assertArrayEquals(previous, state.bytes)
        assertEquals("previous.png", state.fileName)
        assertEquals("읽기 실패", state.error)
    }
}
