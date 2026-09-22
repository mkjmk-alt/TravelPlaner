import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var browser: BrowserModel

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            TravelWebView(browser: browser)

            if browser.isLoading {
                ProgressView("TripPlot 불러오는 중…")
                    .padding(.horizontal, 22)
                    .padding(.vertical, 16)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            }

            if browser.lastError != nil {
                OfflineView(retry: browser.retry, isOffline: browser.isOffline)
            }
        }
        .background(Color.white)
        .sheet(
            isPresented: Binding(
                get: { browser.downloadURL != nil },
                set: { if !$0 { browser.downloadURL = nil } }
            )
        ) {
            if let fileURL = browser.downloadURL {
                ShareSheet(items: [fileURL])
            }
        }
    }
}

private struct OfflineView: View {
    let retry: () -> Void
    let isOffline: Bool

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color.secondary)
            Text(isOffline ? "인터넷 연결을 확인해주세요" : "앱 서버에 연결할 수 없습니다")
                .font(.headline)
            Text(isOffline ? "기기에 저장된 일정은 삭제되지 않습니다." : "잠시 후 다시 시도해주세요. 기기에 저장된 일정은 삭제되지 않습니다.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button("다시 시도", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.15, green: 0.39, blue: 0.92))
        }
        .multilineTextAlignment(.center)
        .padding(28)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24))
        .padding(24)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
