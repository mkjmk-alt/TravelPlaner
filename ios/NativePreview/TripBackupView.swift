import SwiftUI
import UniformTypeIdentifiers
import NativeCore

struct TripBackupView: View {
    @EnvironmentObject private var store: NativeTripStore
    @State private var importing = false
    @State private var exporting = false
    @State private var busy = false
    @State private var error: String?
    @State private var message: String?
    @State private var preview: ImportPreview?
    @State private var selectedTrip: String
    @State private var file = TripBackupFile(data: Data())
    @State private var filename = "trip-backup.json"
    init(tripID: String = "") { _selectedTrip = State(initialValue: tripID) }

    var body: some View {
        Form {
            Section("여행 백업 가져오기") {
                Button("JSON 파일 선택") { message = nil; error = nil; importing = true }.accessibilityIdentifier("backupImport").disabled(busy)
                Text("웹·기존 앱에서 내보낸 여행 1개의 JSON 파일을 선택해주세요. 전역 즐겨찾기와 계정 전체는 포함되지 않습니다.").font(.footnote)
                Text("최대 20 MiB · 장소 10,000개 · 원본 파일은 이 기기 내부에 보존").font(.caption).foregroundStyle(.secondary)
            }
            if busy { ProgressView("처리 중…") }
            if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("import-error") }
            if let message { Text(message).foregroundStyle(.green).accessibilityIdentifier("backup-result") }
            if let preview {
                Section("가져오기 미리보기") {
                    Text(preview.candidate.trip.name).font(.headline).accessibilityIdentifier("import-preview")
                    Text("\(preview.candidate.trip.country) · \(preview.candidate.trip.startDate) ~ \(preview.candidate.trip.endDate)")
                    let trip = preview.candidate.trip
                    Text("일정 \(trip.days.reduce(0) { $0 + ($1["items"] as? [Any] ?? []).count })곳 · 예비 \((trip.raw["reserveItems"] as? [Any] ?? []).count)곳 · 지출 \((trip.raw["expenses"] as? [Any] ?? []).count)건")
                    Text(dispositionText(preview.disposition))
                    ForEach(Array(preview.candidate.warnings.prefix(100).enumerated()), id: \.offset) { _, warning in Text(warning).font(.caption).foregroundStyle(.secondary) }
                    if preview.candidate.warnings.count > 100 { Text("그 외 \(preview.candidate.warnings.count - 100)개 누락 항목을 보완했습니다.").font(.caption) }
                    Button("취소", role: .cancel) { self.preview = nil }.disabled(busy)
                    Button(confirmTitle(preview.disposition)) { confirm(preview) }
                        .accessibilityIdentifier(preview.disposition == .conflict ? "keepBothImport" : "confirmImport").disabled(busy)
                }
            }
            Section("여행 백업 내보내기") {
                Text("전역 저장 장소는 포함되지 않습니다. 새 Google 검색 장소는 직접 입력한 이름·메모와 장소 ID만 내보냅니다. 현재 웹 가져오기는 이 참조의 지도 위치를 자동 복원하지 않습니다.").font(.footnote)
                Picker("대상 여행", selection: $selectedTrip) {
                    Text("여행 선택").tag("")
                    ForEach(store.trips) { Text($0.name).tag($0.id) }
                }.accessibilityIdentifier("backupTripSelection")
                Button("JSON 파일로 내보내기") {
                    guard let trip = store.trips.first(where: { $0.id == selectedTrip }) else { return }
                    busy = true; error = nil; message = nil
                    Task {
                        do {
                            let data = try store.memoryBackupData(tripID: trip.id)
                            file = .init(data: data); filename = TripBackup.filename(trip.name); exporting = true
                        } catch { self.error = error.localizedDescription }
                        busy = false
                    }
                }.disabled(busy || !store.trips.contains { $0.id == selectedTrip }).accessibilityIdentifier("backupExport")
                Text("공유 연결과 관리 권한 정보는 내보내지 않습니다.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("여행 백업").navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
            switch result {
            case .success(let url):
                busy = true; preview = nil
                Task {
                    do { preview = try await store.prepareImport(url: url) } catch { self.error = error.localizedDescription }
                    busy = false
                }
            case .failure(let issue): if (issue as NSError).code != NSUserCancelledError { error = issue.localizedDescription }
            }
        }
        .fileExporter(isPresented: $exporting, document: file, contentType: .json, defaultFilename: filename) { result in
            switch result {
            case .success: message = "선택한 위치에 백업을 저장했습니다."
            case .failure(let issue): if (issue as NSError).code != NSUserCancelledError { error = issue.localizedDescription }
            }
        }
    }
    private func confirm(_ preview: ImportPreview) {
        busy = true; error = nil
        let decision: ImportDecision = preview.disposition == .conflict ? .keepBoth : preview.disposition == .previouslyDeleted ? .restoreDeleted : .confirmNew
        Task {
            do {
                let outcome = try await store.commitImport(preview, decision: decision)
                message = outcome.alreadyImported ? "이미 가져온 여행입니다. 이후 수정한 내용은 그대로 유지했습니다." : "여행을 기기에 저장했습니다. 내 여행에서 확인할 수 있어요."
                self.preview = nil
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
    private func confirmTitle(_ disposition: ImportDisposition) -> String {
        switch disposition { case .conflict: return "별도 여행으로 가져오기"; case .previouslyDeleted: return "새 여행으로 복원"; case .alreadyImported: return "가져온 여행 확인"; default: return "확인 후 가져오기" }
    }
    private func dispositionText(_ disposition: ImportDisposition) -> String {
        switch disposition {
        case .conflict: return "동일한 ID의 다른 여행이 있습니다. 취소하거나 별도 여행으로 보관할 수 있습니다. 기존 여행은 덮어쓰지 않습니다."
        case .previouslyDeleted: return "이전에 가져온 여행이 삭제되었습니다. 명시적으로 복원하면 새 여행으로 저장합니다."
        case .alreadyImported: return "이미 가져온 파일입니다. 여행을 중복 생성하거나 이후 수정한 내용을 덮어쓰지 않습니다."
        case .identicalExisting: return "기존 여행과 같습니다. 중복 여행 없이 가져오기 이력만 저장합니다."
        case .newTrip: return "확인하면 새 여행을 저장합니다."
        }
    }
}
