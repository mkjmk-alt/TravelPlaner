package com.travelplaner.nativepreview

import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import kotlin.math.abs
import kotlin.math.roundToInt

class NativeThemeUiTest {
    private val compose = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules = RuleChain.outerRule(NativeNavigationTestRule()).around(compose)

    @Test fun primaryTripActionUsesWebPurpleAccent() {
        val button = compose.onNodeWithTag("trip-create").assertIsDisplayed()
        val bitmap = button.captureToImage()
        val color = bitmap.toPixelMap()[bitmap.width / 8, bitmap.height / 2]
        val actual = listOf(
            (color.red * 255).roundToInt(),
            (color.green * 255).roundToInt(),
            (color.blue * 255).roundToInt(),
        )
        val webPurpleVariants = listOf(listOf(0x8B, 0x5C, 0xF6), listOf(0xA7, 0x8B, 0xFA))
        val usesWebPurple = webPurpleVariants.any { expected ->
            actual.zip(expected).all { (actualChannel, expectedChannel) -> abs(actualChannel - expectedChannel) <= 18 }
        }
        assertTrue("여행 만들기 버튼이 웹 보라색 계열이어야 합니다. 실제 RGB: $actual", usesWebPurple)
    }
}
