import Foundation

public enum MemoryItemKey: Equatable {
    case string(String)
    case integer(Int)
}

public struct MemoryRowSelector {
    public let key: MemoryItemKey?
    public let index: Int?
    public let expected: [String: Any]
    public let expectedRows: [[String: Any]]?

    public init(key: MemoryItemKey?, index: Int?, expected: [String: Any], expectedRows: [[String: Any]]?) {
        self.key = key
        self.index = index
        self.expected = expected
        self.expectedRows = expectedRows
    }
}

public enum MemoryChange {
    case setTravelDetails(values: [String: String], expected: [String: String])
    case addChecklist(operationID: String, item: [String: Any])
    case setChecklistChecked(selector: MemoryRowSelector, checked: Bool)
    case removeChecklist(selector: MemoryRowSelector)
    case addJournal(operationID: String, entry: [String: Any])
    case editJournal(selector: MemoryRowSelector, changes: [String: Any], expected: [String: Any])
    case removeJournal(selector: MemoryRowSelector)
}

public enum MemoryError: LocalizedError {
    case malformedArray(String)
    case staleSelection
    case missingRow
    case duplicateOperation
    case invalidJournal
    case invalidDetails

    public var errorDescription: String? {
        switch self {
        case .malformedArray(let key): return "저장된 \(key) 목록이 올바르지 않습니다."
        case .staleSelection: return "다른 변경사항이 먼저 저장되어 현재 편집 내용을 적용할 수 없습니다."
        case .missingRow: return "변경하려는 항목을 찾지 못했습니다."
        case .duplicateOperation: return "같은 작업 ID에 다른 내용이 사용되었습니다."
        case .invalidJournal: return "기록 날짜 또는 글자 수를 확인해주세요."
        case .invalidDetails: return "여행 준비 정보가 다른 곳에서 변경되었습니다."
        }
    }
}

public enum TripMemory {
    public static func apply(_ change: MemoryChange, to trip: TripDocument, now: Double) throws -> TripDocument {
        var next = trip.raw
        var didChange = false

        switch change {
        case .setTravelDetails(let values, let expected):
            guard var details = next["travelDetails"] as? [String: Any] else { throw MemoryError.malformedArray("travelDetails") }
            for (key, expectedValue) in expected {
                guard (details[key] as? String ?? "") == expectedValue else { throw MemoryError.invalidDetails }
            }
            for (key, value) in values where (details[key] as? String ?? "") != value {
                details[key] = value
                didChange = true
            }
            next["travelDetails"] = details

        case .addChecklist(let operationID, let item):
            var rows = try rows(from: next, key: "checklist")
            if let existing = rows.first(where: { $0["operationId"] as? String == operationID }) {
                guard JSONEqual.object(normalized(existing, removing: "operationId"), normalized(item, removing: "operationId")) else { throw MemoryError.duplicateOperation }
                return trip
            }
            var candidate = item
            candidate["operationId"] = operationID
            guard candidate["label"] as? String != nil else { throw MemoryError.invalidDetails }
            if candidate["checked"] == nil { candidate["checked"] = false }
            rows.append(candidate)
            next["checklist"] = rows
            didChange = true

        case .setChecklistChecked(let selector, let checked):
            var rows = try rows(from: next, key: "checklist")
            let index = try locate(selector, in: rows)
            guard (rows[index]["checked"] as? Bool ?? false) != checked else { return trip }
            rows[index]["checked"] = checked
            next["checklist"] = rows
            didChange = true

        case .removeChecklist(let selector):
            var rows = try rows(from: next, key: "checklist")
            rows.remove(at: try locate(selector, in: rows))
            next["checklist"] = rows
            didChange = true

        case .addJournal(let operationID, let entry):
            try validateJournal(entry)
            var rows = try rows(from: next, key: "journalEntries")
            if let existing = rows.first(where: { $0["operationId"] as? String == operationID }) {
                guard JSONEqual.object(normalized(existing, removing: "operationId"), normalized(entry, removing: "operationId")) else { throw MemoryError.duplicateOperation }
                return trip
            }
            var candidate = entry
            candidate["operationId"] = operationID
            rows.append(candidate)
            next["journalEntries"] = rows
            didChange = true

        case .editJournal(let selector, let changes, let expected):
            try validateJournal(changes, partial: true)
            var rows = try rows(from: next, key: "journalEntries")
            let index = try locate(selector, in: rows)
            guard expected.allSatisfy({ key, value in JSONEqual.scalarOrObject(rows[index][key], value) }) else { throw MemoryError.staleSelection }
            for (key, value) in changes {
                if value is NSNull { rows[index].removeValue(forKey: key) }
                else { rows[index][key] = value }
            }
            next["journalEntries"] = rows
            didChange = true

        case .removeJournal(let selector):
            var rows = try rows(from: next, key: "journalEntries")
            rows.remove(at: try locate(selector, in: rows))
            next["journalEntries"] = rows
            didChange = true
        }

        guard didChange else { return trip }
        next["updatedAt"] = max(now, trip.updatedAt + 1)
        return TripDocument(raw: next)
    }

    private static func rows(from raw: [String: Any], key: String) throws -> [[String: Any]] {
        guard let value = raw[key] else { return [] }
        guard let rows = value as? [[String: Any]] else { throw MemoryError.malformedArray(key) }
        return rows
    }

    private static func locate(_ selector: MemoryRowSelector, in rows: [[String: Any]]) throws -> Int {
        if let expectedRows = selector.expectedRows, !JSONEqual.array(rows, expectedRows) { throw MemoryError.staleSelection }
        if let key = selector.key {
            let matches = rows.enumerated().compactMap { index, row -> Int? in
                itemKey(row) == key ? index : nil
            }
            if matches.count == 1 {
                let index = matches[0]
                guard JSONEqual.object(rows[index], selector.expected) else { throw MemoryError.staleSelection }
                return index
            }
            guard let index = selector.index, matches.contains(index), rows.indices.contains(index), JSONEqual.object(rows[index], selector.expected) else {
                throw matches.isEmpty ? MemoryError.missingRow : MemoryError.staleSelection
            }
            return index
        }
        guard let index = selector.index, rows.indices.contains(index), JSONEqual.object(rows[index], selector.expected) else { throw MemoryError.staleSelection }
        return index
    }

    private static func itemKey(_ row: [String: Any]) -> MemoryItemKey? {
        if let value = row["id"] as? String { return .string(value) }
        if let number = row["id"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() { return .integer(number.intValue) }
        return nil
    }

    private static func validateJournal(_ entry: [String: Any], partial: Bool = false) throws {
        if let date = entry["date"] as? String, !date.isEmpty, TripDate.date(date) == nil { throw MemoryError.invalidJournal }
        if !partial || entry["title"] != nil {
            guard let title = entry["title"] as? String, title.utf16.count <= 80 else { throw MemoryError.invalidJournal }
        }
        if !partial || entry["body"] != nil {
            guard let body = entry["body"] as? String, body.utf16.count <= 2000 else { throw MemoryError.invalidJournal }
        }
        if !partial {
            let title = entry["title"] as? String ?? ""
            let body = entry["body"] as? String ?? ""
            let image = entry["imageDataUrl"] as? String ?? ""
            let localImage = entry["imageFileName"] as? String ?? ""
            guard !title.isEmpty || !body.isEmpty || !image.isEmpty || !localImage.isEmpty else { throw MemoryError.invalidJournal }
        }
    }

    private static func normalized(_ value: [String: Any], removing key: String) -> [String: Any] {
        var result = value
        result.removeValue(forKey: key)
        return result
    }
}

private enum JSONEqual {
    static func object(_ left: [String: Any], _ right: [String: Any]) -> Bool { fragment(left) == fragment(right) }
    static func array(_ left: [[String: Any]], _ right: [[String: Any]]) -> Bool { fragment(left) == fragment(right) }
    static func scalarOrObject(_ left: Any?, _ right: Any) -> Bool {
        guard let left else { return false }
        return fragment(left) == fragment(right)
    }
    private static func fragment(_ value: Any) -> Data? { try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed]) }
}
