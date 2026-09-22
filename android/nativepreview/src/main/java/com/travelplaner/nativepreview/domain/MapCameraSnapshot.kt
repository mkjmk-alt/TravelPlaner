package com.travelplaner.nativepreview.domain

/** Viewport preference only, never written into travel JSON or location history. */
data class MapCameraSnapshot private constructor(val values:List<Double>) {
    companion object {
        fun from(values:List<Double>):MapCameraSnapshot? = values.takeIf {it.size==5 && it.all(Double::isFinite) && it[0] in -90.0..90.0 && it[1] in -180.0..180.0 && it[2] in 0.0..22.0 && it[3] in 0.0..360.0 && it[4] in 0.0..90.0}?.let {MapCameraSnapshot(it.toList())}
    }
}
