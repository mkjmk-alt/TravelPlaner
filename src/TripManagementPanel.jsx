import React, { useState } from 'react';
import { Check, ClipboardList, Download, Plane, Save, Upload } from 'lucide-react';
import LodgingManager from './LodgingManager';
import { getTravelDetails } from './travelMemory';
import './travel-management.css';

const travelDetailFields = [
  { name: 'departure', label: '출발지', placeholder: '예: 인천공항' },
  { name: 'arrival', label: '도착지', placeholder: '예: 나리타공항' },
  { name: 'flightNumber', label: '항공편', placeholder: '예: KE703' },
  { name: 'flightDepartureDate', label: '출발일 (현지)', type: 'date' },
  { name: 'flightDepartureTime', label: '출발 시간 (현지)', type: 'time' },
  { name: 'flightArrivalDate', label: '도착일 (현지)', type: 'date' },
  { name: 'flightArrivalTime', label: '도착 시간 (현지)', type: 'time' },
  { name: 'flightBoardingDate', label: '탑승일 (확인된 경우)', type: 'date' },
  { name: 'flightBoardingTime', label: '탑승 시간 (확인된 경우)', type: 'time' },
  { name: 'stayName', label: '기존 숙소 (날짜 미지정)', placeholder: '예: 도쿄 호텔' },
  { name: 'stayAddress', label: '숙소 주소', wide: true }
];

function ManualTravelDetails({ details, canEdit, onUpdateTrip }) {
  const [changes, setChanges] = useState({});
  const [status, setStatus] = useState('');
  const saving = status === 'saving';

  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || saving || !Object.keys(changes).length) return;
    setStatus('saving');
    try {
      await onUpdateTrip({ travelDetails: { ...details, ...changes } });
      setChanges({});
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="travel-memory-card">
      <div className="travel-memory-card-heading">
        <h3>항공·숙소 정보</h3>
        <Plane size={18} aria-hidden="true" />
      </div>
      <form onSubmit={save}>
        <div className="travel-memory-form-grid">
          {travelDetailFields.map(({ name, label, type, placeholder, wide }) => (
            <label key={name} className={wide ? 'travel-memory-form-grid-wide' : undefined}>
              <span>{label}</span>
              <input
                type={type || 'text'}
                disabled={!canEdit || saving}
                value={canEdit ? changes[name] ?? details[name] : details[name]}
                onChange={event => {
                  const { value } = event.target;
                  setChanges(current => ({ ...current, [name]: value }));
                  setStatus('');
                }}
                placeholder={placeholder}
              />
            </label>
          ))}
        </div>
        {canEdit && (
          <button type="submit" className="travel-memory-secondary-button" disabled={saving || !Object.keys(changes).length}>
            {status === 'saved' ? <Check size={14} aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            {status === 'saved' ? '저장됨' : saving ? '저장 중' : '여행 정보 저장'}
          </button>
        )}
        {canEdit && status === 'error' && <p className="travel-memory-form-error" role="alert">여행 정보를 저장하지 못했습니다. 다시 시도해주세요.</p>}
      </form>
    </section>
  );
}

export default function TripManagementPanel({
  trip,
  readOnly = false,
  savedPlaces = [],
  onUpdateTrip,
  onOpenChecklist,
  checklist,
  onExportBackup,
  onRestoreBackup
}) {
  if (!trip) return null;

  const details = getTravelDetails(trip);
  const canEdit = !readOnly && typeof onUpdateTrip === 'function';
  const actions = [
    !readOnly && onOpenChecklist && {
      label: '여행 준비 체크리스트',
      icon: <ClipboardList size={15} aria-hidden="true" />,
      run: onOpenChecklist,
      expanded: checklist === undefined ? undefined : Boolean(checklist)
    },
    onExportBackup && { label: '여행 데이터 백업', icon: <Download size={15} aria-hidden="true" />, run: onExportBackup },
    !readOnly && onRestoreBackup && { label: '백업 복원', icon: <Upload size={15} aria-hidden="true" />, run: onRestoreBackup }
  ].filter(Boolean);

  return (
    <section className="trip-management-panel" aria-label="여행 관리">
      {actions.length > 0 && (
        <div className="trip-management-actions" role="group" aria-label="여행 준비 및 백업">
          {actions.map(({ label, icon, run, expanded }) => (
            <button key={label} type="button" className="travel-memory-secondary-button" aria-expanded={expanded} onClick={() => run()}>
              {icon} {label}
            </button>
          ))}
        </div>
      )}
      {!readOnly && checklist}
      <React.Fragment key={trip.id}>
        <ManualTravelDetails details={details} canEdit={canEdit} onUpdateTrip={onUpdateTrip} />
        <LodgingManager trip={trip} readOnly={!canEdit} savedPlaces={savedPlaces} legacyDetails={details} onUpdateTrip={onUpdateTrip} />
      </React.Fragment>
    </section>
  );
}
