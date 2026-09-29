import assert from 'node:assert/strict';
import test from 'node:test';

import * as settlement from '../src/expenseSettlement.js';

const {
  calculateSettlement,
  createExpensePayerSelection,
  getNextExpensePayerIndex,
  normalizeExpenseParticipants,
  normalizeSettlementParticipants
} = settlement;

test('keeps the owner as the default settlement participant', () => {
  assert.deepEqual(normalizeSettlementParticipants([]), [
    { id: 'self', name: '나' }
  ]);
});

test('selecting a payer also includes them in shared participants exactly once', () => {
  assert.equal(typeof settlement.createExpensePayerSelection, 'function');
  assert.deepEqual(createExpensePayerSelection('jisu', ['self']), {
    payerId: 'jisu',
    participantIds: ['self', 'jisu']
  });
  assert.deepEqual(createExpensePayerSelection('jisu', ['self', 'jisu']), {
    payerId: 'jisu',
    participantIds: ['self', 'jisu']
  });
});

test('moves payer selection with arrow keys and Home/End, wrapping at list edges', () => {
  assert.equal(typeof settlement.getNextExpensePayerIndex, 'function');
  assert.equal(getNextExpensePayerIndex(0, 'ArrowDown', 3), 1);
  assert.equal(getNextExpensePayerIndex(2, 'ArrowDown', 3), 0);
  assert.equal(getNextExpensePayerIndex(0, 'ArrowUp', 3), 2);
  assert.equal(getNextExpensePayerIndex(1, 'Home', 3), 0);
  assert.equal(getNextExpensePayerIndex(1, 'End', 3), 2);
  assert.equal(getNextExpensePayerIndex(0, 'ArrowDown', 0), -1);
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
