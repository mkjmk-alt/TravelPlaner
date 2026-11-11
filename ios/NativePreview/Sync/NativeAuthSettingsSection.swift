import SwiftUI

struct NativeAuthSettingsSection: View {
    @EnvironmentObject private var auth: NativeAuthStore
    @EnvironmentObject private var store: NativeTripStore
    @EnvironmentObject private var syncCoordinator: NativeSyncCoordinator
    @State private var showingAuth = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: auth.userID == nil ? "person.crop.circle" : "checkmark.shield.fill")
                    .font(.title3)
                    .foregroundStyle(NativePreviewTheme.primary)
                    .frame(width: 40, height: 40)
                    .background(NativePreviewTheme.primaryContainer, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text("계정 및 동기화")
                        .font(.headline)
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                        .accessibilityIdentifier("syncAccountHeading")
                    Text(auth.email ?? (auth.isConfigured ? "로그인하지 않음" : "설정 필요"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NativePreviewTheme.textMuted)
                }
                Spacer(minLength: 8)
                if auth.userID != nil {
                    Button("로그아웃") {
                        Task { await auth.signOut() }
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("syncLogoutButton")
                } else {
                    Button("로그인") { showingAuth = true }
                        .buttonStyle(.borderedProminent)
                        .tint(NativePreviewTheme.primary)
                        .disabled(!auth.isConfigured || auth.isLoading)
                        .accessibilityIdentifier("syncLoginButton")
                }
            }

            if !auth.isConfigured {
                Text("이 앱 빌드에는 Supabase 프로젝트 URL과 공개 키가 설정되지 않았습니다. 웹과 같은 Supabase 프로젝트를 연결해 다시 빌드해야 로그인할 수 있어요.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .accessibilityIdentifier("syncConfigurationMissing")
            } else if auth.userID != nil {
                VStack(alignment: .leading, spacing: 10) {
                    if let error = syncCoordinator.errorMessage {
                        Label(error, systemImage: "exclamationmark.icloud.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.favoritesAccent)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("syncErrorMessage")
                    } else if let status = syncCoordinator.statusMessage {
                        Label(status, systemImage: "checkmark.icloud.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.budgetAccent)
                            .accessibilityIdentifier("syncStatusMessage")
                    } else if let lastSyncedAt = syncCoordinator.lastSyncedAt {
                        Text("마지막 동기화 · \(lastSyncedAt.formatted(date: .omitted, time: .shortened))")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.textMuted)
                    } else {
                        Text("로그인한 계정의 여행·저장 장소를 확인합니다.")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.textMuted)
                    }
                    Button {
                        guard let userID = auth.userID else { return }
                        Task { await syncCoordinator.userRequestedSync(userID: userID) }
                    } label: {
                        Label(syncCoordinator.isManualSyncing ? "동기화 중…" : "지금 동기화",
                              systemImage: syncCoordinator.isManualSyncing ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(NativePreviewTheme.primary)
                    .disabled(syncCoordinator.isManualSyncing)
                    .accessibilityIdentifier("syncNowButton")

                    if syncCoordinator.shouldMigrateWebData {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("웹에 저장된 기존 여행이 있다면 웹에서 한 번 가져와야 이 앱에서도 사용할 수 있어요.")
                                .font(.footnote)
                                .foregroundStyle(NativePreviewTheme.textMuted)
                                .fixedSize(horizontal: false, vertical: true)
                            Link(destination: URL(string: "https://travelplaner-545.pages.dev/")!) {
                                Label("웹에서 기존 자료 가져오기", systemImage: "globe")
                                    .font(.footnote.weight(.semibold))
                            }
                            .accessibilityIdentifier("syncWebMigrationLink")
                        }
                        .accessibilityIdentifier("syncWebMigrationHint")
                    }

                    if store.pendingSyncOperationCount > 0 {
                        Text("전송 대기 중인 변경 \(store.pendingSyncOperationCount)건")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.textMuted)
                            .accessibilityIdentifier("syncPendingCount")
                    }
                    if let warning = store.syncWarningMessage {
                        Label(warning, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(NativePreviewTheme.mapAccent)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("syncSafetyWarning")
                    }
                    if !store.syncConflicts.isEmpty, let userID = auth.userID {
                        NavigationLink {
                            SyncConflictView(userID: userID)
                        } label: {
                            Label("동기화 충돌 확인 · \(store.syncConflicts.count)건", systemImage: "arrow.triangle.branch")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .accessibilityIdentifier("syncConflictLink")
                    }
                }
            } else {
                Text("로그인하면 이 계정의 동기화를 연결할 수 있습니다.")
                    .font(.subheadline)
                    .foregroundStyle(NativePreviewTheme.textMuted)
            }

            if let message = auth.statusMessage {
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(NativePreviewTheme.budgetAccent)
            }
            if let error = auth.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(NativePreviewTheme.favoritesAccent)
            }

            Text(auth.userID == nil
                 ? "이 기기에 저장된 여행 \(store.trips.count)개는 로그인이나 로그아웃으로 삭제되지 않습니다. 로그인하지 않은 동안 새로 만든 여행은 이 기기에만 저장됩니다."
                 : "이 기기의 기존 로컬 초안은 로그인해도 자동 업로드하지 않습니다. 계정 데이터와 겹치는 항목은 안전 확인 전까지 보존합니다.")
                .font(.footnote)
                .foregroundStyle(NativePreviewTheme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("localOnlyStatus")
        }
        .nativeCard()
        .sheet(isPresented: $showingAuth) {
            NativeAuthSheet()
                .environmentObject(auth)
        }
    }
}

struct NativeAuthSheet: View {
    @EnvironmentObject private var auth: NativeAuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false
    @State private var showsPassword = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case email, password }
    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !auth.isLoading
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: "airplane.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(NativePreviewTheme.primary)
                        Text(isCreatingAccount ? "TripPlot 시작하기" : "TripPlot에 로그인")
                            .font(.title2.bold())
                            .foregroundStyle(NativePreviewTheme.textPrimary)
                        Text("로그인하고 여행을 여러 기기에서 이어가세요.")
                            .font(.subheadline)
                            .foregroundStyle(NativePreviewTheme.textMuted)
                    }

                    Button {
                        focusedField = nil
                        Task { await auth.signInWithGoogle() }
                    } label: {
                        HStack(spacing: 10) {
                            Text("G").font(.headline.bold()).foregroundStyle(NativePreviewTheme.mapAccent)
                            Text("Google로 계속하기").font(.headline)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(NativePreviewTheme.textPrimary)
                        .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(NativePreviewTheme.outline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(auth.isLoading)
                    .accessibilityIdentifier("syncGoogleSignIn")

                    HStack {
                        Rectangle().fill(NativePreviewTheme.outline).frame(height: 1)
                        Text("또는 이메일로").font(.caption.weight(.semibold)).foregroundStyle(NativePreviewTheme.textMuted)
                        Rectangle().fill(NativePreviewTheme.outline).frame(height: 1)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("이메일").font(.subheadline.weight(.semibold)).foregroundStyle(NativePreviewTheme.textPrimary)
                        TextField("이메일 주소", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                            .accessibilityIdentifier("syncAuthEmail")
                            .padding(14)
                            .background(NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 12))
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("비밀번호").font(.subheadline.weight(.semibold)).foregroundStyle(NativePreviewTheme.textPrimary)
                        HStack {
                            Group {
                                if showsPassword {
                                    TextField("비밀번호", text: $password)
                                } else {
                                    SecureField("비밀번호", text: $password)
                                }
                            }
                            .textContentType(isCreatingAccount ? .newPassword : .password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .password)
                            .submitLabel(.done)
                            .accessibilityIdentifier("syncAuthPassword")
                            Button { showsPassword.toggle() } label: {
                                Image(systemName: showsPassword ? "eye.slash" : "eye")
                                    .foregroundStyle(NativePreviewTheme.textMuted)
                            }
                            .accessibilityLabel(showsPassword ? "비밀번호 숨기기" : "비밀번호 보기")
                        }
                        .padding(14)
                        .background(NativePreviewTheme.surfaceLow, in: RoundedRectangle(cornerRadius: 12))
                    }

                    if let message = auth.statusMessage {
                        Label(message, systemImage: "checkmark.circle.fill")
                            .font(.footnote).foregroundStyle(NativePreviewTheme.budgetAccent)
                    }
                    if let error = auth.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.footnote).foregroundStyle(NativePreviewTheme.favoritesAccent)
                    }
                    if auth.isLoading { ProgressView("계정 확인 중…") }

                    Button(isCreatingAccount ? "회원가입" : "로그인") {
                        focusedField = nil
                        Task {
                            let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
                            if isCreatingAccount {
                                await auth.signUp(email: trimmed, password: password)
                            } else {
                                await auth.signIn(email: trimmed, password: password)
                            }
                        }
                    }
                    .nativePrimaryButton()
                    .opacity(canSubmit ? 1 : 0.55)
                    .disabled(!canSubmit)
                    .accessibilityIdentifier("syncAuthSubmit")

                    Button(isCreatingAccount ? "이미 계정이 있어요 · 로그인" : "계정이 없어요 · 회원가입") {
                        isCreatingAccount.toggle()
                        auth.clearMessage()
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NativePreviewTheme.primary)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("syncAuthModeToggle")
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .background(NativePreviewTheme.background)
            .navigationTitle(isCreatingAccount ? "회원가입" : "로그인")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기") { dismiss() }
                }
            }
            .onChange(of: auth.userID) { userID in
                if userID != nil { dismiss() }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}
