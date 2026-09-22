import SwiftUI
import NativeCore

struct PlaceSearchView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Binding var activeTrip:String
    @StateObject private var map=MapConfiguration.makeState()
    @State private var query=""
    @State private var saving=false
    @State private var toItinerary=false
    @State private var tripMarker:MapMarker?
    @State private var detailID:String?
    @State private var savedID:String?
    @Environment(\.scenePhase) private var phase
    private var trip:TripDocument? { store.trips.first { $0.id==activeTrip } }
    private var projection:MapProjection { TripMapProjection.make(trip:trip,saved:store.savedPlaces,resolved:map.resolved) }
    private var references:[String] { TripMapProjection.googlePlaceIDs(trip:trip,saved:store.savedPlaces) }
    var body:some View {
        NavigationStack {
            VStack(spacing:0) {
                HStack {
                    TextField("장소 검색",text:$query).textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("placeSearch")
                    Button("취소") { query=""; map.cancelSearch() }
                }.padding(.horizontal)
                Picker("지도에 표시할 여행",selection:$activeTrip) {
                    Text("여행 미선택").tag("")
                    ForEach(store.trips) { Text($0.name).tag($0.id) }
                }.pickerStyle(.menu)
                if !map.results.isEmpty {
                    ScrollView {
                        VStack(alignment:.leading) {
                            ForEach(map.results) { result in Button(result.text) { Task { await map.select(placeID:result.placeID); detailID=map.selected?.placeID } }.padding(.vertical,8) }
                            GooglePlacesAttribution()
                        }.padding()
                    }.frame(maxHeight:200)
                }
                NativeMapPane(projection:projection,command:map.cameraCommand,onSelect:{ marker in
                    if let id=marker.favoriteID { savedID=id }
                    else {tripMarker=marker}
                })
                HStack {
                    Button("전체 장소 보기") { map.fit(projection.markers.map(\.coordinate)) }
                    Spacer()
                    Button("현재 위치") { Task { await map.locate() } }
                }.buttonStyle(.bordered).padding(.horizontal)
                if map.loading { ProgressView().padding(4) }
                if projection.unlocatedItemCount>0 { Button("위치 미확인 \(projection.unlocatedItemCount)곳 · 다시 조회") {Task {await map.resolveReferences(references)}}.font(.caption) }
                if let error=map.error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal) }
                if let outcome=map.locationOutcome,case .granted = outcome {} else if map.locationOutcome != nil {
                    Text("현재 위치를 확인하지 못했어요. 위치 권한·연결을 확인해주세요. 검색과 직접 등록은 계속 사용할 수 있어요.").font(.caption).padding(.horizontal)
                }
            }.navigationTitle("지도").navigationBarTitleDisplayMode(.inline)
                .onChange(of:query) { map.search($0) }
                .task(id:references) {await map.resolveReferences(references)}
                .onDisappear { query=""; map.deactivate() }
                .onChange(of:phase) { if $0 == .background { query=""; map.deactivate() } else if $0 == .active {Task {await map.resolveReferences(references)}} }
                .sheet(isPresented:Binding(get:{detailID != nil},set:{if !$0 {detailID=nil}})) {
                    if let id=detailID {
                        NavigationStack {
                            ScrollView {
                                VStack(spacing:20) {
                                    if let place=map.resolved[id] { GooglePlaceReferenceView(place:place); Button("지도에서 보기") { map.focus(place.coordinate); detailID=nil } }
                                    else { Text("위치 참고 정보가 만료되었습니다."); Button("다시 조회") { Task { await map.select(placeID:id) } } }
                                    Button("내 장소로 저장") {toItinerary=false; saving=true}.buttonStyle(.borderedProminent)
                                    Button("일정에 추가") {toItinerary=true; saving=true}.buttonStyle(.bordered)
                                }.padding()
                            }.navigationTitle("검색 장소")
                                .toolbar { Button("닫기") { detailID=nil } }
                                .sheet(isPresented:$saving) { SavedPlaceEditorView(googlePlaceID:id,toItinerary:toItinerary) }
                        }
                    }
                }
                .sheet(isPresented:Binding(get:{savedID != nil},set:{if !$0 {savedID=nil}})) {
                    if let id=savedID { NavigationStack { PlaceDetailView(savedID:id).toolbar { Button("닫기") { savedID=nil } } } }
                }
                .sheet(item:$tripMarker) { marker in TripPlaceCard(marker:marker,onShowMap:{map.focus(marker.coordinate);tripMarker=nil}) }
        }
    }
}
