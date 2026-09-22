import SwiftUI
import NativeCore

struct TravelDetailsView: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @State private var departure = ""
    @State private var arrival = ""
    @State private var flightNumber = ""
    @State private var stayName = ""
    @State private var stayAddress = ""
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    var body: some View {
        Form {
            Section("항공") { TextField("출발지", text: $departure); TextField("도착지", text: $arrival); TextField("항공편", text: $flightNumber) }
            Section("숙소") { TextField("숙소 이름", text: $stayName); TextField("숙소 주소", text: $stayAddress) }
            Button("저장") { save() }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("항공·숙소 정보")
        .onAppear { load() }
    }
    private func load() {
        let values = trip?.raw["travelDetails"] as? [String: Any] ?? [:]
        departure = values["departure"] as? String ?? ""; arrival = values["arrival"] as? String ?? ""; flightNumber = values["flightNumber"] as? String ?? ""; stayName = values["stayName"] as? String ?? ""; stayAddress = values["stayAddress"] as? String ?? ""
    }
    private func save() {
        guard let trip, let old = trip.raw["travelDetails"] as? [String: Any] else { return }
        let values = ["departure": departure, "arrival": arrival, "flightNumber": flightNumber, "stayName": stayName, "stayAddress": stayAddress]
        let expected = values.reduce(into: [String: String]()) { $0[$1.key] = old[$1.key] as? String ?? "" }
        do { try store.applyMemoryChange(tripID: trip.id, change: .setTravelDetails(values: values, expected: expected)); error = nil }
        catch let issue { error = issue.localizedDescription }
    }
}
