import Foundation
import NativeCore

@MainActor
final class NativeTripStore: ObservableObject {
    @Published private(set) var trips: [TripDocument] = []
    @Published private(set) var loadError: String?
    @Published private(set) var savedPlaces: [SavedPlaceDocument] = []
    @Published private(set) var savedLoadError: String?
    @Published private(set) var syncConflicts: [SyncConflict] = []
    @Published private(set) var syncWarningMessage: String?
    @Published private(set) var pendingSyncOperationCount = 0
    @Published private(set) var syncMutationGeneration = 0
    private(set) var activeUserID: String?
    private var repository: TripRepository?
    private var mediaStore: TravelMediaStore?
    private var draftStore: MemoryDraftStore?

    init() { open() }

    func open() {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let next = try TripRepository(url: directory.appendingPathComponent("TripPlotNative/trips.sqlite"))
            let media = try TravelMediaStore(root: directory.appendingPathComponent("TripPlotNative/media", isDirectory: true))
            let drafts = try MemoryDraftStore(root: directory.appendingPathComponent("TripPlotNative/drafts", isDirectory: true))
            let loaded = try next.list(userID: activeUserID)
            if let staleDrafts = try? drafts.removeStaleJournals() {
                for draft in staleDrafts {
                    if let fileName = draft.stagedPhotoFileName {
                        try? media.remove(try media.reference(tripID: draft.tripID, fileName: fileName))
                    }
                }
            }
            repository = next
            mediaStore = media
            draftStore = drafts
            trips = loaded
            loadError = nil
            reloadSavedPlaces()
            refreshPendingSyncCount()
        } catch {
            repository = nil
            loadError = error.localizedDescription
        }
    }

    func stageMemoryPhoto(_ data: Data, tripID: String) throws -> TravelMediaReference {
        guard let mediaStore else { throw CocoaError(.fileWriteUnknown) }
        return try mediaStore.write(data, tripID: tripID)
    }

    func memoryPhotoData(tripID: String, fileName: String) -> Data? {
        guard let mediaStore else { return nil }
        return try? mediaStore.read(try mediaStore.reference(tripID: tripID, fileName: fileName))
    }

    func removeMemoryPhoto(tripID: String, fileName: String) throws {
        guard let mediaStore else { throw CocoaError(.fileWriteUnknown) }
        try mediaStore.remove(try mediaStore.reference(tripID: tripID, fileName: fileName))
    }

    func saveJournalDraft(_ draft: JournalEditorDraft, draftIDOverride: String? = nil) throws {
        guard let draftStore else { throw CocoaError(.fileWriteUnknown) }
        try draftStore.saveJournal(draft, draftIDOverride: draftIDOverride)
    }

    func loadJournalDraft(tripID: String, draftID: String) throws -> JournalEditorDraft? {
        guard let draftStore else { throw CocoaError(.fileReadUnknown) }
        return try draftStore.loadJournal(tripID: tripID, draftID: draftID)
    }

    func removeJournalDraft(tripID: String, draftID: String) throws {
        guard let draftStore else { throw CocoaError(.fileWriteUnknown) }
        try draftStore.removeJournal(tripID: tripID, draftID: draftID)
    }

    func discardJournalDraft(tripID: String, draftID: String, preserving stagedPhotoFileName: String? = nil) throws {
        guard let draftStore, let mediaStore else { throw CocoaError(.fileWriteUnknown) }
        let draftIDs = Set([draftID, "new"])
        for id in draftIDs {
            if let draft = try draftStore.loadJournal(tripID: tripID, draftID: id),
               let fileName = draft.stagedPhotoFileName,
               fileName != stagedPhotoFileName {
                try mediaStore.remove(try mediaStore.reference(tripID: tripID, fileName: fileName))
            }
        }
        for id in draftIDs { try draftStore.removeJournal(tripID: tripID, draftID: id) }
    }

    func memoryBackupData(tripID: String) throws -> Data {
        guard let trip = trips.first(where: { $0.id == tripID }), let mediaStore else { throw CocoaError(.fileReadUnknown) }
        return try MemoryBackup.encode(trip) { fileName in
            try mediaStore.read(try mediaStore.reference(tripID: tripID, fileName: fileName))
        }
    }

    func reloadSavedPlaces() {
        do {
            guard let repository else { throw CocoaError(.fileReadUnknown) }
            savedPlaces = try repository.listSavedPlaces(userID: activeUserID); savedLoadError = nil
        } catch { savedLoadError = error.localizedDescription }
    }
    func setActiveAccount(_ userID: String?) {
        let normalized = userID.flatMap { $0.isEmpty ? nil : $0 }
        activeUserID = normalized
        do {
            guard let repository else { throw CocoaError(.fileReadUnknown) }
            trips = try repository.list(userID: normalized)
            savedPlaces = try repository.listSavedPlaces(userID: normalized)
            syncConflicts = try normalized.map(repository.conflicts(userID:)) ?? []
            refreshPendingSyncCount()
            syncWarningMessage = nil
            loadError = nil
            savedLoadError = nil
        } catch {
            loadError = error.localizedDescription
            syncConflicts = []
        }
    }

    func performSync(userID: String, transport: SyncTransport, forceFull: Bool = false) async throws -> SyncRunResult {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        guard userID == activeUserID else { throw SyncError.accountMismatch }
        let result = try await repository.makeSyncEngine(transport: transport).sync(userID: userID, forceFull: forceFull)
        let remoteRecords = try repository.syncRecords(userID: userID)
        let hydration = try repository.applyRemoteRecords(remoteRecords, userID: userID)
        guard activeUserID == userID else { return result }

        trips = try repository.list(userID: userID)
        savedPlaces = try repository.listSavedPlaces(userID: userID)
        syncConflicts = try repository.conflicts(userID: userID)
        refreshPendingSyncCount()
        let retainedCount = hydration.retainedLocalDraftCount + hydration.retainedPendingEditCount
            + hydration.retainedConflictCount + hydration.retainedOtherAccountCount
            + hydration.retainedDuplicatePlaceCount
        if retainedCount > 0 {
            syncWarningMessage = "안전 확인이 필요한 \(retainedCount)개 항목은 덮어쓰지 않고 보존했습니다. 충돌 항목은 아래에서 확인하고, 기기 초안은 데이터 이전 기능에서 별도로 병합할 수 있습니다."
        } else {
            syncWarningMessage = nil
        }
        return result
    }

    func resolveSyncConflict(id: UUID, choice: SyncConflictChoice, userID: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        guard activeUserID == userID else { throw SyncError.accountMismatch }
        try repository.resolveConflict(id: id, choice: choice, userID: userID)
        trips = try repository.list(userID: userID)
        savedPlaces = try repository.listSavedPlaces(userID: userID)
        syncConflicts = try repository.conflicts(userID: userID)
        refreshPendingSyncCount()
    }

    func accountSyncRecordCount(userID: String) throws -> Int {
        guard let repository else { throw CocoaError(.fileReadUnknown) }
        return try repository.syncRecords(userID: userID).filter { $0.deletedAt == nil }.count
    }

    func pendingSyncCount(userID: String) throws -> Int {
        guard let repository else { throw CocoaError(.fileReadUnknown) }
        return try repository.pendingSyncCount(userID: userID)
    }

    private func refreshPendingSyncCount() {
        guard let userID = activeUserID, let repository else {
            pendingSyncOperationCount = 0
            return
        }
        do {
            pendingSyncOperationCount = try repository.pendingSyncCount(userID: userID)
        } catch {
            pendingSyncOperationCount = 0
            syncWarningMessage = error.localizedDescription
        }
    }

    private func recordLocalSyncMutation() {
        refreshPendingSyncCount()
        syncMutationGeneration &+= 1
    }

    private var writeContext: SyncWriteContext { SyncWriteContext(userID: activeUserID) }

    func saveFavorite(selection: PlaceSelection, draft: PlaceDraft, id: String) throws -> SavedPlaceDocument {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let saved = try repository.savePlace(selection: selection, draft: draft, id: id, syncContext: writeContext)
        savedPlaces = try repository.listSavedPlaces(userID: activeUserID); savedLoadError = nil
        recordLocalSyncMutation()
        return saved
    }
    func deleteFavorite(id: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.deleteSavedPlace(id: id, syncContext: writeContext)
        savedPlaces = try repository.listSavedPlaces(userID: activeUserID)
        recordLocalSyncMutation()
    }

    func save(draft: TripDraft, original: TripDocument?) throws -> String {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let trip = try original?.edited(draft: draft) ?? TripDocument.create(draft: draft)
        try repository.save(trip, syncContext: writeContext)
        trips.removeAll { $0.id == trip.id }
        trips.insert(trip, at: 0)
        recordLocalSyncMutation()
        return trip.id
    }

    func delete(_ trip: TripDocument) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.delete(id: trip.id, syncContext: writeContext)
        trips.removeAll { $0.id == trip.id }
        recordLocalSyncMutation()
    }

    func saveFlightConfirmation(tripID: String, flight: FlightReceiptDraft, expected: [String: String], addToItinerary: Bool, itemID: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.saveFlightConfirmation(tripID: tripID, flight: flight, expected: expected,
                                                   addToItinerary: addToItinerary, itemID: itemID, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }

    func applySchedule(tripID: String, change: ScheduleChange) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.applySchedule(tripID: tripID, change: change, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func upsertExpense(tripID: String, expenseID: String, fields: [String: Any]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.upsertExpense(tripID: tripID, expenseID: expenseID, fields: fields, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func deleteExpense(tripID: String, expenseID: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.deleteExpense(tripID: tripID, expenseID: expenseID, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func updateBudgetSettings(tripID: String, values: [String: Any]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.updateBudgetSettings(tripID: tripID, values: values, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func updateParticipants(tripID: String, participants: [[String: Any]]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.updateSettlementParticipants(tripID: tripID, participants: participants, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func applyMemoryChange(tripID: String, change: MemoryChange) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.applyMemoryChange(tripID: tripID, change: change, syncContext: writeContext)
        trips = try repository.list(userID: activeUserID)
        recordLocalSyncMutation()
    }
    func prepareImport(url: URL) async throws -> ImportPreview {
        guard let repository else { throw CocoaError(.fileReadUnknown) }
        return try await Task.detached(priority: .userInitiated) {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let candidate = try TripBackup.decode(TripBackup.readFile(url))
            return try repository.prepareImport(candidate)
        }.value
    }
    func prepareImport(data: Data) async throws -> ImportPreview {
        guard let repository else { throw CocoaError(.fileReadUnknown) }
        return try await Task.detached(priority: .userInitiated) {
            try repository.prepareImport(TripBackup.decode(data))
        }.value
    }
    func commitImport(_ preview: ImportPreview, decision: ImportDecision) async throws -> ImportOutcome {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let currentUserID = activeUserID
        let result = try await Task.detached(priority: .userInitiated) {
            let outcome = try repository.commitImport(preview, decision: decision)
            return (outcome, try repository.list(userID: currentUserID))
        }.value
        trips = result.1
        return result.0
    }
}
