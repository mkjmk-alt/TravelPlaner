import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Edit2, MoreHorizontal, Navigation, Trash2, X } from 'lucide-react';

export default function ItineraryRowMenu({ name, ...actions }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);

  return (
    <>
      <button ref={trigger} type="button" className="itinerary-row-action"
        aria-label={`${name} 일정 작업`} aria-haspopup="dialog" title="일정 작업"
        onClick={() => setOpen(true)}>
        <MoreHorizontal size={19} aria-hidden="true" />
      </button>
      {open && <ItineraryRowMenuDialog name={name} trigger={trigger} onClose={() => setOpen(false)} {...actions} />}
    </>
  );
}

function ItineraryRowMenuDialog({ name, trigger, onClose, onEdit, onMoveUp, onMoveDown, onNavigate, onDelete, dayMove }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const panel = dialog.current;
    const origin = trigger.current;
    panel.showModal();
    return () => {
      panel.close();
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [trigger]);

  const run = action => {
    onClose();
    action();
  };

  return createPortal(
    <dialog ref={dialog} className="business-place-dialog itinerary-row-menu" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className="business-place-dialog-header">
        <h2 id={titleId}>일정 작업</h2>
        <button type="button" autoFocus aria-label="닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="business-place-dialog-scroll itinerary-row-menu-body">
        <h3>{name}</h3>
        {confirmDelete ? (
          <>
            <p>{dayMove ? '이 예비 장소를 삭제할까요?' : '이 일정을 삭제할까요?'}</p>
            <button type="button" className="is-destructive" onClick={() => run(onDelete)}>
              <Trash2 size={16} aria-hidden="true" />삭제 확인
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}>취소</button>
          </>
        ) : (
          <>
            {onEdit && <button type="button" onClick={() => run(onEdit)}><Edit2 size={16} aria-hidden="true" />일정 편집</button>}
            {(onEdit || dayMove) && <>
              <button type="button" disabled={!onMoveUp} onClick={() => run(onMoveUp)}><ChevronUp size={16} aria-hidden="true" />위로 이동</button>
              <button type="button" disabled={!onMoveDown} onClick={() => run(onMoveDown)}><ChevronDown size={16} aria-hidden="true" />아래로 이동</button>
            </>}
            {dayMove ? (
              <select aria-label="일차로 이동" value="" disabled={!dayMove.days.length} onChange={event => {
                const target = event.target.value;
                if (target) run(() => dayMove.move(target));
              }}>
                <option value="" disabled>일차로 이동</option>
                {dayMove.days.map(day => <option value={day} key={day}>{day}일차</option>)}
              </select>
            ) : (
              <button type="button" disabled={!onNavigate} onClick={() => run(onNavigate)}><Navigation size={16} aria-hidden="true" />길찾기</button>
            )}
            {onDelete && <button type="button" className="is-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden="true" />{dayMove ? '예비 장소 삭제' : '일정 삭제'}
            </button>}
          </>
        )}
      </div>
    </dialog>,
    document.body
  );
}
