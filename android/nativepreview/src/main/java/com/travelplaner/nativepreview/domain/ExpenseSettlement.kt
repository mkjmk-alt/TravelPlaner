package com.travelplaner.nativepreview.domain

data class SettlementParticipant(val id: String, val name: String)
data class SettlementExpense(
    val id: String,
    val amount: Int,
    val currency: String,
    val amountKrw: Int,
    val payerId: String,
    val participantIds: List<String>,
)
data class PersonSettlement(val id: String, val name: String, val paidKrw: Int, val shareKrw: Int, val balanceKrw: Int)
data class SettlementTransfer(val fromId: String, val toId: String, val amountKrw: Int)
data class SettlementSummary(val people: List<PersonSettlement>, val transfers: List<SettlementTransfer>, val totalKrw: Int, val expenseCount: Int)
data class CashWallet(val id: String, val name: String, val currency: String, val initial: Int = 0, val additional: Int = 0, val actualRemaining: Int? = null)
data class CashWalletRemovalState(val wallets: List<CashWallet>, val activeWalletId: String?, val cashLedgerCurrency: String)

object ExpenseSettlement {
    fun normalizeParticipants(source: List<SettlementParticipant>): List<SettlementParticipant> {
        val self = source.firstOrNull { it.id.trim() == "self" && it.name.trim().isNotEmpty() }?.let { SettlementParticipant("self", it.name.trim()) }
            ?: SettlementParticipant("self", "나")
        val result = mutableListOf(self)
        val seen = mutableSetOf("self")
        source.forEach { person ->
            val id = person.id.trim(); val name = person.name.trim()
            if (id.isNotEmpty() && name.isNotEmpty() && seen.add(id)) result += SettlementParticipant(id, name)
        }
        return result
    }

    fun normalizeExpense(expense: SettlementExpense, participants: List<SettlementParticipant>): SettlementExpense {
        val people = normalizeParticipants(participants)
        val known = people.map { it.id }.toSet()
        val payer = expense.payerId.trim().takeIf { it in known } ?: "self"
        val ids = expense.participantIds.filter { it in known }.distinct().toMutableList()
        if (ids.isEmpty()) ids += payer
        if (payer !in ids) ids += payer
        return expense.copy(amountKrw = maxOf(0, expense.amountKrw), payerId = payer, participantIds = ids)
    }

    fun calculate(expenses: List<SettlementExpense>, participants: List<SettlementParticipant>): SettlementSummary {
        val people = normalizeParticipants(participants)
        val paid = people.associate { it.id to 0 }.toMutableMap()
        val shares = people.associate { it.id to 0 }.toMutableMap()
        var total = 0; var count = 0
        expenses.forEach { raw ->
            val expense = normalizeExpense(raw, people)
            if (expense.amountKrw <= 0) return@forEach
            total += expense.amountKrw; count += 1
            paid[expense.payerId] = paid.getValue(expense.payerId) + expense.amountKrw
            val base = expense.amountKrw / expense.participantIds.size
            val remainder = expense.amountKrw - base * expense.participantIds.size
            expense.participantIds.forEachIndexed { index, id -> shares[id] = shares.getValue(id) + base + if (index < remainder) 1 else 0 }
        }
        val summaries = people.map { PersonSettlement(it.id, it.name, paid.getValue(it.id), shares.getValue(it.id), paid.getValue(it.id) - shares.getValue(it.id)) }
        val debtors = summaries.filter { it.balanceKrw < 0 }.map { it.id to -it.balanceKrw }.toMutableList()
        val creditors = summaries.filter { it.balanceKrw > 0 }.map { it.id to it.balanceKrw }.toMutableList()
        val transfers = mutableListOf<SettlementTransfer>()
        var debtorIndex = 0; var creditorIndex = 0
        while (debtorIndex < debtors.size && creditorIndex < creditors.size) {
            val amount = minOf(debtors[debtorIndex].second, creditors[creditorIndex].second)
            if (amount > 0) transfers += SettlementTransfer(debtors[debtorIndex].first, creditors[creditorIndex].first, amount)
            debtors[debtorIndex] = debtors[debtorIndex].first to debtors[debtorIndex].second - amount
            creditors[creditorIndex] = creditors[creditorIndex].first to creditors[creditorIndex].second - amount
            if (debtors[debtorIndex].second == 0) debtorIndex += 1
            if (creditors[creditorIndex].second == 0) creditorIndex += 1
        }
        return SettlementSummary(summaries, transfers, total, count)
    }

    fun createWallet(id: String, currency: String, name: String? = null): CashWallet {
        val safe = currency.trim().ifEmpty { "KRW" }
        return CashWallet(if (id.isBlank()) "$safe-cash-wallet" else id, name ?: "$safe 현금 지갑", safe)
    }

    fun removeWallet(wallets: List<CashWallet>, walletId: String, activeWalletId: String?, selectedCurrency: String, fallbackCurrency: String = "KRW"): CashWalletRemovalState {
        val remaining = wallets.filterNot { it.id == walletId }
        val active = remaining.firstOrNull { it.id == activeWalletId }
            ?: remaining.firstOrNull { it.currency == selectedCurrency }
            ?: remaining.firstOrNull()
        return CashWalletRemovalState(remaining, active?.id, active?.currency ?: selectedCurrency.ifBlank { fallbackCurrency })
    }
}
