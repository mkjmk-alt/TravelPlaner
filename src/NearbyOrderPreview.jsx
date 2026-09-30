import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Route, X, MapPin, Clock } from 'lucide-react';
import { getRoutePoint } from './itineraryRoutes';
import { getItineraryItemCategory } from './itineraryCategories';

const formatDistance = meters => meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
const reasons = {
  'too-few': '위치 정보가 있는 장소가 3개 이상이면 순서를 정렬할 수 있습니다.',
  'start-missing': '첫 장소에 위치 정보가 없습니다. 출발할 장소를 맨 앞으로 옮겨주세요.',
  'already-nearby': '이미 가까운 순서로 배치되어 있습니다.'
};

export function NearbyOrderPreviewContent({ preview, blockedReason = '', onApply, onCancel, titleId }) {
  const canApply = preview.changed && !blockedReason;
  return (
    <section className="nearby-order-content">
      <header className="nearby-order-heading">
        <div><span className="nearby-order-eyebrow"><Route size={14} aria-hidden="true" />일차별 동선 정리</span><h2 id={titleId}>{preview.day}일차 가까운 순 정렬</h2></div>
        <button type="button" className="nearby-order-close" aria-label="정렬 미리보기 닫기" onClick={onCancel}><X size={20} /></button>
      </header>
      <div className="nearby-order-scroll">
        <p className="nearby-order-description">첫 장소와 식사 시간을 유지하고, 식사 전후의 장소를 각각 가까운 순서로 정렬합니다.</p>
        <div className="nearby-order-distance" aria-label="위치가 있는 장소 사이의 직선 거리 합계">
          <span>기존 <strong>{formatDistance(preview.beforeMeters)}</strong></span><span aria-hidden="true">→</span><span>정렬 후 <strong>{formatDistance(preview.afterMeters)}</strong></span>
        </div>
        <p className="nearby-order-distance-note">직선 거리 기준이며 실제 도로 거리·최단 동선과 다를 수 있습니다.{preview.afterMeters > preview.beforeMeters + 1 ? ' 이 정렬안은 전체 이동 거리가 더 길어집니다. 적용 전에 확인해주세요.' : ''}</p>
        {(blockedReason || reasons[preview.reason]) && <p className="nearby-order-message" role="status">{blockedReason || reasons[preview.reason]}</p>}
        {preview.missingCount > 0 && <p className="nearby-order-message">위치 정보 없는 {preview.missingCount}개 일정은 기존 자리에 유지합니다. 거리 합계에서는 제외됩니다.</p>}
        {preview.timeSlotsRestored && <p className="nearby-order-message">뒤섞인 시간대를 저장된 시간순으로 복원했습니다. 새 시간을 만들지 않고 기존 시간대에 장소를 배치합니다.</p>}
        <ol className="nearby-order-list" aria-label="정렬 후 방문 순서">
          {preview.items.map((item, index) => {
            const previousIndex = preview.originalIndices?.[index] ?? preview.originalItems.indexOf(item);
            const hasLocation = Boolean(getRoutePoint(item));
            const isMeal = getItineraryItemCategory(item) === 'meal';
            return <li key={`${item.id || 'item'}-${index}`}>
              <span className="nearby-order-number">{index + 1}</span>
              <div className="nearby-order-place"><strong>{item.displayName || item.name || '이름 없는 일정'}</strong><small>{isMeal ? '식사 고정 · 기존 시간 유지' : index === 0 ? '출발점 유지' : !hasLocation ? '위치 없음 · 자리 유지' : previousIndex === index ? '기존 순서 유지' : `기존 ${previousIndex + 1}번째 → ${index + 1}번째`}</small></div>
              <span className="nearby-order-time"><Clock size={12} aria-hidden="true" />{item.time || '미지정'}</span>
            </li>;
          })}
        </ol>
        <p className="nearby-order-time-note"><MapPin size={15} aria-hidden="true" />도착 시간은 기존 시간 칸에 유지하고 장소만 재배치합니다. 식사는 기존 시간에 고정하며, 예약 정보와 메모는 장소와 함께 유지합니다. 일정 화면의 ‘실행 취소’로 되돌릴 수 있습니다.</p>
      </div>
      <footer className="nearby-order-footer">
        <button type="button" data-action="cancel" onClick={onCancel}>취소</button>
        <button type="button" data-action="apply" disabled={!canApply} onClick={() => { if (canApply) onApply(); }}>이 순서로 적용</button>
      </footer>
    </section>
  );
}

export default function NearbyOrderPreview(props) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="nearby-order-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); props.onCancel(); }}
      onClick={event => { if (event.target === event.currentTarget) props.onCancel(); }}>
      <NearbyOrderPreviewContent {...props} titleId={titleId} />
    </dialog>, document.body
  );
}
