import SwiftUI

@main
struct TravelPlanerApp: App {
    @StateObject private var browser = BrowserModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(browser)
                .onOpenURL { url in
                    browser.open(url)
                }
        }
    }
}
