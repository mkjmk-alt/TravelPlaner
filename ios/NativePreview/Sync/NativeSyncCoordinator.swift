import Foundation
import Combine
import Network
import NativeCore

@MainActor
final class NativeSyncCoordinator: ObservableObject {
    @Published private(set) var isSyncing = false
    @Published private(set) var isManualSyncing = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var lastSyncedAt: Date?
    @Published private(set) var shouldMigrateWebData = false

    private weak var authStore: NativeAuthStore?
    private weak var tripStore: NativeTripStore?
    private var networkMonitor: NWPathMonitor?
    private let networkMonitorQueue = DispatchQueue(label: "com.travelplaner.native-sync-reachability")
    private var reachabilityGate = SyncReachabilityGate()
    private var queuedSyncUserID: String?
    private var notificationTask: Task<Void, Never>?
    private var appIsActive = false
    private var fingerprintUserID: String?
    private var lastFingerprint: String?
    private(set) var fingerprintAvailable = false
    private(set) var realtimeConnected = false
    private var realtimeSession: UUID?

    func connect(authStore: NativeAuthStore, tripStore: NativeTripStore) {
        self.authStore = authStore
        self.tripStore = tripStore
    }

    func startNetworkMonitoring() {
        guard networkMonitor == nil else { return }
        let monitor = NWPathMonitor()
        networkMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            let isOnline = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self,
                      self.reachabilityGate.update(isOnline: isOnline),
                      self.appIsActive,
                      let userID = self.authStore?.userID else { return }
                await self.resumePendingOperations(userID: userID)
            }
        }
        monitor.start(queue: networkMonitorQueue)
    }

    @discardableResult
    func sync(userID: String, showProgress: Bool = false) async -> SyncRunResult? {
        guard !userID.isEmpty else {
            statusMessage = nil
            errorMessage = "로그인 계정을 확인한 뒤 다시 동기화해주세요."
            shouldMigrateWebData = false
            return nil
        }
        guard let authStore else {
            statusMessage = nil
            errorMessage = "인증 연결을 준비하지 못했습니다. 앱을 다시 연 뒤 시도해주세요."
            shouldMigrateWebData = false
            return nil
        }
        guard let tripStore else {
            statusMessage = nil
            errorMessage = "기기 저장소를 준비하지 못했습니다. 앱을 다시 연 뒤 시도해주세요."
            shouldMigrateWebData = false
            return nil
        }
        guard authStore.userID == userID else {
            statusMessage = nil
            errorMessage = "로그인 계정이 바뀌었습니다. 현재 계정으로 다시 동기화해주세요."
            shouldMigrateWebData = false
            return nil
        }
        guard !isSyncing else {
            queuedSyncUserID = userID
            return nil
        }

        isSyncing = true
        errorMessage = nil
        if showProgress { statusMessage = "계정 데이터 동기화 중…" }
        defer {
            isSyncing = false
            if let nextUserID = queuedSyncUserID {
                queuedSyncUserID = nil
                if authStore.userID == nextUserID {
                    Task { await resumePendingOperations(userID: nextUserID) }
                }
            }
        }

        do {
            try Task.checkCancellation()
            let transport = try await authStore.makeSyncTransport(for: userID)
            guard authStore.userID == userID else { return nil }
            if fingerprintUserID != userID { fingerprintUserID = userID; lastFingerprint = nil }
            let before = try? await transport.fetchFingerprint(userID: userID)
            fingerprintAvailable = before != nil
            try Task.checkCancellation()
            guard authStore.userID == userID else { return nil }
            let pending = try? tripStore.pendingSyncCount(userID: userID)
            if SyncRefreshPolicy.canSkipFullSync(known: lastFingerprint, current: before, pendingCount: pending, force: showProgress) {
                lastSyncedAt = Date()
                return SyncRunResult(pulledRecords: 0, appliedOperations: 0, replayedOperations: 0, conflicts: 0)
            }
            let mutationGeneration = tripStore.syncMutationGeneration
            let result = try await tripStore.performSync(userID: userID, transport: transport, forceFull: showProgress)
            guard authStore.userID == userID else { return result }
            let after = try? await transport.fetchFingerprint(userID: userID)
            try Task.checkCancellation()
            guard authStore.userID == userID else { return result }
            if mutationGeneration == tripStore.syncMutationGeneration, (try? tripStore.pendingSyncCount(userID: userID)) == 0 {
                lastFingerprint = SyncRefreshPolicy.confirmedFingerprint(before: before, after: after)
            } else { lastFingerprint = nil }
            lastSyncedAt = Date()
            let sentCount = result.appliedOperations + result.replayedOperations
            let activeRecords = try? tripStore.accountSyncRecordCount(userID: userID)
            if activeRecords == 0, sentCount == 0, result.conflicts == 0 {
                statusMessage = "동기화 완료 · 계정에 저장된 자료가 없습니다."
                shouldMigrateWebData = true
            } else if result.conflicts == 0 {
                shouldMigrateWebData = false
                statusMessage = "동기화 완료 · 서버 변경 \(result.pulledRecords)건 확인, 내 변경 \(sentCount)건 반영"
            } else {
                shouldMigrateWebData = false
                statusMessage = "동기화 완료 · 충돌 \(result.conflicts)건을 확인해주세요"
            }
            return result
        } catch is CancellationError {
            errorMessage = nil
            statusMessage = "동기화가 중단됐습니다. 다시 시도해주세요."
            shouldMigrateWebData = false
            return nil
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = nil
            shouldMigrateWebData = false
            return nil
        }
    }

    func setAppActive(_ active: Bool) {
        appIsActive = active
        if !active {
            notificationTask?.cancel(); notificationTask = nil
            realtimeSession = nil; realtimeConnected = false
        }
    }

    func beginRealtimeSession() -> UUID {
        let id = UUID(); realtimeSession = id; realtimeConnected = false; return id
    }
    func setRealtimeConnected(_ connected: Bool, session: UUID, userID: String) {
        guard realtimeSession == session, authStore?.userID == userID, appIsActive else { return }
        realtimeConnected = connected
    }
    func endRealtimeSession(_ session: UUID) {
        guard realtimeSession == session else { return }
        realtimeSession = nil; realtimeConnected = false
    }

    func requestRealtimeRefresh(userID: String) {
        notificationTask?.cancel()
        notificationTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: SyncRefreshPolicy.debounceNanoseconds) } catch { return }
            guard let self, self.appIsActive, self.authStore?.userID == userID else { return }
            await self.resumePendingOperations(userID: userID)
        }
    }

    func userRequestedSync(userID: String) async {
        guard !isManualSyncing else { return }
        isManualSyncing = true
        defer { isManualSyncing = false }
        while isSyncing && authStore?.userID == userID {
            do { try await Task.sleep(nanoseconds: 100_000_000) } catch { return }
        }
        guard authStore?.userID == userID else { return }
        _ = await sync(userID: userID, showProgress: true)
    }

    func resumePendingOperations(userID: String) async {
        _ = await sync(userID: userID)
    }

    func acceptRemote(_ conflict: SyncConflict, userID: String) {
        guard let authStore, let tripStore, authStore.userID == userID else { return }
        do {
            try tripStore.resolveSyncConflict(id: conflict.id, choice: .acceptServer, userID: userID)
            statusMessage = "서버 버전을 적용했습니다."
            errorMessage = nil
            Task { await resumePendingOperations(userID: userID) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func keepLocal(conflictID: UUID) {
        guard let authStore, let tripStore, let userID = authStore.userID else { return }
        do {
            try tripStore.resolveSyncConflict(id: conflictID, choice: .keepLocal, userID: userID)
            statusMessage = "내 변경을 다시 전송 대기열에 넣었습니다."
            errorMessage = nil
            Task { await resumePendingOperations(userID: userID) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
