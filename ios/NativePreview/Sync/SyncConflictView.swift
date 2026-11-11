import SwiftUI
import NativeCore

struct SyncConflictView: View {
    let userID: String
    @EnvironmentObject private var store: NativeTripStore
    @EnvironmentObject private var syncCoordinator: NativeSyncCoordinator

    var body: some View {
        List {
            Section {
                Text("서버와 이 기기의 내용이 달라 두 버전을 보존했습니다. 사용할 버전을 직접 선택하세요.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)
            }

            ForEach(store.syncConflicts.filter { $0.operation.userID == userID }, id: \.id) { conflict in
                NavigationLink {
                    SyncConflictDetailView(conflict: conflict, userID: userID)
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(conflictTitle(conflict))
                            .font(.headline)
                            .foregroundStyle(NativePreviewTheme.textPrimary)
                        Text("\(conflict.operation.recordType.rawValue == "trip" ? "여행" : "저장 장소") · 로컬과 서버 내용을 비교하세요")
                            .font(.caption)
                            .foregroundStyle(NativePreviewTheme.textMuted)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(NativePreviewTheme.background)
        .navigationTitle("동기화 충돌")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("syncConflictList")
    }

    private func conflictTitle(_ conflict: SyncConflict) -> String {
        conflict.operation.payload?["name"] as? String
            ?? conflict.serverRecord.payload?["name"] as? String
            ?? "이름 없는 항목"
    }
}

private struct SyncConflictDetailView: View {
    let conflict: SyncConflict
    let userID: String
    @EnvironmentObject private var syncCoordinator: NativeSyncCoordinator

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("두 버전을 확인한 후 유지할 내용을 선택하세요. 선택 전까지 둘 다 보존됩니다.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)

                versionCard(title: "이 기기의 변경", payload: conflict.operation.payload,
                            deletedAt: conflict.operation.deletedAt)
                versionCard(title: "서버의 현재 내용", payload: conflict.serverRecord.payload,
                            deletedAt: conflict.serverRecord.deletedAt)

                Button {
                    syncCoordinator.acceptRemote(conflict, userID: userID)
                } label: {
                    Label("서버 버전 사용", systemImage: "icloud.and.arrow.down")
                        .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
                }
                .buttonStyle(.borderedProminent)
                .tint(NativePreviewTheme.primary)
                .accessibilityIdentifier("syncAcceptServer")

                Button {
                    syncCoordinator.keepLocal(conflictID: conflict.id)
                } label: {
                    Label("내 변경 다시 전송", systemImage: "arrow.clockwise.icloud")
                        .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
                }
                .buttonStyle(.bordered)
                .tint(NativePreviewTheme.primary)
                .accessibilityIdentifier("syncKeepLocal")

                if let error = syncCoordinator.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(NativePreviewTheme.favoritesAccent)
                        .accessibilityIdentifier("syncConflictError")
                }
            }
            .padding(NativePreviewTheme.screenPadding)
        }
        .background(NativePreviewTheme.background)
        .navigationTitle("버전 비교")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func versionCard(title: String, payload: [String: Any]?, deletedAt: Date?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
                .foregroundStyle(NativePreviewTheme.textPrimary)
            if let deletedAt {
                Text("삭제됨 · \(deletedAt.formatted(date: .abbreviated, time: .shortened))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativePreviewTheme.favoritesAccent)
            } else if let payload {
                if let name = payload["name"] as? String {
                    Text(name).font(.subheadline.weight(.bold)).foregroundStyle(NativePreviewTheme.textPrimary)
                }
                Text(prettyJSON(payload))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("표시할 데이터가 없습니다.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .nativeCard()
    }

    private func prettyJSON(_ value: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return "데이터를 표시할 수 없습니다." }
        return text
    }
}
