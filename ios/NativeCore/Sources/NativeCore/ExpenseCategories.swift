import Foundation
public enum ExpenseCategories {
    public static let all: [(id: String, label: String)] = [
        ("food", "🍽️ 식비"), ("cafe", "☕ 카페·간식"), ("transport", "🚕 교통"),
        ("lodging", "🛏️ 숙박"), ("flight", "✈️ 항공"), ("sightseeing", "🎟️ 관광"),
        ("activity", "🎢 액티비티·체험"), ("shopping", "🛍️ 쇼핑"), ("essentials", "🧴 생활·편의"),
        ("medical", "💊 의료·약국"), ("communication", "📶 통신"), ("insurance", "🛡️ 보험"), ("other", "🧾 기타")
    ]
    public static func normalize(_ value: String) -> String { value == "stay" ? "lodging" : (value.isEmpty ? "other" : value) }
}
