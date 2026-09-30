import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageDown, Share2, X } from 'lucide-react';
import { captureMapSnapshot } from './mapSnapshot';

function SnapshotPreview({ snapshot, onSave, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [shareError, setShareError] = useState('');
  const file = new File([snapshot.blob], snapshot.fileName, { type: 'image/png' });
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const share = async () => {
    try {
      setShareError('');
      await navigator.share({ files: [file], title: snapshot.title });
    } catch (error) {
      if (error.name !== 'AbortError') setShareError('공유하지 못했습니다. PNG 저장을 이용해주세요.');
    }
  };
  return createPortal(
    <dialog ref={dialogRef} className="map-snapshot-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="map-snapshot-heading">
        <div><h2 id={titleId}>일정 지도 이미지</h2><p>{snapshot.title}</p></div>
        <button type="button" aria-label="지도 이미지 닫기" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="map-snapshot-image"><img src={snapshot.url} alt={`${snapshot.title} 지도 미리보기`} /></div>
      <p className="map-snapshot-note">현재 지도 범위의 경로와 번호 마커가 저장됩니다. 다른 범위를 담으려면 지도를 이동하거나 확대·축소한 뒤 다시 저장해주세요.</p>
      {shareError && <p className="map-snapshot-note" role="alert">{shareError}</p>}
      <footer className="map-snapshot-footer">
        <button type="button" onClick={onClose}>닫기</button>
        {canShare && <button type="button" onClick={share}><Share2 size={16} />공유</button>}
        <button type="button" className="is-primary" onClick={() => onSave(snapshot.blob, snapshot.fileName)}><Download size={16} />PNG 저장</button>
      </footer>
    </dialog>, document.body
  );
}

export default function MapSnapshotControl({ mapRef, enabled, routeLoading = false, tripName = 'TripPlot', routeLabel, onSave }) {
  const [capturing, setCapturing] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => () => {
    if (snapshot) URL.revokeObjectURL(snapshot.url);
  }, [snapshot]);
  const capture = async () => {
    if (capturing || !enabled || routeLoading) return;
    setCapturing(true);
    setError('');
    try {
      const blob = await captureMapSnapshot(mapRef.current?.getDiv());
      if (!mountedRef.current) return;
      const title = `${tripName} · ${routeLabel}`;
      const safeName = `${tripName}_${routeLabel}_지도`.replace(/[\\/:*?"<>|]/g, '_').replace(/\p{Cc}/gu, '_').slice(0, 100);
      setSnapshot({ blob, url: URL.createObjectURL(blob), title, fileName: `${safeName}.png` });
    } catch (cause) {
      if (mountedRef.current) setError(cause.message || '지도 이미지를 만들지 못했습니다. 다시 시도해주세요.');
    } finally {
      if (mountedRef.current) setCapturing(false);
    }
  };
  const title = !enabled ? '일정이 있는 일차 또는 전체 경로를 선택해주세요.'
    : routeLoading ? '경로를 불러온 뒤 저장할 수 있습니다.' : capturing ? '지도 이미지 만드는 중' : '일정 지도 이미지 저장';
  return <div className="map-snapshot-control">
    <button type="button" className="map-snapshot-trigger" aria-label="일정 지도 이미지 저장" title={title}
      disabled={!enabled || routeLoading || capturing} aria-busy={capturing} onClick={capture}>
      {capturing ? <span className="map-route-spinner" aria-hidden="true" /> : <ImageDown size={24} aria-hidden="true" />}
    </button>
    {capturing && <span className="sr-only" role="status">지도 이미지 만드는 중</span>}
    {error && <div className="map-snapshot-error" role="alert"><p>{error}</p><button type="button" onClick={() => setError('')}>확인</button></div>}
    {snapshot && <SnapshotPreview snapshot={snapshot} onSave={onSave} onClose={() => setSnapshot(null)} />}
  </div>;
}
