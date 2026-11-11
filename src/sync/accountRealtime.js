// Events are invalidation hints only. Authenticated reconciliation remains the
// source of truth and the fallback also covers missed events or an absent publication.
export const ACCOUNT_REFRESH_FALLBACK_MS = 60_000;

export function createAccountRealtimeListener({ supabase, userID, onChange, onConnected, onDisconnected = () => {} }) {
  let active = true;
  const channel = supabase.channel(`account-sync-${userID}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'user_sync_records', filter: `user_id=eq.${userID}`
    }, () => { if (active) onChange(); })
    .subscribe(status => {
      if (!active) return;
      if (status === 'SUBSCRIBED') onConnected();
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) onDisconnected();
    });
  return () => {
    if (!active) return;
    active = false;
    Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
  };
}

export function canSkipFullRefresh(known, current, pendingCount) {
  return typeof known === 'string' && known.length > 0 && known === current && pendingCount === 0;
}

export function confirmedFingerprint(before, after) {
  return typeof before === 'string' && before.length > 0 && before === after ? before : null;
}

export function canApplySnapshot(before, after) {
  // Null on both sides is the compatibility path for servers without the RPC.
  return before === after;
}

export function fallbackInterval(fingerprintAvailable) {
  return fingerprintAvailable ? ACCOUNT_REFRESH_FALLBACK_MS : 10_000;
}

export function mergeAccountDelta(userID, existing, changes) {
  const byKey = new Map();
  for (const row of existing) {
    if (row.userID !== userID || !['trip', 'savedPlace'].includes(row.type) || !row.recordID || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
    const key = `${row.type}:${row.recordID}`;
    if (byKey.has(key)) return null;
    byKey.set(key, row);
  }
  const seen = new Set();
  for (const row of changes) {
    if (row.userID !== userID || !['trip', 'savedPlace'].includes(row.type) || !row.recordID || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
    const key = `${row.type}:${row.recordID}`;
    if (seen.has(key) || (byKey.has(key) && row.revision < byKey.get(key).revision)) return null;
    seen.add(key); byKey.set(key, row);
  }
  return [...byKey.values()];
}
