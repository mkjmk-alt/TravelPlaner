import Foundation
import CryptoKit

public struct TravelMediaReference: Equatable {
    public let tripID: String
    public let fileName: String
    public let byteCount: Int
    public init(tripID: String, fileName: String, byteCount: Int) {
        self.tripID = tripID; self.fileName = fileName; self.byteCount = byteCount
    }
}

public final class TravelMediaStore {
    public static let maxImageBytes = 2_621_440
    private let root: URL

    public init(root: URL) throws {
        self.root = root.standardizedFileURL
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
    }

    public func write(_ data: Data, tripID: String, fileExtension: String? = nil) throws -> TravelMediaReference {
        guard data.count <= Self.maxImageBytes else { throw BackupError.tooLarge }
        let ext = try Self.imageExtension(data: data, requested: fileExtension)
        let directory = tripDirectory(tripID)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileName = "\(UUID().uuidString).\(ext)"
        let destination = directory.appendingPathComponent(fileName, isDirectory: false)
        let temporary = directory.appendingPathComponent(".\(UUID().uuidString).tmp", isDirectory: false)
        try data.write(to: temporary, options: [.atomic])
        do { try FileManager.default.moveItem(at: temporary, to: destination) }
        catch { try? FileManager.default.removeItem(at: temporary); throw error }
        return TravelMediaReference(tripID: tripID, fileName: fileName, byteCount: data.count)
    }

    public func read(_ reference: TravelMediaReference) throws -> Data {
        let url = try safeURL(reference)
        let data = try Data(contentsOf: url, options: [.mappedIfSafe])
        guard data.count <= Self.maxImageBytes, Self.isSupportedImage(data) else { throw BackupError.invalid("사진 파일을 읽지 못했습니다.") }
        return data
    }

    public func remove(_ reference: TravelMediaReference) throws {
        let url = try safeURL(reference)
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    public func reference(tripID: String, fileName: String) throws -> TravelMediaReference {
        _ = try safeURL(.init(tripID: tripID, fileName: fileName, byteCount: 0))
        return TravelMediaReference(tripID: tripID, fileName: fileName, byteCount: 0)
    }

    public func url(for reference: TravelMediaReference) -> URL { try! safeURL(reference) }

    private func tripDirectory(_ tripID: String) -> URL {
        let digest = SHA256.hash(data: Data(tripID.utf8)).map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(digest, isDirectory: true)
    }

    private func safeURL(_ reference: TravelMediaReference) throws -> URL {
        guard reference.tripID.isEmpty == false, reference.fileName.range(of: "^[A-Za-z0-9-]+\\.(jpg|jpeg|png)$", options: .regularExpression) != nil else { throw BackupError.invalid("잘못된 사진 참조입니다.") }
        let directory = tripDirectory(reference.tripID)
        let candidate = directory.appendingPathComponent(reference.fileName).standardizedFileURL
        guard candidate.path.hasPrefix(directory.standardizedFileURL.path + "/") else { throw BackupError.invalid("사진 경로가 저장소 밖을 가리킵니다.") }
        return candidate
    }

    private static func imageExtension(data: Data, requested: String?) throws -> String {
        if data.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) { return "png" }
        if data.starts(with: [0xff, 0xd8, 0xff]) { return requested?.lowercased() == "jpeg" ? "jpeg" : "jpg" }
        throw BackupError.invalid("PNG 또는 JPEG 사진만 저장할 수 있습니다.")
    }

    private static func isSupportedImage(_ data: Data) -> Bool {
        data.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || data.starts(with: [0xff, 0xd8, 0xff])
    }
}
