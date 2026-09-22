import SwiftUI
import UIKit
import NativeCore
import PhotosUI

struct TravelMemoryView: View {
    @EnvironmentObject private var store: NativeTripStore
    let tripID: String

    @State private var date = ""
    @State private var title = ""
    @State private var bodyText = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var stagedPhotoFileName: String?
    @State private var removePhoto = false
    @State private var editingIndex: Int?
    @State private var editingExpected: [String: Any]?
    @State private var pendingDeleteIndex: Int?
    @State private var error: String?
    @State private var draftID = "new"
    @State private var draftPersistenceEnabled = false

    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var entries: [[String: Any]] { (trip?.raw["journalEntries"] as? [[String: Any]]) ?? [] }
    private var isEditing: Bool { editingIndex != nil }
    private var existingPhotoAttached: Bool {
        guard let expected = editingExpected else { return false }
        return expected["imageFileName"] is String || expected["imageDataUrl"] is String
    }
    private var canSave: Bool {
        let hasText = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return hasText || photoData != nil || (isEditing && existingPhotoAttached && !removePhoto)
    }

    var body: some View {
        Form {
            Section(isEditing ? "기록 편집" : "새 기록") {
                TextField("날짜 (선택)", text: $date)
                    .textInputAutocapitalization(.never)
                    .accessibilityIdentifier("memory-date")
                TextField("제목", text: $title)
                    .accessibilityIdentifier("memory-title")
                TextField("내용", text: $bodyText, axis: .vertical)
                    .lineLimit(3...8)
                    .accessibilityIdentifier("memory-body")

                if let photoData {
                    photoPreview(data: photoData)
                } else if isEditing, existingPhotoAttached, !removePhoto {
                    Label("기존 사진이 첨부되어 있습니다.", systemImage: "photo")
                        .foregroundStyle(.secondary)
                }

                PhotosPicker(selection: $photoItem, matching: .images) { photoPickerLabel }
                .accessibilityIdentifier("memory-photo")
                .onChange(of: photoItem) { item in handlePhotoSelection(item) }

                if isEditing, existingPhotoAttached, !removePhoto {
                    Button("기존 사진 제거", role: .destructive) { removePhoto = true }
                        .accessibilityIdentifier("memory-remove-photo")
                }

                if isEditing {
                    HStack {
                        Button("편집 취소") { discardDraft(); resetForm() }
                            .accessibilityIdentifier("memory-edit-cancel")
                        Spacer()
                        Button("초기화") { discardDraft(); clearFields() }
                    }
                }

                Button(isEditing ? "기록 수정" : "기록 저장") { save() }
                    .disabled(!canSave)
                    .accessibilityIdentifier(isEditing ? "memory-edit-save" : "memory-save")
            }

            Section("저장한 기록") {
                if entries.isEmpty {
                    Text("아직 기록이 없습니다.").foregroundStyle(.secondary)
                }

                ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
                    memoryRow(index: index, entry: entry)
                }
            }

            if let error {
                Text(error).foregroundStyle(.red)
            }
        }
        .navigationTitle("여행 기록")
        .task(id: tripID) { restoreDraft() }
        .onChange(of: date) { _ in persistDraft() }
        .onChange(of: title) { _ in persistDraft() }
        .onChange(of: bodyText) { _ in persistDraft() }
        .onChange(of: removePhoto) { _ in persistDraft() }
        .onChange(of: stagedPhotoFileName) { _ in persistDraft() }
        .confirmationDialog("이 기록을 삭제할까요?", isPresented: pendingDeleteBinding, titleVisibility: .visible) {
            Button("삭제", role: .destructive) {
                guard let index = pendingDeleteIndex, entries.indices.contains(index) else { return }
                let entry = entries[index]
                pendingDeleteIndex = nil
                remove(index: index, entry: entry)
            }
            .accessibilityIdentifier("memory-delete-confirm")
            Button("취소", role: .cancel) { pendingDeleteIndex = nil }
        }
    }

    private var pendingDeleteBinding: Binding<Bool> {
        Binding(
            get: { pendingDeleteIndex != nil },
            set: { if !$0 { pendingDeleteIndex = nil } }
        )
    }

    @ViewBuilder
    private var photoPickerLabel: some View {
        Label(photoData == nil ? "사진 선택" : "사진 선택됨", systemImage: "photo")
    }

    @MainActor
    private func handlePhotoSelection(_ item: PhotosPickerItem?) {
        Task { @MainActor in
            guard let item, let loaded = try? await item.loadTransferable(type: Data.self) else { return }
            do {
                let reference = try store.stageMemoryPhoto(loaded, tripID: tripID)
                if let previous = stagedPhotoFileName { try? store.removeMemoryPhoto(tripID: tripID, fileName: previous) }
                photoData = loaded
                stagedPhotoFileName = reference.fileName
                removePhoto = false
                persistDraft()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    @ViewBuilder
    private func memoryRow(index: Int, entry: [String: Any]) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button { beginEditing(index: index, entry: entry) } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(entry["title"] as? String ?? "제목 없음").font(.headline)
                    if let date = entry["date"] as? String, !date.isEmpty {
                        Text(date).font(.caption).foregroundStyle(.secondary)
                    }
                    if let body = entry["body"] as? String, !body.isEmpty {
                        Text(body).lineLimit(3)
                    }
                    if let image = image(for: entry) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 72, height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else if entry["imageFileName"] != nil || entry["imageDataUrl"] != nil {
                        Label("사진 첨부됨", systemImage: "photo")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("memory-edit")

            Button(role: .destructive) { pendingDeleteIndex = index } label: {
                Image(systemName: "trash")
            }
            .accessibilityLabel("기록 삭제")
            .accessibilityIdentifier("memory-delete")
        }
        .padding(.vertical, 3)
    }

    private func save() {
        guard let trip else { return }
        let trimmedDate = date.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            if let editingIndex, entries.indices.contains(editingIndex), let editingExpected {
                let entry = entries[editingIndex]
                var changes: [String: Any] = ["date": trimmedDate, "title": trimmedTitle, "body": trimmedBody]
                if let stagedPhotoFileName {
                    changes["imageFileName"] = stagedPhotoFileName
                    changes["imageDataUrl"] = NSNull()
                } else if let photoData {
                    let reference = try store.stageMemoryPhoto(photoData, tripID: trip.id)
                    changes["imageFileName"] = reference.fileName
                    changes["imageDataUrl"] = NSNull()
                } else if removePhoto {
                    changes["imageFileName"] = NSNull()
                    changes["imageDataUrl"] = NSNull()
                }
                try store.applyMemoryChange(
                    tripID: trip.id,
                    change: .editJournal(selector: selector(for: entry, index: editingIndex), changes: changes, expected: editingExpected)
                )
                discardDraft(preserving: stagedPhotoFileName)
            } else {
                let id = UUID().uuidString
                let now = floor(Date().timeIntervalSince1970 * 1000)
                var entry: [String: Any] = [
                    "id": id,
                    "date": trimmedDate,
                    "title": trimmedTitle,
                    "body": trimmedBody,
                    "createdAt": now,
                    "updatedAt": now
                ]
                if let stagedPhotoFileName {
                    entry["imageFileName"] = stagedPhotoFileName
                } else if let photoData {
                    entry["imageFileName"] = try store.stageMemoryPhoto(photoData, tripID: trip.id).fileName
                }
                try store.applyMemoryChange(tripID: trip.id, change: .addJournal(operationID: UUID().uuidString, entry: entry))
                discardDraft(preserving: stagedPhotoFileName)
            }
            resetForm()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func beginEditing(index: Int, entry: [String: Any]) {
        draftPersistenceEnabled = false
        if let stagedPhotoFileName { try? store.removeMemoryPhoto(tripID: tripID, fileName: stagedPhotoFileName) }
        editingIndex = index
        editingExpected = entry
        draftID = "edit:" + ((entry["id"] as? String) ?? "index-(index)")
        date = entry["date"] as? String ?? ""
        title = entry["title"] as? String ?? ""
        bodyText = entry["body"] as? String ?? ""
        photoItem = nil
        photoData = nil
        stagedPhotoFileName = nil
        removePhoto = false
        error = nil
        Task { @MainActor in
            draftPersistenceEnabled = true
            persistDraft()
        }
    }

    private func clearFields(removeStagedPhoto: Bool = true) {
        if removeStagedPhoto, let stagedPhotoFileName { try? store.removeMemoryPhoto(tripID: tripID, fileName: stagedPhotoFileName) }
        date = ""
        title = ""
        bodyText = ""
        photoItem = nil
        photoData = nil
        stagedPhotoFileName = nil
        removePhoto = false
    }

    private func resetForm() {
        draftPersistenceEnabled = false
        clearFields(removeStagedPhoto: false)
        editingIndex = nil
        editingExpected = nil
        draftID = "new"
        error = nil
        Task { @MainActor in draftPersistenceEnabled = true }
    }

    private func remove(index: Int, entry: [String: Any]) {
        guard let trip else { return }
        do {
            try store.applyMemoryChange(tripID: trip.id, change: .removeJournal(selector: selector(for: entry, index: index)))
            if editingIndex == index { discardDraft() }
            if editingIndex == index { resetForm() }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func selector(for row: [String: Any], index: Int) -> MemoryRowSelector {
        if let id = row["id"] as? String {
            return MemoryRowSelector(key: .string(id), index: nil, expected: row, expectedRows: nil)
        }
        if let number = row["id"] as? NSNumber {
            return MemoryRowSelector(key: .integer(number.intValue), index: index, expected: row, expectedRows: entries)
        }
        return MemoryRowSelector(key: nil, index: index, expected: row, expectedRows: entries)
    }

    private func image(for entry: [String: Any]) -> UIImage? {
        if let fileName = entry["imageFileName"] as? String, let data = store.memoryPhotoData(tripID: tripID, fileName: fileName) {
            return UIImage(data: data)
        }
        if let dataURL = entry["imageDataUrl"] as? String {
            let encoded = dataURL.components(separatedBy: ",").last ?? dataURL
            if let data = Data(base64Encoded: encoded) { return UIImage(data: data) }
        }
        return nil
    }

    private func restoreDraft() {
        draftPersistenceEnabled = false
        guard let draft = try? store.loadJournalDraft(tripID: tripID, draftID: "new") else {
            Task { @MainActor in draftPersistenceEnabled = true }
            return
        }
        apply(draft: draft)
        Task { @MainActor in draftPersistenceEnabled = true }
    }

    private func apply(draft: JournalEditorDraft) {
        draftID = draft.draftID
        date = draft.date
        title = draft.title
        bodyText = draft.body
        removePhoto = draft.removePhoto
        stagedPhotoFileName = draft.stagedPhotoFileName
        if let fileName = draft.stagedPhotoFileName {
            photoData = store.memoryPhotoData(tripID: tripID, fileName: fileName)
            if photoData == nil { stagedPhotoFileName = nil }
        }
        guard draft.mode == .edit, let entryID = draft.entryID,
              let index = entries.firstIndex(where: { ($0["id"] as? String) == entryID }) else { return }
        editingIndex = index
        editingExpected = entries[index]
    }

    private func persistDraft() {
        guard draftPersistenceEnabled else { return }
        let hasDraft = isEditing || !date.isEmpty || !title.isEmpty || !bodyText.isEmpty || removePhoto || stagedPhotoFileName != nil
        guard hasDraft else { return }
        let entryID = editingExpected?["id"] as? String
        let draft = JournalEditorDraft(
            tripID: tripID,
            draftID: draftID,
            mode: isEditing ? .edit : .new,
            entryID: entryID,
            date: date,
            title: title,
            body: bodyText,
            removePhoto: removePhoto,
            stagedPhotoFileName: stagedPhotoFileName,
            updatedAt: Date().timeIntervalSince1970 * 1000
        )
        do {
            try store.saveJournalDraft(draft)
            if isEditing { try store.saveJournalDraft(draft, draftIDOverride: "new") }
        }
        catch { self.error = "작성 중인 기록을 임시 저장하지 못했어요." }
    }

    private func discardDraft(preserving stagedPhotoFileName: String? = nil) {
        guard let trip else { return }
        try? store.discardJournalDraft(tripID: trip.id, draftID: draftID, preserving: stagedPhotoFileName)
    }

    @ViewBuilder
    private func photoPreview(data: Data) -> some View {
        if let image = UIImage(data: data) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 160)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            Label("사진을 읽을 수 없습니다.", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.secondary)
        }
    }
}
