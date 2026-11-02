import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcilePendingMove } from '../src/features/match/pending-move-reconciliation.ts';

const pending = {
  actionId: 'action-1',
  action: { type: 'drop-token', column: 2 },
  previousStateKey: JSON.stringify({ moves: [] }),
  seat: 'first',
  expectedRevision: 4,
};

function match(state, revision = 4) {
  return { state, revision };
}

test('an authoritative sync with the unchanged board confirms the move was not applied', () => {
  assert.equal(reconcilePendingMove(pending, match({ moves: [] }), { syncId: 'sync-1' }), 'not-applied');
});

test('a sync snapshot with a newer board resolves the pending move', () => {
  assert.equal(reconcilePendingMove(pending, match({ moves: ['first:2'] }, 5), { syncId: 'sync-1' }), 'accepted');
});

test('an action acknowledgement resolves the pending move even without a board comparison', () => {
  assert.equal(reconcilePendingMove(pending, match(null), { acceptedActionId: 'action-1' }), 'accepted');
});

test('a non-sync snapshot without the move leaves reconciliation pending', () => {
  assert.equal(reconcilePendingMove(pending, match({ moves: [] }), {}), 'pending');
});
