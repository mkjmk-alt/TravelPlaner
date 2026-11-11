import SwiftUI
import NativeCore

struct NativeRootView: View {
    @EnvironmentObject private var store: NativeTripStore
    @EnvironmentObject private var authStore: NativeAuthStore
    @EnvironmentObject private var syncCoordinator: NativeSyncCoordinator
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("native.selectedTab") private var persistedSelectedTab = "trips"
    @State private var selectedTab = "trips"
    @State private var mountedTabs: Set<String> = ["trips"]
    @State private var didRestoreSelectedTab = false
    @State private var isAppOnlyFeaturesExpanded = false
    @State private var accountScrollRequest = 0
    @State private var showingLogin = false
    @AppStorage("native.activeTrip") private var activeTrip = ""
    @AppStorage("native.hasSeenWelcome") private var hasSeenWelcome = false
    @State private var showingWelcome = false
    @State private var createTripAfterWelcome = false

    private var showsBrandHeader: Bool {
        ["favorites", "budget", "memory", "more"].contains(selectedTab)
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsBrandHeader {
                NativeBrandHeader(isSignedIn: authStore.userID != nil) {
                    openAccount()
                }
            }
        ZStack {
            if mountedTabs.contains("trips") {
                TripListView(
                    activeTrip: $activeTrip,
                    createTripAfterWelcome: $createTripAfterWelcome,
                    isActive: selectedTab == "trips",
                    onOpenAccount: { openAccount() }
                )
                .nativeTabPage(isActive: selectedTab == "trips")
            }
            if mountedTabs.contains("favorites") {
                SavedPlacesView()
                    .nativeTabPage(isActive: selectedTab == "favorites")
            }
            if mountedTabs.contains("budget") {
                ExpenseView(activeTrip: $activeTrip, onGoToTrips: { selectedTab = "trips" })
                    .nativeTabPage(isActive: selectedTab == "budget")
            }
            if mountedTabs.contains("memory") {
                NativeMemoryTabView(activeTrip: $activeTrip, selectedTab: $selectedTab)
                    .nativeTabPage(isActive: selectedTab == "memory")
            }
            if mountedTabs.contains("more") {
            NavigationStack {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("더보기").font(.title.bold()).foregroundStyle(NativePreviewTheme.textPrimary)
                                Text("계정과 여행, 앱 설정을 관리하세요.")
                                    .font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                moreSectionTitle("계정", id: "moreAccountSection")
                                Button { openAccount() } label: {
                                    moreRow(symbol: authStore.userID == nil ? "person.crop.circle" : "checkmark.shield.fill",
                                            title: authStore.userID == nil ? "로그인 / 회원가입" : "계정 및 동기화",
                                            detail: authStore.email ?? "여러 기기에서 여행을 이어가세요.", accent: NativePreviewTheme.primary)
                                }
                                .buttonStyle(.plain).nativeCard(padding: 14)
                                .accessibilityIdentifier("moreAccountAction")
                            }

                            if let tripID = activeTrip.isEmpty ? store.trips.first?.id : activeTrip {
                                VStack(alignment: .leading, spacing: 8) {
                                    moreSectionTitle("여행 관리", id: "moreTravelSection")
                                    VStack(spacing: 0) {
                                        NavigationLink { TravelMemoryView(tripID: tripID) } label: {
                                            moreRow(symbol: "book.closed", title: "여행 기록·사진", detail: nil, accent: NativePreviewTheme.memoryAccent)
                                        }
                                        Divider().padding(.leading, 52)
                                        NavigationLink { TravelPrepView(tripID: tripID) } label: {
                                            moreRow(symbol: "checklist", title: "여행 준비 체크리스트", detail: nil, accent: NativePreviewTheme.budgetAccent)
                                        }
                                        Divider().padding(.leading, 52)
                                        NavigationLink { TravelDetailsView(tripID: tripID) } label: {
                                            moreRow(symbol: "airplane", title: "항공·숙소 정보", detail: nil, accent: NativePreviewTheme.mapAccent)
                                        }
                                    }.buttonStyle(.plain).nativeCard(padding: 14)
                                }
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                moreSectionTitle("앱 설정", id: "moreSettingsSection")
                                Button {
                                    isAppOnlyFeaturesExpanded.toggle()
                                } label: {
                                    moreRow(symbol: "slider.horizontal.3", title: "앱 전용 기능",
                                            detail: "계정 동기화 · 백업 · 지도 연결 안내",
                                            accent: NativePreviewTheme.moreAccent,
                                            indicator: isAppOnlyFeaturesExpanded ? "chevron.up" : "chevron.down")
                                }
                                .buttonStyle(.plain).nativeCard(padding: 14)
                                .accessibilityValue(isAppOnlyFeaturesExpanded ? "펼침" : "접힘")
                                .accessibilityHint("여행 백업, 계정 동기화, 네이티브 지도 안내를 표시합니다")
                                .accessibilityIdentifier("appOnlyFeaturesToggle")

                                if isAppOnlyFeaturesExpanded {
                                    VStack(alignment: .leading, spacing: 12) {
                                        NativeAuthSettingsSection().id("accountSyncPanel")
                                        NavigationLink { TripBackupView() } label: {
                                            moreRow(symbol: "doc", title: "여행 백업 가져오기·내보내기",
                                                    detail: "여행 JSON 파일을 저장하거나 불러옵니다.", accent: NativePreviewTheme.primary)
                                        }
                                        .buttonStyle(.plain).nativeCard(padding: 14)
                                        .accessibilityIdentifier("backupImport")
                                        Text("여행 JSON 백업에는 전역 저장 장소가 포함되지 않습니다.")
                                            .font(.footnote).foregroundStyle(NativePreviewTheme.textMuted)
                                        MoreInfoPanel(symbol: "map", title: "지도 연결 안내", detail: "실제 지도·검색에는 별도 네이티브 지도 키가 필요합니다.")
                                            .accessibilityIdentifier("nativeMapKeyInfo")
                                        MoreInfoPanel(symbol: "info.circle", title: "기기에 저장된 여행", detail: "앱을 삭제하거나 데이터를 지우면 이 기기의 여행도 사라질 수 있어요. 중요한 여행은 백업해주세요.")
                                    }
                                }
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                moreSectionTitle("지원 및 약관", id: "moreSupportSection")
                                VStack(spacing: 0) {
                                    Link(destination: URL(string: "https://travelplaner-545.pages.dev/support.html")!) {
                                        moreRow(symbol: "questionmark.circle", title: "지원 및 도움말", detail: nil, accent: NativePreviewTheme.moreAccent)
                                    }.accessibilityIdentifier("moreSupportTerms")
                                    Divider().padding(.leading, 52)
                                    Link(destination: URL(string: "https://travelplaner-545.pages.dev/privacy.html")!) {
                                        moreRow(symbol: "hand.raised", title: "개인정보처리방침", detail: nil, accent: NativePreviewTheme.moreAccent)
                                    }
                                    Divider().padding(.leading, 52)
                                    Link(destination: URL(string: "https://travelplaner-545.pages.dev/terms.html")!) {
                                        moreRow(symbol: "doc.text", title: "이용약관", detail: nil, accent: NativePreviewTheme.moreAccent)
                                    }
                                }.buttonStyle(.plain).nativeCard(padding: 14)
                            }
                            Text("\(store.savedPlaces.count) 저장 · \(itineraryPlaceCount) 일정")
                                .font(.footnote.weight(.semibold)).foregroundStyle(NativePreviewTheme.textMuted)
                                .accessibilityIdentifier("moreSavedTripSummary")
                        }
                        .padding(.horizontal, NativePreviewTheme.screenPadding)
                        .padding(.vertical, NativePreviewTheme.sectionSpacing)
                    }
                    .onChange(of: accountScrollRequest) { _ in
                        DispatchQueue.main.async { proxy.scrollTo("accountSyncPanel", anchor: .top) }
                    }
                    .onAppear {
                        if accountScrollRequest > 0 {
                            DispatchQueue.main.async { proxy.scrollTo("accountSyncPanel", anchor: .top) }
                        }
                    }
                }
                .background(NativePreviewTheme.background)
                .navigationTitle("더보기")
                .toolbar(.hidden, for: .navigationBar)
            }
            .nativeTabPage(isActive: selectedTab == "more")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(NativePreviewTheme.background.ignoresSafeArea())
        NativeTabBar(selection: $selectedTab)
        }
        .background(NativePreviewTheme.background)
        .overlay {
            if showingWelcome {
                FirstRunWelcomeOverlay(
                    onLater: {
                        hasSeenWelcome = true
                        showingWelcome = false
                    },
                    onCreateTrip: {
                        hasSeenWelcome = true
                        showingWelcome = false
                        selectedTab = "trips"
                        createTripAfterWelcome = true
                    }
                )
                .zIndex(1)
            }
        }
        .onAppear {
            syncCoordinator.connect(authStore: authStore, tripStore: store)
            syncCoordinator.setAppActive(scenePhase == .active)
            syncCoordinator.startNetworkMonitoring()
            if selectedTab == "map" { selectedTab = "trips" }
            if selectedTab == "expenses" { selectedTab = "budget" }
            guard hasSeenWelcome else {
                didRestoreSelectedTab = true
                selectedTab = "trips"
                showingWelcome = true
                return
            }
            guard !didRestoreSelectedTab else { return }
            didRestoreSelectedTab = true
            let restoredRoute: String
            switch persistedSelectedTab {
            case "favorites", "budget", "memory", "more":
                restoredRoute = persistedSelectedTab
            case "expenses":
                restoredRoute = "budget"
            case "map", "trips":
                restoredRoute = "trips"
            default:
                restoredRoute = "trips"
            }
            if persistedSelectedTab != restoredRoute {
                persistedSelectedTab = restoredRoute
            }
            if restoredRoute != "trips" {
                Task { @MainActor in
                    // Restore only after the root view has mounted so the
                    // selected page is added to the retained tab host.
                    await Task.yield()
                    selectedTab = restoredRoute
                }
            }
        }
        .onChange(of: selectedTab) { route in
            persistedSelectedTab = route
            mountedTabs.insert(route)
        }
        .task(id: authStore.userID) {
            store.setActiveAccount(authStore.userID)
            syncCoordinator.connect(authStore: authStore, tripStore: store)
            if let userID = authStore.userID {
                await syncCoordinator.sync(userID: userID)
            }
        }
        .task(id: "\(authStore.userID ?? "")-\(scenePhase == .active)") {
            guard scenePhase == .active, let userID = authStore.userID else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: SyncRefreshPolicy.interval(fingerprintAvailable: syncCoordinator.fingerprintAvailable, realtimeConnected: syncCoordinator.realtimeConnected)) }
                catch { break }
                guard !Task.isCancelled, scenePhase == .active, authStore.userID == userID else { break }
                await syncCoordinator.resumePendingOperations(userID: userID)
            }
        }
        .task(id: "realtime-\(authStore.userID ?? "")-\(scenePhase == .active)") {
            let userID = authStore.userID
            guard SyncRefreshPolicy.shouldListen(isActive: scenePhase == .active, userID: userID), let userID else { return }
            let realtimeSession = syncCoordinator.beginRealtimeSession()
            defer { syncCoordinator.endRealtimeSession(realtimeSession) }
            var retryDelay: UInt64 = 5_000_000_000
            while !Task.isCancelled {
                do {
                    try await authStore.listenForAccountChanges(userID: userID, onConnection: { connected in
                        syncCoordinator.setRealtimeConnected(connected, session: realtimeSession, userID: userID)
                    }, onChange: {
                        syncCoordinator.requestRealtimeRefresh(userID: userID)
                    })
                } catch is CancellationError { break }
                catch { /* The periodic reconciliation remains available. */ }
                guard !Task.isCancelled, authStore.userID == userID else { break }
                do { try await Task.sleep(nanoseconds: retryDelay) } catch { break }
                retryDelay = min(retryDelay * 2, SyncRefreshPolicy.fallbackNanoseconds)
            }
        }
        .onChange(of: store.syncMutationGeneration) { _ in
            guard scenePhase == .active, store.pendingSyncOperationCount > 0,
                  let userID = authStore.userID else { return }
            Task { await syncCoordinator.resumePendingOperations(userID: userID) }
        }
        .onChange(of: scenePhase) { phase in
            syncCoordinator.setAppActive(phase == .active)
            guard phase == .active, let userID = authStore.userID else { return }
            Task { await syncCoordinator.resumePendingOperations(userID: userID) }
        }
        .sheet(isPresented: $showingLogin) {
            NativeAuthSheet().environmentObject(authStore)
        }
    }

    private func openAccount() {
        if authStore.userID == nil && authStore.isConfigured {
            showingLogin = true
        } else {
            isAppOnlyFeaturesExpanded = true
            selectedTab = "more"
            accountScrollRequest += 1
        }
    }

    private func moreSectionTitle(_ title: String, id: String) -> some View {
        Text(title).font(.subheadline.weight(.bold)).foregroundStyle(NativePreviewTheme.textMuted)
            .padding(.horizontal, 4).accessibilityIdentifier(id)
    }

    private func moreRow(symbol: String, title: String, detail: String?, accent: Color, indicator: String = "chevron.right") -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).font(.title3).foregroundStyle(accent).accessibilityHidden(true)
                .frame(width: 40, height: 40)
                .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(NativePreviewTheme.textPrimary)
                if let detail { Text(detail).font(.footnote).foregroundStyle(NativePreviewTheme.textMuted).lineLimit(2) }
            }
            Spacer(minLength: 8)
            Image(systemName: indicator).font(.footnote.weight(.semibold)).foregroundStyle(NativePreviewTheme.textMuted).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(Rectangle())
    }

    private var itineraryPlaceCount: Int {
        guard let trip = store.trips.first(where: { $0.id == activeTrip }) ?? store.trips.first else { return 0 }
        return trip.days.reduce(0) { total, day in
            total + (day["items"] as? [[String: Any]] ?? []).count
        }
    }
}

private extension View {
    func nativeTabPage(isActive: Bool) -> some View {
        opacity(isActive ? 1 : 0)
            .allowsHitTesting(isActive)
            .accessibilityHidden(!isActive)
            .zIndex(isActive ? 1 : 0)
    }
}

private struct FirstRunWelcomeOverlay: View {
    let onLater: () -> Void
    let onCreateTrip: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(Color.black.opacity(0.34))
                    .ignoresSafeArea()

                ScrollView(.vertical) {
                    welcomeCard(width: max(280, min(420, geometry.size.width - 40)))
                        .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .center)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .ignoresSafeArea()
        .accessibilityIdentifier("firstRunWelcomeOverlay")
    }

    private func welcomeCard(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "airplane")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(NativePreviewTheme.mapAccent)
                    .frame(width: 48, height: 48)
                    .background(NativePreviewTheme.mapAccentContainer, in: RoundedRectangle(cornerRadius: 15))
                VStack(alignment: .leading, spacing: 4) {
                    Text("여행을 시작해볼까요?")
                        .font(.title3.bold())
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                        .accessibilityIdentifier("firstRunWelcomeTitle")
                    Text("3단계로 간단하게 일정을 만들 수 있어요.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NativePreviewTheme.textMuted)
                }
            }
            .padding(.bottom, 20)

            VStack(spacing: 10) {
                welcomeStep(1, title: "여행 만들기", detail: "여행 이름과 날짜를 정해요.")
                welcomeStep(2, title: "장소 검색", detail: MapConfiguration.key == nil
                    ? "지도 키를 연결하면 장소나 주소를 검색할 수 있어요."
                    : "지도에서 장소나 주소를 검색해요.")
                welcomeStep(3, title: "일정 추가", detail: "시간과 표시 이름을 정해 일정에 넣어요.")
            }
            .padding(.bottom, 22)

            HStack(spacing: 10) {
                Button("나중에", action: onLater)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 14))
                    .accessibilityIdentifier("welcomeLater")
                Button(action: onCreateTrip) {
                    Text("여행 만들기")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(NativePreviewTheme.mapAccent, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("welcomeCreateTrip")
            }
        }
        .padding(24)
        .frame(width: width)
        .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: 28))
        .overlay(RoundedRectangle(cornerRadius: 28).stroke(NativePreviewTheme.outline, lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 28, y: 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("firstRunWelcomeCard")
    }

    private func welcomeStep(_ number: Int, title: String, detail: String) -> some View {
        HStack(spacing: 12) {
            Text("\(number)")
                .font(.headline.weight(.heavy))
                .foregroundStyle(number == 1 ? .white : NativePreviewTheme.textMuted)
                .frame(width: 38, height: 38)
                .background(number == 1 ? NativePreviewTheme.mapAccent : NativePreviewTheme.outline, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NativePreviewTheme.textPrimary)
                    .accessibilityIdentifier("firstRunWelcomeStep\(number)")
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(number == 1 ? NativePreviewTheme.mapAccentContainer : NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(number == 1 ? NativePreviewTheme.mapAccent.opacity(0.25) : .clear, lineWidth: 1))
    }
}

private struct NativeMemoryTabView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Binding var activeTrip: String
    @Binding var selectedTab: String

    private var selectedTripID: String? {
        store.trips.first(where: { $0.id == activeTrip })?.id ?? store.trips.first?.id
    }

    var body: some View {
        Group {
            if let tripID = selectedTripID {
                NavigationStack { TravelMemoryView(tripID: tripID) }
            } else {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            Image(systemName: "airplane")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(NativePreviewTheme.tripRequiredAccent)
                                .frame(width: 48, height: 48)
                                .background(NativePreviewTheme.tripRequiredIconContainer, in: RoundedRectangle(cornerRadius: 15))
                            Text("여행 기록")
                                .font(.system(size: 19, weight: .black))
                                .foregroundStyle(NativePreviewTheme.textPrimary)
                            Text("여행을 선택하면 여행 기록을 확인할 수 있어요.")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(NativePreviewTheme.textMuted)
                                .fixedSize(horizontal: false, vertical: true)
                            Button { selectedTab = "trips" } label: {
                                Label("내 여행으로 이동", systemImage: "arrow.right")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 15)
                                    .frame(minHeight: 44)
                                    .background(NativePreviewTheme.tripRequiredAccent, in: RoundedRectangle(cornerRadius: 13))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("memoryGoToTrips")
                        }
                        .padding(22)
                        .frame(maxWidth: 560, alignment: .leading)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .background(
                            LinearGradient(
                                colors: [NativePreviewTheme.tripRequiredContainer, NativePreviewTheme.card],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 22)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 22)
                                .stroke(NativePreviewTheme.tripRequiredOutline, lineWidth: 1)
                        }
                        .shadow(color: NativePreviewTheme.tripRequiredAccent.opacity(0.08), radius: 18, y: 8)
                        .padding(.horizontal, NativePreviewTheme.screenPadding)
                        .padding(.top, 12)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("memoryTripRequiredCard")
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(NativePreviewTheme.background)
                }
            }
        }
    }
}

private struct MoreInfoPanel: View {
    let symbol: String
    let title: String
    let detail: String
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(NativePreviewTheme.primary)
                .frame(width: 40, height: 40)
                .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline).foregroundStyle(NativePreviewTheme.textPrimary)
                Text(detail).font(.subheadline).foregroundStyle(NativePreviewTheme.textMuted)
            }
        }
        .nativeCard()
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
                        .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 32))
                    Text(message).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                    Text("다음 단계에서 연결될 기능입니다.").font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(32).frame(maxWidth: .infinity).padding(.top, 60)
            }
            .navigationTitle(title)
        }
    }
}
