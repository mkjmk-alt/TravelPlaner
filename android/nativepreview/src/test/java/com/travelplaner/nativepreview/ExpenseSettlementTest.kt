package com.travelplaner.nativepreview

import com.travelplaner.nativepreview.domain.*
import org.junit.Assert.assertEquals
import org.junit.Test

class ExpenseSettlementTest {
    @Test fun normalizesParticipantsAndIncludesPayer() {
        val people = ExpenseSettlement.normalizeParticipants(listOf(
            SettlementParticipant("person-1", "민지"),
            SettlementParticipant("person-1", "중복"),
            SettlementParticipant("self", "나"),
        ))
        val expense = SettlementExpense("e1", 1200, "JPY", 10800, "person-1", listOf("self"))
        val normalized = ExpenseSettlement.normalizeExpense(expense, people)
        assertEquals(listOf("self", "person-1"), people.map { it.id })
        assertEquals(listOf("self", "person-1"), normalized.participantIds)
    }

    @Test fun calculatesRemainderAndDeterministicTransfers() {
        val people = listOf(SettlementParticipant("self", "나"), SettlementParticipant("person-1", "민지"), SettlementParticipant("person-2", "준호"))
        val expenses = listOf(
            SettlementExpense("e1", 1000, "JPY", 10001, "self", listOf("self", "person-1", "person-2")),
            SettlementExpense("e2", 500, "JPY", 5000, "person-1", listOf("self", "person-1")),
        )
        val summary = ExpenseSettlement.calculate(expenses, people)
        assertEquals(15001, summary.totalKrw)
        assertEquals(listOf(
            PersonSettlement("self", "나", 10001, 5834, 4167),
            PersonSettlement("person-1", "민지", 5000, 5834, -834),
            PersonSettlement("person-2", "준호", 0, 3333, -3333),
        ), summary.people)
        assertEquals(listOf(
            SettlementTransfer("person-1", "self", 834),
            SettlementTransfer("person-2", "self", 3333),
        ), summary.transfers)
    }

    @Test fun createsSelectedCurrencyWalletAndRemovesOnlyThatWallet() {
        val wallet = ExpenseSettlement.createWallet("jpy-1", "JPY")
        val state = ExpenseSettlement.removeWallet(listOf(wallet, CashWallet("usd-1", "USD 현금 지갑", "USD")), "jpy-1", "jpy-1", "JPY")
        assertEquals("JPY 현금 지갑", wallet.name)
        assertEquals(listOf("usd-1"), state.wallets.map { it.id })
        assertEquals("usd-1", state.activeWalletId)
        assertEquals("USD", state.cashLedgerCurrency)
    }
}
