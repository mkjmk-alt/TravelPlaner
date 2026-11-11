package com.travelplaner.nativepreview

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice

/** Scrolls the real form viewport before tapping the CTA, including while the IME is open. */
internal fun ComposeTestRule.tapTripSave() {
    val focused = listOf("trip-name", "trip-country", "trip-start", "trip-end").any { tag ->
        onAllNodesWithTag(tag).fetchSemanticsNodes().any { node ->
            node.config.getOrElse(SemanticsProperties.Focused) { false }
        }
    }
    if (focused) UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
    waitForIdle()
    onNodeWithTag("trip-save").performScrollTo().assertIsDisplayed().performClick()
}

/** Dismisses the editor IME before scrolling and tapping its save action. */
internal fun ComposeTestRule.tapSavedPlaceSave() {
    val focused = onAllNodesWithTag("savedPlaceName").fetchSemanticsNodes().any { node ->
        node.config.getOrElse(SemanticsProperties.Focused) { false }
    }
    if (focused) UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()
    waitForIdle()
    onNodeWithTag("savedPlaceSave").performScrollTo().assertIsDisplayed().performClick()
}

/** Scrolls the journal editor's LazyColumn so its save CTA is exposed above the IME. */
internal fun ComposeTestRule.tapMemorySave(editing: Boolean = false) {
    val tag = if (editing) "memory-edit-save" else "memory-save"
    onNodeWithTag(tag).performScrollTo().assertIsDisplayed().performClick()
}
