import Foundation
import CoreFoundation

public enum ScheduleSection: Hashable {
    case reserve, day(Int)
    public var token: Int { if case .day(let number) = self { return number }; return 0 }
    public var title: String { token == 0 ? "예비 목록" : "\(token)일차" }
}

public enum ItemKey: Hashable {
    case string(String), integer(Int64)
    public init(json: Any) throws {
        if let value = json as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            self = .string(value)
        } else if let value = json as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
                  value.doubleValue.isFinite, abs(value.doubleValue) <= 9007199254740991,
                  value.doubleValue.rounded() == value.doubleValue {
            self = .integer(value.int64Value)
        } else { throw ScheduleError.invalidID }
    }
    public var token: String {
        switch self { case .string(let value): return "s:\(value)"; case .integer(let value): return "n:\(value)" }
    }
}

public struct PlaceDraft: Equatable {
    public var name, displayName, loc, time, memo, emoji: String
    public init(name: String = "", displayName: String = "", loc: String = "", time: String = "", memo: String = "", emoji: String = "📍") {
        self.name = name; self.displayName = displayName; self.loc = loc; self.time = time; self.memo = memo; self.emoji = emoji
    }
    public init(item: [String: Any]) {
        self.init(name: item["name"] as? String ?? "", displayName: item["displayName"] as? String ?? "",
                  loc: item["loc"] as? String ?? "", time: item["time"] as? String ?? "",
                  memo: item["memo"] as? String ?? "", emoji: item["emoji"] as? String ?? "📍")
    }
    var fields: [String: String] { ["name": name, "displayName": displayName, "loc": loc, "time": time, "memo": memo, "emoji": emoji] }
    public func validate(original: [String: Any] = [:]) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ScheduleError.emptyName }
        guard TripSchedule.validTime(time) else { throw ScheduleError.invalidTime }
        for (key, limit) in [("name", 200), ("displayName", 200), ("loc", 2000), ("memo", 10000)] {
            let value = fields[key]!
            if value != original[key] as? String && value.unicodeScalars.count > limit { throw ScheduleError.tooLong(key, limit) }
        }
    }
}

public enum ScheduleChange {
    case add(section: ScheduleSection, id: String, draft: PlaceDraft)
    case addPlace(section: ScheduleSection, id: String, draft: PlaceDraft, selection: PlaceSelection)
    case edit(section: ScheduleSection, key: ItemKey, draft: PlaceDraft)
    case move(section: ScheduleSection, key: ItemKey, to: ScheduleSection)
    case shift(section: ScheduleSection, key: ItemKey, offset: Int)
    case remove(section: ScheduleSection, key: ItemKey)
    case sortByTime(section: ScheduleSection)
    var section: ScheduleSection {
        switch self {
        case .add(let section, _, _), .addPlace(let section, _, _, _), .edit(let section, _, _), .move(let section, _, _), .shift(let section, _, _),
             .remove(let section, _), .sortByTime(let section): return section
        }
    }
}

public enum TripSchedule {
    public static func validTime(_ time: String) -> Bool {
        time.isEmpty || time.range(of: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil
    }
    public static func items(in section: ScheduleSection, trip: TripDocument) throws -> [[String: Any]] {
        switch section {
        case .reserve:
            if trip.raw["reserveItems"] == nil { return [] }
            guard let items = trip.raw["reserveItems"] as? [[String: Any]] else { throw TripError.invalidDocument }
            return items
        case .day(let number):
            guard number > 0, number <= trip.days.count, let items = trip.days[number - 1]["items"] as? [[String: Any]] else { throw ScheduleError.missingSection }
            return items
        }
    }
    public static func apply(_ change: ScheduleChange, to trip: TripDocument) throws -> TripDocument {
        var allKeys = Set<ItemKey>()
        for section in [.reserve] + (1...trip.dayCount).map(ScheduleSection.day) {
            for item in try items(in: section, trip: trip) {
                guard let id = item["id"] else { throw ScheduleError.invalidID }
                guard try allKeys.insert(ItemKey(json: id)).inserted else { throw ScheduleError.duplicateID }
            }
        }
        var raw = trip.raw
        var list = try items(in: change.section, trip: trip)
        func index(_ key: ItemKey) throws -> Int {
            let matches = try list.indices.filter { try ItemKey(json: list[$0]["id"]!) == key }
            guard matches.count == 1 else { throw ScheduleError.missingItem }
            return matches[0]
        }
        func set(_ items: [[String: Any]], _ section: ScheduleSection) {
            if case .reserve = section { raw["reserveItems"] = items }
            else {
                var days = raw["itinerary"] as! [[String: Any]]
                days[section.token - 1]["items"] = items; raw["itinerary"] = days
            }
        }
        switch change {
        case .addPlace(_, let id, let draft, let selection):
            let payload = try selection.durablePayload(id: id, draft: draft)
            if allKeys.contains(.string(id)) {
                guard let existing = list.first(where: { $0["id"] as? String == id }),
                      try JSONSerialization.data(withJSONObject: existing, options: [.sortedKeys]) == JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { throw PlaceError.conflictingOperation }
                return trip
            }
            list.append(payload)
        case .add(_, let id, let draft):
            guard UUID(uuidString: id) != nil, !allKeys.contains(.string(id)) else { throw ScheduleError.invalidID }
            try draft.validate()
            list.append(draft.fields.merging(["id": id]) { _, new in new })
        case .edit(_, let key, let draft):
            let i = try index(key); try draft.validate(original: list[i])
            for (field, value) in draft.fields { list[i][field] = value }
        case .move(_, let key, let destination):
            let i = try index(key)
            if change.section == destination { return trip }
            var target = try items(in: destination, trip: trip)
            target.append(list.remove(at: i)); set(target, destination)
        case .shift(_, let key, let offset):
            guard offset == -1 || offset == 1 else { throw ScheduleError.invalidShift }
            let i = try index(key); let next = i + offset
            guard list.indices.contains(next) else { return trip }
            list.swapAt(i, next)
        case .remove(_, let key): list.remove(at: try index(key))
        case .sortByTime:
            for item in list {
                guard item["time"] == nil || (item["time"] as? String).map(validTime) == true else { throw ScheduleError.invalidTime }
            }
            list = list.enumerated().sorted { lhs, rhs in
                let a = lhs.element["time"] as? String ?? "", b = rhs.element["time"] as? String ?? ""
                if a == b { return lhs.offset < rhs.offset }
                if a.isEmpty { return false }; if b.isEmpty { return true }; return a < b
            }.map(\.element)
        }
        set(list, change.section)
        let next = try JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys])
        if next == (try trip.encoded()) { return trip }
        raw["updatedAt"] = max(floor(Date().timeIntervalSince1970 * 1000), trip.updatedAt + 1)
        return try TripDocument(data: JSONSerialization.data(withJSONObject: raw))
    }
}

public enum ScheduleError: LocalizedError {
    case invalidID, duplicateID, missingSection, missingItem, emptyName, invalidTime, invalidShift, tooLong(String, Int)
    public var errorDescription: String? {
        switch self {
        case .invalidID, .duplicateID: return "장소 식별자가 잘못되었거나 중복되었습니다. 원본을 변경하지 않았습니다."
        case .missingSection, .missingItem: return "일정이 변경되었습니다. 화면을 다시 확인해주세요."
        case .emptyName: return "장소 이름을 입력해주세요."
        case .invalidTime: return "시간은 09:30처럼 입력하거나 비워주세요."
        case .invalidShift: return "한 칸씩 위아래로 이동할 수 있습니다."
        case .tooLong(let field, let count): return "\(field) 입력은 최대 \(count)자까지 가능합니다. 기존 긴 내용은 그대로 보관할 수 있습니다."
        }
    }
}
