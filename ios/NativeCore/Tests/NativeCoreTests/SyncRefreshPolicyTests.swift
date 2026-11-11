import XCTest
@testable import NativeCore

final class SyncRefreshPolicyTests: XCTestCase {
    func testNotificationsAreOnlyActiveForAnAuthenticatedForegroundAccount() {
        XCTAssertFalse(SyncRefreshPolicy.shouldListen(isActive: false, userID: "a"))
        XCTAssertFalse(SyncRefreshPolicy.shouldListen(isActive: true, userID: nil))
        XCTAssertFalse(SyncRefreshPolicy.shouldListen(isActive: true, userID: ""))
        XCTAssertTrue(SyncRefreshPolicy.shouldListen(isActive: true, userID: "a"))
    }
    func testFingerprintNeverSkipsUnknownChangedPendingOrManualSync() {
        XCTAssertTrue(SyncRefreshPolicy.canSkipFullSync(known: "x", current: "x", pendingCount: 0, force: false))
        XCTAssertFalse(SyncRefreshPolicy.canSkipFullSync(known: nil, current: nil, pendingCount: 0, force: false))
        XCTAssertFalse(SyncRefreshPolicy.canSkipFullSync(known: "x", current: "y", pendingCount: 0, force: false))
        XCTAssertFalse(SyncRefreshPolicy.canSkipFullSync(known: "x", current: "x", pendingCount: 1, force: false))
        XCTAssertFalse(SyncRefreshPolicy.canSkipFullSync(known: "x", current: "x", pendingCount: 0, force: true))
        XCTAssertNil(SyncRefreshPolicy.confirmedFingerprint(before: "x", after: "y"))
        XCTAssertEqual(SyncRefreshPolicy.confirmedFingerprint(before: "x", after: "x"), "x")
    }
    func testFallbackStillReconcilesAndBurstsAreDebounced() {
        XCTAssertEqual(SyncRefreshPolicy.fallbackNanoseconds, 60_000_000_000)
        XCTAssertEqual(SyncRefreshPolicy.interval(fingerprintAvailable: false), 10_000_000_000)
        XCTAssertEqual(SyncRefreshPolicy.interval(fingerprintAvailable: true), 60_000_000_000)
        XCTAssertEqual(SyncRefreshPolicy.interval(fingerprintAvailable: true, realtimeConnected: false), 10_000_000_000)
        XCTAssertEqual(SyncRefreshPolicy.interval(fingerprintAvailable: true, realtimeConnected: true), 60_000_000_000)
        XCTAssertEqual(SyncRefreshPolicy.debounceNanoseconds, 500_000_000)
    }
}
