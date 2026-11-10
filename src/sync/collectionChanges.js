import { canonicalSyncJson } from './legacyUserStateImporter.js';

export function syncRecordsUnchanged(known, incoming) {
  if (known.size !== incoming.length) return false;
  return incoming.every(record => {
    const previous = known.get(`${record.type}:${record.recordID}`);
    return Boolean(previous && previous.userID === record.userID && previous.revision === record.revision && previous.deletedAt === record.deletedAt);
  });
}

// Baseline represents what this browser actually displayed, not a fresh server
// snapshot: an unseen server record must never be interpreted as a deletion.
export function planCollectionChanges(type, userID, baseline, items) {
  const next = new Map(items.map(item => [String(item.id), item]));
  const changes = [];
  for (const [recordID, payload] of next) {
    const entry = baseline.get(`${type}:${recordID}`);
    const record = entry?.record?.userID === userID ? entry.record : null;
    if (record && !record.deletedAt && entry.payload != null && canonicalSyncJson(entry.payload) === canonicalSyncJson(payload)) continue;
    changes.push({ type, recordID, expectedRevision: record?.revision || 0, payload, deleted: false });
  }
  for (const entry of baseline.values()) {
    const record = entry.record;
    if (record?.userID !== userID || record.type !== type || record.deletedAt || entry.payload == null || next.has(record.recordID)) continue;
    changes.push({ type, recordID: record.recordID, expectedRevision: record.revision, payload: null, deleted: true });
  }
  return changes;
}
