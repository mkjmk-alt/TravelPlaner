public struct SyncReachabilityGate: Sendable {
    private var lastKnownOnline: Bool?

    public init() {}

    /// Returns true only when a previously observed offline path becomes online.
    public mutating func update(isOnline: Bool) -> Bool {
        defer { lastKnownOnline = isOnline }
        return lastKnownOnline == false && isOnline
    }
}
