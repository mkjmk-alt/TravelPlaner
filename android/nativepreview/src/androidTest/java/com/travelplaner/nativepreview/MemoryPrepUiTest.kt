package com.travelplaner.nativepreview

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import java.util.UUID

/** Route smoke test: each memory/preparation feature is a child of More, not a global tab. */
class MemoryPrepUiTest {
    private val rule = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules = RuleChain.outerRule(NativeNavigationTestRule()).around(rule)

    @Test fun moreChildRoutesReturnToMore() {
        rule.waitUntil(10_000) { rule.onAllNodesWithTag("tab-trips").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("tab-trips").performClick()
        rule.onNodeWithTag("trip-list").performScrollToNode(hasTestTag("trip-create"))
        rule.onNodeWithTag("trip-create").performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("trip-name").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("trip-name").performTextInput("Memory QA ${UUID.randomUUID().toString().take(6)}")
        rule.tapTripSave()
        rule.waitUntil(15_000) { rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() }

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
        rule.tapTripSave()
        try {
            rule.waitUntil(15_000) {
                rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() ||
                    rule.onAllNodesWithTag("form-error").fetchSemanticsNodes().isNotEmpty()
            }
        } catch (error: Throwable) {
            rule.onRoot().printToLog("MemoryTripCreateQA")
            throw error
        }
        if (rule.onAllNodesWithTag("form-error").fetchSemanticsNodes().isNotEmpty()) {
            rule.onRoot().printToLog("MemoryTripCreateQA")
            rule.onNodeWithTag("form-error").assertDoesNotExist()
        }

        rule.onNodeWithTag("tab-more").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").performTextInput("Original Memory")
        rule.tapMemorySave()
        rule.onNodeWithTag("memory-list").performScrollToNode(hasTestTag("memory-row-0"))
        rule.onNodeWithTag("memory-row-0").assertExists()
        rule.onNodeWithTag("memory-list").performScrollToNode(hasTestTag("memory-edit-0"))
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-edit-0").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("memory-edit-0").performClick()
        try {
            rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-edit-save").fetchSemanticsNodes().isNotEmpty() }
        } catch (error: Throwable) {
            rule.onRoot().printToLog("MemoryEditFormQA")
            throw error
        }
        rule.onNodeWithTag("memory-title").performTextClearance()
        rule.onNodeWithTag("memory-title").performTextInput("Edited Memory")
        rule.tapMemorySave(editing = true)
        rule.onNodeWithTag("memory-list").performScrollToNode(hasTestTag("memory-row-0"))
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-row-0").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("Edited Memory").assertExists()
        rule.onNodeWithTag("memory-list").performScrollToNode(hasTestTag("memory-delete-0"))
        rule.waitUntil(5_000) { rule.onAllNodesWithTag("memory-delete-0").fetchSemanticsNodes().isNotEmpty() }
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
        rule.tapTripSave()
        rule.waitUntil(15_000) { rule.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithTag("tab-more").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.onNodeWithTag("memory-title").performTextInput("Restored Memory Draft")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val tripID = requireNotNull(context.getSharedPreferences("native.workspace", 0).getString("activeTrip", null))
        val draftStore = (context.applicationContext as NativePreviewApplication).memoryDraftStore
        rule.waitUntil(15_000) {
            draftStore.loadJournal(tripID, "new")?.title == "Restored Memory Draft"
        }
        rule.onNodeWithTag("trip-back").performClick()
        rule.onNodeWithTag("openMemory").performClick()
        rule.waitUntil(5_000) {
            try {
                rule.onNodeWithTag("memory-title").assertTextContains("Restored Memory Draft")
                true
            } catch (_: AssertionError) {
                false
            }
        }
        rule.onNodeWithTag("memory-title").assertTextContains("Restored Memory Draft")
    }
}
