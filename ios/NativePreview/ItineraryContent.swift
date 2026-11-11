import SwiftUI
import NativeCore

private struct PlaceEditTarget: Identifiable {
    let id = UUID()
    let section: ScheduleSection
    let key: ItemKey?
    let draft: PlaceDraft
}
private struct PlaceActionTarget: Identifiable {
    let id = UUID()
    let section: ScheduleSection
    let key: ItemKey
    let item: [String: Any]
    let index: Int
    let count: Int
    let dayCount: Int
    var title: String {
        let draft = PlaceDraft(item: item)
        return draft.displayName.isEmpty ? (draft.name.isEmpty ? "장소" : draft.name) : draft.displayName
    }
}
private enum PlaceAction {
    case showMap, save, edit, shift(Int), move(ScheduleSection), delete
}
private struct PendingPlaceAction {
    let target: PlaceActionTarget
    let action: PlaceAction
}
private struct PlaceDeleteTarget {
    let section: ScheduleSection
    let key: ItemKey
}

struct ItineraryContent: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @Binding var selected:Int
    @Binding var scrollToken:String
    var onShowMap:(ItemKey)->Void
    var focusedToken:String?
    @State private var editing: PlaceEditTarget?
    @State private var deleting: PlaceDeleteTarget?
    @State private var actionTarget: PlaceActionTarget?
    @State private var pendingAction: PendingPlaceAction?
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var section: ScheduleSection { selected == 0 ? .reserve : .day(selected) }
    var body: some View {
        Group {
            if let trip {
                VStack(spacing: 0) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(0...trip.dayCount, id: \.self) { number in
                                Button(number == 0 ? "예비 목록" : "\(number)일차") { selected = number }
                                    .buttonStyle(.bordered)
                                    .tint(number == selected ? NativePreviewTheme.primary : NativePreviewTheme.textMuted)
                                    .accessibilityIdentifier(number == 0 ? "section-reserve" : "section-day-\(number)")
                                    .frame(minHeight: 44)
                            }
                        }.padding(.horizontal, NativePreviewTheme.screenPadding)
                    }
                    .padding(.vertical, 8)
                    .background(NativePreviewTheme.background)
                    ScrollViewReader { proxy in
                    List {
                        if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("schedule-error") }
                        Section {
                            Button { editing = .init(section: section, key: nil, draft: .init()) } label: { Label("장소 직접 추가", systemImage: "plus.circle") }
                                .accessibilityIdentifier("addPlace")
                            Text("지도 탭에서 검색한 장소도 일정에 추가할 수 있어요.").font(.footnote).foregroundStyle(.secondary)
                        }
                        if selected > 0 {
                            ForEach(Array(TripLodging.day(selected, in: trip).enumerated()), id: \.offset) { _, stay in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("🏨 \(stay.row["name"] as? String ?? "숙소")").font(.headline)
                                    Text([stay.checkOut ? "체크아웃" : nil, stay.checkIn ? "체크인" : nil, stay.overnight ? "숙박" : nil].compactMap { $0 }.joined(separator: " · "))
                                        .font(.caption).foregroundStyle(NativePreviewTheme.primary)
                                    if let address = stay.row["address"] as? String, !address.isEmpty { Text(address).font(.caption).foregroundStyle(NativePreviewTheme.textMuted) }
                                }.accessibilityIdentifier("lodgingDaySummary")
                            }
                        }
                        let result = Result { try TripSchedule.items(in: section, trip: trip) }
                        switch result {
                        case .failure(let issue): Text(issue.localizedDescription).foregroundStyle(.red)
                        case .success(let items):
                            if items.isEmpty { Text("아직 장소가 없어요.").foregroundStyle(.secondary) }
                            ForEach(items.indices.map { ItineraryRow(index:$0,item:items[$0]) }) { row in
                                let index=row.index, item=row.item
                                HStack(alignment: .top, spacing: 12) {
                                    Text(item["emoji"] as? String ?? "📍").font(.title2)
                                    VStack(alignment: .leading, spacing: 6) {
                                        let display = item["displayName"] as? String ?? ""
                                        Text(display.isEmpty ? item["name"] as? String ?? "장소" : display).font(.headline)
                                        if let time = item["time"] as? String, !time.isEmpty { Text(time).font(.subheadline).foregroundStyle(.tint) }
                                        if let address = item["loc"] as? String, !address.isEmpty { Text(address).font(.subheadline).foregroundStyle(.secondary) }
                                        if let memo = item["memo"] as? String, !memo.isEmpty { Text(memo).font(.body) }
                                    }
                                    Spacer(minLength: 0)
                                    if let value = item["id"], let key = try? ItemKey(json: value) {
                                        Button {
                                            actionTarget = .init(section: section, key: key, item: item,
                                                                 index: index, count: items.count, dayCount: trip.dayCount)
                                        } label: {
                                            Label("관리", systemImage: "slider.horizontal.3")
                                                .font(.system(size: 13, weight: .bold))
                                                .foregroundStyle(NativePreviewTheme.primary)
                                                .padding(.horizontal, 10)
                                                .frame(minWidth: 68, minHeight: 44)
                                                .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 13))
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel("\(PlaceActionTarget(section: section, key: key, item: item, index: index, count: items.count, dayCount: trip.dayCount).title) 장소 관리")
                                        .accessibilityHint("장소 편집, 순서 변경 및 삭제 메뉴")
                                        .accessibilityIdentifier("placeActions")
                                    }
                                }.padding(.vertical, 8).id(row.id)
                                    .background(GeometryReader { geometry in Color.clear.preference(key:VisibleItineraryRows.self,value:[row.id:geometry.frame(in:.named("itinerary-list"))]) })
                            }
                        }
                        Section { Button("시간순 정렬") { apply(.sortByTime(section: section)) } }
                    }.coordinateSpace(name:"itinerary-list").accessibilityIdentifier("itinerary-list")
                        .scrollContentBackground(.hidden)
                        .background(NativePreviewTheme.background)
                        .onAppear { if !scrollToken.isEmpty { proxy.scrollTo(scrollToken,anchor:.top) } }
                        .onChange(of:focusedToken) { token in if let token { proxy.scrollTo(token,anchor:.top) } }
                        .onPreferenceChange(VisibleItineraryRows.self) { rows in
                            if let first=rows.filter({$0.value.maxY>0}).min(by:{$0.value.minY < $1.value.minY})?.key { scrollToken=first }
                        }
                    }
                }
            } else { Text("여행을 찾을 수 없어요.") }
        }
        .sheet(item: $editing) { target in
            PlaceEditorView(tripID: tripID, section: target.section, key: target.key, initial: target.draft)
        }
        .sheet(item: $actionTarget, onDismiss: performPendingAction) { target in
            PlaceActionsSheet(target: target) { action in
                pendingAction = .init(target: target, action: action)
                actionTarget = nil
            }
        }
        .alert("장소를 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("장소 삭제", role: .destructive) {
                if let target = deleting { apply(.remove(section: target.section, key: target.key)) }
                deleting = nil
            }
            Button("취소", role: .cancel) { deleting = nil }
        } message: { Text("해당 장소만 일정에서 제거됩니다. 지출 기록은 삭제되지 않습니다.") }
    }
    private func performPendingAction() {
        guard let pending = pendingAction else { return }
        pendingAction = nil
        let target = pending.target
        guard let trip, let items = try? TripSchedule.items(in: target.section, trip: trip),
              let item = items.first(where: { value in
                  guard let id = value["id"], let key = try? ItemKey(json: id) else { return false }
                  return key == target.key
              }) else { error = "장소가 변경되었거나 삭제되었습니다. 목록을 확인해주세요."; return }
        switch pending.action {
        case .showMap: onShowMap(target.key)
        case .save:
            do {
                _ = try store.saveFavorite(selection: .init(reference: .existing, originalItem: item, sourceTripID: tripID, sourceItemKey: target.key), draft: .init(item: item), id: UUID().uuidString)
            } catch { self.error = error.localizedDescription }
        case .edit: editing = .init(section: target.section, key: target.key, draft: .init(item: item))
        case .shift(let offset): apply(.shift(section: target.section, key: target.key, offset: offset))
        case .move(let destination): apply(.move(section: target.section, key: target.key, to: destination))
        case .delete: deleting = .init(section: target.section, key: target.key)
        }
    }
    private func apply(_ change: ScheduleChange) {
        do { try store.applySchedule(tripID: tripID, change: change); error = nil } catch { self.error = error.localizedDescription }
    }
}
private struct ItineraryRow:Identifiable {
    let index:Int
    let item:[String:Any]
    var id:String { (item["id"].flatMap { try? ItemKey(json:$0).token }) ?? "invalid:\(index)" }
}
private struct VisibleItineraryRows:PreferenceKey {
    static var defaultValue=[String:CGRect]()
    static func reduce(value:inout [String:CGRect],nextValue:()->[String:CGRect]) { value.merge(nextValue(),uniquingKeysWith:{$1}) }
}


private struct PlaceActionsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: PlaceActionTarget
    let onAction: (PlaceAction) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(target.title).font(.title3.bold()).foregroundStyle(NativePreviewTheme.textPrimary)
                        Text("\(target.section.title) · 장소 관리").font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    actionGroup("장소") {
                        actionRow("장소 편집", symbol: "pencil", action: .edit)
                        actionRow("지도에서 보기", symbol: "map", action: .showMap)
                        actionRow("저장 장소에 추가", symbol: "heart", action: .save)
                    }
                    actionGroup("순서 변경") {
                        actionRow("위로 이동", symbol: "arrow.up", action: .shift(-1), disabled: target.index == 0)
                        actionRow("아래로 이동", symbol: "arrow.down", action: .shift(1), disabled: target.index >= target.count - 1)
                    }
                    actionGroup("다른 일정으로 이동") {
                        ForEach(0...target.dayCount, id: \.self) { number in
                            if number != target.section.token {
                                actionRow(number == 0 ? "예비 목록으로 이동" : "\(number)일차로 이동",
                                          symbol: "calendar", action: .move(number == 0 ? .reserve : .day(number)))
                            }
                        }
                    }
                    actionRow("장소 삭제", symbol: "trash", action: .delete, destructive: true)
                        .nativeCard(padding: 8)
                }
                .padding(.horizontal, NativePreviewTheme.screenPadding)
                .padding(.vertical, 16)
            }
            .background(NativePreviewTheme.background)
            .accessibilityIdentifier("placeActionSheet")
            .navigationTitle("장소 관리")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } }
            }
            .tint(NativePreviewTheme.primary)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func actionGroup<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.footnote.weight(.bold)).foregroundStyle(NativePreviewTheme.textMuted)
                .padding(.horizontal, 4)
            VStack(spacing: 0, content: content).nativeCard(padding: 8)
        }
    }
    private func actionRow(_ title: String, symbol: String, action: PlaceAction, disabled: Bool = false, destructive: Bool = false) -> some View {
        Button { onAction(action) } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(destructive ? NativePreviewTheme.favoritesAccent : NativePreviewTheme.primary)
                    .frame(width: 34, height: 34)
                    .background(destructive ? NativePreviewTheme.favoritesContainer : NativePreviewTheme.primaryContainer,
                                in: RoundedRectangle(cornerRadius: 10))
                Text(title).font(.subheadline.weight(.semibold))
                Spacer(minLength: 0)
                if !destructive { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(NativePreviewTheme.textMuted) }
            }
            .foregroundStyle(destructive ? NativePreviewTheme.favoritesAccent : NativePreviewTheme.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .padding(.horizontal, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(title)
    }
}
