import SwiftUI
import NativeCore

struct PlaceDetailView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    let savedID:String
    @StateObject private var map=MapConfiguration.makeState()
    @State private var destination=false
    @State private var deleting=false
    @State private var showMap=false
    @State private var error:String?
    private var row:SavedPlaceDocument? { store.savedPlaces.first { $0.id==savedID } }
    var body:some View {
        ScrollView {
            if let row {
                VStack(alignment:.leading,spacing:18) {
                    Text(row.draft.emoji+" "+row.draft.name).font(.title2.bold())
                    if !row.draft.loc.isEmpty { Text(row.draft.loc) }
                    if !row.draft.memo.isEmpty { Text(row.draft.memo) }
                    if let id=row.payload["placeId"] as? String,row.payload["nativePlaceSource"] as? String=="google" {
                        if let reference=map.resolved[id] { GooglePlaceReferenceView(place:reference) }
                        else { Text("위치는 연결 후 확인할 수 있어요.").font(.subheadline) }
                        Button("위치 다시 조회") { Task { await map.select(placeID:id) } }
                    }
                    Button("지도에서 보기") {
                        showMap=true
                        if let coordinate=TripMapProjection.make(trip:nil,saved:[row],resolved:map.resolved).markers.first?.coordinate { map.focus(coordinate) }
                    }.buttonStyle(.bordered)
                    if showMap {
                        NativeMapPane(projection:TripMapProjection.make(trip:nil,saved:[row],resolved:map.resolved),command:map.cameraCommand).frame(height:260)
                    }
                    Button("일정에 추가") { destination=true }.buttonStyle(.borderedProminent)
                    Button("저장 장소 삭제",role:.destructive) { deleting=true }
                    if let error=error ?? map.error { Text(error).foregroundStyle(.red) }
                }.padding().frame(maxWidth:.infinity,alignment:.leading)
            } else { Text("저장 장소가 삭제되었거나 변경되었습니다.").padding() }
        }.navigationTitle("장소 상세").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented:$destination) { if let row { PlaceDestinationView(selection:row.selection,draft:row.draft) } }
            .alert("저장 장소를 삭제할까요?",isPresented:$deleting) {
                Button("삭제",role:.destructive) { do { try store.deleteFavorite(id:savedID); dismiss() } catch { self.error=error.localizedDescription } }
                Button("취소",role:.cancel) {}
            } message: { Text("이미 복사한 여행 일정은 그대로 남습니다.") }
            .onDisappear { map.deactivate() }
            .onChange(of:phase) {if $0 == .background {map.deactivate()}}
    }
}
struct GooglePlaceReferenceView:View {
    let place:ResolvedPlace
    var body:some View {
        VStack(alignment:.leading,spacing:8) {
            Text(place.displayName).font(.headline)
            Text(place.address).font(.subheadline)
            ForEach(place.attribution,id:\.self) { Text($0).font(.caption) }
            GooglePlacesAttribution()
        }
    }
}
struct GooglePlacesAttribution:View {
    @Environment(\.colorScheme) private var scheme
    private var logo:UIImage? {
        let name=scheme == .dark ? "build-with-google-white" : "build-with-google-black"
        let paths=Bundle.main.urls(forResourcesWithExtension:"bundle",subdirectory:nil) ?? []
        for path in paths {
            if let bundle=Bundle(url:path),let nested=bundle.url(forResource:"GooglePlaces",withExtension:"bundle"),let resources=Bundle(url:nested),
               let image=UIImage(named:name,in:resources,compatibleWith:nil) { return image }
            if let bundle=Bundle(url:path),let image=UIImage(named:name,in:bundle,compatibleWith:nil) { return image }
        }
        return nil
    }
    var body:some View {
        if let logo { Image(uiImage:logo).resizable().scaledToFit().frame(height:18).accessibilityLabel("Google Maps") }
        else { Text("Google Maps").font(.caption) }
    }
}
