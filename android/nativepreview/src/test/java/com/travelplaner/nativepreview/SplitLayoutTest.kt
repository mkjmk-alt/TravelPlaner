package com.travelplaner.nativepreview
import com.travelplaner.nativepreview.domain.SplitLayout
import com.travelplaner.nativepreview.domain.MapCameraSnapshot
import org.junit.Assert.*
import org.junit.Test

class SplitLayoutTest {
    @Test fun cameraRestorationRejectsInvalidPrimitives() {
        assertNull(MapCameraSnapshot.from(listOf(Double.NaN,0.0,16.0,0.0,0.0)))
        assertNull(MapCameraSnapshot.from(listOf(0.0,0.0,100.0,0.0,0.0)))
        assertNull(MapCameraSnapshot.from(listOf(91.0,0.0,16.0,0.0,0.0)))
        assertNull(MapCameraSnapshot.from(listOf(0.0)))
        assertEquals(listOf(35.0,139.0,16.0,45.0,20.0),MapCameraSnapshot.from(listOf(35.0,139.0,16.0,45.0,20.0))?.values)
    }
    @Test fun freeResizeAndInvalidSettings() {
        val value=SplitLayout.resize(0.5,-137.0,1000.0)
        assertEquals(0.363,value,0.000001); assertEquals(value,SplitLayout.commit(value),0.0)
        assertEquals(value,SplitLayout.restore(value),0.0)
        listOf(0.0,-10.0,Double.NaN,Double.POSITIVE_INFINITY).forEach { assertEquals(value,SplitLayout.resize(value,40.0,it),0.0) }
        listOf(0.0,1.0,Double.NaN,Double.POSITIVE_INFINITY,-1.0).forEach { assertEquals(0.5,SplitLayout.restore(it),0.0) }
        assertEquals(0.5,SplitLayout.commit(Double.NaN),0.0)
        assertEquals(1.0,SplitLayout.resize(0.5,100.0,1.0),0.0); assertEquals(0.0,SplitLayout.resize(0.5,-100.0,1.0),0.0)
        assertEquals(value,SplitLayout.resize(value,Double.NaN,100.0),0.0)
    }
    @Test fun axisUsesAvailableContainer() {
        assertFalse(SplitLayout.isHorizontal(839.0,600.0)); assertFalse(SplitLayout.isHorizontal(900.0,599.0))
        assertFalse(SplitLayout.isHorizontal(840.0,1000.0)); assertTrue(SplitLayout.isHorizontal(840.0,600.0))
    }
}
