import { canonicalSyncJson, convertLegacyUserStateRows } from './legacyUserStateImporter.js';

const RECORD_COLUMNS = 'user_id,record_type,record_id,payload,revision,updated_at,deleted_at';

const normalizeRecord = (record) => {
  if (!record) return null;
  return {
    userID: String(record.user_id),
    type: record.record_type,
    recordID: String(record.record_id),
    payload: record.payload ?? null,
    revision: Number(record.revision) || 0,
    updatedAt: record.updated_at || null,
    deletedAt: record.deleted_at || null
  };
};

const recordKey = (type, recordID) => `${type}:${recordID}`;

const parseCursor = (cursor) => {
  if (cursor === null || cursor === undefined || cursor === '') return 0;
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('Invalid sync page cursor.');
  return offset;
};

const assertOperation = (operation) => {
  if (!operation?.userID || !['trip', 'savedPlace'].includes(operation.type)) {
    throw new TypeError('Sync operation requires a user ID and supported record type.');
  }
  if (!operation.recordID || String(operation.recordID).length > 200) {
    throw new TypeError('Sync operation requires a valid record ID.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(operation.operationID || '')) || !Number.isSafeInteger(Number(operation.expectedRevision)) || Number(operation.expectedRevision) < 0) {
    throw new TypeError('Sync operation requires a stable operation ID and expected revision.');
  }
  if (operation.deletedAt ? operation.payload != null : (!operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload))) {
    throw new TypeError('Sync operation payload does not match active/tombstone state.');
  }
};

const defaultMakeOperationID = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable.');
  return globalThis.crypto.randomUUID();
};

export function createSyncV2Repository({ supabase, queueStore, makeOperationID = defaultMakeOperationID, pageSize = 500 }) {
  if (!supabase?.from || !supabase?.rpc) throw new TypeError('A Supabase client is required.');
  if (!queueStore?.put || !queueStore?.list || !queueStore?.remove) throw new TypeError('A durable sync queue store is required.');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError('pageSize must be between 1 and 1000.');

  const listRecords = async (userID, cursor = null) => {
    if (!userID) throw new TypeError('A user ID is required to read sync records.');
    const offset = parseCursor(cursor);
    const { data, error } = await supabase
      .from('user_sync_records')
      .select(RECORD_COLUMNS)
      .eq('user_id', userID)
      .order('updated_at', { ascending: true })
      .order('record_type', { ascending: true })
      .order('record_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return {
      records: rows.map(normalizeRecord),
      nextCursor: rows.length === pageSize ? String(offset + rows.length) : null
    };
  };

  const listAllRecords = async (userID) => {
    const records = [];
    let cursor = null;
    do {
      const page = await listRecords(userID, cursor);
      records.push(...page.records);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return records;
  };

  const applyOperation = async (operation) => {
    assertOperation(operation);
    await queueStore.put(JSON.parse(JSON.stringify(operation)));
    const { data, error } = await supabase.rpc('apply_user_sync_operation', {
      p_record_type: operation.type,
      p_record_id: String(operation.recordID),
      p_expected_revision: Number(operation.expectedRevision),
      p_operation_id: operation.operationID,
      p_payload: operation.deletedAt ? null : operation.payload,
      p_deleted_at: operation.deletedAt || null
    });
    if (error) throw error;
    if (!data || !['applied', 'replayed', 'conflict'].includes(data.status)) {
      throw new Error('The sync server returned an invalid operation result.');
    }
    const result = { status: data.status, record: normalizeRecord(data.record) };
    // Conflict entries remain durable so neither the attempted local edit nor its ID is lost.
    if (data.status === 'applied' || data.status === 'replayed') {
      await queueStore.remove(operation.operationID, operation.userID);
    }
    return result;
  };

  const previewLegacyRows = async (userID, rows) => {
    const converted = convertLegacyUserStateRows(userID, rows);
    const existingRecords = await listAllRecords(userID);
    const existingByKey = new Map(existingRecords.map(record => [recordKey(record.type, record.recordID), record]));
    const importable = [];
    const identical = [];
    const conflicts = [];
    const sourceConflictKeys = new Set();

    converted.records.forEach((candidate) => {
      const current = existingByKey.get(recordKey(candidate.type, candidate.recordID));
      if (!current) {
        importable.push(candidate);
      } else if (!current.deletedAt && canonicalSyncJson(current.payload) === canonicalSyncJson(candidate.payload)) {
        identical.push({ local: candidate, remote: current });
      } else {
        conflicts.push({ local: candidate, remote: current });
      }
    });

    converted.duplicates.forEach((duplicate) => {
      if (duplicate.identical) return;
      conflicts.push({
        local: { type: duplicate.type, recordID: duplicate.recordID, payload: duplicate.payload },
        remote: { type: duplicate.type, recordID: duplicate.recordID, payload: duplicate.previous },
        sourceDuplicate: true
      });
      sourceConflictKeys.add(recordKey(duplicate.type, duplicate.recordID));
    });

    const safeImportable = importable.filter(record => !sourceConflictKeys.has(recordKey(record.type, record.recordID)));

    return {
      records: converted.records,
      existingRecords,
      importable: safeImportable,
      identical,
      conflicts,
      sourceConflictKeys: [...sourceConflictKeys],
      invalidEntries: converted.invalidEntries,
      duplicates: converted.duplicates,
      localOnlyCount: converted.localOnlyCount
    };
  };

  const importLegacyRows = async (userID, rows, { conflictChoices = {} } = {}) => {
    await resumePendingOperations(userID);
    const preview = await previewLegacyRows(userID, rows);
    const imported = [];
    const skipped = [...preview.identical];
    const conflicts = [];
    const recordsByKey = new Map(preview.existingRecords.map(record => [recordKey(record.type, record.recordID), record]));
    const sourceAlternates = new Map(preview.duplicates
      .filter(item => !item.identical)
      .map(item => [recordKey(item.type, item.recordID), item]));

    for (const candidate of preview.records) {
      const key = recordKey(candidate.type, candidate.recordID);
      const sourceAlternate = sourceAlternates.get(key);
      if (sourceAlternate && !['local', 'cloud'].includes(conflictChoices[key])) {
        conflicts.push({
          local: { type: candidate.type, recordID: candidate.recordID, payload: sourceAlternate.payload },
          remote: candidate,
          sourceDuplicate: true
        });
        continue;
      }
      const selectedCandidate = sourceAlternate && conflictChoices[key] === 'local'
        ? { ...candidate, payload: sourceAlternate.payload }
        : candidate;
      let current = recordsByKey.get(key);
      const identical = current && !current.deletedAt && canonicalSyncJson(current.payload) === canonicalSyncJson(selectedCandidate.payload);
      if (identical) continue;

      if (current && conflictChoices[key] !== 'local') {
        if (conflictChoices[key] === 'cloud') {
          skipped.push({ local: selectedCandidate, remote: current });
          continue;
        }
        conflicts.push({ local: selectedCandidate, remote: current });
        continue;
      }

      const operation = {
        userID,
        type: selectedCandidate.type,
        recordID: selectedCandidate.recordID,
        expectedRevision: current?.revision || 0,
        operationID: makeOperationID(),
        payload: selectedCandidate.payload,
        deletedAt: null
      };
      const result = await applyOperation(operation);
      if (result.status === 'conflict') {
        conflicts.push({ local: selectedCandidate, remote: result.record });
      } else {
        imported.push({ ...selectedCandidate, record: result.record, status: result.status });
        if (result.record) recordsByKey.set(key, result.record);
      }
    }

    return {
      imported,
      skipped,
      conflicts,
      invalidEntries: preview.invalidEntries,
      duplicates: preview.duplicates,
      localOnlyCount: preview.localOnlyCount
    };
  };

  const listChanges = async (userID, known) => {
    if (!userID || !Array.isArray(known)) return null;
    try {
      const p_known = known.map(record => ({ record_type: record.type, record_id: record.recordID, revision: record.revision, deleted: !!record.deletedAt }));
      const { data, error } = await supabase.rpc('account_sync_delta', { p_known });
      if (error || !data || typeof data.requires_full !== 'boolean' || !Array.isArray(data.records)) return null;
      return { requiresFull: data.requires_full, records: data.records.map(normalizeRecord) };
    } catch { return null; }
  };

  const fingerprint = async () => {
    try {
      const { data, error } = await supabase.rpc('account_sync_fingerprint');
      return !error && typeof data === 'string' && data.length > 0 ? data : null;
    } catch { return null; }
  };

  const listPendingOperations = (userID) => queueStore.list(userID);

  const discardPendingOperations = async (userID, recordKeys = null) => {
    const pending = await queueStore.list(userID);
    const allowedKeys = recordKeys ? new Set(recordKeys) : null;
    const discarded = [];
    for (const operation of pending) {
      if (operation.userID !== userID) continue;
      if (allowedKeys && !allowedKeys.has(recordKey(operation.type, operation.recordID))) continue;
      await queueStore.remove(operation.operationID, userID);
      discarded.push(operation);
    }
    return discarded;
  };

  const resumePendingOperations = async (userID) => {
    const pending = await queueStore.list(userID);
    const results = [];
    for (const operation of pending) {
      if (operation.userID !== userID) continue;
      results.push({ operation, result: await applyOperation(operation) });
    }
    return results;
  };

  return {
    listRecords,
    listAllRecords,
    listChanges,
    fingerprint,
    applyOperation,
    previewLegacyRows,
    importLegacyRows,
    listPendingOperations,
    discardPendingOperations,
    resumePendingOperations
  };
}
