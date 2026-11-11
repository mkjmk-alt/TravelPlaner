import Foundation
import Combine
import AuthenticationServices
import UIKit
import NativeCore
import Supabase

@MainActor
final class NativeAuthStore: ObservableObject {
    @Published private(set) var userID: String?
    @Published private(set) var email: String?
    @Published private(set) var isConfigured = false
    @Published private(set) var isLoading = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private let client: SupabaseClient?
    private let configuredURL: URL?
    private let configuredAnonKey: String?
    private var authEventsTask: Task<Void, Never>?
    private let presentationContext = NativeAuthPresentationContext()

    private static let callbackURL = URL(string: "travelplaner://auth/callback")!

    init(bundle: Bundle = .main) {
        let rawURL = bundle.object(forInfoDictionaryKey: "TripPlotSupabaseURL") as? String
        let rawKey = bundle.object(forInfoDictionaryKey: "TripPlotSupabaseAnonKey") as? String
        guard let rawURL, let url = URL(string: rawURL),
              url.scheme == "https", url.host != nil,
              let rawKey, !rawKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !rawKey.contains("YOUR_PUBLIC") else {
            client = nil
            configuredURL = nil
            configuredAnonKey = nil
            return
        }

        configuredURL = url
        configuredAnonKey = rawKey
        let client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: rawKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(flowType: .pkce)
            )
        )
        self.client = client
        isConfigured = true

        authEventsTask = Task { [weak self] in
            for await (_, session) in client.auth.authStateChanges {
                guard !Task.isCancelled else { break }
                self?.updateSession(session)
            }
        }
    }

    deinit {
        authEventsTask?.cancel()
    }

    func signIn(email: String, password: String) async {
        await performAuthAction {
            try await self.client?.auth.signIn(email: email, password: password)
            self.statusMessage = "로그인되었습니다. 계정 데이터를 확인합니다."
        }
    }

    func signUp(email: String, password: String) async {
        await performAuthAction {
            let response = try await self.client?.auth.signUp(email: email, password: password)
            if response?.session == nil {
                self.statusMessage = "가입 확인 메일을 확인한 뒤 로그인해 주세요."
            } else {
                self.statusMessage = "가입 및 로그인이 완료되었습니다. 계정 데이터를 확인합니다."
            }
        }
    }

    func signInWithGoogle() async {
        guard let client else {
            errorMessage = NativeAuthError.configurationMissing.localizedDescription
            return
        }
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        statusMessage = nil
        defer { isLoading = false }
        do {
            let presentationContext = self.presentationContext
            let session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: Self.callbackURL) { session in
                session.presentationContextProvider = presentationContext
            }
            updateSession(session)
            statusMessage = "로그인되었습니다. 계정 데이터를 확인합니다."
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            statusMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func makeSyncTransport(for userID: String) async throws -> SyncTransport {
        guard let client, let configuredURL, let configuredAnonKey else {
            throw NativeAuthError.configurationMissing
        }
        let session = try await client.auth.session
        let sessionUserID = session.user.id.uuidString.lowercased()
        guard sessionUserID == userID.lowercased() else { throw SyncError.accountMismatch }
        let sessionToken = session.accessToken
        let accountBoundClient = SupabaseClient(
            supabaseURL: configuredURL,
            supabaseKey: configuredAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(accessToken: { sessionToken })
            )
        )
        return SupabaseSyncTransport(client: accountBoundClient, sessionUserID: sessionUserID)
    }

    // Realtime is only an invalidation signal. The authenticated sync transport
    // performs the actual read and preserves queued edits and conflict checks.
    func listenForAccountChanges(userID: String, onConnection: @escaping @MainActor (Bool) -> Void, onChange: @escaping @MainActor () -> Void) async throws {
        guard let client else { throw NativeAuthError.configurationMissing }
        let session = try await client.auth.session
        guard session.user.id.uuidString.lowercased() == userID.lowercased(), self.userID == userID else {
            throw SyncError.accountMismatch
        }
        let channel = client.channel("account-sync-\(userID)")
        let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "user_sync_records", filter: .eq("user_id", value: userID))
        let statuses = channel.statusChange
        let statusTask = Task {
            for await status in statuses {
                guard !Task.isCancelled, self.userID == userID else { break }
                if case .subscribed = status { onConnection(true); onChange() } // Catch up after reconnect.
                else { onConnection(false) }
            }
        }
        defer { statusTask.cancel(); onConnection(false); Task { await client.removeChannel(channel) } }
        try await channel.subscribeWithError()
        guard !Task.isCancelled, self.userID == userID else { return }
        for await _ in changes {
            guard !Task.isCancelled, self.userID == userID else { break }
            onChange()
        }
    }

    func signOut() async {
        await performAuthAction {
            try await self.client?.auth.signOut()
            self.statusMessage = "로그아웃되었습니다. 이 기기의 여행 데이터는 삭제되지 않았습니다."
        }
    }

    func handleOpenURL(_ url: URL) {
        guard url.scheme == Self.callbackURL.scheme,
              url.host == Self.callbackURL.host,
              url.path == Self.callbackURL.path else { return }
        client?.handle(url)
    }

    func clearMessage() {
        statusMessage = nil
        errorMessage = nil
    }

    func reportError(_ error: Error) {
        errorMessage = error.localizedDescription
    }

    private func updateSession(_ session: Session?) {
        let previousUserID = userID
        userID = session?.user.id.uuidString.lowercased()
        email = session?.user.email
        if session == nil, previousUserID != nil {
            statusMessage = "로그아웃되었습니다. 이 기기의 여행 데이터는 삭제되지 않았습니다."
        }
    }

    private func performAuthAction(_ action: () async throws -> Void) async {
        guard isConfigured else {
            errorMessage = NativeAuthError.configurationMissing.localizedDescription
            return
        }
        isLoading = true
        errorMessage = nil
        statusMessage = nil
        defer { isLoading = false }
        do {
            try await action()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
private final class NativeAuthPresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.filter { $0.activationState == .foregroundActive }.flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first ?? ASPresentationAnchor()
    }
}

private enum NativeAuthError: LocalizedError {
    case configurationMissing

    var errorDescription: String? {
        switch self {
        case .configurationMissing:
            "Supabase 공개 URL과 anon/publishable key를 NativeSync.local.xcconfig에 설정해 주세요."
        }
    }
}
