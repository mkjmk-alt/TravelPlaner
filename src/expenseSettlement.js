export const DEFAULT_SETTLEMENT_PARTICIPANT = { id: 'self', name: '나' };

const toSafeId = (value, fallback) => String(value || fallback).trim();
const toSafeName = (value, fallback) => String(value || fallback).trim();

export const normalizeSettlementParticipants = (participants = []) => {
  const source = Array.isArray(participants) ? participants : [];
  const selfEntry = source.find(person => String(person?.id || '').trim() === DEFAULT_SETTLEMENT_PARTICIPANT.id);
  const normalized = [{
    id: DEFAULT_SETTLEMENT_PARTICIPANT.id,
    name: toSafeName(selfEntry?.name, DEFAULT_SETTLEMENT_PARTICIPANT.name)
  }];
  const seen = new Set([DEFAULT_SETTLEMENT_PARTICIPANT.id]);

  source.forEach((person, index) => {
    const id = toSafeId(person?.id, `person-${index + 1}`);
    const name = toSafeName(person?.name, '참여자');
    if (!id || !name || seen.has(id)) return;
    seen.add(id);
    normalized.push({ id, name });
  });

  return normalized;
};

export const normalizeExpenseParticipants = (expense = {}, participants = []) => {
  const normalizedParticipants = normalizeSettlementParticipants(participants);
  const knownIds = new Set(normalizedParticipants.map(person => person.id));
  const payerId = knownIds.has(String(expense?.payerId || '').trim())
    ? String(expense.payerId).trim()
    : DEFAULT_SETTLEMENT_PARTICIPANT.id;
  const requestedIds = Array.isArray(expense?.participantIds) ? expense.participantIds : [];
  const participantIds = Array.from(new Set(requestedIds
    .map(id => String(id || '').trim())
    .filter(id => knownIds.has(id))));

  if (participantIds.length === 0) return { payerId, participantIds: [payerId] };
  if (!participantIds.includes(payerId)) participantIds.push(payerId);
  return { payerId, participantIds };
};

const getExpenseAmountKRW = (expense, convertAmount) => {
  const converted = typeof convertAmount === 'function'
    ? convertAmount(expense?.amount, expense?.currency, expense)
    : expense?.amountKRW ?? expense?.amount;
  const numericAmount = Number(converted);
  return Number.isFinite(numericAmount) ? Math.max(0, Math.round(numericAmount)) : 0;
};

export const calculateSettlement = (expenses = [], participants = [], convertAmount) => {
  const normalizedParticipants = normalizeSettlementParticipants(participants);
  const paidBy = Object.fromEntries(normalizedParticipants.map(person => [person.id, 0]));
  const shareBy = Object.fromEntries(normalizedParticipants.map(person => [person.id, 0]));
  let totalKRW = 0;
  let expenseCount = 0;

  (Array.isArray(expenses) ? expenses : []).forEach(expense => {
    const { payerId, participantIds } = normalizeExpenseParticipants(expense, normalizedParticipants);
    const amountKRW = getExpenseAmountKRW(expense, convertAmount);
    if (amountKRW <= 0) return;

    totalKRW += amountKRW;
    expenseCount += 1;
    paidBy[payerId] += amountKRW;

    const baseShare = Math.floor(amountKRW / participantIds.length);
    const remainder = amountKRW - (baseShare * participantIds.length);
    participantIds.forEach((participantId, index) => {
      shareBy[participantId] += baseShare + (index < remainder ? 1 : 0);
    });
  });

  const people = normalizedParticipants.map(person => ({
    ...person,
    paidKRW: paidBy[person.id],
    shareKRW: shareBy[person.id],
    balanceKRW: paidBy[person.id] - shareBy[person.id]
  }));

  const debtors = people
    .filter(person => person.balanceKRW < 0)
    .map(person => ({ id: person.id, amount: -person.balanceKRW }));
  const creditors = people
    .filter(person => person.balanceKRW > 0)
    .map(person => ({ id: person.id, amount: person.balanceKRW }));
  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountKRW = Math.min(debtor.amount, creditor.amount);
    if (amountKRW > 0) transfers.push({ fromId: debtor.id, toId: creditor.id, amountKRW });
    debtor.amount -= amountKRW;
    creditor.amount -= amountKRW;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return { people, transfers, totalKRW, expenseCount };
};
