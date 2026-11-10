const TRIP_KEY = 'world_pro_trips_v1';
const SAVED_PLACE_KEY = 'world_pro_fav_v1';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
};

const hashText = (value) => {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(36)}${second.toString(36)}${value.length.toString(36)}`;
};

const describeInvalid = (key, index, reason) => ({ key, index, reason });

/** Convert legacy array-valued user_state rows to stable v2 records without mutating the source. */
export function convertLegacyUserStateRows(userID, rows) {
  const records = [];
  const invalidEntries = [];
  const duplicates = [];
  const seen = new Map();
  let localOnlyCount = 0;

  if (!Array.isArray(rows)) {
    return {
      records,
      invalidEntries: [describeInvalid('', -1, '기존 사용자 데이터 행이 배열이 아닙니다.')],
      duplicates,
      localOnlyCount
    };
  }

  rows.forEach((row) => {
    if (!isPlainObject(row) || ![TRIP_KEY, SAVED_PLACE_KEY].includes(row.key)) return;
    if (!Array.isArray(row.value)) {
      invalidEntries.push(describeInvalid(row.key, -1, '저장된 값이 목록 형식이 아닙니다.'));
      return;
    }

    row.value.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        invalidEntries.push(describeInvalid(row.key, index, '객체 형식이 아닌 항목입니다.'));
        return;
      }

      let type;
      let recordID;
      let payload;

      if (row.key === TRIP_KEY) {
        if (entry.localOnly) {
          localOnlyCount += 1;
          return;
        }
        if (entry.id === undefined || entry.id === null || String(entry.id).trim() === '') {
          invalidEntries.push(describeInvalid(row.key, index, '여행 ID가 없어 안전하게 가져올 수 없습니다.'));
          return;
        }
        type = 'trip';
        recordID = String(entry.id);
        payload = { ...entry, id: recordID };
        delete payload.localOnly;
        // A creator-only secret must never be copied into cross-device sync records.
        delete payload.sharedManagementToken;
      } else {
        const place = String(entry.loc || entry.location || entry.formatted_address || '').trim();
        const name = String(entry.name || entry.displayName || '').trim();
        if (!place && !entry.id && !entry.placeId && !entry.place_id) {
          invalidEntries.push(describeInvalid(row.key, index, '저장 장소의 위치 또는 ID가 없습니다.'));
          return;
        }
        type = 'savedPlace';
        const stableSource = JSON.stringify(canonicalize({
          userID: String(userID || ''),
          place: place.normalize('NFKC').toLocaleLowerCase() || name.normalize('NFKC').toLocaleLowerCase()
        }));
        recordID = String(entry.id || entry.placeId || entry.place_id || `legacy-${hashText(stableSource)}`);
        payload = { ...entry, id: recordID };
        if (!payload.loc && place) payload.loc = place;
      }

      if (recordID.length > 200) {
        invalidEntries.push(describeInvalid(row.key, index, 'ID가 서버 허용 길이를 초과합니다.'));
        return;
      }

      const identity = `${type}:${recordID}`;
      if (seen.has(identity)) {
        const previous = seen.get(identity);
        duplicates.push({
          type,
          recordID,
          key: row.key,
          index,
          identical: JSON.stringify(canonicalize(previous.payload)) === JSON.stringify(canonicalize(payload)),
          previous: previous.payload,
          payload
        });
        return;
      }
      const record = { type, recordID, payload };
      seen.set(identity, record);
      records.push(record);
    });
  });

  return { records, invalidEntries, duplicates, localOnlyCount };
}

export const canonicalSyncJson = (value) => JSON.stringify(canonicalize(value));

export const hashLegacySnapshot = async (rows) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Secure hashing is unavailable for legacy data verification.');
  const bytes = new TextEncoder().encode(canonicalSyncJson(rows));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};
