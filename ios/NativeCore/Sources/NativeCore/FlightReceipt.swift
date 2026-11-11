import Foundation

public struct FlightReceiptDraft: Equatable, Sendable {
    public var flightNumber = "", departure = "", arrival = ""
    public var departureDate = "", departureTime = "", arrivalDate = "", arrivalTime = ""
    public var boardingDate = "", boardingTime = ""
    public var hasAmbiguity = false
    public init() {}
    public var values: [String: String] {
        ["flightNumber": flightNumber, "departure": departure, "arrival": arrival,
         "flightDepartureDate": departureDate, "flightDepartureTime": departureTime,
         "flightArrivalDate": arrivalDate, "flightArrivalTime": arrivalTime,
         "flightBoardingDate": boardingDate, "flightBoardingTime": boardingTime]
    }
}

public enum FlightReceiptParser {
    private static func matches(_ pattern: String, in text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return re.matches(in: text, range: range).compactMap { result in
            guard let range = Range(result.range(at: 1), in: text) else { return nil }
            return String(text[range])
        }
    }
    private static func dates(_ text: String) -> [String] {
        let normalized = text.replacingOccurrences(of: #"\s*년\s*"#, with: "-", options: .regularExpression)
            .replacingOccurrences(of: #"\s*월\s*"#, with: "-", options: .regularExpression)
            .replacingOccurrences(of: #"\s*일"#, with: "", options: .regularExpression)
        let matches = matches(#"\b(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b"#, in: normalized)
        let numeric = matches.compactMap { text -> String? in
            let values = text.split(whereSeparator: { "./-".contains($0) }).compactMap { Int($0) }
            guard values.count == 3 else { return nil }
            let result = String(format: "%04d-%02d-%02d", values[0], values[1], values[2])
            return TripDate.date(result) == nil ? nil : result
        }
        let english = matchesForEnglishDates(normalized)
        return numeric + english
    }
    private static func matchesForEnglishDates(_ text: String) -> [String] {
        let months = ["JAN":1,"FEB":2,"MAR":3,"APR":4,"MAY":5,"JUN":6,"JUL":7,"AUG":8,"SEP":9,"OCT":10,"NOV":11,"DEC":12]
        return matches(#"\b(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})\b"#, in: text.uppercased()).compactMap { value in
            let parts = value.split(whereSeparator: { $0.isWhitespace })
            guard parts.count == 3, let day = Int(parts[0]), let month = months[String(parts[1])], let year = Int(parts[2]) else { return nil }
            let result = String(format: "%04d-%02d-%02d", year, month, day)
            return TripDate.date(result) == nil ? nil : result
        }
    }
    private static func times(_ text: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: #"(?i)(오전|오후)?\s*(?<!\d)(\d{1,2}):([0-5]\d)\s*(AM|PM)?(?![A-Z0-9])"#) else { return [] }
        return re.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { match in
            func part(_ index: Int) -> String? { Range(match.range(at: index), in: text).map { String(text[$0]) } }
            guard let hourText = part(2), var hour = Int(hourText), let minute = part(3) else { return nil }
            let prefix = part(1), suffix = part(4)?.uppercased()
            if prefix != nil && suffix != nil { return nil }
            if prefix != nil || suffix != nil {
                guard (1...12).contains(hour) else { return nil }
                let pm = prefix == "오후" || suffix == "PM"
                hour = hour % 12 + (pm ? 12 : 0)
            } else if hour > 23 { return nil }
            return String(format: "%02d:%@", hour, minute)
        }
    }
    private static func airportCodes(_ text: String) -> [String] {
        let ignore = Set(["DEP", "ARR", "FLY", "AIR", "THE", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "PDF"])
        return matches(#"\b([A-Z]{3})\b"#, in: text.uppercased()).filter { !ignore.contains($0) }
    }
    public static func parse(_ text: String) -> FlightReceiptDraft {
        var draft = FlightReceiptDraft()
        let lines = text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let numbers = Set(matches(#"\b((?:[A-Z][A-Z0-9]|[0-9][A-Z])\s?\d{1,4}[A-Z]?)\b"#, in: text.uppercased()).map { $0.replacingOccurrences(of: " ", with: "") })
        if numbers.count > 1 { draft.hasAmbiguity = true; return draft }
        draft.flightNumber = numbers.first ?? ""
        var depDates = Set<String>(), depTimes = Set<String>(), arrDates = Set<String>(), arrTimes = Set<String>()
        var boardDates = Set<String>(), boardTimes = Set<String>(), departures = Set<String>(), arrivals = Set<String>()
        for line in lines {
            let lower = line.lowercased()
            let boarding = lower.range(of: #"boarding|탑승"#, options: .regularExpression) != nil
            let departure = lower.range(of: #"departure|depart|\bdep\b|출발"#, options: .regularExpression) != nil
            let arrival = lower.range(of: #"arrival|arrive|\barr\b|도착"#, options: .regularExpression) != nil
            if (boarding && (departure || arrival)) || (departure && arrival) { draft.hasAmbiguity = true; continue }
            if boarding { boardDates.formUnion(dates(line)); boardTimes.formUnion(times(line)) }
            else if departure { depDates.formUnion(dates(line)); depTimes.formUnion(times(line)); departures.formUnion(airportCodes(line)) }
            else if arrival { arrDates.formUnion(dates(line)); arrTimes.formUnion(times(line)); arrivals.formUnion(airportCodes(line)) }
        }
        func only(_ values: Set<String>) -> String { if values.count > 1 { draft.hasAmbiguity = true }; return values.count == 1 ? values.first! : "" }
        draft.departureDate = only(depDates); draft.departureTime = only(depTimes)
        draft.arrivalDate = only(arrDates); draft.arrivalTime = only(arrTimes)
        draft.boardingDate = only(boardDates); draft.boardingTime = only(boardTimes)
        draft.departure = only(departures); draft.arrival = only(arrivals)
        return draft
    }
}

public enum FlightConfirmationError: LocalizedError {
    case invalidDate, invalidTime, flightRequired, outsideTrip, duplicate, textTooLong
    public var errorDescription: String? {
        switch self {
        case .invalidDate: return "날짜는 YYYY-MM-DD 형식으로 정확히 입력해주세요."
        case .invalidTime: return "시간은 09:30처럼 입력하거나 비워주세요."
        case .flightRequired: return "일정에 추가하려면 항공편과 출발 날짜·시간이 필요합니다."
        case .outsideTrip: return "출발 날짜가 이 여행 기간에 없습니다. 여행 날짜를 확인해주세요."
        case .duplicate: return "같은 항공편이 해당 날짜의 일정에 이미 있습니다."
        case .textTooLong: return "항공편과 공항 이름은 200자 이하로 입력해주세요."
        }
    }
}

public enum FlightConfirmation {
    public static func apply(_ flight: FlightReceiptDraft, to trip: TripDocument,
                             expected: [String: String], addToItinerary: Bool, itemID: String) throws -> TripDocument {
        let values = flight.values.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        for key in ["flightDepartureDate", "flightArrivalDate", "flightBoardingDate"] {
            let value = values[key] ?? ""
            if !value.isEmpty && TripDate.date(value) == nil { throw FlightConfirmationError.invalidDate }
        }
        for key in ["flightDepartureTime", "flightArrivalTime", "flightBoardingTime"] {
            if !TripSchedule.validTime(values[key] ?? "") { throw FlightConfirmationError.invalidTime }
        }
        guard ["flightNumber", "departure", "arrival"].allSatisfy({ (values[$0] ?? "").count <= 200 }) else { throw FlightConfirmationError.textTooLong }
        var result = try TripMemory.apply(.setTravelDetails(values: values, expected: expected), to: trip,
                                          now: floor(Date().timeIntervalSince1970 * 1000))
        guard addToItinerary else { return result }
        let number = values["flightNumber"] ?? "", date = values["flightDepartureDate"] ?? "", time = values["flightDepartureTime"] ?? ""
        guard !number.isEmpty, let departureDate = TripDate.date(date), !time.isEmpty,
              let start = TripDate.date(trip.startDate), let end = TripDate.date(trip.endDate) else { throw FlightConfirmationError.flightRequired }
        guard departureDate >= start && departureDate <= end else { throw FlightConfirmationError.outsideTrip }
        let day = (TripDate.calendar.dateComponents([.day], from: start, to: departureDate).day ?? -1) + 1
        let flightKey = "\(number.uppercased().filter { !$0.isWhitespace })|\(date)"
        for section in [ScheduleSection.reserve] + (1...trip.dayCount).map(ScheduleSection.day) {
            if try TripSchedule.items(in: section, trip: trip).contains(where: { ($0["flightImportKey"] as? String) == flightKey }) {
                throw FlightConfirmationError.duplicate
            }
        }
        let route = [values["departure"], values["arrival"]].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " → ")
        var notes: [String] = []
        let arrival = [values["flightArrivalDate"], values["flightArrivalTime"]].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        if !arrival.isEmpty { notes.append("도착: \(arrival) (현지 시각)") }
        let boarding = [values["flightBoardingDate"], values["flightBoardingTime"]].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        if !boarding.isEmpty { notes.append("탑승: \(boarding) (현지 시각)") }
        let draft = PlaceDraft(name: "항공편 \(number)", loc: route, time: time, memo: notes.joined(separator: "\n"), emoji: "✈️")
        result = try TripSchedule.apply(.add(section: .day(day), id: itemID, draft: draft), to: result)
        var raw = result.raw
        guard var days = raw["itinerary"] as? [[String: Any]], var items = days[day - 1]["items"] as? [[String: Any]],
              let index = items.firstIndex(where: { ($0["id"] as? String) == itemID }) else { throw TripError.invalidDocument }
        items[index]["category"] = "flight"; items[index]["flightImportKey"] = flightKey
        days[day - 1]["items"] = items; raw["itinerary"] = days
        return try TripDocument(data: JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys]))
    }
}
