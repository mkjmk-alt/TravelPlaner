import SwiftUI
import NativeCore

struct TripWorkspaceView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.scenePhase) private var phase
    let tripID:String
    @StateObject private var map=MapConfiguration.makeState()
    @State private var ratio:Double
    @State private var interior:Double
    @State private var selected:Int
    @State private var scrollToken:String
    @State private var dragStart:Double?
    @State private var focusedToken:String?
    @State private var selectedMarker:MapMarker?
    @State private var cameraValues:[Double]
    init(tripID:String) {
        self.tripID=tripID
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
        GeometryReader { geometry in
            let horizontal=SplitLayout.isHorizontal(width:geometry.size.width,height:geometry.size.height)
            let extent=max(0,(horizontal ? geometry.size.width:geometry.size.height)-44)
            let layout=horizontal ? AnyLayout(HStackLayout(spacing:0)):AnyLayout(VStackLayout(spacing:0))
            layout {
                VStack(spacing:0) {
                    NativeMapPane(projection:projection,command:map.cameraCommand,active:ratio>0,onSelect:selectMarker,initialCamera:MapCameraSnapshot(values:cameraValues),onCameraIdle:{snapshot in
                        cameraValues=snapshot.values;UserDefaults.standard.set(snapshot.values,forKey:"workspace.\(tripID).camera")
                    })
                    HStack {
                        Button("전체 장소 보기") { map.fit(projection.markers.map(\.coordinate)) }
                        Spacer()
                        Button("현재 위치") { Task { await map.locate() } }
                    }.font(.caption).buttonStyle(.bordered).padding(.horizontal,8)
                    if projection.unlocatedItemCount>0 {
                        Button("위치 미확인 \(projection.unlocatedItemCount)곳 · 다시 조회") { Task { await map.resolveReferences(references) } }.font(.caption)
                    }
                    if let error=map.error { Text(error).font(.caption).foregroundStyle(.red) }
                }.frame(width:horizontal ? extent*ratio:nil,height:horizontal ? nil:extent*ratio).contentShape(Rectangle()).clipped().allowsHitTesting(ratio>0).accessibilityHidden(ratio==0)
                divider(horizontal:horizontal,extent:extent)
                ItineraryContent(tripID:tripID,selected:$selected,scrollToken:$scrollToken,onShowMap:showMap,focusedToken:focusedToken)
                    .frame(width:horizontal ? extent*(1-ratio):nil,height:horizontal ? nil:extent*(1-ratio)).contentShape(Rectangle()).clipped().allowsHitTesting(ratio<1).accessibilityHidden(ratio==1)
            }
        }.navigationTitle("일정·지도").navigationBarTitleDisplayMode(.inline)
            .onAppear { selected=min(max(0,selected),trip?.dayCount ?? 1) }
            .task(id:references) { await map.resolveReferences(references) }
            .onChange(of:selected) { UserDefaults.standard.set($0,forKey:"workspace.\(tripID).day") }
            .onChange(of:scrollToken) { UserDefaults.standard.set($0,forKey:"workspace.\(tripID).scroll") }
            .onChange(of:phase) { phase in
                if phase == .background { map.deactivate() } else if phase == .active { Task { await map.resolveReferences(references) } }
            }
            .onDisappear { saveRatio(); map.deactivate() }
            .sheet(item:$selectedMarker) { marker in TripPlaceCard(marker:marker,onShowMap:{if let key=marker.itemKey {showMap(key)}; selectedMarker=nil}) }
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
        }.frame(width:horizontal ? 44:nil,height:horizontal ? nil:44).background(Color(.secondarySystemBackground))
    }
    private func setRatio(_ value:Double) { ratio=SplitLayout.commit(value); if ratio>0 && ratio<1 {interior=ratio}; saveRatio() }
    private func saveRatio() { let prefs=UserDefaults.standard; prefs.set(ratio,forKey:"workspace.\(tripID).ratio"); prefs.set(interior,forKey:"workspace.\(tripID).interior") }
    private func showMap(_ key:ItemKey) {
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
                Button("저장 장소에 추가") {
                    do {_ = try store.saveFavorite(selection:.init(reference:.existing,originalItem:item,sourceTripID:marker.tripID,sourceItemKey:marker.itemKey),draft:draft,id:UUID().uuidString); result="저장 장소에 추가했습니다."}
                    catch {result=error.localizedDescription}
                }
                if let result {Text(result)}
            } else {Text("장소가 변경되었거나 삭제되었습니다.")}
        }.navigationTitle("일정 장소").toolbar {Button("닫기") {dismiss()}} }
    }
}
