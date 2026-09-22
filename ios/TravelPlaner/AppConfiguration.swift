import Foundation

enum AppConfiguration {
    private static let defaultWebURL = URL(string: "https://travelplaner-545.pages.dev/")!
    static let webURL: URL = {
        guard let configuredValue = Bundle.main.object(forInfoDictionaryKey: "TripPlotWebURL") as? String,
              let configuredURL = URL(string: configuredValue.trimmingCharacters(in: .whitespacesAndNewlines)),
              let configuredComponents = URLComponents(url: configuredURL, resolvingAgainstBaseURL: false),
              webSchemes.contains(configuredURL.scheme?.lowercased() ?? ""),
              configuredURL.host != nil,
              configuredComponents.user == nil,
              configuredComponents.query == nil,
              configuredComponents.fragment == nil else {
            return defaultWebURL
        }
        return configuredURL
    }()
    static let authenticationHost = "eiktqxrgsjrtmoyzuupn.supabase.co"
    static let webSchemes: Set<String> = ["http", "https"]
    static let externalSchemes: Set<String> = ["tel", "mailto", "sms", "maps", "comgooglemaps"]

    static func isInternalWebURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme, let host = url.host else { return false }
        return isInternalWebOrigin(scheme: scheme, host: host, port: url.port ?? 0)
    }

    static func isInternalWebOrigin(scheme originScheme: String, host: String, port: Int) -> Bool {
        guard let expectedComponents = URLComponents(url: webURL, resolvingAgainstBaseURL: false),
              let expectedScheme = expectedComponents.scheme,
              let expectedHost = expectedComponents.host else { return false }

        let normalizedExpectedScheme = expectedScheme.lowercased()
        let normalizedOriginScheme = originScheme.lowercased()
        guard normalizedExpectedScheme == normalizedOriginScheme,
              expectedHost.lowercased() == host.lowercased() else { return false }

        let defaultPort = normalizedExpectedScheme == "https" ? 443 : 80
        let expectedPort = expectedComponents.port ?? defaultPort
        let actualPort = port == 0 ? defaultPort : port
        return expectedPort == actualPort
    }

    static func isAllowedAuthenticationURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == authenticationHost
    }

    static func isAuthenticationCallback(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "travelplaner"
            && url.host?.lowercased() == "auth"
            && url.path == "/callback"
    }

    static func shouldOpenExternally(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if externalSchemes.contains(scheme) { return true }
        return webSchemes.contains(scheme) && !isInternalWebURL(url)
    }
}
