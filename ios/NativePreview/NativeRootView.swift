import SwiftUI

struct NativeRootView: View {
    @EnvironmentObject private var store: NativeTripStore
    @AppStorage("native.selectedTab") private var selectedTab = "trips"
    @AppStorage("native.activeTrip") private var activeTrip = ""

    var body: some View {
        TabView(selection: $selectedTab) {
            TripListView(activeTrip: $activeTrip)
                .tabItem { Label("내 여행", systemImage: "suitcase.rolling") }.tag("trips")
            PlaceSearchView(activeTrip: $activeTrip)
                .tabItem { Label("지도", systemImage: "map") }.tag("map")
            SavedPlacesView()
                .tabItem { Label("저장", systemImage: "heart") }.tag("favorites")
            ExpenseView(activeTrip: $activeTrip)
                .tabItem { Label("지출", systemImage: "creditcard") }.tag("expenses")
            NavigationStack {
                List {
                    Section("데이터") {
                        NavigationLink { TripBackupView() } label: { Label("여행 백업 가져오기·내보내기", systemImage: "doc") }
                            .accessibilityIdentifier("backupImport")
                        if let tripID = activeTrip.isEmpty ? store.trips.first?.id : activeTrip {
                            NavigationLink { TravelMemoryView(tripID: tripID) } label: { Label("여행 기록·사진", systemImage: "book.closed") }
                            NavigationLink { TravelPrepView(tripID: tripID) } label: { Label("여행 준비 체크리스트", systemImage: "checklist") }
                            NavigationLink { TravelDetailsView(tripID: tripID) } label: { Label("항공·숙소 정보", systemImage: "airplane") }
                        }
                    }
                    Section("이 기기의 여행") {
                        Label("여행 \(store.trips.count)개", systemImage: "suitcase.rolling")
                        Label("로그인 없이 기기에 저장", systemImage: "internaldrive")
                        Text("인터넷 연결 없이도 여행을 만들고 확인할 수 있어요.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Section("네이티브 미리보기") {
                        Text("여행·일정 편집과 JSON 백업 가져오기·내보내기를 사용할 수 있어요.")
                        Text("저장 장소·지도·일정 분할·지출·함께 정산을 사용할 수 있어요. 실제 지도·검색에는 별도 네이티브 지도 키가 필요합니다.")
                            .foregroundStyle(.secondary)
                    }
                    Section("안내") {
                        Link("개인정보처리방침",destination:URL(string:"https://travelplaner-545.pages.dev/privacy.html")!)
                        Link("이용약관",destination:URL(string:"https://travelplaner-545.pages.dev/terms.html")!)
                        Text("여행 JSON 백업에는 전역 저장 장소가 포함되지 않습니다. 새 Google 검색 장소는 직접 입력한 이름과 장소 ID만 보관하며, 현재 웹에서는 해당 위치의 자동 복원을 지원하지 않습니다.").font(.footnote)
                    }
                }
                .navigationTitle("더보기")
            }
            .tabItem { Label("더보기", systemImage: "ellipsis.circle") }.tag("more")
        }
    }
}

struct PreviewFeatureView: View {
    let title: String
    let symbol: String
    let message: String
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    Image(systemName: symbol).font(.system(size: 48, weight: .light))
                        .foregroundStyle(.tint).padding(30)
                        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 32))
                    Text(message).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                    Text("다음 단계에서 연결될 기능입니다.").font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(32).frame(maxWidth: .infinity).padding(.top, 60)
            }
            .navigationTitle(title)
        }
    }
}
