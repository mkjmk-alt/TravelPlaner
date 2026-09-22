import XCTest
@testable import NativeCore

final class ExpenseSettlementTests: XCTestCase {
    func testNormalizesParticipantsAndAlwaysIncludesPayer() throws {
        let people = ExpenseSettlement.normalizeParticipants([
            .init(id: "person-1", name: "민지"),
            .init(id: "person-1", name: "중복"),
            .init(id: "self", name: "나")
        ])
        let expense = SettlementExpense(id: "e1", amount: 1200, currency: "JPY", amountKRW: 10800, payerID: "person-1", participantIDs: ["self"])
        let normalized = ExpenseSettlement.normalizeExpense(expense, participants: people)
        XCTAssertEqual(people.map(\.id), ["self", "person-1"])
        XCTAssertEqual(normalized.participantIDs, ["self", "person-1"])
    }

    func testCalculatesRemainderAndDeterministicTransfers() throws {
        let people = [
            SettlementParticipant(id: "self", name: "나"),
            SettlementParticipant(id: "person-1", name: "민지"),
            SettlementParticipant(id: "person-2", name: "준호")
        ]
        let expenses = [
            SettlementExpense(id: "e1", amount: 1000, currency: "JPY", amountKRW: 10001, payerID: "self", participantIDs: ["self", "person-1", "person-2"]),
            SettlementExpense(id: "e2", amount: 500, currency: "JPY", amountKRW: 5000, payerID: "person-1", participantIDs: ["self", "person-1"])
        ]
        let summary = ExpenseSettlement.calculate(expenses: expenses, participants: people)
        XCTAssertEqual(summary.totalKRW, 15001)
        XCTAssertEqual(summary.people, [
            PersonSettlement(id: "self", name: "나", paidKRW: 10001, shareKRW: 5834, balanceKRW: 4167),
            PersonSettlement(id: "person-1", name: "민지", paidKRW: 5000, shareKRW: 5834, balanceKRW: -834),
            PersonSettlement(id: "person-2", name: "준호", paidKRW: 0, shareKRW: 3333, balanceKRW: -3333)
        ])
        XCTAssertEqual(summary.transfers, [
            SettlementTransfer(fromID: "person-1", toID: "self", amountKRW: 834),
            SettlementTransfer(fromID: "person-2", toID: "self", amountKRW: 3333)
        ])
        XCTAssertEqual(summary.transfers.reduce(0) { $0 + $1.amountKRW }, 4167)
    }

    func testCreatesWalletForSelectedCurrencyAndRemovesOnlyThatWallet() {
        let wallet = ExpenseSettlement.createWallet(id: "jpy-1", currency: "JPY")
        XCTAssertEqual(wallet.name, "JPY 현금 지갑")
        let state = ExpenseSettlement.removeWallet(wallets: [
            wallet,
            CashWallet(id: "usd-1", name: "USD 현금 지갑", currency: "USD")
        ], walletID: "jpy-1", activeWalletID: "jpy-1", selectedCurrency: "JPY")
        XCTAssertEqual(state.wallets.map(\.id), ["usd-1"])
        XCTAssertEqual(state.activeWalletID, "usd-1")
        XCTAssertEqual(state.cashLedgerCurrency, "USD")
    }
}
