package com.travelplaner.nativepreview.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.travelplaner.nativepreview.domain.*
import kotlinx.serialization.json.*
import java.util.UUID

private val expenseCurrencies = listOf("KRW", "JPY", "USD", "EUR", "CNY", "VND")
private val expenseCategories = listOf("food" to "식비", "transport" to "교통", "stay" to "숙박", "shopping" to "쇼핑", "other" to "기타")

private fun JsonObject.string(key: String, fallback: String = "") = this[key]?.jsonPrimitive?.contentOrNull ?: fallback
private fun JsonObject.int(key: String, fallback: Int = 0) = this[key]?.jsonPrimitive?.intOrNull ?: fallback
private fun JsonObject.double(key: String, fallback: Double = 0.0) = this[key]?.jsonPrimitive?.doubleOrNull ?: fallback
private fun tripParticipants(trip: TripDocument): List<SettlementParticipant> {
    val parsed = trip.json["settlementParticipants"]?.jsonArray.orEmpty().mapNotNull { row ->
        row.jsonObject.let { obj -> obj.string("id").takeIf { it.isNotBlank() }?.let { SettlementParticipant(it, obj.string("name", "참여자")) } }
    }
    return if (parsed.isEmpty()) listOf(SettlementParticipant("self", "나")) else ExpenseSettlement.normalizeParticipants(parsed)
}
private fun tripExpenses(trip: TripDocument): List<Pair<JsonObject, SettlementExpense>> = trip.json["expenses"]?.jsonArray.orEmpty().mapNotNull { row ->
    val obj = row.jsonObject; val id = obj.string("id")
    if (id.isBlank()) null else obj to SettlementExpense(id, obj.double("amount").toInt(), obj.string("currency", "KRW"), obj.int("amountKRW", obj.int("amount")), obj.string("payerId", "self"), obj["participantIds"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList())
}

@Composable
fun ExpenseScreen(state: TripUiState, model: TripViewModel, activeTripID: String, onSettlement: (String) -> Unit) {
    val trip = state.trips.find { it.id == activeTripID }
    var showEditor by rememberSaveable { mutableStateOf(false) }
    var editing by remember { mutableStateOf<JsonObject?>(null) }
    var pendingDeletion by remember { mutableStateOf<String?>(null) }
    when {
        trip == null -> EmptyNativeScreen("여행을 먼저 선택해주세요", "내 여행에서 여행을 선택하면 지출을 기록할 수 있어요.")
        else -> {
            val entries = tripExpenses(trip)
            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) { Text("지출", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text(trip.name, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        FilledTonalButton(onClick = { editing = null; showEditor = true }, modifier = Modifier.testTag("add-expense")) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(4.dp)); Text("추가") }
                    }
                }
                item { Text("원래 통화·환율·지출자·함께 사용한 사람을 함께 저장해요.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (entries.isEmpty()) item { ExpenseCalmCard { Text("아직 지출이 없어요", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); Text("오른쪽 위 추가 버튼으로 첫 지출을 기록해보세요.", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                items(entries, key = { it.second.id }) { (raw, expense) ->
                    Card(onClick = { editing = raw; showEditor = true }, modifier = Modifier.fillMaxWidth().testTag("expense-row")) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(raw.string("memo", raw.string("category", "지출")), fontWeight = FontWeight.SemiBold); Text("${expense.currency} ${expense.amount} · ${expense.payerId} 결제", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text("₩${expense.amountKrw}", fontWeight = FontWeight.SemiBold)
                            IconButton(onClick = { pendingDeletion = expense.id }, modifier = Modifier.testTag("delete-expense-${expense.id}")) { Icon(Icons.Outlined.Delete, contentDescription = "지출 삭제") }
                        }
                    }
                }
                item { Button(onClick = { onSettlement(trip.id) }, modifier = Modifier.fillMaxWidth().testTag("open-settlement")) { Icon(Icons.Outlined.Person, null); Spacer(Modifier.width(8.dp)); Text("함께 정산") } }
                if (state.expenseError != null) item { Text(state.expenseError, color = MaterialTheme.colorScheme.error) }
            }
            if (showEditor) ExpenseEditorDialog(trip, editing, tripParticipants(trip), onDismiss = { showEditor = false }, onSave = { id, fields -> model.upsertExpense(trip.id, id, fields); showEditor = false })
            pendingDeletion?.let { expenseID ->
                AlertDialog(
                    onDismissRequest = { pendingDeletion = null },
                    title = { Text("지출 삭제") },
                    text = { Text("이 지출 내역만 삭제합니다. 정산 결과에서도 제외됩니다.") },
                    confirmButton = {
                        TextButton(onClick = { model.deleteExpense(trip.id, expenseID); pendingDeletion = null }) { Text("삭제") }
                    },
                    dismissButton = { TextButton(onClick = { pendingDeletion = null }) { Text("취소") } },
                )
            }
        }
    }
}

@Composable
private fun ExpenseEditorDialog(trip: TripDocument, existing: JsonObject?, participants: List<SettlementParticipant>, onDismiss: () -> Unit, onSave: (String, JsonObject) -> Unit) {
    var amount by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.double("amount")?.takeIf { it > 0 }?.toString() ?: "") }
    var amountKrw by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.int("amountKRW")?.takeIf { it > 0 }?.toString() ?: "") }
    var currency by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.string("currency", "KRW") ?: "KRW") }
    var category by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.string("category", "other") ?: "other") }
    var memo by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.string("memo") ?: "") }
    var payer by rememberSaveable(existing?.string("id")) { mutableStateOf(existing?.string("payerId", "self") ?: "self") }
    var selected by remember(existing?.string("id")) { mutableStateOf((existing?.get("participantIds")?.jsonArray?.map { it.jsonPrimitive.content } ?: listOf("self")).toSet()) }
    var validation by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(if (existing == null) "지출 추가" else "지출 수정") }, text = {
        Column(Modifier.heightIn(max = 560.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(amount, { amount = it }, label = { Text("원래 금액") }, modifier = Modifier.testTag("expense-amount"), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true)
            Text("사용 통화", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) { expenseCurrencies.forEach { code -> FilterChip(selected = currency == code, onClick = { currency = code }, label = { Text(code) }) } }
            OutlinedTextField(amountKrw, { amountKrw = it }, label = { Text("KRW 환산 금액") }, modifier = Modifier.testTag("expense-amount-krw"), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
            Text("카테고리", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) { expenseCategories.forEach { (code, label) -> FilterChip(selected = category == code, onClick = { category = code }, label = { Text(label) }) } }
            OutlinedTextField(memo, { memo = it }, label = { Text("메모") }, singleLine = true)
            Text("누가 결제했나요?", style = MaterialTheme.typography.labelLarge)
            participants.forEach { person -> Row(verticalAlignment = Alignment.CenterVertically) { RadioButton(payer == person.id, { payer = person.id; selected = selected + person.id }); Text(person.name) } }
            Text("함께 사용한 사람", style = MaterialTheme.typography.labelLarge)
            participants.forEach { person -> Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(selected.contains(person.id), { checked -> if (checked || person.id == payer) selected = selected + person.id else selected = selected - person.id }); Text(person.name) } }
            Text("지출자는 자동 포함되어 선택한 사람 수로 1/n 정산합니다.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            validation?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }, confirmButton = { TextButton(onClick = {
        val parsedAmount = amount.toDoubleOrNull(); val parsedKrw = amountKrw.toIntOrNull()
        if (parsedAmount == null || parsedAmount <= 0 || parsedKrw == null || parsedKrw < 0) { validation = "금액과 KRW 환산 금액을 확인해주세요."; return@TextButton }
        val ids = participants.map { it.id }.filter { it in selected || it == payer }.distinct()
        onSave(existing?.string("id") ?: "expense-${UUID.randomUUID()}", buildJsonObject { put("amount", parsedAmount); put("currency", currency); put("amountKRW", parsedKrw); put("category", category); put("memo", memo); put("payerId", payer); put("participantIds", buildJsonArray { ids.forEach { add(it) } }); put("updatedAt", System.currentTimeMillis()) })
    }, modifier = Modifier.testTag("expense-save")) { Text("저장") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } })
}

@Composable
fun SettlementScreen(state: TripUiState, model: TripViewModel, tripID: String, onBack: () -> Unit) {
    val trip = state.trips.find { it.id == tripID }
    BackHandler(onBack = onBack)
    if (trip == null) {
        EmptyNativeScreen("여행을 찾을 수 없어요", "목록에서 다시 선택해주세요.")
        return
    }
    var newName by rememberSaveable { mutableStateOf("") }
    var currency by rememberSaveable { mutableStateOf(trip.json["budgetSettings"]?.jsonObject?.string("travelCurrency", "USD") ?: "USD") }
    var pendingWalletDeletion by remember { mutableStateOf<JsonObject?>(null) }
    var initialWalletDrafts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var additionalWalletDrafts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var actualWalletDrafts by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val participants = tripParticipants(trip)
    val summary = ExpenseSettlement.calculate(tripExpenses(trip).map { it.second }, participants)
    val wallets = trip.json["budgetSettings"]?.jsonObject?.get("cashWallets")?.jsonArray.orEmpty().map { it.jsonObject }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, contentDescription = "뒤로") }
                Text("함께 정산", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            }
        }
        item {
            ExpenseCalmCard {
                Text("총 지출 ₩${summary.totalKrw} · ${summary.expenseCount}건", fontWeight = FontWeight.Bold)
                summary.people.forEach { person ->
                    Text("${person.name}: 지불 ₩${person.paidKrw} · 부담 ₩${person.shareKrw} · 잔액 ${if (person.balanceKrw >= 0) "+" else "-"}₩${kotlin.math.abs(person.balanceKrw)}")
                }
                summary.transfers.forEach { transfer ->
                    val from = summary.people.firstOrNull { it.id == transfer.fromId }?.name ?: transfer.fromId
                    val to = summary.people.firstOrNull { it.id == transfer.toId }?.name ?: transfer.toId
                    Text("$from → $to ₩${transfer.amountKrw}")
                }
            }
        }
        item { SectionTitle("정산 참여자") }
        items(participants, key = { it.id }) { person ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(person.name, Modifier.weight(1f))
                if (person.id != "self") {
                        IconButton(onClick = { model.updateParticipants(trip.id, participants.filterNot { it.id == person.id }.participantsToJson()) }) {
                        Icon(Icons.Outlined.Delete, contentDescription = "참여자 삭제")
                    }
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(newName, { newName = it }, label = { Text("함께 여행한 사람") }, modifier = Modifier.weight(1f), singleLine = true)
                Spacer(Modifier.width(8.dp))
                Button(onClick = {
                    if (newName.isNotBlank()) {
                        val next = (participants + SettlementParticipant("person-${UUID.randomUUID()}", newName.trim())).participantsToJson()
                        model.updateParticipants(trip.id, next)
                        newName = ""
                    }
                }) { Text("추가") }
            }
        }
        item { SectionTitle("현금 지갑") }
        item {
            Text("정산 통화", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                expenseCurrencies.forEach { code ->
                    FilterChip(selected = currency == code, onClick = { currency = code; model.updateBudgetSettings(trip.id, buildJsonObject { put("travelCurrency", code) }) }, label = { Text(code) })
                }
            }
        }
        items(wallets, key = { it.string("id") }) { wallet ->
            val walletID = wallet.string("id")
            val walletCurrency = wallet.string("currency", "KRW")
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(wallet.string("name", "$walletCurrency 현금 지갑"), fontWeight = FontWeight.SemiBold)
                            Text(walletCurrency, style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = { pendingWalletDeletion = wallet }, modifier = Modifier.testTag("wallet-delete-$walletID")) { Icon(Icons.Outlined.Delete, contentDescription = "지갑 삭제") }
                    }
                    OutlinedTextField(initialWalletDrafts[walletID] ?: wallet.string("initial"), { initialWalletDrafts = initialWalletDrafts + (walletID to it) }, label = { Text("여행 전 환전·인출") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                    OutlinedTextField(additionalWalletDrafts[walletID] ?: wallet.string("additional"), { additionalWalletDrafts = additionalWalletDrafts + (walletID to it) }, label = { Text("추가 환전·인출") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                    OutlinedTextField(actualWalletDrafts[walletID] ?: wallet.string("actualRemaining"), { actualWalletDrafts = actualWalletDrafts + (walletID to it) }, label = { Text("실제 남은 현금") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                    OutlinedButton(onClick = {
                        val initial = initialWalletDrafts[walletID]?.toIntOrNull() ?: wallet.int("initial")
                        val additional = additionalWalletDrafts[walletID]?.toIntOrNull() ?: wallet.int("additional")
                        val actualText = actualWalletDrafts[walletID] ?: wallet.string("actualRemaining")
                        val updated = buildJsonObject {
                            wallet.forEach { (key, value) -> put(key, value) }
                            put("initial", initial); put("additional", additional); put("actualRemaining", actualText)
                        }
                        val next = wallets.map { if (it.string("id") == walletID) updated else it }.walletsToJson()
                        model.updateBudgetSettings(trip.id, buildJsonObject { put("cashWallets", next) })
                        initialWalletDrafts = initialWalletDrafts - walletID
                        additionalWalletDrafts = additionalWalletDrafts - walletID
                        actualWalletDrafts = actualWalletDrafts - walletID
                    }, modifier = Modifier.fillMaxWidth()) { Text("지갑 금액 저장") }
                }
            }
        }
        item {
            OutlinedButton(onClick = {
                val id = "wallet-${UUID.randomUUID()}"
                val next = (wallets + buildJsonObject { put("id", id); put("name", "$currency 현금 지갑"); put("currency", currency); put("initial", 0); put("additional", 0); put("actualRemaining", "") }).walletsToJson()
                model.updateBudgetSettings(trip.id, buildJsonObject { put("cashWallets", next) })
            }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(8.dp)); Text("현재 통화로 지갑 추가")
            }
        }
        if (state.expenseError != null) item { Text(state.expenseError, color = MaterialTheme.colorScheme.error) }
    }
    pendingWalletDeletion?.let { wallet ->
        AlertDialog(
            onDismissRequest = { pendingWalletDeletion = null },
            title = { Text("지갑 삭제") },
            text = { Text("선택한 현금 지갑만 삭제합니다. 지출 내역은 유지됩니다.") },
            confirmButton = {
                TextButton(onClick = {
                    val next = wallets.filterNot { it.string("id") == wallet.string("id") }.walletsToJson()
                    model.updateBudgetSettings(trip.id, buildJsonObject { put("cashWallets", next) })
                    pendingWalletDeletion = null
                }) { Text("삭제") }
            },
            dismissButton = { TextButton(onClick = { pendingWalletDeletion = null }) { Text("취소") } },
        )
    }
}

private fun List<SettlementParticipant>.participantsToJson() = buildJsonArray { forEach { add(buildJsonObject { put("id", it.id); put("name", it.name) }) } }
private fun List<JsonObject>.walletsToJson() = JsonArray(this)

@Composable private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
@Composable private fun EmptyNativeScreen(title: String, message: String) { Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp)); Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
@Composable private fun ExpenseCalmCard(content: @Composable ColumnScope.() -> Unit) { Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content) } }
