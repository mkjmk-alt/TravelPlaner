package com.travelplaner.nativepreview

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement

/** Starts every UI test from a predictable tab without clearing trips or app data. */
internal class NativeNavigationTestRule : TestRule {
    override fun apply(base: Statement, description: Description): Statement = object : Statement() {
        override fun evaluate() {
            InstrumentationRegistry.getInstrumentation().targetContext
                .getSharedPreferences("native-navigation", Context.MODE_PRIVATE)
                .edit()
                .putString("location", "trips/list")
                .commit()
            base.evaluate()
        }
    }
}
