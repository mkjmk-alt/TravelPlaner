import SwiftUI
import NativeCore

struct TripWorkspaceView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    let tripID:String
    let onSelectTrip: (String) -> Void
    let onBack: (() -> Void)?
    @State private var quickAddDay:Int?
    private let onConsumeQuickAdd: () -> Void
    @StateObject private var map=MapConfiguration.makeState()
    @State private var ratio:Double
    @State private var interior:Double
    @State private var selected:Int
    @State private var scrollToken:String
    @State private var dragStart:Double?
    @State private var focusedToken:String?
    @State private var selectedMarker:MapMarker?
    @State private var cameraValues:[Double]
    @State private var editingTrip = false
    @State private var showingBackup = false
    @State private var deletingTrip = false
    @State private var tripError: String?
    @State private var mapLoadFailed = false
    init(tripID:String, quickAddDay:Int? = nil, onConsumeQuickAdd: @escaping () -> Void = {}, onSelectTrip: @escaping (String) -> Void = { _ in }, onBack: (() -> Void)? = nil) {
        self.tripID=tripID
        self.onConsumeQuickAdd = onConsumeQuickAdd
        self.onSelectTrip = onSelectTrip
        self.onBack = onBack
        _quickAddDay = State(initialValue: quickAddDay)
        let prefs=UserDefaults.standard, key="workspace.\(tripID)."
        _ratio=State(initialValue:SplitLayout.commit(prefs.object(forKey:key+"ratio") as? Double ?? 0.5))
        _interior=State(initialValue:SplitLayout.restore(prefs.object(forKey:key+"interior") as? Double ?? 0.5))
        _selected=State(initialValue:prefs.object(forKey:key+"day") as? Int ?? 1)
        _scrollToken=State(initialValue:prefs.string(forKey:key+"scroll") ?? "")
        _cameraValues=State(initialValue:prefs.array(forKey:key+"camera") as? [Double] ?? [])
    }
    private var trip:TripDocument? { store.trips.first {$0.id==tripID} }
    private var projection:MapProjection { TripMapProjection.make(trip:trip,saved:[],resolved:map.resolved) }
    private var references:[String] { TripMapProjection.googlePlaceIDs(trip:trip,saved:[]) }
    var body:some View {
        Group {
        if MapConfiguration.key == nil || mapLoadFailed {
            VStack(spacing: 0) {
                HStack {
                    Label(mapLoadFailed ? "지도를 불러오지 못했어요" : "지도를 연결하면 일정과 함께 볼 수 있어요", systemImage: "map")
                    if mapLoadFailed { Button("다시 시도") { mapLoadFailed = false } }
                }
                    .font(.caption).foregroundStyle(NativePreviewTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(NativePreviewTheme.mapAccentContainer)
                    .accessibilityIdentifier("workspaceMapUnavailable")
                ItineraryContent(tripID:tripID,selected:$selected,scrollToken:$scrollToken,onShowMap:showMap,focusedToken:focusedToken,
                                 quickAddDay:quickAddDay,onConsumeQuickAdd:consumeQuickAdd)
            }
        } else {
        GeometryReader { geometry in
            // A compact landscape phone cannot fit useful map and list content vertically.
            let horizontal=SplitLayout.isHorizontal(width:geometry.size.width,height:geometry.size.height)
                || (geometry.size.width>geometry.size.height && geometry.size.width>=600)
            let extent=max(0,(horizontal ? geometry.size.width:geometry.size.height)-44)
            let layout=horizontal ? AnyLayout(HStackLayout(spacing:0)):AnyLayout(VStackLayout(spacing:0))
            layout {
                VStack(spacing:0) {
                    NativeMapPane(projection:projection,command:map.cameraCommand,active:ratio>0,onSelect:selectMarker,initialCamera:MapCameraSnapshot(values:cameraValues),onCameraIdle:{snapshot in
                        cameraValues=snapshot.values;UserDefaults.standard.set(snapshot.values,forKey:"workspace.\(tripID).camera")
                    },onUnavailable:{ mapLoadFailed = true })
                    HStack {
                        Button("전체 장소 보기") { map.fit(projection.markers.map(\.coordinate)) }.frame(minHeight: 44)
                        Spacer()
                        Button("현재 위치") { Task { await map.locate() } }.frame(minHeight: 44)
                    }.font(.caption).buttonStyle(.bordered).padding(.horizontal,8)
                    if projection.unlocatedItemCount>0 {
                        Button("위치 미확인 \(projection.unlocatedItemCount)곳 · 다시 조회") { Task { await map.resolveReferences(references) } }.font(.caption)
                    }
                    if let error=map.error { Text(error).font(.caption).foregroundStyle(.red) }
                }.frame(width:horizontal ? extent*ratio:nil,height:horizontal ? nil:extent*ratio).contentShape(Rectangle()).clipped().allowsHitTesting(ratio>0).accessibilityHidden(ratio==0)
                divider(horizontal:horizontal,extent:extent)
                ItineraryContent(tripID:tripID,selected:$selected,scrollToken:$scrollToken,onShowMap:showMap,focusedToken:focusedToken,
                                 quickAddDay:quickAddDay,onConsumeQuickAdd:consumeQuickAdd)
                    .frame(width:horizontal ? extent*(1-ratio):nil,height:horizontal ? nil:extent*(1-ratio)).contentShape(Rectangle()).clipped().allowsHitTesting(ratio<1).accessibilityHidden(ratio==1)
            }
        }
        }
        }
        .navigationTitle(trip?.name ?? "일정·지도").navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(trip?.name ?? "일정·지도").font(.headline).lineLimit(1)
                    if let trip { Text("\(trip.startDate) ~ \(trip.endDate)").font(.caption2).foregroundStyle(NativePreviewTheme.textMuted).lineLimit(1) }
                }
                .accessibilityIdentifier("workspaceTripTitle")
            }
            ToolbarItem(placement: .topBarLeading) {
                Button { if let onBack { onBack() } else { dismiss() } } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("내 여행 목록").accessibilityIdentifier("tripListBack")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    ForEach(store.trips) { option in
                        Button { onSelectTrip(option.id) } label: {
                            if option.id == tripID { Label(option.name, systemImage: "checkmark") } else { Text(option.name) }
                        }
                    }
                } label: { Image(systemName: "arrow.left.arrow.right") }
                    .accessibilityLabel("여행 선택").accessibilityIdentifier("tripSelectorButton")
                Menu {
                    Button("여행 정보 수정", systemImage: "pencil") { editingTrip = true }
                    Button("여행 백업", systemImage: "square.and.arrow.up") { showingBackup = true }
                    Button("여행 삭제", systemImage: "trash", role: .destructive) { deletingTrip = true }
                } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("여행 관리").accessibilityIdentifier("tripManagementMenu")
            }
        }
            .onAppear { selected=min(max(0,selected),trip?.dayCount ?? 1) }
            .task(id:references) { await map.resolveReferences(references) }
            .onChange(of:selected) { UserDefaults.standard.set($0,forKey:"workspace.\(tripID).day") }
            .onChange(of:scrollToken) { UserDefaults.standard.set($0,forKey:"workspace.\(tripID).scroll") }
            .onChange(of:phase) { phase in
                if phase == .background { map.deactivate() } else if phase == .active { Task { await map.resolveReferences(references) } }
            }
            .onDisappear { saveRatio(); map.deactivate() }
            .sheet(item:$selectedMarker) { marker in TripPlaceCard(marker:marker,onShowMap:{if let key=marker.itemKey {showMap(key)}; selectedMarker=nil}) }
            .sheet(isPresented: $editingTrip) { if let trip { TripEditorView(original: trip) { _ in } } }
            .sheet(isPresented: $showingBackup) { NavigationStack { TripBackupView(tripID: tripID) } }
            .confirmationDialog("이 여행을 삭제할까요?", isPresented: $deletingTrip, titleVisibility: .visible) {
                Button("여행 삭제", role: .destructive) {
                    guard let trip else { return }
                    do { try store.delete(trip); if let onBack { onBack() } else { dismiss() } }
                    catch { tripError = error.localizedDescription }
                }
            } message: { Text("여행과 해당 여행의 일정이 삭제됩니다.") }
            .alert("알림", isPresented: Binding(get: { tripError != nil }, set: { if !$0 { tripError = nil } })) {
                Button("확인") { tripError = nil }
            } message: { Text(tripError ?? "") }
    }
    private func consumeQuickAdd() {
        quickAddDay = nil
        onConsumeQuickAdd()
    }
    private func divider(horizontal:Bool,extent:Double)->some View {
        let layout=horizontal ? AnyLayout(VStackLayout(spacing:0)):AnyLayout(HStackLayout(spacing:0))
        return layout {
            Button { setRatio(1) } label:{Image(systemName:"map").frame(width:44,height:44)}.accessibilityLabel("지도 전체 화면").accessibilityIdentifier("splitMapFull")
            Image(systemName:horizontal ? "line.3.horizontal":"line.3.horizontal")
                .frame(maxWidth:horizontal ? 44:.infinity,maxHeight:horizontal ? .infinity:44).contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance:1).onChanged { value in
                    if dragStart==nil {dragStart=ratio}
                    ratio=SplitLayout.resize(startRatio:dragStart!,delta:horizontal ? value.translation.width:value.translation.height,extent:extent)
                }.onEnded { _ in dragStart=nil; setRatio(ratio) })
                .accessibilityElement().accessibilityLabel("지도와 일정 크기 조절").accessibilityValue("지도 \(Int((ratio*100).rounded()))%")
                .accessibilityIdentifier("splitHandle")
                .accessibilityAdjustableAction { direction in setRatio(SplitLayout.commit(ratio+(direction == .increment ? 0.1:-0.1))) }
            Button { setRatio(SplitLayout.restore(interior)) } label:{Image(systemName:"rectangle.split.2x1").frame(width:44,height:44)}.accessibilityLabel("분할 복원").accessibilityIdentifier("splitRestore")
            Button { setRatio(0) } label:{Image(systemName:"list.bullet").frame(width:44,height:44)}.accessibilityLabel("일정 전체 화면").accessibilityIdentifier("splitListFull")
        }.frame(width:horizontal ? 44:nil,height:horizontal ? nil:44)
            .foregroundStyle(NativePreviewTheme.primary)
            .background(NativePreviewTheme.surfaceLow)
    }
    private func setRatio(_ value:Double) { ratio=SplitLayout.commit(value); if ratio>0 && ratio<1 {interior=ratio}; saveRatio() }
    private func saveRatio() { let prefs=UserDefaults.standard; prefs.set(ratio,forKey:"workspace.\(tripID).ratio"); prefs.set(interior,forKey:"workspace.\(tripID).interior") }
    private func showMap(_ key:ItemKey) {
        guard MapConfiguration.key != nil, !mapLoadFailed else { tripError = "지도를 연결한 뒤 장소 위치를 확인할 수 있어요."; return }
        if ratio==0 {setRatio(SplitLayout.restore(interior))}
        if let marker=projection.markers.first(where:{$0.itemKey==key}) {map.focus(marker.coordinate)} else {map.fit([])}
    }
    private func selectMarker(_ marker:MapMarker) {
        switch marker.kind {case .day(let day):selected=day;case .reserve:selected=0;case .saved:return}
        focusedToken=marker.itemKey?.token; selectedMarker=marker
    }
}

struct TripPlaceCard:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let marker:MapMarker
    var onShowMap:()->Void
    @State private var result:String?
    @State private var editing = false
    private var section: ScheduleSection? {
        switch marker.kind { case .day(let day): return .day(day); case .reserve: return .reserve; case .saved: return nil }
    }
    private var item:[String:Any]? {
        guard let trip=store.trips.first(where:{$0.id==marker.tripID}),let key=marker.itemKey else {return nil}
        return ([ScheduleSection.reserve]+(1...trip.dayCount).map(ScheduleSection.day)).flatMap {(try? TripSchedule.items(in:$0,trip:trip)) ?? []}.first {(try? ItemKey(json:$0["id"] as Any))==key}
    }
    var body:some View {
        NavigationStack { Form {
            if let item {
                let draft=PlaceDraft(item:item)
                Text(draft.displayName.isEmpty ? draft.name:draft.displayName).font(.headline)
                Text(draft.memo)
                Button("지도에서 보기",action:onShowMap)
                if marker.itemKey != nil && section != nil {
                    Button("일정 수정") { editing = true }.accessibilityIdentifier("editMapItineraryPlace")
                }
                Button("저장 장소에 추가") {
                    do {_ = try store.saveFavorite(selection:.init(reference:.existing,originalItem:item,sourceTripID:marker.tripID,sourceItemKey:marker.itemKey),draft:draft,id:UUID().uuidString); result="저장 장소에 추가했습니다."}
                    catch {result=error.localizedDescription}
                }
                if let result {Text(result)}
            } else {Text("장소가 변경되었거나 삭제되었습니다.")}
        }.navigationTitle("일정 장소").toolbar {Button("닫기") {dismiss()}} }
        .sheet(isPresented: $editing) {
            if let item, let tripID = marker.tripID, let key = marker.itemKey, let section {
                PlaceEditorView(tripID: tripID, section: section, key: key, initial: PlaceDraft(item: item))
            }
        }
    }
}
