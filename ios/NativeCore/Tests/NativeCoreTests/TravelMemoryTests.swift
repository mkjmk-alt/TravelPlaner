import XCTest
@testable import NativeCore

final class TravelMemoryTests: XCTestCase {
    func testReducerChangesOneChecklistRowAndPreservesUnknownFields() throws {
        let trip = try fixture()
        let checklist = try XCTUnwrap(trip.raw["checklist"] as? [[String: Any]])
        let selector = MemoryRowSelector(key: .string("passport"), index: nil, expected: checklist[0], expectedRows: nil)

        let next = try TripMemory.apply(.setChecklistChecked(selector: selector, checked: false), to: trip, now: 200)
        let rows = try XCTUnwrap(next.raw["checklist"] as? [[String: Any]])
        XCTAssertEqual(rows[0]["checked"] as? Bool, false)
        XCTAssertEqual((rows[0]["future"] as? [String: Any])?["keep"] as? Bool, true)
        XCTAssertEqual((next.raw["futureRoot"] as? [String: Any])?["mustSurvive"] as? Bool, true)
        XCTAssertGreaterThan(next.updatedAt, trip.updatedAt)
    }

    func testReplayOfSameAddIsIdempotentAndConflictingOperationFails() throws {
        let trip = try fixture()
        let entry: [String: Any] = ["id": "new", "date": "2026-10-12", "title": "새 기록", "body": "내용", "createdAt": 200, "updatedAt": 200]
        let first = try TripMemory.apply(.addJournal(operationID: "op-1", entry: entry), to: trip, now: 200)
        let replay = try TripMemory.apply(.addJournal(operationID: "op-1", entry: entry), to: first, now: 300)
        XCTAssertEqual(replay.updatedAt, first.updatedAt)
        XCTAssertEqual((replay.raw["journalEntries"] as? [[String: Any]])?.count, 5)

        XCTAssertThrowsError(try TripMemory.apply(.addJournal(operationID: "op-1", entry: ["id": "other", "date": "2026-10-12", "title": "다른 내용", "body": "" ]), to: first, now: 400))
    }

    func testStaleLegacyIndexIsRejectedAfterPrecedingRowChanges() throws {
        let trip = try fixture()
        let rows = try XCTUnwrap(trip.raw["checklist"] as? [[String: Any]])
        let selector = MemoryRowSelector(key: nil, index: 3, expected: rows[3], expectedRows: rows)
        let removedFirst = try TripMemory.apply(.removeChecklist(selector: MemoryRowSelector(key: .string("passport"), index: nil, expected: rows[0], expectedRows: nil)), to: trip, now: 200)
        XCTAssertThrowsError(try TripMemory.apply(.removeChecklist(selector: selector), to: removedFirst, now: 300))
    }

    func testDetailsAndJournalValidation() throws {
        let trip = try fixture()
        XCTAssertThrowsError(try TripMemory.apply(.addJournal(operationID: "bad", entry: ["id": "bad", "date": "2026-02-30", "title": "제목", "body": ""]), to: trip, now: 200))
        XCTAssertThrowsError(try TripMemory.apply(.addJournal(operationID: "bad-title", entry: ["id": "bad-title", "date": "", "title": String(repeating: "가", count: 81), "body": ""]), to: trip, now: 200))
        let next = try TripMemory.apply(.setTravelDetails(values: ["stayName": "새 숙소"], expected: ["stayName": "난바 호텔"]), to: trip, now: 200)
        XCTAssertEqual((next.raw["travelDetails"] as? [String: Any])?["stayName"] as? String, "새 숙소")
        XCTAssertEqual((next.raw["travelDetails"] as? [String: Any])?["futureDetail"] as? String, "keep")
    }

    func testJournalEditCanRemovePhotoWhilePreservingPlaceSnapshotAndUnknownFields() throws {
        let original = try fixture()
        var raw = original.raw
        var entries = try XCTUnwrap(raw["journalEntries"] as? [[String: Any]])
        entries[0]["imageFileName"] = "photo.jpg"
        entries[0]["futureEntry"] = ["keep": true]
        raw["journalEntries"] = entries
        let trip = TripDocument(raw: raw)
        let selector = MemoryRowSelector(key: .string("same-z"), index: nil, expected: entries[0], expectedRows: nil)

        let next = try TripMemory.apply(
            .editJournal(
                selector: selector,
                changes: ["title": "수정된 기록", "imageFileName": NSNull()],
                expected: ["title": "두 번째", "imageFileName": "photo.jpg"],
            ),
            to: trip,
            now: 300,
        )
        let edited = try XCTUnwrap((next.raw["journalEntries"] as? [[String: Any]])?.first)
        XCTAssertEqual(edited["title"] as? String, "수정된 기록")
        XCTAssertNil(edited["imageFileName"])
        XCTAssertEqual((edited["place"] as? [String: Any])?["name"] as? String, "도톤보리")
        XCTAssertEqual((edited["futureEntry"] as? [String: Any])?["keep"] as? Bool, true)
    }

    func testJournalEditorDraftPersistsByTripAndDraftIdentityAndCanBeDiscarded() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MemoryDraftStore(root: root)
        let draft = JournalEditorDraft(
            tripID: "trip-a",
            draftID: "edit:journal-a",
            mode: .edit,
            entryID: "journal-a",
            date: "2026-10-10",
            title: "기록 초안",
            body: "앱을 종료해도 남아야 해요.",
            removePhoto: true,
            stagedPhotoFileName: "photo.png",
            updatedAt: 10
        )

        try store.saveJournal(draft)

        XCTAssertEqual(try store.loadJournal(tripID: "trip-a", draftID: "edit:journal-a"), draft)
        XCTAssertNil(try store.loadJournal(tripID: "trip-b", draftID: "edit:journal-a"))
        XCTAssertNil(try store.loadJournal(tripID: "trip-a", draftID: "new"))

        try store.removeJournal(tripID: "trip-a", draftID: "edit:journal-a")
        XCTAssertNil(try store.loadJournal(tripID: "trip-a", draftID: "edit:journal-a"))
    }

    func testJournalEditorDraftCarriesStagedPhotoReferenceAcrossPersistence() throws {
        let draft = JournalEditorDraft(
            tripID: "trip-a",
            draftID: "new",
            mode: .new,
            date: "2026-10-10",
            title: "사진 기록",
            body: "사진을 고른 직후 종료되어도 복구되어야 해요.",
            stagedPhotoFileName: "photo.png",
            updatedAt: 20
        )
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(draft)) as! [String: Any]
        XCTAssertEqual(object["stagedPhotoFileName"] as? String, "photo.png")
    }

    func testJournalDraftStoreRemovesOnlyDraftsOlderThanRetentionWindow() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MemoryDraftStore(root: root)
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let old = JournalEditorDraft(tripID: "trip-a", draftID: "old", mode: .new, date: "", title: "오래된 초안", body: "", updatedAt: now.timeIntervalSince1970 * 1000 - 31 * 24 * 60 * 60 * 1000)
        let fresh = JournalEditorDraft(tripID: "trip-a", draftID: "fresh", mode: .new, date: "", title: "최근 초안", body: "", updatedAt: now.timeIntervalSince1970 * 1000 - 1 * 24 * 60 * 60 * 1000)
        try store.saveJournal(old)
        try store.saveJournal(fresh)

        let removed = try store.removeStaleJournals(now: now, maxAge: 30 * 24 * 60 * 60)

        XCTAssertEqual(removed.map(\.draftID), ["old"])
        XCTAssertNil(try store.loadJournal(tripID: "trip-a", draftID: "old"))
        XCTAssertNotNil(try store.loadJournal(tripID: "trip-a", draftID: "fresh"))
    }

    private func fixture() throws -> TripDocument {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try TripDocument(data: Data(contentsOf: root.appendingPathComponent("contracts/native/fixtures/memory-prep.json")))
    }
}
