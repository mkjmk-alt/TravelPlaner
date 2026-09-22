import Foundation
import CryptoKit

public enum JournalEditorMode: String, Codable {
    case new
    case edit
}

public struct JournalEditorDraft: Codable, Equatable {
    public let tripID: String
    public let draftID: String
    public let mode: JournalEditorMode
    public let entryID: String?
    public let date: String
    public let title: String
    public let body: String
    public let removePhoto: Bool
    public let stagedPhotoFileName: String?
    public let updatedAt: Double

    public init(tripID: String, draftID: String, mode: JournalEditorMode, entryID: String? = nil, date: String, title: String, body: String, removePhoto: Bool = false, stagedPhotoFileName: String? = nil, updatedAt: Double) {
        self.tripID = tripID
        self.draftID = draftID
        self.mode = mode
        self.entryID = entryID
        self.date = date
        self.title = title
        self.body = body
        self.removePhoto = removePhoto
        self.stagedPhotoFileName = stagedPhotoFileName
        self.updatedAt = updatedAt
    }
}

public final class MemoryDraftStore {
    public static let defaultJournalMaxAge: TimeInterval = 30 * 24 * 60 * 60
    private let root: URL
    public init(root: URL) throws {
        self.root = root.standardizedFileURL
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    public func save(_ payload: [String: Any], tripID: String, feature: String, draftID: String) throws {
        let url = fileURL(tripID: tripID, feature: feature, draftID: draftID)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let bytes = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        try bytes.write(to: url, options: [.atomic])
    }

    public func load(tripID: String, feature: String, draftID: String) throws -> [String: Any]? {
        let url = fileURL(tripID: tripID, feature: feature, draftID: draftID)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        guard let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else { throw TripError.invalidDocument }
        return object
    }

    public func remove(tripID: String, feature: String, draftID: String) throws {
        let url = fileURL(tripID: tripID, feature: feature, draftID: draftID)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    public func saveJournal(_ draft: JournalEditorDraft, draftIDOverride: String? = nil) throws {
        let data = try JSONEncoder().encode(draft)
        let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        try save(payload ?? [:], tripID: draft.tripID, feature: "journal-editor", draftID: draftIDOverride ?? draft.draftID)
    }

    public func loadJournal(tripID: String, draftID: String) throws -> JournalEditorDraft? {
        guard let payload = try load(tripID: tripID, feature: "journal-editor", draftID: draftID) else { return nil }
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode(JournalEditorDraft.self, from: data)
    }

    public func removeJournal(tripID: String, draftID: String) throws {
        try remove(tripID: tripID, feature: "journal-editor", draftID: draftID)
    }

    @discardableResult
    public func removeStaleJournals(now: Date = Date(), maxAge: TimeInterval = MemoryDraftStore.defaultJournalMaxAge) throws -> [JournalEditorDraft] {
        guard maxAge >= 0 else { throw TripError.invalidDocument }
        let cutoff = (now.timeIntervalSince1970 - maxAge) * 1000
        let urls = (FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL } ?? [])
            .filter { $0.pathExtension == "json" }
        var removed: [JournalEditorDraft] = []
        for url in urls {
            guard let data = try? Data(contentsOf: url), let draft = try? JSONDecoder().decode(JournalEditorDraft.self, from: data),
                  !draft.tripID.isEmpty, !draft.draftID.isEmpty, draft.updatedAt < cutoff else { continue }
            try FileManager.default.removeItem(at: url)
            removed.append(draft)
        }
        return removed.sorted { ($0.updatedAt, $0.draftID) < ($1.updatedAt, $1.draftID) }
    }

    private func fileURL(tripID: String, feature: String, draftID: String) -> URL {
        let trip = digest(tripID), featurePart = digest(feature), draftPart = digest(draftID)
        return root.appendingPathComponent(trip, isDirectory: true).appendingPathComponent(featurePart, isDirectory: true).appendingPathComponent("\(draftPart).json")
    }
    private func digest(_ text: String) -> String { SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined() }
}
