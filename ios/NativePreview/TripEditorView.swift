import SwiftUI
import NativeCore

struct TripEditorView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let original: TripDocument?
    let onSaved: (String) -> Void
    @State private var name: String
    @State private var country: String
    @State private var start: Date
    @State private var end: Date
    @State private var error: String?

    init(original: TripDocument?, onSaved: @escaping (String) -> Void) {
        self.original = original
        self.onSaved = onSaved
        let local = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        let today = TripDate.calendar.date(from: local) ?? Date()
        _name = State(initialValue: original?.name ?? "")
        _country = State(initialValue: original?.country ?? "")
        _start = State(initialValue: original.flatMap { TripDate.date($0.startDate) } ?? today)
        _end = State(initialValue: original.flatMap { TripDate.date($0.endDate) } ?? today)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: NativePreviewTheme.sectionSpacing) {
                    Text(original == nil ? "새 여행 만들기" : "여행 정보 수정")
                        .font(.title.bold()).foregroundStyle(NativePreviewTheme.textPrimary)
                    Text("여행 이름과 날짜를 입력하면 이 기기에 바로 저장돼요.")
                        .font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                    VStack(alignment: .leading, spacing: 10) {
                        Text("여행 이름").font(.headline)
                        HStack {
                            TextField("예: 가을 오사카 여행", text: $name)
                                .accessibilityIdentifier("tripNameField")
                            if !name.isEmpty {
                                Button { name = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                                    .buttonStyle(.borderless).accessibilityLabel("이름 지우기").accessibilityIdentifier("clearTripName")
                            }
                        }
                        .padding(14).background(NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 14))
                    }.nativeCard()
                    VStack(alignment: .leading, spacing: 10) {
                        Text("여행지").font(.headline)
                        TextField("예: 일본", text: $country).accessibilityIdentifier("tripCountryField")
                            .padding(14).background(NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 14))
                    }.nativeCard()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("여행 날짜").font(.headline)
                        DatePicker("시작일", selection: $start, displayedComponents: .date)
                        DatePicker("종료일", selection: $end, displayedComponents: .date)
                        Text("당일 여행부터 최대 100일까지 만들 수 있어요.")
                            .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                    }.nativeCard()
                    if let error {
                        Label(error, systemImage: "exclamationmark.circle").foregroundStyle(.red)
                    }
                    Button("여행 저장", action: save).nativePrimaryButton()
                    Label("로그인 없이 이 기기에 저장됩니다.", systemImage: "internaldrive")
                        .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                }
                .padding(.horizontal, NativePreviewTheme.screenPadding)
                .padding(.vertical, NativePreviewTheme.sectionSpacing)
            }
            .background(NativePreviewTheme.background)
            .environment(\.calendar, TripDate.calendar)
            .environment(\.timeZone, TripDate.calendar.timeZone)
            .navigationTitle(original == nil ? "새 여행" : "여행 편집")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("저장", action: save).bold().accessibilityIdentifier("saveTripButton")
                }
            }
            .interactiveDismissDisabled(!name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func save() {
        do {
            let id = try store.save(draft: .init(name: name, country: country, startDate: TripDate.string(start), endDate: TripDate.string(end)), original: original)
            dismiss()
            onSaved(id)
        } catch { self.error = error.localizedDescription }
    }
}
