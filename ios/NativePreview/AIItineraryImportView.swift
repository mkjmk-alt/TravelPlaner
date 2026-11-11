import SwiftUI
import UniformTypeIdentifiers
import UIKit
import NativeCore

struct AIItineraryImportView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    @FocusState private var editorFocused: Bool

    let onImported: (String) -> Void

    @State private var jsonText = ""
    @State private var preview: ImportPreview?
    @State private var error: String?
    @State private var message: String?
    @State private var isBusy = false
    @State private var choosingFile = false

    private let example = """
    {
      "name": "가을 오사카 여행",
      "country": "일본",
      "startDate": "2026-11-01",
      "endDate": "2026-11-03",
      "itinerary": [
        { "day": 1, "items": [
          { "name": "도톤보리", "displayName": "도톤보리 산책", "time": "18:00", "loc": "Dotonbori, Osaka" }
        ] },
        { "day": 2, "items": [] },
        { "day": 3, "items": [] }
      ]
    }
    """

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: NativePreviewTheme.sectionSpacing) {
                Text("AI로 일정 만들기")
                    .font(.title.bold())
                    .foregroundStyle(NativePreviewTheme.textPrimary)
                Text("예시를 복사해 현재 구독 중인 LLM에 여행 일정을 요청한 뒤, 받은 JSON을 붙여넣어 저장하세요.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)

                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("LLM용 예시 형식")
                                .font(.headline)
                                .foregroundStyle(NativePreviewTheme.mapAccent)
                            Text("예시 형식을 LLM에 전달하고, 결과는 JSON 코드만 요청하세요.")
                                .font(.footnote)
                                .foregroundStyle(NativePreviewTheme.textMuted)
                        }
                        Spacer(minLength: 4)
                        Button(action: copyExample) {
                            Label("예시 복사", systemImage: "doc.on.doc")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 11)
                                .frame(minHeight: 40)
                                .background(NativePreviewTheme.mapAccent, in: RoundedRectangle(cornerRadius: 12))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("copyAIItineraryExample")
                    }

                    Text(example)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                        .lineLimit(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(13)
                        .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: 14))
                }
                .nativeCard(padding: 16)

                VStack(alignment: .leading, spacing: 9) {
                    Text("사용 방법")
                        .font(.headline)
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                    instruction("예시 복사를 눌러 JSON 형식을 복사합니다.")
                    instruction("현재 구독 중인 LLM에 예시와 여행지·날짜·장소·방문 시간을 전달합니다.")
                    instruction("설명 없이 예시 구조를 따르는 JSON만 작성해 달라고 요청합니다.")
                    instruction("응답에서 JSON 코드만 복사해 아래 입력칸에 붙여넣고, 미리보기에서 확인합니다.")
                    Text("추천 문장: “아래 예시 JSON 형식을 유지해 여행 일정을 만들고 설명 없이 JSON 코드만 반환해줘.”")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(NativePreviewTheme.mapAccent)
                        .padding(.top, 2)
                }
                .nativeCard(padding: 16)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("일정 JSON")
                            .font(.headline)
                            .foregroundStyle(NativePreviewTheme.textPrimary)
                        Spacer()
                        Button("JSON 파일 선택") { choosingFile = true }
                            .font(.caption.weight(.semibold))
                            .accessibilityIdentifier("chooseAIItineraryFile")
                    }
                    TextEditor(text: $jsonText)
                        .focused($editorFocused)
                        .font(.system(size: 13, design: .monospaced))
                        .scrollContentBackground(.hidden)
                        .padding(8)
                        .frame(minHeight: 190)
                        .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: 15))
                        .overlay(RoundedRectangle(cornerRadius: 15).stroke(NativePreviewTheme.outline, lineWidth: 1))
                        .accessibilityLabel("일정 JSON 붙여넣기")
                        .accessibilityIdentifier("aiItineraryJSON")
                    Text("JSON은 이 기기에 저장되며, 기존 여행과 겹치면 별도 여행으로 보관할 수 있어요.")
                        .font(.footnote)
                        .foregroundStyle(NativePreviewTheme.textMuted)
                }

                if let message {
                    Label(message, systemImage: "checkmark.circle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(NativePreviewTheme.primary)
                        .accessibilityIdentifier("aiImportMessage")
                }
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("aiImportError")
                }
                if isBusy { ProgressView("일정을 확인하고 있어요…") }

                if let preview {
                    let placeCount = preview.candidate.trip.days.reduce(0) { total, day in
                        total + ((day["items"] as? [Any])?.count ?? 0)
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("가져오기 미리보기")
                            .font(.headline)
                        Text(preview.candidate.trip.name)
                            .font(.title3.bold())
                            .accessibilityIdentifier("aiImportPreviewName")
                        Text("\(preview.candidate.trip.country) · \(preview.candidate.trip.startDate) ~ \(preview.candidate.trip.endDate)")
                            .font(.subheadline)
                        Text("\(placeCount)개 장소 · \(preview.candidate.trip.dayCount)일")
                            .font(.subheadline)
                            .foregroundStyle(NativePreviewTheme.textMuted)
                        Text(dispositionText(preview.disposition))
                            .font(.footnote)
                            .foregroundStyle(NativePreviewTheme.textMuted)
                        ForEach(Array(preview.candidate.warnings.prefix(20).enumerated()), id: \.offset) { _, warning in
                            Text(warning).font(.caption).foregroundStyle(NativePreviewTheme.textMuted)
                        }
                    }
                    .nativeCard()
                }
            }
            .padding(.horizontal, NativePreviewTheme.screenPadding)
            .padding(.vertical, NativePreviewTheme.sectionSpacing)
        }
        .background(NativePreviewTheme.background)
        .navigationTitle("AI 일정")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("닫기") { dismiss() }
                    .accessibilityIdentifier("closeAIItineraryImport")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("완료") { editorFocused = false }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button {
                if preview == nil { makePreview() } else { confirmImport() }
            } label: {
                HStack(spacing: 8) {
                    if isBusy { ProgressView().tint(.white) }
                    Text(preview == nil ? "일정 가져오기" : confirmTitle(preview!.disposition))
                }
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
                .foregroundStyle(.white)
                .background(NativePreviewTheme.mapAccent, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
            .disabled(isBusy || (preview == nil && jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            .accessibilityIdentifier(preview == nil ? "importAIItinerary" : "confirmAIImport")
            .padding(.horizontal, NativePreviewTheme.screenPadding)
            .padding(.vertical, 10)
            .background(NativePreviewTheme.background.opacity(0.97))
            .overlay(alignment: .top) { NativePreviewTheme.outline.frame(height: 1) }
        }
        .fileImporter(isPresented: $choosingFile, allowedContentTypes: [.json, .data]) { result in
            switch result {
            case .success(let url):
                prepareFile(url)
            case .failure(let issue):
                if (issue as NSError).code != NSUserCancelledError { error = issue.localizedDescription }
            }
        }
    }

    private func instruction(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(NativePreviewTheme.mapAccent)
                .padding(.top, 3)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(NativePreviewTheme.textMuted)
        }
    }

    private func copyExample() {
        UIPasteboard.general.string = example
        message = "예시 JSON을 복사했습니다. LLM 대화창에 붙여넣어 주세요."
        error = nil
    }

    private func makePreview() {
        let source = jsonText.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: String
        if source.hasPrefix("```") {
            let lines = source.components(separatedBy: .newlines)
            guard lines.count >= 3, lines.last?.trimmingCharacters(in: .whitespacesAndNewlines) == "```" else {
                error = "코드 블록의 시작과 끝을 확인해주세요."
                return
            }
            body = lines.dropFirst().dropLast().joined(separator: "\n")
        } else {
            body = source
        }

        isBusy = true
        error = nil
        message = nil
        editorFocused = false
        Task {
            do {
                preview = try await store.prepareImport(data: Data(body.utf8))
            } catch {
                self.error = error.localizedDescription
                preview = nil
            }
            isBusy = false
        }
    }

    private func prepareFile(_ url: URL) {
        isBusy = true
        error = nil
        message = nil
        preview = nil
        Task {
            do { preview = try await store.prepareImport(url: url) }
            catch { self.error = error.localizedDescription }
            isBusy = false
        }
    }

    private func confirmImport() {
        guard let preview else { return }
        isBusy = true
        error = nil
        let decision: ImportDecision = preview.disposition == .conflict ? .keepBoth : preview.disposition == .previouslyDeleted ? .restoreDeleted : .confirmNew
        Task {
            do {
                let outcome = try await store.commitImport(preview, decision: decision)
                onImported(outcome.tripID)
            } catch {
                self.error = error.localizedDescription
            }
            isBusy = false
        }
    }

    private func confirmTitle(_ disposition: ImportDisposition) -> String {
        switch disposition {
        case .conflict: "별도 여행으로 저장"
        case .previouslyDeleted: "여행으로 복원"
        case .alreadyImported: "가져온 여행 확인"
        default: "확인 후 저장"
        }
    }

    private func dispositionText(_ disposition: ImportDisposition) -> String {
        switch disposition {
        case .conflict: "같은 ID의 다른 여행이 있어요. 기존 여행을 바꾸지 않고 별도 여행으로 저장합니다."
        case .previouslyDeleted: "이전에 가져온 여행이 삭제되어 새 여행으로 복원합니다."
        case .alreadyImported: "이미 가져온 JSON입니다. 기존의 이후 수정 내용은 덮어쓰지 않습니다."
        case .identicalExisting: "기존 여행과 같아 중복 생성하지 않습니다."
        case .newTrip: "확인하면 이 기기에 새 여행으로 저장합니다."
        }
    }
}
