import React, { useEffect, useRef, useState } from 'react';
import { Car, Footprints, Route, X } from 'lucide-react';

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

function RouteFeedback({ routeState, settings, onChange, isReserve }) {
  if (settings.mode !== 'road') return null;
  const { status, total, failures, warnings, error, onRetry } = routeState;
  const message = status === 'loading'
    ? `일정 순서대로 ${total}개 구간의 길을 찾고 있어요.`
    : error
    ? '실제 길을 불러오지 못했습니다. 다시 시도하거나 직선 연결로 확인해주세요.'
    : failures.length
    ? `${failures.length}개 구간은 길을 찾지 못해 연결하지 않았어요.`
    : !total
    ? isReserve ? '예비 목록에는 연결 경로를 표시하지 않습니다.' : '경로를 보려면 위치가 있는 장소를 2개 이상 추가해주세요.'
    : `일정 순서대로 ${total}개 구간을 연결했어요.`;
  return (
    <div className={`map-route-feedback-content${error || failures.length ? ' is-warning' : ''}`} role="status" aria-live="polite">
      <p>{status === 'loading' && <span className="map-route-spinner" aria-hidden="true" />}{message}</p>
      {warnings.length > 0 && <ul className="map-route-warnings">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {(error || failures.length > 0) && (
        <div className="map-route-feedback-actions">
          <button type="button" onClick={onRetry}>다시 시도</button>
          <button type="button" onClick={() => onChange({ ...settings, mode: 'straight' })}>직선 연결</button>
        </div>
      )}
    </div>
  );
}

export default function MapRouteSettings({ settings, onChange, routeState, isReserve }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  const needsFeedback = settings.mode === 'road' && (
    routeState.status === 'loading' || routeState.error || routeState.failures.length || routeState.warnings.length
  );
  return (
    <div className="map-route-settings" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`map-route-settings-trigger${settings.mode === 'road' ? ' is-road' : ''}`}
        aria-label="일정 경로 표시 설정"
        title="일정 경로 표시 설정"
        aria-expanded={open}
        aria-controls="map-route-settings-panel"
        onClick={() => setOpen(value => !value)}
      ><Route size={24} aria-hidden="true" /></button>
      {open ? (
        <section id="map-route-settings-panel" className="map-route-settings-panel" aria-label="일정 경로 표시 설정">
          <div className="map-route-settings-heading">
            <strong>일정 경로 표시</strong>
            <button type="button" aria-label="경로 설정 닫기" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={16} /></button>
          </div>
          <MapRouteOptions settings={settings} onChange={onChange} />
          <p className="map-route-settings-note">저장한 일정 순서대로 화살표를 표시합니다.</p>
          <RouteFeedback routeState={routeState} settings={settings} onChange={onChange} isReserve={isReserve} />
        </section>
      ) : needsFeedback ? (
        <div className="map-route-feedback">
          <RouteFeedback routeState={routeState} settings={settings} onChange={onChange} isReserve={isReserve} />
        </div>
      ) : null}
    </div>
  );
}
