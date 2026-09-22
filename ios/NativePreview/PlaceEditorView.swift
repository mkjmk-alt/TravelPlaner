import SwiftUI
import NativeCore

struct PlaceEditorView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    let section: ScheduleSection
    let key: ItemKey?
    let initial: PlaceDraft
    @State private var draft: PlaceDraft
    @State private var newID = UUID().uuidString
    @State private var error: String?
    @State private var discarding = false
    init(tripID: String, section: ScheduleSection, key: ItemKey?, initial: PlaceDraft) {
        self.tripID = tripID; self.section = section; self.key = key; self.initial = initial; _draft = State(initialValue: initial)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section(section.title) {
                    TextField("장소 이름", text: $draft.name).accessibilityIdentifier("placeName")
                    TextField("표시 이름 (선택)", text: $draft.displayName)
                    TextField("주소 (선택)", text: $draft.loc, axis: .vertical)
                    TextField("시간: 09:30 또는 미정", text: $draft.time).keyboardType(.numbersAndPunctuation).accessibilityIdentifier("placeTime")
                    TextField("메모 (선택)", text: $draft.memo, axis: .vertical).lineLimit(2...8).accessibilityIdentifier("placeMemo")
                    TextField("아이콘", text: $draft.emoji)
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("place-error") }
                Section { Text("시간을 바꿔도 장소 순서는 유지됩니다. 일정 화면의 시간순 정렬로 따로 정렬할 수 있어요.").font(.footnote) }
            }
            .navigationTitle(key == nil ? "장소 추가" : "장소 편집").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { if draft != initial { discarding = true } else { dismiss() } } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장") {
                        do {
                            let change: ScheduleChange = key.map { .edit(section: section, key: $0, draft: draft) } ?? .add(section: section, id: newID, draft: draft)
                            try store.applySchedule(tripID: tripID, change: change); dismiss()
                        } catch { self.error = error.localizedDescription }
                    }.accessibilityIdentifier("savePlace")
                }
            }
            .confirmationDialog("작성 중인 내용을 버릴까요?", isPresented: $discarding, titleVisibility: .visible) {
                Button("작성 내용 버리기", role: .destructive) { dismiss() }
                Button("계속 작성", role: .cancel) {}
            }
        }.interactiveDismissDisabled(draft != initial)
    }
}
