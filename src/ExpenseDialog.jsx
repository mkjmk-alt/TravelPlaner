import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ExpenseDialog({ title, onClose, children, footer, variant = 'editor' }) {
  const dialog = useRef(null);
  const titleID = useId();

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleID} className={`expense-dialog expense-dialog--${variant}`}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <header className="expense-dialog-header">
        <h2 id={titleID}>{title}</h2>
        <button type="button" autoFocus aria-label="닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="expense-dialog-scroll">{children}</div>
      {footer && <footer className="expense-dialog-footer">{footer}</footer>}
    </dialog>,
    document.body
  );
}
