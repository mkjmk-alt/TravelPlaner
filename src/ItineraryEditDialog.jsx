import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { safePlaceLink } from './placeBusinessDetails.js';

export default function ItineraryEditDialog({
  draft, placeLabel, placeAddress, title = '일정 편집', submitLabel = '저장',
  trips, days, timePicker, onChange, onClose, onSave
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [menuError, setMenuError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!viewport) return;
      dialog.style.setProperty('--edit-viewport-height', `${viewport.height}px`);
      dialog.style.setProperty('--edit-viewport-top', `${Math.max(0, viewport.offsetTop)}px`);
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    dialog.showModal();
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const update = (field, value) => onChange(current => ({ ...current, [field]: value }));
  const save = event => {
    event.preventDefault();
    const menuURL = draft.menuURL.trim();
    if (menuURL && !safePlaceLink(menuURL)) {
      setMenuError(true);
      return;
    }
    onSave({
      day: draft.day,
      time: draft.time,
      displayName: draft.displayName.trim(),
      routeOrderFixed: draft.routeOrderFixed,
      reservationNumber: draft.reservationNumber.trim(),
      reservationUrl: draft.reservationUrl.trim(),
      menuURL,
      memo: draft.memo.trim()
    });
  };

  return createPortal(
    <dialog ref={dialogRef} className="itinerary-edit-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <form className="itinerary-edit-form" noValidate onSubmit={save}>
        <header className="itinerary-edit-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p title={placeLabel}>{placeLabel}</p>
            {placeAddress && <p title={placeAddress}>{placeAddress}</p>}
          </div>
          <button type="button" autoFocus className="itinerary-edit-close" aria-label={`${title} 창 닫기`} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="itinerary-edit-body">
          {trips && <label className="itinerary-edit-field">
            대상 여행
            <select value={draft.tripId} onChange={event => {
              const trip = trips.find(candidate => String(candidate.id) === event.target.value);
              if (!trip) return;
              const days = (trip.itinerary || []).map(plan => Number(plan.day)).filter(day => day > 0);
              onChange(current => ({ ...current, tripId: trip.id, day: current.day === 'reserve' || days.includes(current.day)
                ? current.day : days[0] || 'reserve' }));
            }}>
              {trips.map(trip => <option key={trip.id} value={trip.id}>{trip.name || '제목 없는 여행'}</option>)}
            </select>
          </label>}
          <label className="itinerary-edit-field">
            일정 표시 이름
            <input value={draft.displayName} maxLength={80} placeholder={placeLabel}
              onChange={event => update('displayName', event.target.value)} />
          </label>
          <div className="itinerary-edit-timing">
            <label className="itinerary-edit-field">
              일정 위치
              <select value={draft.day}
                onChange={event => update('day', event.target.value === 'reserve' ? 'reserve' : Number(event.target.value))}>
                <option value="reserve">예비 목록</option>
                {days.map(day => <option key={day} value={day}>{day}일차</option>)}
              </select>
            </label>
            {draft.time ? (
              <div className="itinerary-edit-time">
                {timePicker}
                <button type="button" onClick={() => update('time', '')}>시간 미정으로 변경</button>
              </div>
            ) : (
              <div className="itinerary-edit-time">
                <span className="itinerary-edit-field">일정 시간 · 미정</span>
                <button type="button" className="itinerary-edit-set-time" onClick={() => update('time', '09:00')}>시간 설정</button>
              </div>
            )}
          </div>
          {draft.day !== 'reserve' && <label className="itinerary-edit-lock">
            <input type="checkbox" checked={draft.routeOrderFixed}
              onChange={event => update('routeOrderFixed', event.target.checked)} />
            거리순 정렬에서 순서와 시간 고정
          </label>}
          <details className="itinerary-edit-extras">
            <summary>예약·메모·메뉴 링크 <ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="itinerary-edit-extra-fields">
              <label className="itinerary-edit-field">예약번호
                <input value={draft.reservationNumber} onChange={event => update('reservationNumber', event.target.value)} />
              </label>
              <label className="itinerary-edit-field">예약 링크
                <input type="url" value={draft.reservationUrl} placeholder="https://" onChange={event => update('reservationUrl', event.target.value)} />
              </label>
              <label className="itinerary-edit-field">메모
                <textarea value={draft.memo} rows={3} placeholder="체크인 방법, 준비물 등을 적어두세요."
                  onChange={event => update('memo', event.target.value)} />
              </label>
              <label className="itinerary-edit-field">메뉴 링크
                <input type="url" value={draft.menuURL} placeholder="https://" maxLength={2048} aria-invalid={menuError}
                  onChange={event => { update('menuURL', event.target.value); setMenuError(false); }} />
              </label>
            </div>
          </details>
          {menuError && <p className="itinerary-edit-error" role="alert">메뉴 링크는 https:// 또는 http://로 시작해야 해요.</p>}
        </div>

        <footer className="itinerary-edit-footer">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit">{submitLabel}</button>
        </footer>
      </form>
    </dialog>,
    document.body
  );
}
