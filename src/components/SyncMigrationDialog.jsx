import { AlertTriangle, CloudDownload, HardDrive, X } from 'lucide-react';

const countLabel = (value, noun) => `${Number(value) || 0} ${noun}`;

export default function SyncMigrationDialog({
  summary,
  busy = false,
  onImportSafe,
  onUseDevice,
  onUseCloud,
  onLater
}) {
  if (!summary) return null;
  const conflictCount = summary.preview?.conflicts?.length || 0;
  const invalidCount = summary.preview?.invalidEntries?.length || 0;
  const localTrips = summary.localCounts?.trips || 0;
  const localPlaces = summary.localCounts?.savedPlaces || 0;
  const legacyTrips = summary.legacyCloudCounts?.trips || 0;
  const legacyPlaces = summary.legacyCloudCounts?.savedPlaces || 0;
  const remoteTrips = summary.remoteCounts?.trips || 0;
  const remotePlaces = summary.remoteCounts?.savedPlaces || 0;

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 12000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.48)' }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-migration-title"
        style={{ width: 'min(100%, 520px)', maxHeight: 'min(88dvh, 760px)', overflowY: 'auto', borderRadius: 24, background: '#fff', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.28)', padding: 24 }}
      >
        <header style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 14, display: 'grid', placeItems: 'center', color: '#2563eb', background: '#eff6ff' }}>
            <HardDrive size={22} aria-hidden="true" />
          </span>
          <div style={{ flex: 1 }}>
            <h2 id="sync-migration-title" style={{ margin: '1px 0 6px', color: '#111827', fontSize: 20 }}>기기 간 데이터 동기화</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.55 }}>
              기존 기기 데이터와 계정 동기화 자료를 확인했습니다. 선택하기 전까지 어느 쪽도 덮어쓰지 않습니다.
            </p>
          </div>
          <button type="button" aria-label="나중에 하기" onClick={onLater} disabled={busy} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
          <div style={{ borderRadius: 16, background: '#f8fafc', padding: 14 }}>
            <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#334155' }}>이 기기</strong>
            <span style={{ color: '#64748b', fontSize: 12 }}>{countLabel(localTrips, '여행')} · {countLabel(localPlaces, '저장 장소')}</span>
          </div>
          <div style={{ borderRadius: 16, background: '#f0fdf4', padding: 14 }}>
            <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#166534' }}>기존 계정 자료</strong>
            <span style={{ color: '#15803d', fontSize: 12 }}>{countLabel(legacyTrips, '여행')} · {countLabel(legacyPlaces, '저장 장소')}</span>
          </div>
          <div style={{ borderRadius: 16, background: '#eff6ff', padding: 14, gridColumn: '1 / -1' }}>
            <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#1e40af' }}>새 동기화 자료</strong>
            <span style={{ color: '#1d4ed8', fontSize: 12 }}>{countLabel(remoteTrips, '여행')} · {countLabel(remotePlaces, '저장 장소')}</span>
          </div>
        </div>

        {(conflictCount > 0 || invalidCount > 0) && (
          <div role="status" style={{ display: 'flex', gap: 10, marginTop: 16, borderRadius: 14, background: '#fff7ed', color: '#9a3412', padding: 14, fontSize: 12, lineHeight: 1.55 }}>
            <AlertTriangle size={18} style={{ flex: '0 0 auto', marginTop: 1 }} aria-hidden="true" />
            <div>
              {conflictCount > 0 && <div>같은 ID의 다른 내용 {conflictCount}건은 자동으로 합치지 않습니다. 안전 가져오기는 서버 값을 유지합니다. 아래의 기기 자료 선택을 누르면 이 기기 버전을 서버에 반영하고, 기존 로컬 원본은 백업합니다.</div>}
              {invalidCount > 0 && <div>형식 확인이 필요한 항목 {invalidCount}건은 건너뛰고 나머지만 처리합니다.</div>}
            </div>
          </div>
        )}

        {summary.error && <p role="alert" style={{ margin: '14px 0 0', color: '#b91c1c', fontSize: 12, lineHeight: 1.5 }}>{summary.error}</p>}

        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onImportSafe} disabled={busy} style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 0, borderRadius: 14, background: '#2563eb', color: '#fff', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
            <CloudDownload size={18} aria-hidden="true" />
            {busy ? '확인 중…' : '충돌 없는 기존 자료 가져오기'}
          </button>
          <button type="button" onClick={onUseDevice} disabled={busy} style={{ minHeight: 46, border: '1px solid #fed7aa', borderRadius: 14, background: '#fff7ed', color: '#9a3412', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
            이 기기 자료로 충돌 해결
          </button>
          <button type="button" onClick={onUseCloud} disabled={busy} style={{ minHeight: 46, border: '1px solid #dbeafe', borderRadius: 14, background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
            새 동기화 자료 사용
          </button>
          <button type="button" onClick={onLater} disabled={busy} style={{ minHeight: 42, border: 0, borderRadius: 14, background: '#f8fafc', color: '#64748b', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
            나중에 결정
          </button>
        </div>
      </section>
    </div>
  );
}
