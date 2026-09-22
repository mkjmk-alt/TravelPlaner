package com.travelplaner.nativepreview

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.util.UUID
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import androidx.test.uiautomator.StaleObjectException

class NativePreviewUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun landscapeEditorCanScrollAndSave() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        list(); compose.onNodeWithTag("trip-create").performClick(); waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement("LayoutQA-" + UUID.randomUUID().toString().take(6))
        compose.onNodeWithTag("trip-save").performScrollTo().performClick(); waitFor("trip-detail-title")
        compose.onNodeWithTag("openItinerary").performScrollTo().performClick(); waitFor("addPlace")
        compose.onNodeWithTag("addPlace").performClick(); waitFor("placeName")
        try {
            device.setOrientationLeft(); waitFor("placeName")
            compose.onNodeWithTag("placeName").performScrollTo().performTextReplacement("Landscape place")
            compose.onNodeWithTag("placeMemo").performScrollTo().performTextReplacement("large text memo")
            compose.onNodeWithTag("savePlace").performScrollTo().assertIsDisplayed().performClick(); waitFor("addPlace")
            compose.onNodeWithTag("itinerary-list").performScrollToNode(hasText("large text memo"))
            compose.onNodeWithText("large text memo").performScrollTo().assertIsDisplayed()
        } finally { device.setOrientationNatural(); device.unfreezeRotation() }
    }

    @Test fun realDocumentPickerPreviewCancelAndRepeatImport() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        waitFor("tab-more"); compose.onNodeWithTag("tab-more").performClick()
        compose.onNodeWithTag("backupImport").performClick(); waitFor("backup-list")
        fun select(name: String) {
            compose.onNodeWithTag("backup-list").performScrollToNode(hasTestTag("backupImport"))
            compose.onNodeWithTag("backupImport").performClick()
            device.wait(Until.hasObject(By.pkg("com.google.android.documentsui")), 5000)
            clickFresh(device, By.desc("Show roots"), 5_000, "System picker roots button must be visible")
            device.waitForIdle()
            // The recents grid has the same provider label behind the drawer.
            clickTextParentFresh(device, "TripPlot Test Files", 10_000,
                "Test provider must be visible in the roots drawer")
            val file = device.wait(Until.findObject(By.res("com.google.android.documentsui", "item_root")
                .hasDescendant(By.res("android", "title").text(name))), 10_000)
            if (file == null) {
                val dump = java.io.ByteArrayOutputStream(); device.dumpWindowHierarchy(dump)
                android.util.Log.e("TripPickerQA", dump.toString("UTF-8"))
            }
            assertTrue("Test document must be visible in system picker", file != null)
            clickFresh(device, By.res("com.google.android.documentsui", "item_root")
                .hasDescendant(By.res("android", "title").text(name)), 5_000,
                "Test document must be selectable")
        }
        select("invalid-backup.json"); waitFor("import-error")
        select("legacy-trip-backup.json"); waitFor("import-preview")
        compose.onNodeWithTag("backup-list").performScrollToNode(hasText("취소")); compose.onNodeWithText("취소").performClick()
        compose.onNodeWithTag("import-preview").assertDoesNotExist()
        select("legacy-trip-backup.json"); waitFor("import-preview")
        compose.onNodeWithTag("backup-list").performScrollToNode(hasTestTag("confirmImport")); compose.onNodeWithTag("confirmImport").performClick()
        waitFor("backup-result")
        select("legacy-trip-backup.json"); waitFor("import-preview")
        compose.onNodeWithTag("backup-list").performScrollToNode(hasTestTag("confirmImport")); compose.onNodeWithTag("confirmImport").performClick()
        waitFor("backup-result"); compose.onNodeWithTag("backup-result").assertTextContains("이미 가져온 여행", substring = true)
        // Cancelling the real picker must not produce an extra completion or preview.
        compose.onNodeWithTag("backup-list").performScrollToNode(hasTestTag("backupImport")); compose.onNodeWithTag("backupImport").performClick()
        device.wait(Until.findObject(By.desc("Show roots")), 5000); device.pressBack()
        waitFor("backup-list"); compose.onNodeWithTag("import-preview").assertDoesNotExist()
        compose.onNodeWithTag("backup-list").performScrollToNode(hasText("내보낼 여행 선택"))
        compose.onNodeWithText("내보낼 여행 선택").performClick(); compose.onAllNodesWithText("구형 여행").onFirst().performClick()
        compose.onNodeWithTag("backup-list").performScrollToNode(hasTestTag("backupExport"))
        compose.onNodeWithTag("backupExport").assertIsDisplayed().assertIsEnabled().performClick()
        // Advance Compose frames while async encoding emits the launch event.
        // UiDevice.wait alone leaves the Compose test clock paused here.
        compose.waitUntil(10_000) { device.hasObject(By.pkg("com.google.android.documentsui")) }
        // Use the public Downloads test location so the actual output can be checked
        // across platforms after Gradle removes the isolated provider APK.
        device.wait(Until.findObject(By.desc("Show roots")), 5000)?.click()
        clickTextParentFresh(device, "Downloads", 5_000,
            "Downloads must be visible in the roots drawer")
        val save = device.wait(Until.findObject(By.res("android", "button1").text("SAVE")), 8000)
        if (save == null) {
            val dump = java.io.ByteArrayOutputStream(); device.dumpWindowHierarchy(dump)
            android.util.Log.e("TripPickerQA", dump.toString("UTF-8"))
        }
        requireNotNull(save).click()
        waitFor("backup-result"); compose.onNodeWithTag("backup-result").assertTextContains("백업을 저장", substring = true)
        select("ios-export.json"); waitFor("import-preview")
        val confirmation = hasTestTag("confirmImport") or hasTestTag("keepBothImport")
        compose.onNodeWithTag("backup-list").performScrollToNode(confirmation); compose.onNode(confirmation).performClick()
        waitFor("backup-result")
    }

    @Test fun manualPlaceDraftMoveAndRecreate() {
        list(); compose.onNodeWithTag("trip-create").performClick(); waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement("ScheduleQA-" + UUID.randomUUID().toString().take(6))
        compose.onNodeWithTag("trip-save").performScrollTo().performClick(); waitFor("trip-detail-title")
        compose.onNodeWithTag("openItinerary").performScrollTo().performClick(); waitFor("addPlace")
        compose.onNodeWithTag("section-day-1").performClick(); compose.onNodeWithTag("addPlace").performClick(); waitFor("placeName")
        compose.onNodeWithTag("placeName").performTextReplacement("Tokyo place")
        compose.onNodeWithTag("placeTime").performScrollTo().performTextReplacement("24:00")
        compose.onNodeWithTag("savePlace").performScrollTo().performClick(); waitFor("place-error")
        compose.onNodeWithTag("placeTime").performScrollTo().performTextReplacement("09:30")
        compose.onNodeWithTag("placeMemo").performScrollTo().performTextReplacement("persisted memo")
        compose.onNodeWithTag("tab-map").performClick(); compose.onNodeWithTag("tab-trips").performClick(); waitFor("placeName")
        compose.activityRule.scenario.recreate(); waitFor("placeName")
        compose.onNodeWithTag("placeName").performScrollTo().assertTextContains("Tokyo place")
        compose.onNodeWithTag("savePlace").performScrollTo().performClick(); waitFor("addPlace")
        compose.onNodeWithTag("placeActions").performClick(); compose.onNodeWithText("예비 목록으로 이동").performClick()
        compose.onNodeWithTag("section-reserve").performClick(); compose.onNodeWithText("persisted memo").assertExists()
        compose.onNodeWithTag("placeActions").performClick(); compose.onNodeWithText("장소 삭제").performClick(); compose.onNodeWithText("취소").performClick()
        compose.activityRule.scenario.recreate(); waitFor("addPlace")
        compose.onNodeWithTag("section-reserve").performClick(); compose.onNodeWithText("Tokyo place").assertExists(); compose.onNodeWithText("09:30").assertExists()
        compose.onNodeWithTag("tab-more").performClick(); compose.onNodeWithTag("backupImport").assertExists()
    }

    private fun waitFor(tag: String) {
        compose.waitUntil(15_000) {
            // Returning from Android's DocumentsUI briefly leaves the test
            // rule without a Compose hierarchy while MainActivity is being
            // resumed. Treat that interval as "not ready yet" rather than
            // failing the assertion before the app can render its state.
            try {
                compose.onAllNodes(hasTestTag(tag) and isEnabled()).fetchSemanticsNodes().isNotEmpty()
            } catch (_: IllegalStateException) {
                false
            }
        }
    }

    private fun clickFresh(device: UiDevice, selector: androidx.test.uiautomator.BySelector, timeout: Long, message: String) {
        val deadline = android.os.SystemClock.uptimeMillis() + timeout
        var stale = false
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            val remaining = deadline - android.os.SystemClock.uptimeMillis()
            val target = device.wait(Until.findObject(selector), remaining.coerceAtMost(1_000))
            if (target != null) {
                try {
                    target.click()
                    device.waitForIdle()
                    return
                } catch (_: StaleObjectException) {
                    stale = true
                    device.waitForIdle()
                }
            }
        }
        throw AssertionError("$message${if (stale) " (system picker refreshed repeatedly)" else ""}")
    }

    private fun clickTextParentFresh(device: UiDevice, title: String, timeout: Long, message: String) {
        val deadline = android.os.SystemClock.uptimeMillis() + timeout
        var stale = false
        while (android.os.SystemClock.uptimeMillis() < deadline) {
            val label = device.wait(Until.findObject(By.text(title)),
                (deadline - android.os.SystemClock.uptimeMillis()).coerceAtMost(1_000))
            if (label != null) {
                try {
                    val bounds = label.visibleBounds
                    // The title is a non-clickable child. Tap the provider
                    // card's icon/row area above it so DocumentsUI receives
                    // the click on Android 16's "other apps" layout.
                    if (device.click(bounds.centerX(), (bounds.top - 70).coerceAtLeast(0))) {
                        device.waitForIdle()
                        return
                    }
                } catch (_: StaleObjectException) {
                    stale = true
                    device.waitForIdle()
                }
            }
        }
        throw AssertionError("$message${if (stale) " (system picker refreshed repeatedly)" else ""}")
    }

    private fun list() {
        waitFor("tab-trips")
        compose.onNodeWithTag("tab-trips").performClick()
        // The itinerary adds a deeper destination; restore the real root, not one back step.
        try {
            compose.waitUntil(15_000) { compose.onAllNodesWithTag("trip-list").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithTag("trip-back").fetchSemanticsNodes().isNotEmpty() }
        } catch (error: Throwable) { compose.onRoot().printToLog("TripNavigationQA"); throw error }
        repeat(3) {
            if (compose.onAllNodesWithTag("trip-list").fetchSemanticsNodes().isNotEmpty()) {
                compose.onNodeWithTag("trip-list").performScrollToNode(hasTestTag("trip-create"))
                return
            }
            if (compose.onAllNodesWithTag("trip-back").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithTag("trip-back").performClick()
            compose.waitForIdle()
        }
        waitFor("trip-create")
    }

    @Test fun createEditAndActivityRelaunchReadPersistedTrips() {
        list()
        val name = "UI 여행 " + UUID.randomUUID().toString().take(8)
        compose.onNodeWithTag("trip-create").performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement(name)
        compose.onNodeWithTag("trip-country").performTextReplacement("일본")
        compose.onNodeWithTag("trip-start").performScrollTo().performTextReplacement("2026-10-10")
        compose.onNodeWithTag("trip-end").performScrollTo().performTextReplacement("2026-10-12")
        compose.onNodeWithTag("trip-save").performScrollTo().performClick()
        waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertTextEquals(name)
        compose.onNodeWithText("3일").assertExists()
        compose.activityRule.scenario.recreate()
        waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertTextEquals(name)
        compose.onNodeWithTag("trip-edit").performScrollTo().performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement(name + " 수정")
        compose.onNodeWithTag("trip-save").performScrollTo().performClick()
        waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertTextEquals(name + " 수정")
        compose.activityRule.scenario.recreate()
        waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertTextEquals(name + " 수정")
    }

    @Test fun expenseEditorPersistsAndSettlementOpens() {
        list()
        compose.onNodeWithTag("trip-create").performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement("ExpenseQA-" + UUID.randomUUID().toString().take(6))
        compose.onNodeWithTag("trip-save").performScrollTo().performClick()
        waitFor("trip-detail-title")
        compose.onNodeWithTag("tab-expenses").performClick()
        waitFor("add-expense")
        compose.onNodeWithTag("add-expense").performClick()
        waitFor("expense-amount")
        compose.onNodeWithTag("expense-amount").performTextReplacement("1200")
        compose.onNodeWithTag("expense-amount-krw").performTextReplacement("1200")
        compose.onNodeWithTag("expense-save").performClick()
        waitFor("open-settlement")
        compose.onNodeWithTag("expense-row").assertExists()
        compose.onNodeWithTag("open-settlement").performClick()
        compose.onNodeWithText("총 지출 ₩1200 · 1건").assertExists()
    }

    @Test fun draftSurvivesTabsRecreationAndBackAndValidationIsVisible() {
        list()
        compose.onNodeWithTag("trip-create").performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement("보존할 작성 내용")
        compose.onNodeWithTag("tab-map").performClick()
        compose.onNodeWithTag("placeSearch").assertExists()
        compose.onNodeWithTag("nativeMapUnavailable").assertExists()
        compose.onNodeWithTag("tab-trips").performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").assertTextContains("보존할 작성 내용")
        compose.activityRule.scenario.recreate()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").assertTextContains("보존할 작성 내용")
        compose.onNodeWithTag("trip-back").performClick()
        waitFor("trip-create")
        compose.onNodeWithTag("trip-create").performClick()
        waitFor("trip-name")
        compose.onNodeWithTag("trip-name").assertTextContains("보존할 작성 내용")
        compose.onNodeWithTag("trip-start").performScrollTo().performTextReplacement("2026-02-30")
        compose.onNodeWithTag("trip-save").performScrollTo().performClick()
        waitFor("form-error")
        compose.onNodeWithTag("trip-name").performScrollTo().assertTextContains("보존할 작성 내용")
        assertTrue(compose.onAllNodesWithTag("trip-detail-title").fetchSemanticsNodes().isEmpty())
        compose.onNodeWithTag("trip-back").performClick()
    }

    @Test fun systemBackReturnsFromTripEditorPlaceEditorAndBackup() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        list()
        compose.onNodeWithTag("trip-create").performClick(); waitFor("trip-name")
        compose.onNodeWithTag("trip-name").performTextReplacement("BackRouteQA-" + UUID.randomUUID().toString().take(6))
        compose.onNodeWithTag("trip-save").performScrollTo().performClick(); waitFor("trip-detail-title")

        compose.onNodeWithTag("trip-edit").performScrollTo().performClick(); waitFor("trip-name")
        device.pressBack(); waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertExists()

        compose.onNodeWithTag("openItinerary").performScrollTo().performClick(); waitFor("addPlace")
        compose.onNodeWithTag("addPlace").performClick(); waitFor("placeName")
        device.pressBack(); waitFor("itinerary-list")
        compose.onNodeWithTag("itinerary-list").assertExists()

        device.pressBack(); waitFor("trip-detail-title")
        compose.onNodeWithText("여행 JSON 백업").performScrollTo().performClick(); waitFor("backup-list")
        device.pressBack(); waitFor("trip-detail-title")
        compose.onNodeWithTag("trip-detail-title").assertExists()
        compose.onNodeWithTag("tab-trips").assertIsSelected()
    }

}
