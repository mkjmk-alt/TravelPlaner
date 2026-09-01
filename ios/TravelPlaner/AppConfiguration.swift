import Foundation

enum AppConfiguration {
    static let productionURL = URL(string: "https://travelplaner-545.pages.dev/")!
    static let authenticationHost = "eiktqxrgsjrtmoyzuupn.supabase.co"
    static let allowedWebSchemes: Set<String> = ["http", "https"]
    static let externalSchemes: Set<String> = ["tel", "mailto", "sms", "maps", "comgooglemaps"]

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
        guard allowedWebSchemes.contains(scheme), let host = url.host?.lowercased() else {
            return !allowedWebSchemes.contains(scheme)
        }

        let path = url.path.lowercased()
        return (host == "maps.apple.com")
            || (host.hasSuffix("google.com") && path.hasPrefix("/maps"))
            || (host.hasSuffix("google.com") && path.hasPrefix("/maps/dir"))
    }
}
