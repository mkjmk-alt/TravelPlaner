package com.travelplaner.nativepreview
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import java.util.UUID

class SavedPlacesUITest {
    private val rule=createAndroidComposeRule<MainActivity>()
    @get:Rule val rules=RuleChain.outerRule(NativeNavigationTestRule()).around(rule)

    private fun openDetail(name: String) {
        rule.onNodeWithText(name).performScrollTo().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("일정에 추가").fetchSemanticsNodes().isNotEmpty() }
    }

    private fun waitForSavedPlace(name: String) {
        rule.waitUntil(5_000) {
            rule.onAllNodesWithTag("savedPlaceAddManual").fetchSemanticsNodes().isNotEmpty() &&
                rule.onAllNodesWithText(name).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test fun manualSaveAndReturnWithoutKey() {
        rule.waitUntil(10000) { rule.onAllNodesWithTag("tab-saved").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithTag("savedPlaceAddManual").assertExists().performClick()
        val name="MapQA-" + UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("savedPlaceName").performTextInput(name)
        rule.tapSavedPlaceSave()
        waitForSavedPlace(name)
        rule.onNodeWithTag("tab-map").performClick()
        rule.onNodeWithTag("nativeMapUnavailable").assertExists()
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithText(name).assertExists()
    }
    @Test fun createDestinationReturnsToPendingFavorite() {
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithTag("savedPlaceAddManual").performClick()
        val name="CopyQA-"+UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("savedPlaceName").performTextInput(name)
        rule.tapSavedPlaceSave()
        waitForSavedPlace(name)
        openDetail(name)
        rule.onNodeWithText("일정에 추가").performScrollTo().performClick()
        rule.onNodeWithText("새 여행 만들기").assertExists().performClick()
        val trip="DestinationQA-"+UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("trip-name").performTextReplacement(trip)
        rule.tapTripSave()
        rule.waitUntil(5000) { rule.onAllNodesWithTag("destinationConfirm").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(name).assertExists()
        rule.onNodeWithTag("destinationTrip").assertTextContains(trip)
        rule.onNodeWithTag("destinationConfirm").performScrollTo().performClick()
        rule.waitUntil(5000) { rule.onAllNodesWithTag("destinationConfirm").fetchSemanticsNodes().isEmpty() }
        rule.onNodeWithText(name).assertExists()
    }
    @Test fun systemBackClosesDestinationWithoutLeavingSavedTab() {
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithTag("savedPlaceAddManual").performClick()
        val name="BackQA-"+UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("savedPlaceName").performTextInput(name)
        rule.tapSavedPlaceSave()
        waitForSavedPlace(name)
        openDetail(name)
        rule.onNodeWithText("일정에 추가").performScrollTo().performClick()
        rule.onNodeWithTag("destinationTrip").assertExists()

        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()

        rule.waitUntil(5000) { rule.onAllNodesWithText("일정에 추가").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText("일정에 추가").assertExists()
        rule.onNodeWithTag("tab-saved").assertIsSelected()
    }
    @Test fun systemBackClosesSavedPlaceDetailWithoutLeavingSavedTab() {
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithTag("savedPlaceAddManual").performClick()
        val name="DetailBackQA-"+UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("savedPlaceName").performTextInput(name)
        rule.tapSavedPlaceSave()
        waitForSavedPlace(name)
        openDetail(name)
        rule.onNodeWithText("일정에 추가").performScrollTo().assertExists()

        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()

        rule.waitUntil(5000) { rule.onAllNodesWithTag("savedPlaceAddManual").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithText(name).assertExists()
        rule.onNodeWithTag("tab-saved").assertIsSelected()
    }
    @Test fun systemBackClosesNewTripDraftWithoutLeavingDestination() {
        rule.onNodeWithTag("tab-saved").performClick()
        rule.onNodeWithTag("savedPlaceAddManual").performClick()
        val name="DraftBackQA-"+UUID.randomUUID().toString().take(8)
        rule.onNodeWithTag("savedPlaceName").performTextInput(name)
        rule.tapSavedPlaceSave()
        waitForSavedPlace(name)
        openDetail(name)
        rule.onNodeWithText("일정에 추가").performScrollTo().performClick()
        rule.onNodeWithText("새 여행 만들기").assertExists().performClick()
        rule.onNodeWithTag("trip-name").assertExists()

        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressBack()

        rule.waitUntil(5000) { rule.onAllNodesWithTag("destinationTrip").fetchSemanticsNodes().isNotEmpty() }
        rule.onNodeWithTag("destinationTrip").assertExists()
        rule.onNodeWithText(name).assertExists()
    }
}
