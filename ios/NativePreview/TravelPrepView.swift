import SwiftUI
import NativeCore

struct TravelPrepView: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @State private var newItem = ""
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var items: [[String: Any]] { (trip?.raw["checklist"] as? [[String: Any]]) ?? [] }

    var body: some View {
        List {
            Section("준비 항목 추가") {
                HStack { TextField("예: 여권 사본", text: $newItem); Button("추가") { add() }.disabled(newItem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
            Section("체크리스트") {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    Button { toggle(index: index, item: item) } label: {
                        Label(item["label"] as? String ?? "항목", systemImage: (item["checked"] as? Bool ?? false) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle((item["checked"] as? Bool ?? false) ? .secondary : .primary)
                    }.accessibilityIdentifier("checklist-row-\(index)")
                        .swipeActions { Button(role: .destructive) { remove(index: index, item: item) } label: { Label("삭제", systemImage: "trash") } }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("여행 준비")
    }
    private func add() {
        guard let trip else { return }; let value = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
        do { try store.applyMemoryChange(tripID: trip.id, change: .addChecklist(operationID: UUID().uuidString, item: ["id": UUID().uuidString, "label": value, "checked": false])); newItem = ""; error = nil }
        catch let issue { error = issue.localizedDescription }
    }
    private func toggle(index: Int, item: [String: Any]) {
        guard let trip else { return }; do { try store.applyMemoryChange(tripID: trip.id, change: .setChecklistChecked(selector: selector(for: item, index: index), checked: !(item["checked"] as? Bool ?? false))); error = nil }
        catch let issue { error = issue.localizedDescription }
    }
    private func remove(index: Int, item: [String: Any]) {
        guard let trip else { return }; do { try store.applyMemoryChange(tripID: trip.id, change: .removeChecklist(selector: selector(for: item, index: index))); error = nil }
        catch let issue { error = issue.localizedDescription }
    }
    private func selector(for row: [String: Any], index: Int) -> MemoryRowSelector {
        if let id = row["id"] as? String { return MemoryRowSelector(key: .string(id), index: nil, expected: row, expectedRows: nil) }
        if let number = row["id"] as? NSNumber { return MemoryRowSelector(key: .integer(number.intValue), index: index, expected: row, expectedRows: items) }
        return MemoryRowSelector(key: nil, index: index, expected: row, expectedRows: items)
    }
}
