import Foundation

enum AppConfiguration {
    static let productionURL = URL(string: "https://travelplaner-545.pages.dev/")!
    static let authenticationHost = "eiktqxrgsjrtmoyzuupn.supabase.co"
    static let webSchemes: Set<String> = ["http", "https"]
    static let externalSchemes: Set<String> = ["tel", "mailto", "sms", "maps", "comgooglemaps"]

    static func isInternalWebURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https"
            && url.host?.lowercased() == productionURL.host?.lowercased()
            && (url.port == nil || url.port == 443)
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
