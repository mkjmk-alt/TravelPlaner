import SwiftUI
import NativeCore

private let expenseCurrencies = ["KRW", "JPY", "USD", "EUR", "CNY", "VND"]
private let expenseCategories = [("food", "식비"), ("transport", "교통"), ("stay", "숙박"), ("shopping", "쇼핑"), ("other", "기타")]

private func rawString(_ value: Any?, fallback: String = "") -> String { (value as? String) ?? fallback }
private func rawInt(_ value: Any?, fallback: Int = 0) -> Int { if let value = value as? NSNumber { return value.intValue }; return Int((value as? String) ?? "") ?? fallback }
private func rawDouble(_ value: Any?, fallback: Double = 0) -> Double { if let value = value as? NSNumber { return value.doubleValue }; return Double((value as? String) ?? "") ?? fallback }
private func walletText(_ row: [String: Any], _ key: String) -> String {
    if let value = row[key] as? String { return value }
    if let value = row[key] as? NSNumber { return String(value.intValue) }
    return ""
}

private func nativeParticipants(_ trip: TripDocument) -> [SettlementParticipant] {
    let parsed = (trip.raw["settlementParticipants"] as? [[String: Any]] ?? []).compactMap { row in
        let id = rawString(row["id"]); let name = rawString(row["name"])
        return id.isEmpty || name.isEmpty ? nil : SettlementParticipant(id: id, name: name)
    }
    return ExpenseSettlement.normalizeParticipants(parsed)
}

private func nativeExpenses(_ trip: TripDocument) -> [SettlementExpense] {
    (trip.raw["expenses"] as? [[String: Any]] ?? []).compactMap { row in
        let id = rawString(row["id"])
        guard !id.isEmpty else { return nil }
        let participantIDs = (row["participantIds"] as? [String]) ?? []
        return SettlementExpense(id: id, amount: rawDouble(row["amount"]), currency: rawString(row["currency"], fallback: "KRW"), amountKRW: rawInt(row["amountKRW"], fallback: rawInt(row["amount"])), payerID: rawString(row["payerId"], fallback: "self"), participantIDs: participantIDs)
    }
}

struct ExpenseView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Binding var activeTrip: String
    @State private var adding = false
    @State private var editing: [String: Any]?
    @State private var pendingDeletion: [String: Any]?
    @State private var error: String?
    private var trip: TripDocument? { store.trips.first { $0.id == activeTrip } }

    var body: some View {
        NavigationStack {
            Group {
                if let trip {
                    List {
                        Section {
                            Text("원래 금액·통화·환율과 누가 함께 사용했는지 저장해요.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Section("지출 내역") {
                            let rows = trip.raw["expenses"] as? [[String: Any]] ?? []
                            if rows.isEmpty { EmptyExpenseView(title: "아직 지출이 없어요", message: "오른쪽 위 + 버튼으로 첫 지출을 추가해보세요.", symbol: "creditcard") }
                            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                                Button { editing = row } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(rawString(row["memo"], fallback: rawString(row["category"], fallback: "지출"))).font(.headline)
                                            Text("\(rawString(row["currency"], fallback: "KRW")) \(rawDouble(row["amount"])) · \(rawString(row["payerId"], fallback: "self")) 결제")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Text("₩\(rawInt(row["amountKRW"]))").font(.subheadline.weight(.semibold))
                                    }
                                }.buttonStyle(.plain)
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) { pendingDeletion = row } label: { Label("삭제", systemImage: "trash") }
                                    }
                            }
                        }
                        Section {
                            NavigationLink { SettlementView(tripID: trip.id) } label: { Label("함께 정산", systemImage: "person.2") }
                                .accessibilityIdentifier("openSettlement")
                        }
                    }
                    .navigationTitle("지출")
                    .toolbar { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityIdentifier("addExpense") }
                } else {
                    EmptyExpenseView(title: "여행을 먼저 선택해주세요", message: "내 여행 탭에서 여행을 선택하면 지출을 기록할 수 있어요.", symbol: "suitcase")
                        .navigationTitle("지출")
                }
            }
            .sheet(isPresented: $adding) { if let trip { ExpenseEditorView(tripID: trip.id) } }
            .sheet(isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) { if let trip, let editing { ExpenseEditorView(tripID: trip.id, expense: editing) } }
            .alert("저장 오류", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("확인") { error = nil } } message: { Text(error ?? "") }
            .alert("지출 삭제", isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })) {
                Button("삭제", role: .destructive) { if let row = pendingDeletion { delete(row) }; pendingDeletion = nil }
                Button("취소", role: .cancel) { pendingDeletion = nil }
            } message: { Text("이 지출 내역만 삭제합니다. 정산 결과에서도 제외됩니다.") }
        }
    }

    private func delete(_ row: [String: Any]) {
        guard let trip, let id = row["id"] as? String else { return }
        do { try store.deleteExpense(tripID: trip.id, expenseID: id) } catch let caught { self.error = caught.localizedDescription }
    }
}

struct ExpenseEditorView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    let expense: [String: Any]?
    @State private var amount: String
    @State private var amountKRW: String
    @State private var currency: String
    @State private var category: String
    @State private var memo: String
    @State private var payerID: String
    @State private var participantIDs: Set<String>
    @State private var rate: String
    @State private var saving = false
    @State private var error: String?

    init(tripID: String, expense: [String: Any]? = nil) {
        self.tripID = tripID; self.expense = expense
        _amount = State(initialValue: expense.map { String(rawDouble($0["amount"])) } ?? "")
        _amountKRW = State(initialValue: expense.map { String(rawInt($0["amountKRW"])) } ?? "")
        _currency = State(initialValue: expense.map { rawString($0["currency"], fallback: "KRW") } ?? "KRW")
        _category = State(initialValue: expense.map { rawString($0["category"], fallback: "other") } ?? "other")
        _memo = State(initialValue: expense.map { rawString($0["memo"]) } ?? "")
        _payerID = State(initialValue: expense.map { rawString($0["payerId"], fallback: "self") } ?? "self")
        _participantIDs = State(initialValue: Set((expense?["participantIds"] as? [String]) ?? ["self"]))
        _rate = State(initialValue: expense.map { rawString($0["exchangeRate"]) } ?? "")
    }

    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var participants: [SettlementParticipant] { trip.map(nativeParticipants) ?? [SettlementParticipant(id: "self", name: "나")] }

    var body: some View {
        NavigationStack {
            Form {
                Section("금액") {
                    TextField("원래 금액", text: $amount).keyboardType(.decimalPad).accessibilityIdentifier("expenseAmount")
                    Picker("사용 통화", selection: $currency) { ForEach(expenseCurrencies, id: \.self) { Text($0).tag($0) } }
                    TextField("KRW 환산 금액", text: $amountKRW).keyboardType(.numberPad).accessibilityIdentifier("expenseAmountKRW")
                    TextField("적용 환율(선택)", text: $rate).keyboardType(.decimalPad)
                }
                Section("내용") {
                    Picker("카테고리", selection: $category) { ForEach(expenseCategories, id: \.0) { Text($0.1).tag($0.0) } }
                    TextField("메모", text: $memo)
                }
                Section("함께 정산") {
                    Picker("지출자", selection: $payerID) { ForEach(participants) { Text($0.name).tag($0.id) } }
                    ForEach(participants) { person in
                        Toggle(person.name, isOn: Binding(get: { participantIDs.contains(person.id) }, set: { enabled in
                            if enabled { participantIDs.insert(person.id) } else if person.id != payerID { participantIDs.remove(person.id) }
                        }))
                    }
                    Text("지출자는 자동으로 포함되며 선택한 사람 수로 1/n 정산해요.").font(.footnote).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(expense == nil ? "지출 추가" : "지출 수정")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("저장") { save() }.disabled(saving).accessibilityIdentifier("saveExpense") }
            }
        }
    }

    private func save() {
        guard let trip, let numericAmount = Double(amount), numericAmount > 0, let converted = Int(amountKRW), converted >= 0 else { error = "원래 금액과 KRW 환산 금액을 확인해주세요."; return }
        var ids = participants.map(\.id).filter { participantIDs.contains($0) }
        if !ids.contains(payerID) { ids.append(payerID) }
        saving = true
        var fields: [String: Any] = ["amount": numericAmount, "currency": currency, "amountKRW": converted, "category": category, "memo": memo, "payerId": payerID, "participantIds": ids, "updatedAt": Date().timeIntervalSince1970 * 1000]
        if let rateValue = Double(rate), rateValue > 0 { fields["exchangeRate"] = rateValue; fields["exchangeRateMode"] = "manual" }
        do { try store.upsertExpense(tripID: trip.id, expenseID: expense?["id"] as? String ?? UUID().uuidString, fields: fields); dismiss() }
        catch { self.error = error.localizedDescription; saving = false }
    }
}

struct SettlementView: View {
    @EnvironmentObject private var store: NativeTripStore
    @Environment(\.dismiss) private var dismiss
    let tripID: String
    @State private var newParticipant = ""
    @State private var selectedCurrency = "USD"
    @State private var error: String?
    @State private var walletDrafts: [String: String] = [:]
    @State private var initialWalletDrafts: [String: String] = [:]
    @State private var actualWalletDrafts: [String: String] = [:]
    @State private var pendingWalletDeletion: String?
    private var trip: TripDocument? { store.trips.first { $0.id == tripID } }
    private var participants: [SettlementParticipant] { trip.map(nativeParticipants) ?? [] }
    private var expenses: [SettlementExpense] { trip.map(nativeExpenses) ?? [] }
    private var summary: SettlementSummary { ExpenseSettlement.calculate(expenses: expenses, participants: participants) }
    private var walletRows: [[String: Any]] {
        (trip?.raw["budgetSettings"] as? [String: Any])?["cashWallets"] as? [[String: Any]] ?? []
    }

    var body: some View {
        List {
            Section("정산 요약") {
                Text("총 지출 ₩\(summary.totalKRW) · \(summary.expenseCount)건")
                ForEach(summary.people) { person in
                    HStack { Text(person.name); Spacer(); Text("지불 ₩\(person.paidKRW) · 부담 ₩\(person.shareKRW)"); Text(person.balanceKRW >= 0 ? "+₩\(person.balanceKRW)" : "-₩\(-person.balanceKRW)").foregroundStyle(person.balanceKRW >= 0 ? .green : .red) }
                        .font(.caption)
                }
                ForEach(Array(summary.transfers.enumerated()), id: \.offset) { _, transfer in
                    let from = summary.people.first { $0.id == transfer.fromID }?.name ?? transfer.fromID
                    let to = summary.people.first { $0.id == transfer.toID }?.name ?? transfer.toID
                    Label("\(from) → \(to) ₩\(transfer.amountKRW)", systemImage: "arrow.right")
                }
            }
            Section("정산 참여자") {
                ForEach(participants) { person in
                    HStack { Text(person.name); Spacer(); if person.id != "self" { Button(role: .destructive) { removeParticipant(person.id) } label: { Image(systemName: "trash") } } }
                }
                HStack { TextField("함께 여행한 사람 이름", text: $newParticipant); Button("추가") { addParticipant() }.disabled(newParticipant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
            Section("현금 지갑") {
                Picker("정산 통화", selection: $selectedCurrency) { ForEach(expenseCurrencies, id: \.self) { Text($0).tag($0) } }
                    .onChange(of: selectedCurrency) { _ in saveBudget(values: ["travelCurrency": selectedCurrency]) }
                ForEach(Array(walletRows.enumerated()), id: \.offset) { _, row in
                    let id = rawString(row["id"]); let currency = rawString(row["currency"], fallback: "KRW")
                    VStack(alignment: .leading) {
                        HStack { Text(rawString(row["name"], fallback: "\(currency) 현금 지갑")); Spacer(); Text(currency); if !id.isEmpty { Button(role: .destructive) { pendingWalletDeletion = id } label: { Image(systemName: "trash") }.accessibilityLabel("지갑 삭제") } }
                        TextField("여행 전 환전·인출", text: Binding(get: { initialWalletDrafts[id] ?? walletText(row, "initial") }, set: { initialWalletDrafts[id] = $0 })).keyboardType(.numberPad)
                        TextField("추가 환전·인출", text: Binding(get: { walletDrafts[id] ?? walletText(row, "additional") }, set: { walletDrafts[id] = $0 })).keyboardType(.numberPad)
                        TextField("실제 남은 현금", text: Binding(get: { actualWalletDrafts[id] ?? walletText(row, "actualRemaining") }, set: { actualWalletDrafts[id] = $0 })).keyboardType(.numberPad)
                        Button("지갑 금액 저장") { updateWallet(row, id: id) }
                    }
                }
                Button("현재 통화로 지갑 추가") { addWallet() }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle("함께 정산")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("닫기") { dismiss() } } }
        .onAppear { selectedCurrency = rawString((trip?.raw["budgetSettings"] as? [String: Any])?["travelCurrency"], fallback: "USD") }
        .alert("지갑 삭제", isPresented: Binding(get: { pendingWalletDeletion != nil }, set: { if !$0 { pendingWalletDeletion = nil } })) {
            Button("삭제", role: .destructive) { if let id = pendingWalletDeletion { removeWallet(id) }; pendingWalletDeletion = nil }
            Button("취소", role: .cancel) { pendingWalletDeletion = nil }
        } message: { Text("선택한 현금 지갑만 삭제합니다. 지출 내역은 유지됩니다.") }
    }

    private func addParticipant() {
        guard let trip else { return }; let name = newParticipant.trimmingCharacters(in: .whitespacesAndNewlines); guard !name.isEmpty else { return }
        var rows = trip.raw["settlementParticipants"] as? [[String: Any]] ?? [["id": "self", "name": "나"]]
        rows.append(["id": "person-\(UUID().uuidString)", "name": name])
        do { try store.updateParticipants(tripID: trip.id, participants: rows); newParticipant = "" } catch let caught { self.error = caught.localizedDescription }
    }
    private func removeParticipant(_ id: String) {
        guard let trip else { return }; let rows = (trip.raw["settlementParticipants"] as? [[String: Any]] ?? []).filter { rawString($0["id"]) != id }
        do { try store.updateParticipants(tripID: trip.id, participants: rows) } catch let caught { self.error = caught.localizedDescription }
    }
    private func saveBudget(values: [String: Any]) { do { try store.updateBudgetSettings(tripID: tripID, values: values) } catch let caught { self.error = caught.localizedDescription } }
    private func addWallet() {
        let id = "wallet-\(UUID().uuidString)"; var next = walletRows
        next.append(["id": id, "name": "\(selectedCurrency) 현금 지갑", "currency": selectedCurrency, "initial": 0, "additional": 0, "actualRemaining": ""])
        saveBudget(values: ["cashWallets": next])
    }
    private func removeWallet(_ id: String) { saveBudget(values: ["cashWallets": walletRows.filter { rawString($0["id"]) != id }]) }
    private func updateWallet(_ row: [String: Any], id: String) {
        var updated = row
        if let value = Int(initialWalletDrafts[id] ?? walletText(row, "initial")) { updated["initial"] = value }
        if let value = Int(walletDrafts[id] ?? walletText(row, "additional")) { updated["additional"] = value }
        let actual = actualWalletDrafts[id] ?? walletText(row, "actualRemaining")
        if actual.isEmpty { updated["actualRemaining"] = "" }
        else if let value = Int(actual) { updated["actualRemaining"] = value }
        saveBudget(values: ["cashWallets": walletRows.map { rawString($0["id"]) == id ? updated : $0 }])
        initialWalletDrafts[id] = nil; walletDrafts[id] = nil; actualWalletDrafts[id] = nil
    }
}

private struct EmptyExpenseView: View {
    let title: String
    let message: String
    let symbol: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: symbol).font(.title2).foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(message).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }.frame(maxWidth: .infinity).padding(.vertical, 18)
    }
}
