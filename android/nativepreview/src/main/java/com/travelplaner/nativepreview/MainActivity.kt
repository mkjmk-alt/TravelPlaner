package com.travelplaner.nativepreview

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.travelplaner.nativepreview.ui.TripPlotApp
import com.travelplaner.nativepreview.ui.TripViewModel
import com.travelplaner.nativepreview.ui.TripBackupViewModel

class MainActivity : ComponentActivity() {
    private val backupModel: TripBackupViewModel by viewModels {
        viewModelFactory { initializer { TripBackupViewModel((application as NativePreviewApplication).repository, (application as NativePreviewApplication).mediaStore) } }
    }
    private val model: TripViewModel by viewModels {
        viewModelFactory {
            initializer {
                TripViewModel((application as NativePreviewApplication).repository, createSavedStateHandle(), (application as NativePreviewApplication).mediaStore, (application as NativePreviewApplication).memoryDraftStore)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val preferences = getSharedPreferences("native-navigation", MODE_PRIVATE)
        val lastLocation = preferences.getString("location", "trips/list") ?: "trips/list"
        setContent {
            TripPlotApp(model, backupModel, lastLocation) { location ->
                preferences.edit().putString("location", location).apply()
            }
        }
    }
}
