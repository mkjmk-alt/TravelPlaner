import Foundation
import CoreFoundation
import CryptoKit

public enum TripBackup {
    public static let maxBytes = 20 * 1024 * 1024
    public static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    public static func filename(_ name: String) -> String {
        let cleaned = String(String.UnicodeScalarView(name.unicodeScalars.map { "/\\".unicodeScalars.contains($0) || CharacterSet.controlCharacters.contains($0) ? UnicodeScalar(95)! : $0 }))
        return String(cleaned.prefix(68)).trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty(or: "trip") + "-backup.json"
    }
    public static func readFile(_ url: URL) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var bytes = Data()
        while bytes.count <= maxBytes {
            let chunk = try handle.read(upToCount: min(65536, maxBytes + 1 - bytes.count)) ?? Data()
            if chunk.isEmpty { break }; bytes.append(chunk)
        }
        guard bytes.count <= maxBytes else { throw BackupError.tooLarge }; return bytes
    }
    public static func encode(_ trip: TripDocument) throws -> Data {
        var raw = trip.raw; raw.removeValue(forKey: "sharedId"); raw.removeValue(forKey: "sharedManagementToken")
        return try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys, .prettyPrinted])
    }
    public static func decode(_ data: Data) throws -> ImportCandidate {
        guard data.count <= maxBytes else { throw BackupError.tooLarge }
        let sourceHash = hash(data)
        let bytes = data.starts(with: [0xef, 0xbb, 0xbf]) ? Data(data.dropFirst(3)) : data
        guard String(data: bytes, encoding: .utf8) != nil else { throw BackupError.invalid("UTF-8 JSON 파일을 선택해주세요.") }
        var depth = 0, quoted = false, escaped = false
        for byte in bytes {
            if quoted {
                if escaped { escaped = false } else if byte == 92 { escaped = true } else if byte == 34 { quoted = false }
            } else if byte == 34 { quoted = true }
            else if byte == 123 || byte == 91 { depth += 1; if depth > 64 { throw BackupError.tooDeep } }
            else if byte == 125 || byte == 93 { depth -= 1 }
        }
        guard var raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              let name = raw["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let startText = raw["startDate"] as? String, let start = TripDate.date(startText),
              var days = raw["itinerary"] as? [[String: Any]], (1...100).contains(days.count) else {
            throw BackupError.invalid("여행 이름·시작일·일정이 있는 단일 여행 파일이어야 합니다.")
        }
        var warnings = [String]()
        func fill(_ key: String, _ value: Any) { if raw[key] == nil { raw[key] = value; warnings.append("\(key) 누락 항목 보완") } }
        fill("id", "import-\(sourceHash)"); fill("country", "")
        fill("endDate", TripDate.string(TripDate.calendar.date(byAdding: .day, value: days.count - 1, to: start)!))
        fill("createdAt", raw["updatedAt"] ?? 0); fill("updatedAt", raw["createdAt"] ?? 0)
        for key in ["createdAt", "updatedAt"] {
            guard let number = raw[key] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
                  abs(number.doubleValue) <= 9007199254740991, number.doubleValue.rounded() == number.doubleValue else { throw BackupError.invalid("저장 시각이 올바르지 않습니다.") }
        }
        for key in ["reserveItems", "expenses", "journalEntries", "checklist", "settlementParticipants"] {
            fill(key, [[String: Any]]())
            guard raw[key] is [[String: Any]] else { throw BackupError.invalid("\(key) 형식을 확인해주세요.") }
        }
        if var entries = raw["journalEntries"] as? [[String: Any]] {
            for index in entries.indices where entries[index].removeValue(forKey: "imageFileName") != nil {
                let title = (entries[index]["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
                let label = title?.isEmpty == false ? title! : "기록 \(index + 1)"
                warnings.append("\(label)의 외부 사진 참조는 가져오지 않음")
            }
            raw["journalEntries"] = entries
        }
        for key in ["budgetSettings", "travelDetails", "reminders"] {
            fill(key, [String: Any]())
            guard raw[key] is [String: Any] else { throw BackupError.invalid("\(key) 형식을 확인해주세요.") }
        }
        var keys = Set<ItemKey>(), count = 0
        func normalizeItems(_ value: Any?, prefix: String) throws -> [[String: Any]] {
            guard var items = value as? [[String: Any]] else { throw BackupError.invalid("장소 목록을 확인해주세요.") }
            count += items.count; guard count <= 10000 else { throw BackupError.invalid("장소는 최대 10,000개까지 가져올 수 있습니다.") }
            for i in items.indices {
                if items[i]["id"] == nil { items[i]["id"] = "import-\(sourceHash)-\(prefix)\(i)"; warnings.append("\(prefix)\(i) 장소 ID 보완") }
                guard try keys.insert(ItemKey(json: items[i]["id"]!)).inserted else { throw BackupError.invalid("중복된 장소 ID가 있습니다.") }
                guard let name = items[i]["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw BackupError.invalid("장소 이름을 확인해주세요.") }
                for field in ["displayName", "loc", "time", "memo", "emoji"] {
                    if let value = items[i][field] { guard value is String else { throw BackupError.invalid("장소 \(field) 형식이 잘못되었습니다.") } }
                }
                if let time = items[i]["time"] as? String, !TripSchedule.validTime(time) { throw BackupError.invalid("잘못된 장소 시간이 있습니다.") }
            }
            return items
        }
        for i in days.indices {
            if days[i]["day"] == nil { days[i]["day"] = i + 1; warnings.append("\(i + 1)일차 번호 보완") }
            days[i]["items"] = try normalizeItems(days[i]["items"], prefix: "day-\(i + 1)-item-")
        }
        raw["itinerary"] = days; raw["reserveItems"] = try normalizeItems(raw["reserveItems"], prefix: "reserve-")
        for key in ["sharedId", "sharedManagementToken"] {
            if raw.removeValue(forKey: key) != nil { warnings.append("\(key) 공유 연결은 가져오지 않음") }
        }
        let trip = try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
        return .init(sourceHash: sourceHash, sourceBytes: data, trip: trip, warnings: warnings)
    }
}
private extension String { func nonEmpty(or fallback: String) -> String { isEmpty ? fallback : self } }
