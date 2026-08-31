import Foundation
import Network
import WebKit

@MainActor
final class BrowserModel: ObservableObject {
    @Published var isLoading = true
    @Published var isOffline = false
    @Published var lastError: String?
    @Published var downloadURL: URL?

    weak var webView: WKWebView?

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.travelplaner.network-monitor")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isOffline = path.status != .satisfied
            }
        }
        monitor.start(queue: monitorQueue)
    }

    deinit {
        monitor.cancel()
    }

    func open(_ url: URL) {
        if url.scheme?.lowercased() == "travelplaner" {
            var components = URLComponents(url: AppConfiguration.productionURL, resolvingAgainstBaseURL: false)
            components?.path = url.path.isEmpty ? "/" : url.path
            components?.query = url.query
            if let destination = components?.url {
                webView?.load(URLRequest(url: destination))
            }
            return
        }

        guard AppConfiguration.allowedWebSchemes.contains(url.scheme?.lowercased() ?? "") else { return }
        webView?.load(URLRequest(url: url))
    }

    func retry() {
        lastError = nil
        if let currentURL = webView?.url {
            webView?.load(URLRequest(url: currentURL))
        } else {
            webView?.load(URLRequest(url: AppConfiguration.productionURL))
        }
    }
}
