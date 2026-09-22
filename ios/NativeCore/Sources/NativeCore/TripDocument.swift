import Foundation

public struct TripDraft {
    public var name: String
    public var country: String
    public var startDate: String
    public var endDate: String
    public init(name: String, country: String, startDate: String, endDate: String) {
        self.name = name; self.country = country; self.startDate = startDate; self.endDate = endDate
    }
}

public struct TripDocument: Identifiable {
    public private(set) var raw: [String: Any]
    public var id: String { raw["id"] as? String ?? "" }
    public var name: String { raw["name"] as? String ?? "" }
    public var days: [[String: Any]] { raw["itinerary"] as? [[String: Any]] ?? [] }
    public var dayCount: Int { days.count }
    public var country: String { raw["country"] as? String ?? "" }
    public var startDate: String { raw["startDate"] as? String ?? "" }
    public var endDate: String { raw["endDate"] as? String ?? "" }
    public var updatedAt: Double { (raw["updatedAt"] as? NSNumber)?.doubleValue ?? 0 }
    public var draft: TripDraft { .init(name: name, country: country, startDate: startDate, endDate: endDate) }

    public init(data: Data) throws {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = object["id"] as? String, !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let name = object["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              object["country"] is String,
              let created = object["createdAt"] as? NSNumber, CFGetTypeID(created) != CFBooleanGetTypeID(),
              let updated = object["updatedAt"] as? NSNumber, CFGetTypeID(updated) != CFBooleanGetTypeID(),
              created.doubleValue.isFinite, updated.doubleValue.isFinite,
              let start = object["startDate"] as? String,
              let end = object["endDate"] as? String,
              let days = object["itinerary"] as? [[String: Any]],
              days.allSatisfy({ $0["items"] is [[String: Any]] }) else { throw TripError.invalidDocument }
        let count = try Self.validatedDayCount(.init(name: name, country: "", startDate: start, endDate: end))
        guard days.count == count,
              days.enumerated().allSatisfy({ index, day in
                  guard let number = day["day"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return false }
                  return number.doubleValue == Double(index + 1)
              }) else { throw TripError.invalidDocument }
        raw = object
    }

    init(raw: [String: Any]) { self.raw = raw }

    public static func create(draft: TripDraft) throws -> TripDocument {
        let count = try validatedDayCount(draft)
        let now = floor(Date().timeIntervalSince1970 * 1000)
        guard let url = Bundle.module.url(forResource: "web-defaults", withExtension: "json"),
              let defaults = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any],
              let currencies = defaults["currencies"] as? [String: String],
              let checklist = defaults["checklist"] as? [[String: Any]] else { throw TripError.invalidDocument }
        let currency = currencies[draft.country.trimmingCharacters(in: .whitespacesAndNewlines)] ?? "USD"
        return TripDocument(raw: [
            "id": UUID().uuidString, "name": draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
            "country": draft.country.trimmingCharacters(in: .whitespacesAndNewlines),
            "startDate": draft.startDate, "endDate": draft.endDate,
            "itinerary": (1...count).map { ["day": $0, "items": []] as [String: Any] },
            "reserveItems": [], "expenses": [], "journalEntries": [], "checklist": checklist,
            "budgetSettings": ["limitKRW": 1000000, "travelCurrency": currency],
            "settlementParticipants": [["id": "self", "name": "나"]],
            "travelDetails": ["departure": "", "arrival": "", "flightNumber": "", "stayName": "", "stayAddress": ""],
            "reminders": ["enabled": false, "minutesBefore": 30],
            "createdAt": now, "updatedAt": now
        ])
    }

    public func edited(draft: TripDraft) throws -> TripDocument {
        let count = try Self.validatedDayCount(draft)
        if days.dropFirst(count).contains(where: {
            !($0["items"] as? [[String: Any]] ?? []).isEmpty || !$0.keys.allSatisfy { ["day", "items"].contains($0) }
        }) {
            throw TripError.wouldDiscardPlaces
        }
        var next = raw
        var resized = Array(days.prefix(count))
        while resized.count < count { resized.append(["day": resized.count + 1, "items": []]) }
        next["name"] = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        next["country"] = draft.country.trimmingCharacters(in: .whitespacesAndNewlines)
        next["startDate"] = draft.startDate
        next["endDate"] = draft.endDate
        next["itinerary"] = resized
        next["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), updatedAt + 1)
        return TripDocument(raw: next)
    }

    private static func validatedDayCount(_ draft: TripDraft) throws -> Int {
        guard !draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw TripError.emptyName }
        guard let start = TripDate.date(draft.startDate), let end = TripDate.date(draft.endDate) else { throw TripError.invalidDate }
        let count = (TripDate.calendar.dateComponents([.day], from: start, to: end).day ?? -1) + 1
        guard count > 0 else { throw TripError.reversedDates }
        guard count <= 100 else { throw TripError.tooLong }
        return count
    }

    public func encoded() throws -> Data { try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys]) }
}

public enum TripError: LocalizedError {
    case emptyName, invalidDate, reversedDates, tooLong, wouldDiscardPlaces, invalidDocument
    public var errorDescription: String? {
        switch self {
        case .emptyName: return "여행 이름을 입력해주세요."
        case .invalidDate: return "올바른 여행 날짜를 선택해주세요."
        case .reversedDates: return "종료일은 시작일보다 빠를 수 없습니다."
        case .tooLong: return "여행 기간은 최대 100일까지 설정할 수 있습니다."
        case .wouldDiscardPlaces: return "줄어드는 날짜에 일정이나 저장된 정보가 있습니다. 내용을 먼저 옮겨주세요."
        case .invalidDocument: return "저장된 여행을 읽지 못했습니다. 원본 데이터는 그대로 보관됩니다."
        }
    }
}

public enum TripDate {
    public static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
    private static var formatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }
    public static func date(_ text: String) -> Date? {
        guard text.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil,
              let date = formatter.date(from: text), formatter.string(from: date) == text else { return nil }
        return date
    }
    public static func string(_ date: Date) -> String { formatter.string(from: date) }
}
