package com.travelplaner.nativepreview
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.geometry.Offset
import androidx.compose.material3.MaterialTheme
import androidx.activity.compose.setContent
import com.travelplaner.nativepreview.domain.*
import com.travelplaner.nativepreview.ui.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class SplitWorkspaceUITest {
    @get:Rule val rule=createAndroidComposeRule<MainActivity>()
    @Test fun freeDividerDoesNotFollowListScrollAndRestores() {
        var trip=TripDocument.create(TripDraft("SplitQA","","2026-09-21","2026-09-21"))
        repeat(50) { index -> trip=TripSchedule.apply(ScheduleChange.Add(ScheduleSection.Day(1),UUID.randomUUID().toString(),PlaceDraft(name="Row-$index")),trip) }
        val original=trip.toJson()
        rule.activityRule.scenario.onActivity { activity -> activity.setContent { MaterialTheme { TripWorkspaceScreen(trip,TripUiState(trips=listOf(trip),loading=false),{},{_,_->},{},{_,_,_->error("Unexpected save in gesture test")}) } } }
        val handle=rule.onNodeWithTag("splitHandle")
        fun value()=handle.fetchSemanticsNode().config[SemanticsProperties.StateDescription]
        assertEquals("지도 50%",value())
        rule.onNodeWithTag("splitListFull").performClick(); assertEquals("지도 0%",value())
        rule.onNodeWithTag("splitRestore").performClick(); assertEquals("지도 50%",value())
        handle.performTouchInput { swipe(center,center+Offset(0f,-137f),durationMillis=700) }
        val resized=value(); assertNotEquals("지도 50%",resized); assertNotEquals("지도 0%",resized)
        rule.onNodeWithTag("itinerary-list").performScrollToNode(hasText("Row-49")); rule.onNodeWithText("Row-49").assertIsDisplayed()
        assertEquals(resized,value())
        rule.onNodeWithTag("splitMapFull").performClick(); assertEquals("지도 100%",value())
        rule.onNodeWithTag("splitRestore").performClick(); assertEquals(resized,value())
        assertEquals(original,trip.toJson())
        val instrumentation = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
        val image = java.io.File(instrumentation.targetContext.getExternalFilesDir(null), "stage3-keyless-free-split.png")
        assertTrue(androidx.test.uiautomator.UiDevice.getInstance(instrumentation).takeScreenshot(image))
    }
}
