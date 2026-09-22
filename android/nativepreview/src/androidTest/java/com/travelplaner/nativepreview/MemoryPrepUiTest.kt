package com.travelplaner.nativepreview

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import java.util.UUID

/** Route smoke test: each memory/preparation feature is a child of More, not a global tab. */
class MemoryPrepUiTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun moreChildRoutesReturnToMore() {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag("tab-trips").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("tab-trips").performClick()
        rule.onNodeWithTag("trip-list").performScrollToNode(hasTestTag("trip-create"))
        rule.onNodeWithTag("trip-create").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-name").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("trip-name").performTextInput("Memory QA ${UUID.randomUUID().toString().take(6)}")
        rule.onNodeWithTag("trip-save").performScrollTo().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithTag("tab-more").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").assertExists()
        rule.onNodeWithTag("trip-back").performClick()
        rule.onNodeWithTag("openPrep").performClick()
        rule.onNodeWithTag("checklist-input").assertExists()
        rule.onNodeWithTag("trip-back").performClick()
        rule.onNodeWithTag("openDetails").performClick()
        rule.onNodeWithTag("travel-details-departure").assertExists()
        rule.onNodeWithTag("trip-back").performClick()
        rule.onNodeWithTag("tab-more").assertIsSelected()
    }

    @Test fun memoryRecordCanEditAndConfirmDelete() {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag("tab-trips").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("tab-trips").performClick()
        rule.onNodeWithTag("trip-list").performScrollToNode(hasTestTag("trip-create"))
        rule.onNodeWithTag("trip-create").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-name").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("trip-name").performTextInput("Memory Edit QA ${UUID.randomUUID().toString().take(6)}")
        rule.onNodeWithTag("trip-save").performScrollTo().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithTag("tab-more").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").performTextInput("Original Memory")
        rule.onNodeWithTag("memory-save").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-row-0").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("memory-edit-0").performClick()
        rule.onNodeWithTag("memory-title").performTextClearance()
        rule.onNodeWithTag("memory-title").performTextInput("Edited Memory")
        rule.onNodeWithTag("memory-edit-save").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-row-0").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("memory-delete-0").performClick()
        rule.onNodeWithTag("memory-delete-confirm").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-row-0").fetchSemanticsNodes().isEmpty() }
        rule.onNodeWithTag("memory-row-0").assertDoesNotExist()
    }

    @Test fun memoryDraftRestoresAfterLeavingAndReentering() {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag("tab-trips").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("tab-trips").performClick()
        rule.onNodeWithTag("trip-list").performScrollToNode(hasTestTag("trip-create"))
        rule.onNodeWithTag("trip-create").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-name").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("trip-name").performTextInput("Memory Draft QA ${UUID.randomUUID().toString().take(6)}")
        rule.onNodeWithTag("trip-save").performScrollTo().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithTag("tab-more").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").performTextInput("Restored Memory Draft")
        Thread.sleep(500)
        rule.onNodeWithTag("trip-back").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").assertTextContains("Restored Memory Draft")
    }
}
