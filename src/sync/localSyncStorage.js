import { normalizeSettlementParticipants } from '../expenseSettlement.js';
import { getTravelDetails } from '../travelMemory.js';
import { convertLegacyUserStateRows, hashLegacySnapshot } from './legacyUserStateImporter.js';

export const LOCAL_SYNC_TRIPS_KEY = 'travelplaner_sync_v2_local_trips';
export const LOCAL_SYNC_SAVED_PLACES_KEY = 'travelplaner_sync_v2_local_saved_places';
export const LEGACY_TRIPS_KEY = 'world_pro_trips_v1';
export const LEGACY_SAVED_PLACES_KEY = 'world_pro_fav_v1';
export const LOCAL_SYNC_BACKUP_PREFIX = 'travelplaner_sync_legacy_backup_v1_';
export const SYNC_MIGRATION_COMPLETED_PREFIX = 'travelplaner_sync_migration_v2_completed_';
export const SYNC_CHECKPOINT_PREFIX = 'travelplaner_sync_checkpoint_';

export const getDefaultChecklist = () => [
  { id: 'passport', label: '여권 및 신분증', checked: false },
  { id: 'insurance', label: '여행자 보험', checked: false },
  { id: 'charger', label: '충전기·보조배터리', checked: false },
  { id: 'cash', label: '환전·현금 준비', checked: false },
  { id: 'reservation', label: '예약·티켓 확인', checked: false }
];

export function withSyncDisplayDefaults(trip) {
  return {
    ...trip,
    updatedAt: Number(trip.updatedAt || trip.createdAt || 0),
    reserveItems: Array.isArray(trip.reserveItems) ? trip.reserveItems : [],
    checklist: Array.isArray(trip.checklist) ? trip.checklist : getDefaultChecklist(),
    travelDetails: getTravelDetails(trip),
    journalEntries: Array.isArray(trip.journalEntries) ? trip.journalEntries : [],
    settlementParticipants: Array.isArray(trip.settlementParticipants) && trip.settlementParticipants.length
      ? trip.settlementParticipants : normalizeSettlementParticipants(),
    expenses: Array.isArray(trip.expenses) ? trip.expenses.map(expense => ({
      ...expense, category: expense?.category || 'other', memo: expense?.memo || ''
    })) : []
  };
}

export function comparableSyncPayload(type, payload) {
  if (type !== 'trip' || payload == null) return payload;
  const display = withSyncDisplayDefaults(payload);
  delete display.updatedAt;
  delete display.sharedManagementToken;
  delete display.localOnly;
  return display;
}

const fingerprint = (type, payload) => hashLegacySnapshot(comparableSyncPayload(type, payload));

export async function createSyncCheckpoint(userID, baseline) {
  const entries = await Promise.all([...baseline].map(async ([key, { record, payload }]) => [
    key,
    {
      revision: record.revision,
      deleted: Boolean(record.deletedAt),
      fingerprint: payload == null ? null : await fingerprint(record.type, payload)
    }
  ]));
  return { userID, entries: Object.fromEntries(entries) };
}

export async function planStartupSync(userID, checkpoint, candidates, records) {
  if (checkpoint?.userID !== userID || !checkpoint.entries) return { changes: [], review: candidates };
  const remote = new Map(records.map(record => [`${record.type}:${record.recordID}`, record]));
  const changes = [];
  const review = [];
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.recordID}`;
    const previous = checkpoint.entries[key];
    const current = remote.get(key);
    if (previous && !previous.deleted && current &&
        previous.fingerprint === await fingerprint(candidate.type, candidate.payload)) continue;
    if (previous && !previous.deleted && current && !current.deletedAt && previous.revision === current.revision) {
      changes.push({ ...candidate, expectedRevision: previous.revision });
    } else {
      review.push(candidate);
    }
  }
  return { changes, review };
}

export function excludeSyncRows(userID, rows, excludedKeys) {
  if (!excludedKeys.size) return rows;
  return rows.map(row => ({
    ...row,
    value: !Array.isArray(row.value) ? row.value : row.value.filter(entry => {
      const [candidate] = convertLegacyUserStateRows(userID, [{ key: row.key, value: [entry] }]).records;
      return !candidate || !excludedKeys.has(`${candidate.type}:${candidate.recordID}`);
    })
  }));
}
