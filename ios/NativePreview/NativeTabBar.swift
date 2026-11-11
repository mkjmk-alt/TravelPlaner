import SwiftUI

struct NativeTabBar: View {
    @Binding var selection: String

    private let items: [(route: String, label: String, symbol: String)] = [
        ("trips", "내 여행", "airplane"),
        ("favorites", "저장", "heart"),
        ("budget", "예산·지출", "creditcard"),
        ("memory", "여행 기록", "doc.text"),
        ("more", "더보기", "line.3.horizontal")
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.route) { item in
                let selected = selection == item.route
                let colors = tabColors(for: item.route)
                Button { selection = item.route } label: {
                    VStack(spacing: 4) {
                        Image(systemName: selected && item.route == "favorites" ? "heart.fill" : item.symbol)
                            .font(.system(size: 22, weight: selected ? .semibold : .regular))
                            .frame(width: 64, height: 32)
                            .background(selected ? colors.container : .clear, in: Capsule())
                        Text(item.label)
                            .font(.caption2.weight(selected ? .semibold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(selected ? colors.accent : NativePreviewTheme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 62)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.label)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("tab-\(item.route)")
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .background(NativePreviewTheme.card)
        .overlay(alignment: .top) { NativePreviewTheme.outline.frame(height: 1) }
    }

    private func tabColors(for route: String) -> (accent: Color, container: Color) {
        switch route {
        case "favorites": return (NativePreviewTheme.favoritesAccent, NativePreviewTheme.favoritesContainer)
        case "budget": return (NativePreviewTheme.budgetAccent, NativePreviewTheme.budgetContainer)
        case "memory": return (NativePreviewTheme.memoryAccent, NativePreviewTheme.memoryContainer)
        case "more": return (NativePreviewTheme.moreAccent, NativePreviewTheme.moreContainer)
        default: return (NativePreviewTheme.primary, NativePreviewTheme.primaryContainer)
        }
    }
}
