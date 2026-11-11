import SwiftUI
import NativeCore

struct SavedPlacesView:View {
    @EnvironmentObject private var store:NativeTripStore
    @State private var adding=false
    @State private var query=""
    @State private var isSearching=false
    @FocusState private var searchFocused: Bool
    var body:some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 10) {
                        Text("저장 장소")
                            .font(.title.bold())
                            .foregroundStyle(NativePreviewTheme.textPrimary)
                        Spacer(minLength: 8)
                        Button { adding=true } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(NativePreviewTheme.favoritesAccent, in: Circle())
                                .contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("장소 직접 등록")
                        .accessibilityIdentifier("savedPlaceAddManual")

                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                isSearching.toggle()
                                searchFocused = isSearching
                                if !isSearching { query = "" }
                            }
                        } label: {
                            Image(systemName: isSearching ? "xmark" : "magnifyingglass")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(NativePreviewTheme.favoritesAccent)
                                .frame(width: 44, height: 44)
                                .background(NativePreviewTheme.favoritesContainer, in: Circle())
                                .contentShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(isSearching ? "검색 닫기" : "장소 검색")
                        .accessibilityIdentifier("savedPlaceToggleSearch")
                    }
                    if isSearching {
                        TextField("내 이름·메모 검색", text: $query)
                            .textFieldStyle(.roundedBorder)
                            .focused($searchFocused)
                            .accessibilityIdentifier("savedPlaceSearch")
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                if let error=store.savedLoadError {
                    Text(error).foregroundStyle(.red)
                    Button("다시 불러오기",action:store.reloadSavedPlaces)
                } else {
                    let filtered=store.savedPlaces.filter { query.isEmpty || $0.draft.name.localizedCaseInsensitiveContains(query) || $0.draft.memo.localizedCaseInsensitiveContains(query) }
                    if store.savedPlaces.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "heart")
                                .font(.system(size: 34, weight: .regular))
                                .foregroundStyle(NativePreviewTheme.favoritesAccent.opacity(0.48))
                                .accessibilityIdentifier("savedPlaceEmptyHeart")
                            Text("저장한 장소가 없습니다")
                                .font(.headline)
                                .foregroundStyle(NativePreviewTheme.textMuted)
                                .accessibilityIdentifier("savedPlaceEmptyMessage")
                        }
                        .frame(maxWidth: .infinity, minHeight: 116)
                        .nativeCard(padding: 16)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("savedPlaceEmptyCard")
                        .overlay {
                            RoundedRectangle(cornerRadius: NativePreviewTheme.cardRadius)
                                .stroke(NativePreviewTheme.favoritesAccent.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                        }
                    } else if filtered.isEmpty { Text("검색 결과가 없습니다.").nativeCard() }
                    ForEach(filtered) { row in
                        NavigationLink { PlaceDetailView(savedID:row.id) } label: {
                            HStack(spacing: 14) {
                                Text(row.draft.emoji).font(.title2)
                                    .frame(width: 48, height: 48)
                                    .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 15))
                                VStack(alignment:.leading,spacing:6) {
                                    Text(row.draft.name).font(.headline).accessibilityIdentifier("saved-row-"+row.id)
                                    if !row.draft.memo.isEmpty { Text(row.draft.memo).font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted).lineLimit(2) }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(NativePreviewTheme.textMuted)
                            }
                            .foregroundStyle(NativePreviewTheme.textPrimary)
                            .nativeCard()
                        }.buttonStyle(.plain).accessibilityIdentifier("saved-place-card-"+row.id)
                    }
                }
                }
                .padding(.horizontal, NativePreviewTheme.screenPadding)
                .padding(.vertical, NativePreviewTheme.sectionSpacing)
            }
            .background(NativePreviewTheme.background)
            .navigationTitle("저장 장소").navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
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
            }
            .scrollContentBackground(.hidden)
            .background(NativePreviewTheme.background)
            .navigationTitle(toItinerary ? "일정에 추가할 장소":"장소 저장")
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
