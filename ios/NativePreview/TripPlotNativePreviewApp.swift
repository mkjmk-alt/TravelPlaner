import SwiftUI

@main
struct TripPlotNativePreviewApp: App {
    @StateObject private var store = NativeTripStore()

    var body: some Scene {
        WindowGroup {
            NativeRootView()
                .environmentObject(store)
                .tint(Color(red: 0.49, green: 0.34, blue: 0.87))
        }
    }
}
