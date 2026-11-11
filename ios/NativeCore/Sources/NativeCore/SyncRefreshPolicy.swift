public enum SyncRefreshPolicy {
    public static let fallbackNanoseconds: UInt64 = 60_000_000_000
    public static let debounceNanoseconds: UInt64 = 500_000_000

    public static func interval(fingerprintAvailable: Bool, realtimeConnected: Bool = true) -> UInt64 {
        fingerprintAvailable && realtimeConnected ? fallbackNanoseconds : 10_000_000_000
    }

    public static func canSkipFullSync(known: String?, current: String?, pendingCount: Int?, force: Bool) -> Bool {
        guard !force, pendingCount == 0, let known, !known.isEmpty, let current else { return false }
        return known == current
    }
    public static func confirmedFingerprint(before: String?, after: String?) -> String? {
        guard let before, !before.isEmpty, before == after else { return nil }
        return before
    }

    public static func shouldListen(isActive: Bool, userID: String?) -> Bool {
        isActive && !(userID ?? "").isEmpty
    }
}
