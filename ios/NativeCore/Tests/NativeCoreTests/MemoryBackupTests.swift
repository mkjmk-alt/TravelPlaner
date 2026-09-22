import XCTest
@testable import NativeCore

final class MemoryBackupTests: XCTestCase {
    func testLocalPhotoIsEmbeddedAndLocalReferenceIsRemoved() throws {
        let source = try portablePNG()
        let trip = try fixtureWithLocalPhoto()
        let bytes = try MemoryBackup.encode(trip) { fileName in fileName == "photo.png" ? source : nil }
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let entry = try XCTUnwrap((object["journalEntries"] as? [[String: Any]])?.first)
        XCTAssertNil(entry["imageFileName"])
        let dataURL = try XCTUnwrap(entry["imageDataUrl"] as? String)
        let encoded = String(dataURL.drop(while: { $0 != "," }).dropFirst())
        let decoded = try XCTUnwrap(Data(base64Encoded: encoded))
        XCTAssertEqual(decoded, source)
        XCTAssertEqual(decoded.count, 68)
        XCTAssertEqual(TripBackup.hash(decoded), "431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460")
    }

    func testEmbeddedPhotoIsPreservedWhenThereIsNoLocalReference() throws {
        let source = try portablePNG()
        var raw = try TripDocument.create(draft: .init(name: "사진 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")).raw
        let dataURL = "data:image/png;base64,\(source.base64EncodedString())"
        raw["journalEntries"] = [["id": "j1", "date": "2026-10-10", "title": "사진", "body": "", "imageDataUrl": dataURL]]
        let trip = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))

        let bytes = try MemoryBackup.encode(trip) { _ in
            XCTFail("이미 포함된 사진은 로컬 파일을 다시 읽으면 안 됩니다.")
            return nil
        }
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        let entry = try XCTUnwrap((object["journalEntries"] as? [[String: Any]])?.first)
        XCTAssertEqual(entry["imageDataUrl"] as? String, dataURL)
    }

    func testPortableExportEnforcesTheTwentyMiBBoundary() throws {
        var low = 0
        var high = TripBackup.maxBytes
        while low + 1 < high {
            let middle = (low + high) / 2
            if let candidate = try? encodeTripWithBody(length: middle), candidate.count <= TripBackup.maxBytes {
                low = middle
            } else {
                high = middle
            }
        }
        let below = try encodeTripWithBody(length: low)
        XCTAssertLessThanOrEqual(below.count, TripBackup.maxBytes)
        XCTAssertThrowsError(try encodeTripWithBody(length: low + 1))
    }

    func testMissingLocalPhotoAndOversizeExportFailWithoutMutatingTrip() throws {
        let trip = try fixtureWithLocalPhoto()
        XCTAssertThrowsError(try MemoryBackup.encode(trip) { _ in nil })
        var raw = trip.raw
        raw["journalEntries"] = [["id": "huge", "title": "x", "body": String(repeating: "a", count: TripBackup.maxBytes)]]
        let huge = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
        XCTAssertThrowsError(try MemoryBackup.encode(huge) { _ in nil })
        XCTAssertEqual(trip.raw["journalEntries"] as? [[String: Any]] as? NSObject, trip.raw["journalEntries"] as? [[String: Any]] as? NSObject)
    }

    private func fixtureWithLocalPhoto() throws -> TripDocument {
        var raw = try TripDocument.create(draft: .init(name: "사진 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")).raw
        raw["journalEntries"] = [["id": "j1", "date": "2026-10-10", "title": "사진", "body": "", "imageFileName": "photo.png"]]
        return try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
    }

    private func encodeTripWithBody(length: Int) throws -> Data {
        var raw = try TripDocument.create(draft: .init(name: "경계 여행", country: "일본", startDate: "2026-10-10", endDate: "2026-10-10")).raw
        raw["journalEntries"] = [["id": "large", "date": "2026-10-10", "title": "경계", "body": String(repeating: "a", count: length)]]
        let trip = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
        return try MemoryBackup.encode(trip) { _ in nil }
    }

    private func portablePNG() throws -> Data {
        try XCTUnwrap(Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="))
    }
}
