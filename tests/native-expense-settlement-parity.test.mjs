import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { calculateSettlement, normalizeSettlementParticipants } from '../src/expenseSettlement.js';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const fixture = JSON.parse(fs.readFileSync(path.join(projectRoot, 'contracts/native/fixtures/expense-settlement.json'), 'utf8'));

test('keeps the native expense settlement fixture aligned with the web calculator', () => {
  const participants = normalizeSettlementParticipants(fixture.participants);
  const result = calculateSettlement(fixture.expenses, participants, (_amount, _currency, expense) => expense.amountKRW);
  assert.deepEqual({
    totalKRW: result.totalKRW,
    expenseCount: result.expenseCount,
    people: result.people.map(({ id, paidKRW, shareKRW, balanceKRW }) => ({ id, paidKRW, shareKRW, balanceKRW })),
    transfers: result.transfers
  }, fixture.expected);
});
