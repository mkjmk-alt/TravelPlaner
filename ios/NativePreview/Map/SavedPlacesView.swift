import SwiftUI
import NativeCore

struct SavedPlacesView:View {
    @EnvironmentObject private var store:NativeTripStore
    @State private var adding=false
    @State private var query=""
    var body:some View {
        NavigationStack {
            List {
                Button { adding=true } label: { Label("장소 직접 등록",systemImage:"plus.circle") }.accessibilityIdentifier("savedPlaceAddManual")
                if let error=store.savedLoadError {
                    Text(error).foregroundStyle(.red)
                    Button("다시 불러오기",action:store.reloadSavedPlaces)
                } else {
                    let filtered=store.savedPlaces.filter { query.isEmpty || $0.draft.name.localizedCaseInsensitiveContains(query) || $0.draft.memo.localizedCaseInsensitiveContains(query) }
                    if store.savedPlaces.isEmpty { Text("마음에 드는 장소를 모아두세요. 여행 없이도 저장할 수 있어요.").foregroundStyle(.secondary) }
                    else if filtered.isEmpty { Text("검색 결과가 없습니다.") }
                    ForEach(filtered) { row in
                        NavigationLink { PlaceDetailView(savedID:row.id) } label: {
                            VStack(alignment:.leading,spacing:6) {
                                HStack { Text(row.draft.emoji); Text(row.draft.name).font(.headline) }
                                if !row.draft.memo.isEmpty { Text(row.draft.memo).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
                            }.padding(.vertical,6)
                        }.accessibilityIdentifier("saved-row-"+row.id)
                    }
                }
            }.navigationTitle("저장 장소").searchable(text:$query,prompt:"내 이름·메모 검색")
                .onAppear(perform:store.reloadSavedPlaces)
                .sheet(isPresented:$adding) { SavedPlaceEditorView() }
        }
    }
}
struct SavedPlaceEditorView:View {
    @EnvironmentObject private var store:NativeTripStore
    @Environment(\.dismiss) private var dismiss
    var googlePlaceID:String?=nil
    var toItinerary=false
    @State private var draft=PlaceDraft()
    @State private var latitude=""
    @State private var longitude=""
    @State private var operationID=UUID().uuidString
    @State private var error:String?
    @State private var saving=false
    @State private var destination=false
    @State private var chosen:PlaceSelection?
    var body:some View {
        NavigationStack {
            Form {
                Section("내가 붙일 이름") {
                    TextField("장소 이름",text:$draft.name).accessibilityIdentifier("savedPlaceName")
                    if googlePlaceID != nil { Text("검색 결과를 참고해 직접 이름을 입력해주세요. Google 이름·주소·좌표는 백업에 저장하지 않습니다.").font(.caption) }
                }
                Section("내 기록") {
                    TextField("메모",text:$draft.memo,axis:.vertical)
                    TextField("아이콘",text:$draft.emoji)
                    if googlePlaceID == nil { TextField("주소 (선택)",text:$draft.loc,axis:.vertical) }
                }
                if googlePlaceID == nil {
                    Section("직접 입력한 좌표 (선택)") {
                        TextField("위도",text:$latitude).keyboardType(.numbersAndPunctuation)
                        TextField("경도",text:$longitude).keyboardType(.numbersAndPunctuation)
                        Text("두 값 모두 입력하거나 모두 비워주세요.").font(.caption)
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }.navigationTitle(toItinerary ? "일정에 추가할 장소":"장소 저장")
                .toolbar {
                    ToolbarItem(placement:.cancellationAction) { Button("취소") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement:.confirmationAction) { Button("저장",action:save).disabled(saving).accessibilityIdentifier("savedPlaceSave") }
                }
                .sheet(isPresented:$destination) { if let chosen { PlaceDestinationView(selection:chosen,draft:draft,onAdded:{dismiss()}) } }
        }
    }
    private func save() {
        guard !saving else { return }; saving=true
        defer { saving=false }
        do {
            let selection:PlaceSelection
            if let googlePlaceID { selection = .init(reference:.google(placeID:googlePlaceID)) }
            else if latitude.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && longitude.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty { selection = .init(reference:.unlocated) }
            else {
                guard let lat=Double(latitude.trimmingCharacters(in:.whitespacesAndNewlines)),let lng=Double(longitude.trimmingCharacters(in:.whitespacesAndNewlines)) else { throw PlaceError.invalidCoordinate }
                selection = .init(reference:.manual(try Coordinate(latitude:lat,longitude:lng)))
            }
            if toItinerary { try draft.validate(original:[:]); chosen=selection; destination=true }
            else { _ = try store.saveFavorite(selection:selection,draft:draft,id:operationID); dismiss() }
        } catch { self.error=error.localizedDescription }
    }
}
