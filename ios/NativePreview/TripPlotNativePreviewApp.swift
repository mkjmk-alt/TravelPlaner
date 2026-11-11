import SwiftUI

@main
struct TripPlotNativePreviewApp: App {
    @StateObject private var store = NativeTripStore()
    @StateObject private var authStore = NativeAuthStore()
    @StateObject private var syncCoordinator = NativeSyncCoordinator()

    var body: some Scene {
        WindowGroup {
            NativeRootView()
                .environmentObject(store)
                .environmentObject(authStore)
                .environmentObject(syncCoordinator)
                .tint(NativePreviewTheme.primary)
                .onOpenURL { authStore.handleOpenURL($0) }
        }
    }
}
