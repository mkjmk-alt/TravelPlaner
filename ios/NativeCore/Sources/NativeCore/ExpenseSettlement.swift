import Foundation

public struct SettlementParticipant: Codable, Equatable, Identifiable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct SettlementExpense: Codable, Equatable, Identifiable {
    public let id: String
    public let amount: Double
    public let currency: String
    public let amountKRW: Int
    public let payerID: String
    public let participantIDs: [String]

    public init(id: String, amount: Double, currency: String, amountKRW: Int, payerID: String, participantIDs: [String]) {
        self.id = id
        self.amount = amount
        self.currency = currency
        self.amountKRW = amountKRW
        self.payerID = payerID
        self.participantIDs = participantIDs
    }
}

public struct PersonSettlement: Codable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let paidKRW: Int
    public let shareKRW: Int
    public let balanceKRW: Int

    public init(id: String, name: String, paidKRW: Int, shareKRW: Int, balanceKRW: Int) {
        self.id = id
        self.name = name
        self.paidKRW = paidKRW
        self.shareKRW = shareKRW
        self.balanceKRW = balanceKRW
    }
}

public struct SettlementTransfer: Codable, Equatable {
    public let fromID: String
    public let toID: String
    public let amountKRW: Int

    public init(fromID: String, toID: String, amountKRW: Int) {
        self.fromID = fromID
        self.toID = toID
        self.amountKRW = amountKRW
    }
}

public struct SettlementSummary: Codable, Equatable {
    public let people: [PersonSettlement]
    public let transfers: [SettlementTransfer]
    public let totalKRW: Int
    public let expenseCount: Int

    public init(people: [PersonSettlement], transfers: [SettlementTransfer], totalKRW: Int, expenseCount: Int) {
        self.people = people
        self.transfers = transfers
        self.totalKRW = totalKRW
        self.expenseCount = expenseCount
    }
}

public struct CashWallet: Codable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let currency: String
    public var initial: Int
    public var additional: Int
    public var actualRemaining: Int?

    public init(id: String, name: String, currency: String, initial: Int = 0, additional: Int = 0, actualRemaining: Int? = nil) {
        self.id = id
        self.name = name
        self.currency = currency
        self.initial = initial
        self.additional = additional
        self.actualRemaining = actualRemaining
    }
}

public struct CashWalletRemovalState: Equatable {
    public let wallets: [CashWallet]
    public let activeWalletID: String?
    public let cashLedgerCurrency: String

    public init(wallets: [CashWallet], activeWalletID: String?, cashLedgerCurrency: String) {
        self.wallets = wallets
        self.activeWalletID = activeWalletID
        self.cashLedgerCurrency = cashLedgerCurrency
    }
}

public enum ExpenseSettlement {
    public static func normalizeParticipants(_ source: [SettlementParticipant]) -> [SettlementParticipant] {
        var result = [SettlementParticipant(id: "self", name: "나")]
        var seen = Set(["self"])
        if let selfEntry = source.first(where: { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) == "self" }), !selfEntry.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            result[0] = SettlementParticipant(id: "self", name: selfEntry.name.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        for person in source {
            let id = person.id.trimmingCharacters(in: .whitespacesAndNewlines)
            let name = person.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty, !name.isEmpty, !seen.contains(id) else { continue }
            seen.insert(id)
            result.append(SettlementParticipant(id: id, name: name))
        }
        return result
    }

    public static func normalizeExpense(_ expense: SettlementExpense, participants: [SettlementParticipant]) -> SettlementExpense {
        let people = normalizeParticipants(participants)
        let known = Set(people.map(\.id))
        let payer = known.contains(expense.payerID.trimmingCharacters(in: .whitespacesAndNewlines)) ? expense.payerID : "self"
        var ids: [String] = []
        for id in expense.participantIDs where known.contains(id) && !ids.contains(id) { ids.append(id) }
        if ids.isEmpty { ids = [payer] }
        if !ids.contains(payer) { ids.append(payer) }
        return SettlementExpense(id: expense.id, amount: expense.amount, currency: expense.currency, amountKRW: max(0, expense.amountKRW), payerID: payer, participantIDs: ids)
    }

    public static func calculate(expenses: [SettlementExpense], participants: [SettlementParticipant]) -> SettlementSummary {
        let people = normalizeParticipants(participants)
        var paid = Dictionary(uniqueKeysWithValues: people.map { ($0.id, 0) })
        var shares = Dictionary(uniqueKeysWithValues: people.map { ($0.id, 0) })
        var total = 0
        var count = 0

        for rawExpense in expenses {
            let expense = normalizeExpense(rawExpense, participants: people)
            guard expense.amountKRW > 0 else { continue }
            total += expense.amountKRW
            count += 1
            paid[expense.payerID, default: 0] += expense.amountKRW
            let base = expense.amountKRW / expense.participantIDs.count
            let remainder = expense.amountKRW - base * expense.participantIDs.count
            for (index, id) in expense.participantIDs.enumerated() {
                shares[id, default: 0] += base + (index < remainder ? 1 : 0)
            }
        }

        let summaries = people.map { person in
            PersonSettlement(id: person.id, name: person.name, paidKRW: paid[person.id] ?? 0, shareKRW: shares[person.id] ?? 0, balanceKRW: (paid[person.id] ?? 0) - (shares[person.id] ?? 0))
        }
        var debtors = summaries.filter { $0.balanceKRW < 0 }.map { ($0.id, amount: -$0.balanceKRW) }
        var creditors = summaries.filter { $0.balanceKRW > 0 }.map { ($0.id, amount: $0.balanceKRW) }
        var transfers: [SettlementTransfer] = []
        var debtorIndex = 0
        var creditorIndex = 0
        while debtorIndex < debtors.count && creditorIndex < creditors.count {
            let amount = min(debtors[debtorIndex].amount, creditors[creditorIndex].amount)
            if amount > 0 { transfers.append(SettlementTransfer(fromID: debtors[debtorIndex].0, toID: creditors[creditorIndex].0, amountKRW: amount)) }
            debtors[debtorIndex].amount -= amount
            creditors[creditorIndex].amount -= amount
            if debtors[debtorIndex].amount == 0 { debtorIndex += 1 }
            if creditors[creditorIndex].amount == 0 { creditorIndex += 1 }
        }
        return SettlementSummary(people: summaries, transfers: transfers, totalKRW: total, expenseCount: count)
    }

    public static func createWallet(id: String, currency: String, name: String? = nil) -> CashWallet {
        let safeCurrency = currency.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "KRW" : currency
        return CashWallet(id: id.isEmpty ? "\(safeCurrency)-cash-wallet" : id, name: name ?? "\(safeCurrency) 현금 지갑", currency: safeCurrency)
    }

    public static func removeWallet(wallets: [CashWallet], walletID: String, activeWalletID: String?, selectedCurrency: String, fallbackCurrency: String = "KRW") -> CashWalletRemovalState {
        let remaining = wallets.filter { $0.id != walletID }
        let active = remaining.first(where: { $0.id == activeWalletID }) ?? remaining.first(where: { $0.currency == selectedCurrency }) ?? remaining.first
        return CashWalletRemovalState(wallets: remaining, activeWalletID: active?.id, cashLedgerCurrency: active?.currency ?? (selectedCurrency.isEmpty ? fallbackCurrency : selectedCurrency))
    }
}
