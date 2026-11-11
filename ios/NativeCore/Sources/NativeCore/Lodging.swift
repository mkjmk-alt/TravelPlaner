import Foundation

public enum LodgingError: LocalizedError {
    case invalidName, invalidDates, invalidTime, duplicateID, noEvents, tooLong
    public var errorDescription: String? {
        switch self {
        case .invalidName: return "숙소 이름을 입력해주세요."
        case .tooLong: return "숙소 이름, 주소 또는 메모가 너무 깁니다."
        case .invalidDates: return "체크인과 체크아웃 날짜를 확인해주세요."
        case .invalidTime: return "시간을 확인해주세요."
        case .duplicateID: return "중복된 숙소가 있습니다."
        case .noEvents: return "추가할 일정이 없어요. 이미 추가되었거나 날짜가 여행 기간 밖입니다."
        }
    }
}

public struct LodgingDay {
    public let row: [String: Any]
    public let checkIn: Bool
    public let checkOut: Bool
    public let overnight: Bool
}

public enum TripLodging {
    public static func rows(in trip: TripDocument) throws -> [[String: Any]] {
        guard let value = trip.raw["lodgings"] else { return [] }
        guard let rows = value as? [[String: Any]] else { throw MemoryError.malformedArray("lodgings") }
        return rows
    }

    public static func validate(_ row: [String: Any]) throws {
        guard let name = row["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw LodgingError.invalidName }
        for (key, limit) in [("name", 200), ("address", 2000), ("memo", 10000)] {
            if (row[key] as? String ?? "").unicodeScalars.count > limit { throw LodgingError.tooLong }
        }
        guard let start = row["checkIn"] as? String, let end = row["checkOut"] as? String,
              let checkIn = TripDate.date(start), let checkOut = TripDate.date(end), checkIn <= checkOut else { throw LodgingError.invalidDates }
        for key in ["checkInTime", "checkOutTime"] {
            guard TripSchedule.validTime(row[key] as? String ?? "") else { throw LodgingError.invalidTime }
        }
    }

    public static func addEvents(_ row: [String: Any], to trip: TripDocument) throws -> TripDocument {
        try validate(row)
        guard let id = row["id"] as? String, !id.isEmpty, let start = TripDate.date(trip.startDate) else { throw LodgingError.invalidDates }
        let events = [("checkIn", "체크인", "checkInTime"), ("checkOut", "체크아웃", "checkOutTime")]
        var existing = Set<String>()
        for section in [ScheduleSection.reserve] + (1...trip.dayCount).map(ScheduleSection.day) {
            for item in try TripSchedule.items(in: section, trip: trip) {
                if let key = item["lodgingEventKey"] as? String { existing.insert(key) }
            }
        }
        var result = trip, added = 0
        for (kind, label, timeKey) in events {
            let key = "\(id):\(kind)"
            guard !existing.contains(key), let rawDate = row[kind] as? String, let eventDate = TripDate.date(rawDate) else { continue }
            let day = (TripDate.calendar.dateComponents([.day], from: start, to: eventDate).day ?? -1) + 1
            guard day > 0, day <= trip.dayCount, let end = TripDate.date(trip.endDate), eventDate <= end else { continue }
            let itemID = UUID().uuidString
            let draft = PlaceDraft(name: "\(row["name"] as? String ?? "숙소") \(label)", loc: row["address"] as? String ?? "", time: row[timeKey] as? String ?? "", memo: row["memo"] as? String ?? "", emoji: "🏨")
            result = try TripSchedule.apply(.add(section: .day(day), id: itemID, draft: draft), to: result)
            var raw = result.raw
            guard var days = raw["itinerary"] as? [[String: Any]], var items = days[day - 1]["items"] as? [[String: Any]],
                  let index = items.firstIndex(where: { ($0["id"] as? String) == itemID }) else { throw TripError.invalidDocument }
            items[index]["lodgingEventKey"] = key; items[index]["category"] = "lodging"
            for key in ["lat", "lng", "placeId", "nativePlaceSource"] { if let value = row[key] { items[index][key] = value } }
            days[day - 1]["items"] = items; raw["itinerary"] = days
            result = try TripDocument(data: JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys]))
            existing.insert(key); added += 1
        }
        guard added > 0 else { throw LodgingError.noEvents }
        return result
    }

    public static func day(_ number: Int, in trip: TripDocument) -> [LodgingDay] {
        guard number > 0, let start = TripDate.date(trip.startDate),
              let date = TripDate.calendar.date(byAdding: .day, value: number - 1, to: start),
              let rows = try? rows(in: trip) else { return [] }
        let value = TripDate.string(date)
        return rows.compactMap { row in
            guard let checkIn = row["checkIn"] as? String, let checkOut = row["checkOut"] as? String,
                  TripDate.date(checkIn) != nil, TripDate.date(checkOut) != nil, checkIn <= checkOut else { return nil }
            let inDay = value == checkIn, outDay = value == checkOut
            let overnight = checkIn <= value && value < checkOut
            return inDay || outDay || overnight ? LodgingDay(row: row, checkIn: inDay, checkOut: outDay, overnight: overnight) : nil
        }
    }
}
