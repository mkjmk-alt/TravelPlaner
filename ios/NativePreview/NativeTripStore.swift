import Foundation
import NativeCore

@MainActor
final class NativeTripStore: ObservableObject {
    @Published private(set) var trips: [TripDocument] = []
    @Published private(set) var loadError: String?
    @Published private(set) var savedPlaces: [SavedPlaceDocument] = []
    @Published private(set) var savedLoadError: String?
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
            let loaded = try next.list()
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
            savedPlaces = try repository.listSavedPlaces(); savedLoadError = nil
        } catch { savedLoadError = error.localizedDescription }
    }
    func saveFavorite(selection: PlaceSelection, draft: PlaceDraft, id: String) throws -> SavedPlaceDocument {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let saved = try repository.savePlace(selection: selection, draft: draft, id: id)
        savedPlaces = try repository.listSavedPlaces(); savedLoadError = nil
        return saved
    }
    func deleteFavorite(id: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.deleteSavedPlace(id: id); savedPlaces = try repository.listSavedPlaces()
    }

    func save(draft: TripDraft, original: TripDocument?) throws -> String {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let trip = try original?.edited(draft: draft) ?? TripDocument.create(draft: draft)
        try repository.save(trip)
        trips.removeAll { $0.id == trip.id }
        trips.insert(trip, at: 0)
        return trip.id
    }

    func delete(_ trip: TripDocument) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.delete(id: trip.id)
        trips.removeAll { $0.id == trip.id }
    }

    func applySchedule(tripID: String, change: ScheduleChange) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.applySchedule(tripID: tripID, change: change)
        trips = try repository.list()
    }
    func upsertExpense(tripID: String, expenseID: String, fields: [String: Any]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.upsertExpense(tripID: tripID, expenseID: expenseID, fields: fields)
        trips = try repository.list()
    }
    func deleteExpense(tripID: String, expenseID: String) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        try repository.deleteExpense(tripID: tripID, expenseID: expenseID)
        trips = try repository.list()
    }
    func updateBudgetSettings(tripID: String, values: [String: Any]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.updateBudgetSettings(tripID: tripID, values: values)
        trips = try repository.list()
    }
    func updateParticipants(tripID: String, participants: [[String: Any]]) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.updateSettlementParticipants(tripID: tripID, participants: participants)
        trips = try repository.list()
    }
    func applyMemoryChange(tripID: String, change: MemoryChange) throws {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        _ = try repository.applyMemoryChange(tripID: tripID, change: change)
        trips = try repository.list()
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
    func commitImport(_ preview: ImportPreview, decision: ImportDecision) async throws -> ImportOutcome {
        guard let repository else { throw CocoaError(.fileWriteUnknown) }
        let result = try await Task.detached(priority: .userInitiated) {
            let outcome = try repository.commitImport(preview, decision: decision)
            return (outcome, try repository.list())
        }.value
        trips = result.1
        return result.0
    }
}
