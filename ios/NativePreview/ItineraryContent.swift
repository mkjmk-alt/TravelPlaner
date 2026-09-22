import SwiftUI
import NativeCore

private struct PlaceEditTarget: Identifiable {
    let id = UUID()
    let section: ScheduleSection
    let key: ItemKey?
    let draft: PlaceDraft
}
struct ItineraryContent: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String
    @Binding var selected:Int
    @Binding var scrollToken:String
    var onShowMap:(ItemKey)->Void
    var focusedToken:String?
    @State private var editing: PlaceEditTarget?
    @State private var deleting: ItemKey?
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var section: ScheduleSection { selected == 0 ? .reserve : .day(selected) }
    var body: some View {
        Group {
            if let trip {
                VStack(spacing: 0) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(0...trip.dayCount, id: \.self) { number in
                                Button(number == 0 ? "예비 목록" : "\(number)일차") { selected = number }
                                    .buttonStyle(.bordered).tint(number == selected ? .purple : .secondary)
                                    .accessibilityIdentifier(number == 0 ? "section-reserve" : "section-day-\(number)")
                                    .frame(minHeight: 44)
                            }
                        }.padding(.horizontal)
                    }
                    ScrollViewReader { proxy in
                    List {
                        if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("schedule-error") }
                        Section {
                            Button { editing = .init(section: section, key: nil, draft: .init()) } label: { Label("장소 직접 추가", systemImage: "plus.circle") }
                                .accessibilityIdentifier("addPlace")
                            Text("지도 탭에서 검색한 장소도 일정에 추가할 수 있어요.").font(.footnote).foregroundStyle(.secondary)
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
                                        Menu {
                                            Button("지도에서 보기") { onShowMap(key) }
                                            Button("저장 장소에 추가") {
                                                do {
                                                    _ = try store.saveFavorite(selection:.init(reference:.existing,originalItem:item,sourceTripID:tripID,sourceItemKey:key),draft:.init(item:item),id:UUID().uuidString)
                                                } catch { self.error=error.localizedDescription }
                                            }
                                            Button("장소 편집") { editing = .init(section: section, key: key, draft: .init(item: item)) }
                                            Button("위로 이동") { apply(.shift(section: section, key: key, offset: -1)) }.disabled(index == 0)
                                            Button("아래로 이동") { apply(.shift(section: section, key: key, offset: 1)) }.disabled(index == items.count - 1)
                                            ForEach(0...trip.dayCount, id: \.self) { target in
                                                if target != selected {
                                                    Button(target == 0 ? "예비 목록으로 이동" : "\(target)일차로 이동") {
                                                        apply(.move(section: section, key: key, to: target == 0 ? .reserve : .day(target)))
                                                    }
                                                }
                                            }
                                            Button("장소 삭제", role: .destructive) { deleting = key }
                                        } label: { Image(systemName: "ellipsis.circle").frame(minWidth: 44, minHeight: 44) }
                                        .accessibilityLabel("장소 작업").accessibilityIdentifier("placeActions")
                                    }
                                }.padding(.vertical, 8).id(row.id)
                                    .background(GeometryReader { geometry in Color.clear.preference(key:VisibleItineraryRows.self,value:[row.id:geometry.frame(in:.named("itinerary-list"))]) })
                            }
                        }
                        Section { Button("시간순 정렬") { apply(.sortByTime(section: section)) } }
                    }.coordinateSpace(name:"itinerary-list").accessibilityIdentifier("itinerary-list")
                        .onAppear { if !scrollToken.isEmpty { proxy.scrollTo(scrollToken,anchor:.top) } }
                        .onChange(of:focusedToken) { token in if let token { proxy.scrollTo(token,anchor:.top) } }
                        .onPreferenceChange(VisibleItineraryRows.self) { rows in
                            if let first=rows.filter({$0.value.maxY>0}).min(by:{$0.value.minY < $1.value.minY})?.key { scrollToken=first }
                        }
                    }
                }
                .navigationTitle("여행 일정").navigationBarTitleDisplayMode(.inline)
            } else { Text("여행을 찾을 수 없어요.") }
        }
        .sheet(item: $editing) { target in
            PlaceEditorView(tripID: tripID, section: target.section, key: target.key, initial: target.draft)
        }
        .alert("장소를 삭제할까요?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("장소 삭제", role: .destructive) { if let key = deleting { apply(.remove(section: section, key: key)) }; deleting = nil }
            Button("취소", role: .cancel) { deleting = nil }
        } message: { Text("해당 장소만 일정에서 제거됩니다. 지출 기록은 삭제되지 않습니다.") }
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
