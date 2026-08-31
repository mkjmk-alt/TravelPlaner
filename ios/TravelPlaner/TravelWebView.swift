import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct TravelWebView: UIViewRepresentable {
    @ObservedObject var browser: BrowserModel

    func makeCoordinator() -> Coordinator {
        Coordinator(browser: browser)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "travelPlanerDownload")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.refreshControl = context.coordinator.refreshControl
        if #available(iOS 16.4, *) {
            webView.isInspectable = _isDebugAssertConfiguration()
        }
        webView.backgroundColor = .white
        webView.scrollView.backgroundColor = .white

        context.coordinator.webView = webView
        browser.webView = webView
        webView.load(URLRequest(url: AppConfiguration.productionURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "travelPlanerDownload")
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
        let browser: BrowserModel
        let refreshControl = UIRefreshControl()
        weak var webView: WKWebView?
        private var activeDownloads: [WKDownload] = []
        private var downloadDestinations: [ObjectIdentifier: URL] = [:]

        init(browser: BrowserModel) {
            self.browser = browser
            super.init()
            refreshControl.addTarget(self, action: #selector(refresh), for: .valueChanged)
        }

        @objc private func refresh() {
            webView?.reload()
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "travelPlanerDownload",
                  message.frameInfo.securityOrigin.host == AppConfiguration.productionURL.host,
                  let payload = message.body as? [String: Any],
                  let fileName = payload["fileName"] as? String,
                  let dataURL = payload["dataUrl"] as? String,
                  let separator = dataURL.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(dataURL[dataURL.index(after: separator)...])),
                  data.count <= 25 * 1024 * 1024 else { return }

            let safeName = fileName
                .replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: "\\", with: "-")
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            let destination = directory.appendingPathComponent(safeName.isEmpty ? "TravelPlaner-file" : safeName)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: destination, options: .atomic)
                browser.downloadURL = destination
            } catch {
                browser.lastError = error.localizedDescription
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation?) {
            browser.isLoading = true
            browser.lastError = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            browser.isLoading = false
            browser.lastError = nil
            refreshControl.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation?,
            withError error: Error
        ) {
            finishWithError(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            finishWithError(error)
        }

        private func finishWithError(_ error: Error) {
            browser.isLoading = false
            browser.lastError = error.localizedDescription
            refreshControl.endRefreshing()
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if AppConfiguration.shouldOpenExternally(url) {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            guard AppConfiguration.allowedWebSchemes.contains(url.scheme?.lowercased() ?? "") else {
                if UIApplication.shared.canOpenURL(url) { UIApplication.shared.open(url) }
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            let mimeType = navigationResponse.response.mimeType ?? ""
            let isAttachment = (navigationResponse.response as? HTTPURLResponse)?
                .value(forHTTPHeaderField: "Content-Disposition")?
                .lowercased()
                .contains("attachment") == true

            if isAttachment || (!mimeType.isEmpty && !navigationResponse.canShowMIMEType) {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
            if AppConfiguration.shouldOpenExternally(url) {
                UIApplication.shared.open(url)
            } else {
                webView.load(navigationAction.request)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            presentAlert(title: nil, message: message, actions: [("확인", completionHandler)])
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            guard let controller = topViewController() else {
                completionHandler(false)
                return
            }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
            controller.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            retain(download)
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            retain(download)
        }

        private func retain(_ download: WKDownload) {
            activeDownloads.append(download)
            download.delegate = self
        }

        func download(
            _ download: WKDownload,
            decideDestinationUsing response: URLResponse,
            suggestedFilename: String,
            completionHandler: @escaping (URL?) -> Void
        ) {
            let safeName = suggestedFilename.replacingOccurrences(of: "/", with: "-")
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathComponent(safeName)
            try? FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(),
                withIntermediateDirectories: true,
                attributes: nil
            )
            downloadDestinations[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let fileURL = downloadDestinations[ObjectIdentifier(download)] else {
                release(download)
                return
            }
            browser.downloadURL = fileURL
            release(download)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            browser.lastError = error.localizedDescription
            release(download)
        }

        private func release(_ download: WKDownload) {
            downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
            activeDownloads.removeAll { $0 === download }
        }

        private func presentAlert(title: String?, message: String, actions: [(String, () -> Void)]) {
            guard let controller = topViewController() else {
                actions.first?.1()
                return
            }
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            for (title, handler) in actions {
                alert.addAction(UIAlertAction(title: title, style: .default) { _ in handler() })
            }
            controller.present(alert, animated: true)
        }

        private func topViewController() -> UIViewController? {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            var controller = scene?.windows.first { $0.isKeyWindow }?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            return controller
        }
    }
}
