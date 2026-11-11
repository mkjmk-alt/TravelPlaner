import XCTest
@testable import NativeCore

final class SyncReachabilityGateTests: XCTestCase {
    func testReconnectRequestsSyncOnceForEachOfflineToOnlineTransition() {
        var gate = SyncReachabilityGate()

        XCTAssertFalse(gate.update(isOnline: true), "첫 온라인 상태는 재연결 이벤트가 아닙니다")
        XCTAssertFalse(gate.update(isOnline: true), "온라인 상태가 유지되면 반복 동기화를 요청하지 않습니다")
        XCTAssertFalse(gate.update(isOnline: false))
        XCTAssertFalse(gate.update(isOnline: false), "오프라인 상태가 유지되면 재시도를 요청하지 않습니다")
        XCTAssertTrue(gate.update(isOnline: true), "오프라인에서 온라인으로 복구되면 재시도해야 합니다")
        XCTAssertFalse(gate.update(isOnline: true), "복구 후 온라인 상태에서는 한 번만 요청합니다")
        XCTAssertFalse(gate.update(isOnline: false))
        XCTAssertTrue(gate.update(isOnline: true), "다음 연결 복구도 다시 감지해야 합니다")
    }

    func testInitialOfflinePathThenOnlineIsAReconnect() {
        var gate = SyncReachabilityGate()

        XCTAssertFalse(gate.update(isOnline: false), "초기 오프라인 관측 자체는 전환이 아닙니다")
        XCTAssertTrue(gate.update(isOnline: true), "관측된 오프라인에서 온라인으로 바뀌면 재시도해야 합니다")
    }
}
