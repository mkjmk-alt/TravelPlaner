import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car, ChevronDown, Footprints, Route, X } from 'lucide-react';

export function RouteViewOptions({ showFullRoute, onChange }) {
  return <fieldset className="map-route-options itinerary-route-range">
    <legend>표시 범위</legend>
    {[[false, '현재 일차'], [true, '전체 일정']].map(([value, label]) => (
      <label key={label} className={`map-route-option${showFullRoute === value ? ' is-selected' : ''}`}>
        <input type="radio" name="itinerary-route-range" aria-label={label} checked={showFullRoute === value} onChange={() => onChange(value)} />
        <strong>{label}</strong>
      </label>
    ))}
  </fieldset>;
}

export function MapRouteOptions({ settings, onChange }) {
  return (
    <>
      <fieldset className="map-route-options">
        <legend>연결 방식</legend>
        {[
          ['straight', '직선 연결', '장소 사이를 바로 이어 표시'],
          ['road', '실제 길', '도로·보행로를 따라 표시']
        ].map(([mode, label, description]) => (
          <label key={mode} className={`map-route-option${settings.mode === mode ? ' is-selected' : ''}`}>
            <input type="radio" name="map-route-mode" aria-label={label} checked={settings.mode === mode} onChange={() => onChange({ ...settings, mode })} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>
        ))}
      </fieldset>
      {settings.mode === 'road' && (
        <fieldset className="map-route-transport">
          <legend>이동 방법</legend>
          {[
            ['DRIVING', '자동차', Car],
            ['WALKING', '도보', Footprints]
          ].map(([travelMode, label, icon]) => (
            <label key={travelMode} className={`map-route-option${settings.travelMode === travelMode ? ' is-selected' : ''}`}>
              <input type="radio" name="map-route-transport" aria-label={label} checked={settings.travelMode === travelMode} onChange={() => onChange({ ...settings, travelMode })} />
              {React.createElement(icon, { size: 16, 'aria-hidden': true })}<strong>{label}</strong>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

export function RouteFeedback({ routeState, settings, onChange, isReserve, hasSelectedDay = true, showFullRoute = false, showConfirm = false, onConfirm }) {
  if (settings.mode !== 'road') return null;
  const { status, total, failures, warnings, error, onRetry } = routeState;
  const message = status === 'loading'
    ? `일정 순서대로 ${total}개 구간의 길을 찾고 있어요.`
    : status === 'idle' && total > 0
    ? '지도가 준비되면 선택한 실제 길을 표시합니다.'
    : error
    ? '실제 길을 불러오지 못했습니다. 다시 시도하거나 직선 연결로 확인해주세요.'
    : failures.length
    ? `${failures.length}개 구간은 길을 찾지 못해 연결하지 않았어요.`
    : !total
    ? isReserve ? '예비 목록에는 연결 경로를 표시하지 않습니다.'
      : !hasSelectedDay && !showFullRoute ? '일차 제목을 선택하거나 표시 범위를 전체 일정으로 변경해주세요.'
      : '경로를 보려면 위치가 있는 장소를 2개 이상 추가해주세요.'
    : `일정 순서대로 ${total}개 구간을 연결했어요.`;
  return (
    <div className={`map-route-feedback-content${error || failures.length ? ' is-warning' : ''}`} role="status" aria-live="polite">
      <p>{status === 'loading' && <span className="map-route-spinner" aria-hidden="true" />}{message}</p>
      {warnings.length > 0 && <ul className="map-route-warnings">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {(error || failures.length > 0) && (
        <div className="map-route-feedback-actions">
          <button type="button" onClick={onRetry}>다시 시도</button>
          <button type="button" onClick={() => onChange({ ...settings, mode: 'straight' })}>직선 연결</button>
          {showConfirm && <button type="button" className="map-route-feedback-confirm" onClick={onConfirm}>확인</button>}
        </div>
      )}
      {showConfirm && !(error || failures.length > 0) && (
        <div className="map-route-feedback-actions">
          <button type="button" className="map-route-feedback-confirm" onClick={onConfirm}>확인</button>
        </div>
      )}
    </div>
  );
}

function RouteSettingsDialog({ settings, onChange, routeState, isReserve, hasSelectedDay, showFullRoute, onShowFullRouteChange, isMobile, triggerRef, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [triggerRef]);
  return createPortal(
    <dialog ref={dialogRef} className={`itinerary-route-dialog${isMobile ? ' is-mobile' : ''}`} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="map-route-settings-heading">
        <h2 id={titleId}>일정 경로 표시</h2>
        <button type="button" aria-label="경로 설정 닫기" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="itinerary-route-dialog-body">
        <RouteViewOptions showFullRoute={showFullRoute} onChange={onShowFullRouteChange} />
        {!hasSelectedDay && !showFullRoute && settings.mode === 'straight' && <p className="map-route-settings-note">일차 제목을 선택하거나 표시 범위를 전체 일정으로 변경해주세요.</p>}
        <MapRouteOptions settings={settings} onChange={onChange} />
        <p className="map-route-settings-note">지도 표시만 변경하며 일정 순서와 도착 시간은 바꾸지 않습니다. 연결 방식과 이동 방법은 이 브라우저에 저장됩니다.</p>
        <RouteFeedback routeState={routeState} settings={settings} onChange={onChange} isReserve={isReserve}
          hasSelectedDay={hasSelectedDay} showFullRoute={showFullRoute} />
      </div>
      <footer className="itinerary-route-dialog-footer"><button type="button" onClick={onClose}>확인</button></footer>
    </dialog>, document.body
  );
}

function RouteNotice({ settings, onChange, routeState, isReserve, hidden }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || hidden) return null;
  return <div className="itinerary-route-notice">
    <RouteFeedback routeState={routeState} settings={settings} onChange={onChange} isReserve={isReserve}
      showConfirm onConfirm={() => setDismissed(true)} />
  </div>;
}

export default function ItineraryRouteSettings({ settings, onChange, routeState, isReserve, hasSelectedDay = true, showFullRoute = false, onShowFullRouteChange, isMobile = false }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const summary = settings.mode === 'road' ? `실제 길 · ${settings.travelMode === 'WALKING' ? '도보' : '자동차'}` : '직선';
  const range = showFullRoute ? '전체 일정' : isReserve ? '예비 목록' : hasSelectedDay ? '현재 일차' : '일차 선택 필요';
  const feedbackKey = JSON.stringify({
    requestKey: routeState.requestKey,
    retry: routeState.retry,
    status: routeState.status,
    total: routeState.total,
    failures: routeState.failures,
    warnings: routeState.warnings,
    error: Boolean(routeState.error),
    mode: settings.mode,
    travelMode: settings.travelMode,
    isReserve
  });
  const needsFeedback = settings.mode === 'road' && (
    routeState.status === 'loading' || routeState.error || routeState.failures.length || routeState.warnings.length
  );
  return (
    <div className="itinerary-route-heading">
      <div className="itinerary-route-title-row">
        <h2 className="menu-section-title">내 일정</h2>
        <button
          ref={triggerRef}
          type="button"
          className={`itinerary-route-settings-trigger${settings.mode === 'road' ? ' is-road' : ''}`}
          aria-label="일정 경로 표시 설정"
          title={`${range} · ${summary} 경로 설정`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(value => !value)}
        ><Route size={15} aria-hidden="true" /><span><strong>경로: {summary}</strong><small>{range}</small></span><ChevronDown size={14} aria-hidden="true" /></button>
      </div>
      {open && (
        <RouteSettingsDialog settings={settings} onChange={onChange} routeState={routeState} isReserve={isReserve} hasSelectedDay={hasSelectedDay}
          showFullRoute={showFullRoute} onShowFullRouteChange={onShowFullRouteChange} isMobile={isMobile}
          triggerRef={triggerRef} onClose={() => setOpen(false)} />
      )}
      {needsFeedback && <RouteNotice key={feedbackKey} settings={settings} onChange={onChange}
        routeState={routeState} isReserve={isReserve} hidden={open} />}
    </div>
  );
}
