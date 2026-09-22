package com.travelplaner.nativepreview.domain

object SplitLayout {
    fun commit(ratio:Double):Double = if(ratio.isFinite()) ratio.coerceIn(0.0,1.0) else 0.5
    fun resize(startRatio:Double,delta:Double,extent:Double):Double {
        val start=commit(startRatio)
        return if(extent.isFinite() && extent>0 && delta.isFinite()) commit(start+delta/extent) else start
    }
    fun restore(ratio:Double):Double = if(ratio.isFinite() && ratio>0 && ratio<1) ratio else 0.5
    fun isHorizontal(width:Double,height:Double):Boolean = width>=840 && height>=600 && width>height
}
