import AuthenticationServices
import Foundation
import Network
import UIKit
import WebKit

@MainActor
final class BrowserModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isLoading = true
    @Published var isOffline = false
    @Published var lastError: String?
    @Published var downloadURL: URL?

    weak var webView: WKWebView?

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.travelplaner.network-monitor")
    private var authenticationSession: ASWebAuthenticationSession?

    override init() {
        super.init()
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
            components?.fragment = url.fragment
            if let destination = components?.url {
                webView?.load(URLRequest(url: destination))
            }
            return
        }

        guard AppConfiguration.allowedWebSchemes.contains(url.scheme?.lowercased() ?? "") else { return }
        webView?.load(URLRequest(url: url))
    }

    func beginAuthentication(at url: URL) {
        guard url.scheme?.lowercased() == "https" else { return }
        authenticationSession?.cancel()

        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "travelplaner"
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                self?.authenticationSession = nil
                if let callbackURL {
                    self?.open(callbackURL)
                } else if let authenticationError = error as? ASWebAuthenticationSessionError,
                          authenticationError.code != .canceledLogin {
                    self?.lastError = authenticationError.localizedDescription
                }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authenticationSession = session
        if !session.start() {
            authenticationSession = nil
            lastError = "로그인 창을 열지 못했습니다."
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
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
