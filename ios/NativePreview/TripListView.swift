import SwiftUI
import UIKit
import NativeCore

struct TripListView: View {
    @EnvironmentObject private var store: NativeTripStore
    @EnvironmentObject private var authStore: NativeAuthStore
    @Binding var activeTrip: String
    @Binding var createTripAfterWelcome: Bool
    private let isActive: Bool
    private let onOpenAccount: () -> Void
    @State private var presentedSheet: TripListSheet?
    @State private var actionNotice: TripListActionNotice?
    @State private var quickAddTarget: QuickAddTarget?
    @State private var path: [String]
    @StateObject private var map = MapConfiguration.makeState()
    @State private var topSafeAreaInset: CGFloat = 0

    init(
        activeTrip: Binding<String>,
        createTripAfterWelcome: Binding<Bool> = .constant(false),
        isActive: Bool = true,
        onOpenAccount: @escaping () -> Void = {}
    ) {
        _activeTrip = activeTrip
        _createTripAfterWelcome = createTripAfterWelcome
        self.isActive = isActive
        self.onOpenAccount = onOpenAccount
        _path = State(initialValue: activeTrip.wrappedValue.isEmpty ? [] : [activeTrip.wrappedValue])
    }

    var body: some View {
        NavigationStack(path: $path) {
            GeometryReader { geometry in
                let previewHeight = min(max(geometry.size.height * 0.64, 240), 440)
                VStack(spacing: 0) {
                    mapPreview(height: previewHeight, topInset: max(geometry.safeAreaInsets.top, topSafeAreaInset))
                    ScrollView { tripListContent }
                        .background(NativePreviewTheme.background)
                        .accessibilityIdentifier("tripsListScrollView")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(NativePreviewTheme.background)
            }
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                TripWorkspaceView(
                    tripID: id,
                    quickAddDay: quickAddTarget?.tripID == id ? quickAddTarget?.day : nil,
                    onConsumeQuickAdd: { quickAddTarget = nil },
                    onSelectTrip: { selectedID in
                    activeTrip = selectedID
                    path = [selectedID]
                }, onBack: { path = [] })
                    .id(id)
            }
            .sheet(item: $presentedSheet, onDismiss: continueQuickAdd) { sheet in
                switch sheet {
                case .newTrip:
                    TripEditorView(original: nil) { id in
                        activeTrip = id
                        path = [id]
                        presentedSheet = nil
                    }
                case .aiImport:
                    NavigationStack {
                        AIItineraryImportView { id in
                            activeTrip = id
                            path = [id]
                            presentedSheet = nil
                        }
                    }
                case .mapSearch:
                    PlaceSearchView(activeTrip: $activeTrip, onClose: { presentedSheet = nil })
                case .savedPlace(let id):
                    NavigationStack { PlaceDetailView(savedID: id) }
                case .itineraryPlace(let marker):
                    TripPlaceCard(marker: marker, onShowMap: {
                        map.focus(marker.coordinate)
                        presentedSheet = nil
                    })
                case .quickAdd(let tripID):
                    if let trip = store.trips.first(where: { $0.id == tripID }) {
                        QuickAddDateSheet(trip: trip, onSelect: { day in
                            quickAddTarget = QuickAddTarget(tripID: tripID, day: day)
                            presentedSheet = nil
                        }, onCancel: { presentedSheet = nil })
                    }
                }
            }
            .presentationDragIndicator(.visible)
        }
        .alert(item: $actionNotice) { notice in
            Alert(
                title: Text(notice.title),
                message: Text(notice.message),
                dismissButton: .default(Text("확인"))
            )
        }
        .onChange(of: path) { ids in
            // The map/saved tabs use activeTrip as a selection. Keep that
            // selection independent from the Trips navigation stack so
            // changing the map's displayed trip cannot unexpectedly push a
            // detail screen here. Only an explicit Trips navigation change
            // updates the shared active-trip choice.
            if let id = ids.last { activeTrip = id }
        }
        .onChange(of: createTripAfterWelcome) { requested in
            guard requested else { return }
            presentedSheet = .newTrip
            createTripAfterWelcome = false
        }
        .onChange(of: store.trips.map(\.id)) { ids in
            if let id = path.last, !ids.contains(id) { path = [] }
            if !activeTrip.isEmpty && !ids.contains(activeTrip) { activeTrip = "" }
        }
        .onAppear {
            topSafeAreaInset = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)?
                .safeAreaInsets.top ?? 0
            if let id = path.last, !store.trips.contains(where: { $0.id == id }), store.loadError == nil {
                path = []
                activeTrip = ""
            }
        }
        .task(id: "\(isActive)-\(mapReferences)") {
            guard isActive else { return }
            await map.resolveReferences(mapReferences)
        }
        .onDisappear { map.deactivate() }
    }

    private var tripListContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("TripPlot")
                        .font(.system(size: 21, weight: .black, design: .rounded))
                        .tracking(-1.1)
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                    Text("여행 일정 플래너")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.1)
                        .foregroundStyle(NativePreviewTheme.mapAccent)
                }
                .frame(width: 82, alignment: .leading)

                HStack(spacing: 4) {
                    homeAction("새 여행", id: "newTripButton", foreground: .white, fill: NativePreviewTheme.primary, outline: NativePreviewTheme.primary) {
                        presentedSheet = .newTrip
                    }
                    homeAction("AI 일정", id: "aiItineraryButton", foreground: NativePreviewTheme.primary, fill: NativePreviewTheme.primaryContainer, outline: NativePreviewTheme.outline) {
                        presentedSheet = .aiImport
                    }
                    homeAction("참여", id: "joinTripButton", foreground: NativePreviewTheme.budgetAccent, fill: NativePreviewTheme.budgetContainer, outline: NativePreviewTheme.budgetContainer) {
                        actionNotice = .join
                    }
                    homeAction(authStore.userID == nil ? "로그인" : "계정", id: "accountActionButton", foreground: NativePreviewTheme.textMuted, fill: NativePreviewTheme.surfaceLow, outline: NativePreviewTheme.outline) {
                        onOpenAccount()
                    }
                }
            }
            .padding(.bottom, 2)

            Text("내 여행")
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(NativePreviewTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let error = store.loadError {
                VStack(alignment: .leading, spacing: 12) {
                    Label("여행을 불러오지 못했어요", systemImage: "exclamationmark.triangle")
                    Text(error).font(.footnote)
                    Text("기존 데이터는 삭제하지 않았습니다.").font(.footnote)
                    Button("다시 불러오기", action: store.open).buttonStyle(.bordered)
                }
                .foregroundStyle(.red)
            } else {
                if store.trips.isEmpty {
                    VStack(spacing: 0) {
                        Image(systemName: "airplane")
                            .font(.system(size: 48, weight: .regular))
                            .foregroundStyle(NativePreviewTheme.emptyStateIcon)
                            .padding(.bottom, 16)
                        Text("아직 계획된 여행이 없습니다")
                            .font(.system(size: 12, weight: .bold))
                            .tracking(1.2)
                            .foregroundStyle(NativePreviewTheme.emptyStateTitle)
                        Text("새 여행을 만들고 장소를 검색해 일정에 추가해 보세요.")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(NativePreviewTheme.emptyStateDescription)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 32)
                    .padding(.bottom, 60)
                    .frame(maxWidth: .infinity)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24)
                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                            .foregroundStyle(NativePreviewTheme.emptyStateOutline)
                    }
                }
                if let featuredTrip {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(featuredTrip.phase == .inProgress ? "지금 여행 중" : "가장 가까운 여행")
                            .font(.headline)
                        NavigationLink(value: featuredTrip.trip.id) {
                            FeaturedTripCard(entry: featuredTrip)
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue("대표 여행")
                        .accessibilityIdentifier("trip-\(featuredTrip.trip.id)")
                        quickAddButton(for: featuredTrip.trip)
                    }
                }
                if !otherTrips.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("다른 여행").font(.headline)
                        ForEach(otherTrips) { entry in
                            NavigationLink(value: entry.trip.id) {
                                CompactTripCard(entry: entry)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("trip-\(entry.trip.id)")
                            quickAddButton(for: entry.trip)
                        }
                    }
                }
                if !pastTrips.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("지난 여행").font(.headline)
                        ForEach(pastTrips) { entry in
                            NavigationLink(value: entry.trip.id) {
                                CompactTripCard(entry: entry)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("trip-\(entry.trip.id)")
                            quickAddButton(for: entry.trip)
                        }
                    }
                }
                Label(authStore.userID == nil ? "이 기기에 저장 · 계정 동기화 미연결" : "계정 연결됨 · 동기화 상태는 더보기에서 확인", systemImage: "iphone")
                    .font(.caption)
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func homeAction(
        _ title: String,
        id: String,
        foreground: Color,
        fill: Color,
        outline: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(foreground)
                .background(fill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(outline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    private func mapPreview(height: CGFloat, topInset: CGFloat) -> some View {
        ZStack(alignment: .top) {
            NativeMapPane(
                projection: mapProjection,
                command: map.cameraCommand,
                active: isActive,
                onSelect: { marker in
                    if let id = marker.favoriteID { presentedSheet = .savedPlace(id) }
                    else { presentedSheet = .itineraryPlace(marker) }
                }
            )

            VStack(spacing: 0) {
                Button { presentedSheet = .mapSearch } label: {
                    HStack(spacing: 12) {
                        Text("어디로 떠나시나요?")
                            .font(.headline)
                            .foregroundStyle(NativePreviewTheme.textMuted)
                        Spacer(minLength: 8)
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 48, height: 48)
                            .background(NativePreviewTheme.mapAccent, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .padding(8)
                    .background(NativePreviewTheme.card, in: Capsule())
                    .overlay(Capsule().stroke(NativePreviewTheme.outline, lineWidth: 1))
                    .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("지도 검색")
                .accessibilityIdentifier("mapSearchButton")

                Spacer(minLength: 12)

                HStack {
                    Spacer()
                    Button { Task { await map.locate() } } label: {
                        Image(systemName: "location.north.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(NativePreviewTheme.mapAccent)
                            .frame(width: 48, height: 48)
                            .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: 16))
                            .shadow(color: .black.opacity(0.10), radius: 10, y: 4)
                    }
                    .accessibilityLabel("현재 위치")
                    .accessibilityIdentifier("mapPreviewLocateButton")
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, max(16, topInset + 16))
            .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tripsMapPreview")
    }

    private var mapTrip: TripDocument? {
        store.trips.first(where: { $0.id == activeTrip }) ?? store.trips.first
    }

    private var mapProjection: MapProjection {
        TripMapProjection.make(trip: mapTrip, saved: store.savedPlaces, resolved: map.resolved)
    }

    private var mapReferences: [String] {
        TripMapProjection.googlePlaceIDs(trip: mapTrip, saved: store.savedPlaces)
    }

    private var groupedTrips: (featured: TripListEntry?, other: [TripListEntry], past: [TripListEntry]) {
        let today = TripListEntry.today()
        let entries = store.trips.map { TripListEntry(trip: $0, today: today) }
        let inProgress = entries.filter { $0.phase == .inProgress }.sorted { $0.trip.endDate < $1.trip.endDate }
        let upcoming = entries.filter { $0.phase == .upcoming }.sorted { $0.trip.startDate < $1.trip.startDate }
        let past = entries.filter { $0.phase == .past }.sorted { $0.trip.endDate > $1.trip.endDate }
        let featured = (inProgress + upcoming).first
        let other = (inProgress + upcoming).filter { $0.id != featured?.id }
        return (featured, other, past)
    }

    private var featuredTrip: TripListEntry? { groupedTrips.featured }
    private var otherTrips: [TripListEntry] { groupedTrips.other }
    private var pastTrips: [TripListEntry] { groupedTrips.past }

    private func quickAddButton(for trip: TripDocument) -> some View {
        HStack {
            Spacer()
            Button { presentedSheet = .quickAdd(trip.id) } label: {
                Label("일정 추가", systemImage: "calendar.badge.plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NativePreviewTheme.primary)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 40)
                    .background(NativePreviewTheme.primaryContainer, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("quickAdd-\(trip.id)")
        }
    }

    private func continueQuickAdd() {
        guard let target = quickAddTarget else { return }
        activeTrip = target.tripID
        path = [target.tripID]
    }
}

private enum TripListSheet: Identifiable {
    case newTrip
    case aiImport
    case mapSearch
    case savedPlace(String)
    case itineraryPlace(MapMarker)
    case quickAdd(String)

    var id: String {
        switch self {
        case .newTrip: "new-trip"
        case .aiImport: "ai-import"
        case .mapSearch: "map-search"
        case .savedPlace(let id): "saved-\(id)"
        case .itineraryPlace(let marker): "itinerary-\(marker.key)"
        case .quickAdd(let tripID): "quick-add-\(tripID)"
        }
    }
}

private struct QuickAddTarget {
    let tripID: String
    let day: Int
}

private struct QuickAddDateSheet: View {
    let trip: TripDocument
    let onSelect: (Int) -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section(trip.name) {
                    ForEach(1...max(1, trip.dayCount), id: \.self) { day in
                        Button { onSelect(day) } label: {
                            HStack {
                                Text(dateLabel(for: day))
                                    .foregroundStyle(NativePreviewTheme.textPrimary)
                                Spacer()
                                Text("\(day)일차")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(NativePreviewTheme.primary)
                            }
                            .frame(minHeight: 36)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("quickAddDay-\(day)")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(NativePreviewTheme.background)
            .navigationTitle("일정을 추가할 날짜")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("취소", action: onCancel)
                        .accessibilityIdentifier("cancelQuickAddDate")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func dateLabel(for day: Int) -> String {
        guard let start = TripDate.date(trip.startDate),
              let date = TripDate.calendar.date(byAdding: .day, value: day - 1, to: start) else {
            return "\(day)일차 날짜"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일 (E)"
        return formatter.string(from: date)
    }
}

private enum TripListActionNotice: String, Identifiable {
    case join

    var id: String { rawValue }

    var title: String {
        switch self {
        case .join: "여행 참여 기능 준비 중"
        }
    }

    var message: String {
        switch self {
        case .join: "웹의 공유 여행 참여는 네이티브 동기화 연결 후 제공할 예정입니다."
        }
    }
}

private enum TripListPhase {
    case inProgress, upcoming, past
}

private struct TripListEntry: Identifiable {
    let trip: TripDocument
    let phase: TripListPhase
    var id: String { trip.id }

    init(trip: TripDocument, today: String) {
        self.trip = trip
        phase = trip.startDate > today ? .upcoming : (trip.endDate < today ? .past : .inProgress)
    }

    static func today() -> String {
        let date = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", date.year ?? 0, date.month ?? 0, date.day ?? 0)
    }

    var status: String {
        switch phase {
        case .inProgress: "여행 중"
        case .upcoming: "예정"
        case .past: "완료"
        }
    }

    var dateRange: String {
        "\(trip.startDate.replacingOccurrences(of: "-", with: ".")) – \(trip.endDate.replacingOccurrences(of: "-", with: "."))"
    }
}

private struct FeaturedTripCard: View {
    let entry: TripListEntry

    var body: some View {
        ZStack(alignment: .topTrailing) {
            LinearGradient(
                colors: [NativePreviewTheme.featuredGradientStart, NativePreviewTheme.featuredGradientEnd],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Circle().fill(.white.opacity(0.10))
                .frame(width: 170, height: 170).offset(x: 40, y: -52)
            Image(systemName: "airplane.departure")
                .font(.system(size: 56, weight: .ultraLight))
                .foregroundStyle(.white.opacity(0.23))
                .padding(.top, 70).padding(.trailing, 25)

            VStack(alignment: .leading, spacing: 15) {
                HStack(spacing: 8) {
                    Text(entry.trip.country.isEmpty ? "여행지 미정" : entry.trip.country)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text(entry.status)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.bottom, 16)

                Text(entry.trip.name)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(entry.dateRange)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.88))

                HStack {
                    Label("\(entry.trip.dayCount)일", systemImage: "calendar")
                    Spacer()
                    Text("여행 열기")
                    Image(systemName: "arrow.up.right")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.top, 8)
            }
            .padding(22)
        }
        .frame(maxWidth: .infinity, minHeight: 216)
        .clipShape(RoundedRectangle(cornerRadius: NativePreviewTheme.featuredCardRadius))
        .accessibilityElement(children: .combine)
    }
}

private struct CompactTripCard: View {
    let entry: TripListEntry

    var body: some View {
        HStack(spacing: 14) {
            VStack(spacing: 2) {
                Text(String(entry.trip.startDate.dropFirst(5).prefix(2)))
                    .font(.caption.weight(.semibold))
                Text(String(entry.trip.startDate.suffix(2)))
                    .font(.title3.bold())
            }
            .foregroundStyle(NativePreviewTheme.primary)
            .frame(width: 58, height: 60)
            .background(NativePreviewTheme.primaryContainer.opacity(entry.phase == .past ? 0.45 : 1), in: RoundedRectangle(cornerRadius: 16))

            VStack(alignment: .leading, spacing: 5) {
                Text(entry.trip.name).font(.headline).foregroundStyle(NativePreviewTheme.textPrimary).lineLimit(2)
                Text("\(entry.trip.country.isEmpty ? "여행지 미정" : entry.trip.country) · \(entry.trip.dayCount)일 · \(entry.status)")
                    .font(.caption).foregroundStyle(NativePreviewTheme.textMuted).lineLimit(1)
                Text(entry.dateRange).font(.caption).foregroundStyle(NativePreviewTheme.textMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: NativePreviewTheme.cardRadius))
        .accessibilityElement(children: .combine)
    }
}

struct TripDetailView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    @Binding var activeTrip: String
    let onSelectTrip: (String) -> Void
    @State private var editing = false
    @State private var deleting = false
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }

    var body: some View {
        Group {
            if let trip {
                ScrollView {
                    VStack(alignment: .leading, spacing: NativePreviewTheme.sectionSpacing) {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Image(systemName: "airplane.departure")
                                    .font(.system(size: 34))
                                    .frame(width: 72, height: 72)
                                    .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 22))
                                Spacer()
                                Text("\(trip.dayCount)일")
                                    .font(.caption.bold())
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(NativePreviewTheme.primaryContainer, in: Capsule())
                            }
                            .foregroundStyle(NativePreviewTheme.primary)
                            Text(trip.country.isEmpty ? "여행지 미정" : trip.country)
                                .font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                            Text(trip.name).font(.title.bold()).foregroundStyle(NativePreviewTheme.textPrimary)
                            Label("\(trip.startDate) – \(trip.endDate)", systemImage: "calendar")
                                .font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                        }
                        .nativeCard(padding: 22)
                        .accessibilityIdentifier("trip-detail-card")

                        Button { editing = true } label: { Label("여행 정보 수정", systemImage: "pencil") }
                            .nativePrimaryButton()
                        NavigationLink { ItineraryView(tripID: trip.id) } label: {
                            Label("일정·예비 목록 편집", systemImage: "list.bullet.rectangle")
                                .font(.headline).foregroundStyle(NativePreviewTheme.primary)
                                .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
                                .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 18))
                        }
                        .accessibilityIdentifier("openItinerary")
                        NavigationLink { TripBackupView(tripID: trip.id) } label: {
                            Label("여행 JSON 백업", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .foregroundStyle(NativePreviewTheme.textPrimary)
                                .overlay(RoundedRectangle(cornerRadius: 18).stroke(NativePreviewTheme.outline))
                        }
                        VStack(alignment: .leading, spacing: 14) {
                            Text("여행 일정").font(.headline)
                            ForEach(0..<trip.dayCount, id: \.self) { index in
                                HStack {
                                    Label("\(index + 1)일차", systemImage: "calendar")
                                    Spacer()
                                    Text("\((trip.days[index]["items"] as? [[String: Any]] ?? []).count)개 장소")
                                        .foregroundStyle(NativePreviewTheme.textMuted)
                                }
                                .font(.subheadline)
                            }
                        }
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                        .nativeCard()
                        Label("이 기기에 저장 · 로그인 없이 사용할 수 있어요", systemImage: "internaldrive")
                            .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                        Button("여행 삭제", role: .destructive) { deleting = true }
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .padding(.horizontal, NativePreviewTheme.screenPadding)
                    .padding(.vertical, NativePreviewTheme.sectionSpacing)
                }
                .background(NativePreviewTheme.background)
                .navigationTitle(trip.name).navigationBarTitleDisplayMode(.inline)
                .toolbar(.visible, for: .navigationBar)
                .navigationBarBackButtonHidden(true)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { dismiss() } label: { Image(systemName: "chevron.left") }
                            .accessibilityLabel("내 여행 목록")
                            .accessibilityIdentifier("tripListBack")
                    }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Menu {
                            ForEach(store.trips) { option in
                                Button {
                                    activeTrip = option.id
                                    onSelectTrip(option.id)
                                } label: {
                                    if option.id == trip.id {
                                        Label(option.name, systemImage: "checkmark")
                                    } else {
                                        Text(option.name)
                                    }
                                }
                            }
                        } label: {
                            Label("여행 선택", systemImage: "arrow.left.arrow.right")
                        }
                        .accessibilityLabel("여행 선택")
                        .accessibilityIdentifier("tripSelectorButton")

                        Button("편집") { editing = true }
                            .accessibilityIdentifier("editTripButton")
                    }
                }
                .sheet(isPresented: $editing) { TripEditorView(original: trip) { _ in } }
                .confirmationDialog("이 여행을 삭제할까요?", isPresented: $deleting, titleVisibility: .visible) {
                    Button("여행 삭제", role: .destructive) {
                        do { try store.delete(trip); activeTrip = "" } catch { self.error = error.localizedDescription }
                    }
                } message: { Text("이 미리보기 앱에 저장된 여행이 삭제됩니다.") }
            } else {
                VStack(spacing: 16) {
                    Text("여행을 찾을 수 없어요")
                    Button("여행 목록으로") { activeTrip = "" }
                }
            }
        }
        .alert("저장 오류", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("확인") { error = nil }
        } message: { Text(error ?? "") }
    }
}
