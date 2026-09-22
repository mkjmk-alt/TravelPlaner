import Foundation

public enum MemoryBackup {
    public static func encode(_ trip: TripDocument, imageResolver: (String) throws -> Data?) throws -> Data {
        var raw = trip.raw
        raw.removeValue(forKey: "sharedId")
        raw.removeValue(forKey: "sharedManagementToken")
        if let entries = raw["journalEntries"] as? [[String: Any]] {
            raw["journalEntries"] = try entries.map { entry in
                var copy = entry
                if let fileName = copy["imageFileName"] as? String {
                    guard let data = try imageResolver(fileName) else { throw BackupError.invalid("기록 사진을 찾지 못했습니다.") }
                    copy["imageDataUrl"] = dataURL(data)
                    copy.removeValue(forKey: "imageFileName")
                }
                return copy
            }
        }
        let data = try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys, .prettyPrinted])
        guard data.count <= TripBackup.maxBytes else { throw BackupError.tooLarge }
        return data
    }

    private static func dataURL(_ data: Data) -> String {
        let mime = data.starts(with: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) ? "image/png" : "image/jpeg"
        return "data:\(mime);base64,\(data.base64EncodedString())"
    }
}
