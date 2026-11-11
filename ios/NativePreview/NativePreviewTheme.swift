import SwiftUI
import UIKit

// Mirrors the semantic roles in Android nativepreview's lightColors/darkColors.
enum NativePreviewTheme {
    static let primary = adaptive(light: 0x8B5CF6, dark: 0xA78BFA)
    static let primaryContainer = adaptive(light: 0xF5F3FF, dark: 0x38245C)
    static let tripRequiredAccent = adaptive(light: 0x7C3AED, dark: 0xA78BFA)
    static let tripRequiredContainer = adaptive(light: 0xF5F3FF, dark: 0x38245C)
    static let tripRequiredIconContainer = adaptive(light: 0xEDE9FE, dark: 0x493377)
    static let tripRequiredOutline = adaptive(light: 0xDDD6FE, dark: 0x59458A)
    static let secondaryContainer = adaptive(light: 0xF5F3FF, dark: 0x38245C)
    static let favoritesAccent = adaptive(light: 0xE11D48, dark: 0xFDA4AF)
    static let favoritesContainer = adaptive(light: 0xFFF1F2, dark: 0x4C1D2B)
    static let budgetAccent = adaptive(light: 0x0F766E, dark: 0x5EEAD4)
    static let budgetContainer = adaptive(light: 0xF0FDFA, dark: 0x123B3A)
    static let memoryAccent = adaptive(light: 0x0284C7, dark: 0x7DD3FC)
    static let memoryContainer = adaptive(light: 0xF0F9FF, dark: 0x12344A)
    static let moreAccent = adaptive(light: 0x475569, dark: 0xCBD5E1)
    static let moreContainer = adaptive(light: 0xF1F5F9, dark: 0x334155)
    static let mapAccent = adaptive(light: 0x2563EB, dark: 0x60A5FA)
    static let mapAccentContainer = adaptive(light: 0xEFF6FF, dark: 0x1E3A5F)
    static let background = adaptive(light: 0xFFFFFF, dark: 0x0F172A)
    static let card = adaptive(light: 0xFFFFFF, dark: 0x1E293B)
    static let surfaceLow = adaptive(light: 0xF8FAFC, dark: 0x1E293B)
    static let textPrimary = adaptive(light: 0x0F172A, dark: 0xF8FAFC)
    static let textMuted = adaptive(light: 0x64748B, dark: 0x94A3B8)
    static let outline = adaptive(light: 0xE2E8F0, dark: 0x334155)
    static let emptyStateIcon = adaptive(light: 0xE5E7EB, dark: 0x475569)
    static let emptyStateTitle = adaptive(light: 0x9CA3AF, dark: 0x94A3B8)
    static let emptyStateDescription = adaptive(light: 0x94A3B8, dark: 0x64748B)
    static let emptyStateOutline = adaptive(light: 0xF3F4F6, dark: 0x334155)
    static let onPrimary = adaptive(light: 0xFFFFFF, dark: 0x1E1B4B)
    static let featuredGradientStart = adaptive(light: 0x6D28D9, dark: 0x5B21B6)
    static let featuredGradientEnd = adaptive(light: 0x4F46E5, dark: 0x4338CA)

    static let screenPadding: CGFloat = 20
    static let sectionSpacing: CGFloat = 24
    static let primaryButtonHeight: CGFloat = 54
    static let featuredCardRadius: CGFloat = 26
    static let cardRadius: CGFloat = 21

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((rgb >> 16) & 0xFF) / 255,
                green: CGFloat((rgb >> 8) & 0xFF) / 255,
                blue: CGFloat(rgb & 0xFF) / 255,
                alpha: 1
            )
        })
    }
}

struct NativeBrandHeader: View {
    let isSignedIn: Bool
    let onAccountAction: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("TripPlot")
                    .font(.system(size: 23, weight: .black, design: .rounded))
                    .tracking(-1.1)
                    .foregroundStyle(NativePreviewTheme.textPrimary)
                Text("여행 일정 플래너")
                    .font(.system(size: 9, weight: .heavy))
                    .tracking(1.1)
                    .foregroundStyle(NativePreviewTheme.mapAccent)
            }
            Spacer(minLength: 8)

            Button(action: onAccountAction) {
                Label(isSignedIn ? "계정" : "로그인 / 회원가입",
                      systemImage: isSignedIn ? "person.crop.circle" : "lock")
                    .font(.system(size: 12, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .foregroundStyle(NativePreviewTheme.textMuted)
                    .background(NativePreviewTheme.card, in: Capsule())
                    .overlay(Capsule().stroke(NativePreviewTheme.outline, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("brandAccountAction")
        }
        .padding(.horizontal, NativePreviewTheme.screenPadding)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(NativePreviewTheme.background)
        .overlay(alignment: .bottom) {
            Rectangle().fill(NativePreviewTheme.outline).frame(height: 1)
        }
    }
}

extension View {
    func nativeCard(padding: CGFloat = 18) -> some View {
        self.padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NativePreviewTheme.card, in: RoundedRectangle(cornerRadius: NativePreviewTheme.cardRadius))
            .overlay(RoundedRectangle(cornerRadius: NativePreviewTheme.cardRadius)
                .stroke(NativePreviewTheme.outline, lineWidth: 1))
    }

    func nativePrimaryButton(accent: Color = NativePreviewTheme.primary) -> some View {
        self.font(.headline)
            .frame(maxWidth: .infinity, minHeight: NativePreviewTheme.primaryButtonHeight)
            .foregroundStyle(NativePreviewTheme.onPrimary)
            .background(accent, in: RoundedRectangle(cornerRadius: 18))
    }
}
