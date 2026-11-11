import Foundation
import XCTest
@testable import NativeCore

final class SyncEngineTests: XCTestCase {
    private enum TransportFailure: Error {
        case offline
        case timeout
        case tooManyPageRequests
    }

    private final class StubTransport: SyncTransport {
        var pages: [SyncPage] = [.init(records: [], nextCursor: nil)]
        var fetchFailures: [TransportFailure] = []
        var applyResults: [Result<SyncApplyResult, TransportFailure>] = []
        var delta: SyncDelta?
        func fetchChanges(userID: String, known: [SyncRecord]) async throws -> SyncDelta? { delta }
        var maximumFetchCount = Int.max
        var fingerprints: [String?] = []
        func fetchFingerprint(userID: String) async throws -> String? {
            fingerprints.isEmpty ? nil : fingerprints.removeFirst()
        }
        private(set) var fetchedUsers: [String] = []
        private(set) var fetchedCursors: [String?] = []
        private(set) var operations: [SyncOperation] = []

        func fetchRecords(userID: String, cursor: String?) async throws -> SyncPage {
            fetchedUsers.append(userID)
            fetchedCursors.append(cursor)
            if fetchedCursors.count > maximumFetchCount { throw TransportFailure.tooManyPageRequests }
            if !fetchFailures.isEmpty { throw fetchFailures.removeFirst() }
            let index = cursor == nil ? 0 : 1
            guard pages.indices.contains(index) else { return .init(records: [], nextCursor: nil) }
            return pages[index]
        }

        func apply(_ operation: SyncOperation) async throws -> SyncApplyResult {
            operations.append(operation)
            guard !applyResults.isEmpty else { throw TransportFailure.timeout }
            return try applyResults.removeFirst().get()
        }
    }

    private func makeStores() throws -> (TripRepository, SyncOutboxRepository, SyncRecordStateStore) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("SyncEngine-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("trips.sqlite")
        return (try TripRepository(url: url), try SyncOutboxRepository(url: url), try SyncRecordStateStore(url: url))
    }

    private func trip(name: String) throws -> TripDocument {
        try TripDocument.create(draft: .init(
            name: name,
            country: "대한민국",
            startDate: "2026-11-01",
            endDate: "2026-11-02"
        ))
    }

    private func record(
        userID: String = "account-a",
        recordID: String = "trip-a",
        revision: Int64,
        payload: [String: Any]? = ["id": "trip-a", "name": "server"],
        deletedAt: Date? = nil
    ) -> SyncRecord {
        SyncRecord(userID: userID, recordType: .trip, recordID: recordID, payload: payload,
                   revision: revision, updatedAt: Date(timeIntervalSince1970: 1_791_907_200), deletedAt: deletedAt)
    }

    private func applied(_ record: SyncRecord, status: SyncApplyStatus = .applied) -> SyncApplyResult {
        SyncApplyResult(status: status, record: record)
    }

    func testDeltaAppliesOnlyChangedRecordWithoutFullFetch() async throws {
        let (_, outbox, states) = try makeStores()
        try states.applyRemote(record(revision: 1))
        let transport = StubTransport()
        transport.delta = SyncDelta(records: [record(revision: 2, payload: ["id": "trip-a", "name": "changed"])], requiresFull: false)
        let result = try await SyncEngine(transport: transport, outbox: outbox, states: states).sync(userID: "account-a")
        XCTAssertEqual(result.pulledRecords, 1)
        XCTAssertTrue(transport.fetchedCursors.isEmpty)
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .trip, recordID: "trip-a")?.revision, 2)
    }

    func testDeltaPropagatesDeletionWithoutLosingTombstone() async throws {
        let (_, outbox, states) = try makeStores()
        try states.applyRemote(record(revision: 1))
        let transport = StubTransport()
        transport.delta = SyncDelta(records: [record(revision: 2, payload: nil, deletedAt: Date())], requiresFull: false)
        _ = try await SyncEngine(transport: transport, outbox: outbox, states: states).sync(userID: "account-a")
        let tombstone = try XCTUnwrap(states.record(userID: "account-a", recordType: .trip, recordID: "trip-a"))
        XCTAssertEqual(tombstone.revision, 2)
        XCTAssertNotNil(tombstone.deletedAt)
    }

    func testDeltaRejectsAnotherAccountsRecords() async throws {
        let (_, outbox, states) = try makeStores()
        let transport = StubTransport()
        transport.delta = SyncDelta(records: [record(userID: "account-b", revision: 1)], requiresFull: false)
        do { _ = try await SyncEngine(transport: transport, outbox: outbox, states: states).sync(userID: "account-a"); XCTFail("foreign account") }
        catch { }
        XCTAssertTrue(try states.records(userID: "account-a").isEmpty)
    }

    func testMissingKnownRecordForcesFullReconciliation() async throws {
        let (_, outbox, states) = try makeStores()
        let transport = StubTransport()
        transport.delta = SyncDelta(records: [], requiresFull: true)
        transport.pages = [.init(records: [record(revision: 1)], nextCursor: nil)]
        _ = try await SyncEngine(transport: transport, outbox: outbox, states: states).sync(userID: "account-a")
        XCTAssertEqual(transport.fetchedCursors.count, 1)
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .trip, recordID: "trip-a")?.revision, 1)
    }

    func testChangedServerSnapshotDoesNotApplyPartialRecordsOrPendingEdits() async throws {
        let (_, outbox, states) = try makeStores()
        let operation = SyncOperation(operationID: UUID(), userID: "account-a", recordType: .trip,
            recordID: "local-trip", expectedRevision: 0,
            payload: ["id": "local-trip", "name": "local"], deletedAt: nil)
        try outbox.enqueue(operation)
        let transport = StubTransport()
        transport.fingerprints = ["before", "after"]
        transport.pages = [.init(records: [record(revision: 1)], nextCursor: nil)]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)
        do { _ = try await engine.sync(userID: "account-a"); XCTFail("A changing snapshot must not be applied") }
        catch { }
        XCTAssertNil(try states.record(userID: "account-a", recordType: .trip, recordID: "trip-a"))
        XCTAssertEqual(try outbox.pending(userID: "account-a").count, 1)
        XCTAssertTrue(transport.operations.isEmpty)
    }

    func testOfflineLocalSaveStaysQueuedAndSyncsAfterReconnect() async throws {
        let (trips, outbox, states) = try makeStores()
        let local = try trip(name: "local draft")
        try trips.save(local, syncContext: .init(userID: "account-a"))
        let transport = StubTransport()
        transport.fetchFailures = [.offline]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        do {
            _ = try await engine.sync(userID: "account-a")
            XCTFail("오프라인이면 동기화는 실패해야 합니다")
        } catch TransportFailure.offline {
            XCTAssertEqual(try outbox.pending(userID: "account-a").count, 1)
            XCTAssertEqual(try trips.list().first?.id, local.id)
        }

        transport.pages = [.init(records: [], nextCursor: nil)]
        transport.applyResults = [.success(applied(record(recordID: local.id, revision: 1)))]
        _ = try await engine.sync(userID: "account-a")

        XCTAssertTrue(try outbox.pending(userID: "account-a").isEmpty)
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .trip, recordID: local.id)?.revision, 1)
        XCTAssertEqual(try trips.list().first?.id, local.id)
    }

    func testTimedOutOperationRetriesWithTheSameIDAndBody() async throws {
        let (_, outbox, states) = try makeStores()
        let operation = SyncOperation(operationID: UUID(), userID: "account-a", recordType: .trip,
                                      recordID: "trip-a", expectedRevision: 0,
                                      payload: ["id": "trip-a", "name": "local"], deletedAt: nil)
        try outbox.enqueue(operation)
        let transport = StubTransport()
        transport.applyResults = [
            .failure(.timeout),
            .success(applied(record(revision: 1), status: .replayed))
        ]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        do {
            _ = try await engine.sync(userID: "account-a")
            XCTFail("첫 응답이 시간 초과되어야 합니다")
        } catch TransportFailure.timeout {
            XCTAssertEqual(try outbox.pending(userID: "account-a").first?.operationID, operation.operationID)
        }
        _ = try await engine.sync(userID: "account-a")

        XCTAssertEqual(transport.operations.count, 2)
        XCTAssertEqual(transport.operations[0].operationID, transport.operations[1].operationID)
        XCTAssertEqual(try transport.operations[0].encoded(), try transport.operations[1].encoded())
        XCTAssertTrue(try outbox.pending(userID: "account-a").isEmpty)
    }

    func testAppliedOperationStoresCanonicalServerRecord() async throws {
        let (_, outbox, states) = try makeStores()
        let operation = SyncOperation(operationID: UUID(), userID: "account-a", recordType: .trip,
                                      recordID: "trip-a", expectedRevision: 0,
                                      payload: ["id": "trip-a", "name": "local title"], deletedAt: nil)
        try outbox.enqueue(operation)
        let canonicalServerRecord = record(revision: 1, payload: ["id": "trip-a", "name": "server title"])
        let transport = StubTransport()
        transport.applyResults = [.success(applied(canonicalServerRecord))]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        _ = try await engine.sync(userID: "account-a")

        let stored = try XCTUnwrap(states.record(userID: "account-a", recordType: .trip, recordID: "trip-a"))
        XCTAssertEqual(stored.payload?["name"] as? String, "server title")
        XCTAssertEqual(stored.revision, 1)
    }

    func testConflictKeepsServerAndLocalVersionsUntilExplicitChoice() async throws {
        let (trips, outbox, states) = try makeStores()
        let local = try trip(name: "local version")
        try trips.save(local, syncContext: .init(userID: "account-a"))
        let server = record(recordID: local.id, revision: 4, payload: ["id": local.id, "name": "server version"])
        let transport = StubTransport()
        transport.applyResults = [.success(.init(status: .conflict, record: server))]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        _ = try await engine.sync(userID: "account-a")

        let conflict = try XCTUnwrap(outbox.conflicts(userID: "account-a").first)
        XCTAssertEqual(conflict.operation.payload?["name"] as? String, "local version")
        XCTAssertEqual(conflict.serverRecord.payload?["name"] as? String, "server version")
        XCTAssertEqual(try trips.list().first?.name, "local version", "사용자가 선택하기 전에는 로컬 여행을 서버 값으로 덮지 않아야 합니다")
        XCTAssertNil(try states.record(userID: "account-a", recordType: .trip, recordID: local.id))
    }

    func testPullsTombstonesAcrossPagesAndDoesNotReplaceThemWithOlderRecords() async throws {
        let (_, outbox, states) = try makeStores()
        let deletedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let transport = StubTransport()
        transport.pages = [
            .init(records: [], nextCursor: "next-page"),
            .init(records: [record(revision: 6, payload: nil, deletedAt: deletedAt)], nextCursor: nil)
        ]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        _ = try await engine.sync(userID: "account-a")

        let tombstone = try XCTUnwrap(states.record(userID: "account-a", recordType: .trip, recordID: "trip-a"))
        XCTAssertEqual(tombstone.revision, 6)
        XCTAssertEqual(tombstone.deletedAt, deletedAt)
        XCTAssertEqual(transport.fetchedCursors.count, 2)
        XCTAssertEqual(transport.fetchedCursors[1], "next-page")

        transport.pages = [.init(records: [record(revision: 5)], nextCursor: nil)]
        _ = try await engine.sync(userID: "account-a")
        XCTAssertEqual(try states.record(userID: "account-a", recordType: .trip, recordID: "trip-a")?.deletedAt, deletedAt)
    }

    func testRepeatedPageCursorStopsSyncInsteadOfLooping() async throws {
        let (_, outbox, states) = try makeStores()
        let transport = StubTransport()
        transport.maximumFetchCount = 2
        transport.pages = [
            .init(records: [], nextCursor: "same-cursor"),
            .init(records: [], nextCursor: "same-cursor")
        ]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        do {
            _ = try await engine.sync(userID: "account-a")
            XCTFail("반복되는 페이지 커서는 거부해야 합니다")
        } catch SyncError.invalidRecord {
            XCTAssertEqual(transport.fetchedCursors.count, 2)
            XCTAssertEqual(transport.fetchedCursors[1], "same-cursor")
        } catch {
            XCTFail("반복 커서 검증 전에 동기화가 계속 요청되었습니다: \(error)")
        }
    }

    func testAccountSwitchNeverSendsAnotherUsersPendingOperation() async throws {
        let (_, outbox, states) = try makeStores()
        try outbox.enqueue(.init(operationID: UUID(), userID: "account-a", recordType: .trip,
                                 recordID: "trip-a", expectedRevision: 0, payload: ["id": "trip-a"], deletedAt: nil))
        try outbox.enqueue(.init(operationID: UUID(), userID: "account-b", recordType: .trip,
                                 recordID: "trip-b", expectedRevision: 0, payload: ["id": "trip-b"], deletedAt: nil))
        let transport = StubTransport()
        transport.applyResults = [.success(applied(record(userID: "account-b", recordID: "trip-b", revision: 1)))]
        let engine = SyncEngine(transport: transport, outbox: outbox, states: states)

        _ = try await engine.sync(userID: "account-b")

        XCTAssertEqual(transport.operations.map(\.userID), ["account-b"])
        XCTAssertEqual(try outbox.pending(userID: "account-a").map(\.recordID), ["trip-a"])
        XCTAssertTrue(try outbox.pending(userID: "account-b").isEmpty)
    }
}
