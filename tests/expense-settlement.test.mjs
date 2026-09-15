import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateSettlement,
  normalizeExpenseParticipants,
  normalizeSettlementParticipants
} from '../src/expenseSettlement.js';

test('keeps the owner as the default settlement participant', () => {
  assert.deepEqual(normalizeSettlementParticipants([]), [
    { id: 'self', name: '나' }
  ]);
});

test('treats an older expense without split metadata as a personal expense', () => {
  const participants = normalizeSettlementParticipants([
    { id: 'jisu', name: '지수' }
  ]);

  assert.deepEqual(normalizeExpenseParticipants({ amount: 12000 }, participants), {
    payerId: 'self',
    participantIds: ['self']
  });
});

test('splits a shared expense evenly and calculates who pays or receives', () => {
  const participants = normalizeSettlementParticipants([
    { id: 'jisu', name: '지수' },
    { id: 'minji', name: '민지' }
  ]);

  const result = calculateSettlement([
    {
      amount: 30000,
      currency: 'KRW',
      payerId: 'jisu',
      participantIds: ['jisu', 'self', 'minji']
    }
  ], participants, () => 30000);

  assert.deepEqual(result.people, [
    { id: 'self', name: '나', paidKRW: 0, shareKRW: 10000, balanceKRW: -10000 },
    { id: 'jisu', name: '지수', paidKRW: 30000, shareKRW: 10000, balanceKRW: 20000 },
    { id: 'minji', name: '민지', paidKRW: 0, shareKRW: 10000, balanceKRW: -10000 }
  ]);
  assert.deepEqual(result.transfers, [
    { fromId: 'self', toId: 'jisu', amountKRW: 10000 },
    { fromId: 'minji', toId: 'jisu', amountKRW: 10000 }
  ]);
});

test('allocates remainder won deterministically while preserving the expense total', () => {
  const participants = normalizeSettlementParticipants([
    { id: 'jisu', name: '지수' },
    { id: 'minji', name: '민지' }
  ]);

  const result = calculateSettlement([
    {
      amount: 1001,
      currency: 'KRW',
      payerId: 'self',
      participantIds: ['self', 'jisu', 'minji']
    }
  ], participants, () => 1001);

  assert.deepEqual(result.people.map(person => person.shareKRW), [334, 334, 333]);
  assert.equal(result.totalKRW, 1001);
});
