import type { LiveMatch, PendingOnlineMove } from './match-types.js';

export type PendingMoveReconciliation = 'accepted' | 'not-applied' | 'pending';

/** Resolve a pending client move only from its acknowledgement or an authoritative sync snapshot. */
export function reconcilePendingMove(
  pending: PendingOnlineMove | null,
  match: LiveMatch,
  delivery: { syncId?: string; acceptedActionId?: string },
): PendingMoveReconciliation {
  if (!pending) return 'pending';

  const stateChanged = match.state !== null && match.state !== undefined &&
    JSON.stringify(match.state) !== pending.previousStateKey;
  if (delivery.acceptedActionId === pending.actionId ||
    (stateChanged && match.revision > pending.expectedRevision)) return 'accepted';
  if (delivery.syncId) return 'not-applied';
  return 'pending';
}
