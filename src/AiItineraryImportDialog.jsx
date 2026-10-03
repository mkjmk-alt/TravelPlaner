import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Upload, X } from 'lucide-react';

const readViewport = () => {
  if (typeof window === 'undefined') return { height: 0, top: 0 };
  return {
    height: window.visualViewport?.height || window.innerHeight,
    top: Math.max(0, window.visualViewport?.offsetTop || 0)
  };
};

export default function AiItineraryImportDialog({ value, onChange, template, onCopyTemplate, onImport, onFileImport, onClose, isActive = true }) {
  const [viewport, setViewport] = useState(readViewport);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const descriptionId = useId();
  const inputHintId = useId();
  const hasInput = Boolean(value?.trim());

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateViewport = () => setViewport(readViewport());
    window.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, []);

  useEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (document.activeElement === inputRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, inputRef.current.offsetTop - 8);
    }
  }, [viewport.height, viewport.top]);

  const handleKeyDown = event => {
    if (!isActive) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const controls = [...panelRef.current.querySelectorAll('button:not([disabled]), textarea:not([disabled])')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };

  return createPortal(
    <div className={`ai-itinerary-modal-overlay${viewport.height && viewport.height < 480 ? ' is-compact' : ''}`} style={{
      '--ai-dialog-viewport-height': viewport.height ? `${viewport.height}px` : undefined,
      '--ai-dialog-viewport-top': `${viewport.top}px`
    }}>
      <section ref={panelRef} className="ai-itinerary-modal" role="dialog" aria-modal="true" aria-label="AI 일정 가져오기" aria-describedby={descriptionId} onKeyDown={handleKeyDown}>
        <header className="ai-itinerary-modal-header">
          <h2>AI로 일정 만들기</h2>
          <button ref={closeRef} type="button" className="ai-itinerary-modal-close" aria-label="AI 일정 가져오기 창 닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </header>
        <div ref={scrollRef} className="ai-itinerary-modal-body">
          <p id={descriptionId} className="ai-itinerary-modal-description">예시를 복사해 현재 구독 중인 LLM에 직접 여행 일정 작성을 요청한 뒤, 받은 JSON을 붙여넣어 저장하세요.</p>
          <div className="ai-itinerary-template">
            <div className="ai-itinerary-template-heading">
              <div><strong>LLM용 예시 형식</strong><span>복사한 예시를 현재 구독 중인 LLM의 대화창에 붙여넣고 일정 작성을 요청하세요.</span></div>
              <button type="button" onClick={onCopyTemplate} aria-label="LLM 일정 JSON 예시 복사" title="LLM 일정 JSON 예시 복사"><Copy size={13} aria-hidden="true" /> 예시 복사</button>
            </div>
            <pre>{template}</pre>
          </div>
          <div className="ai-itinerary-instructions">
            <strong>사용 방법</strong>
            <ol>
              <li>위의 <b>예시 복사</b>를 눌러 JSON 형식을 복사합니다.</li>
              <li><b>현재 구독 중인 LLM</b>을 직접 열고, 복사한 예시를 대화창에 붙여넣습니다.</li>
              <li>여행지·날짜·장소·방문 시간을 알려주고, 예시 형식을 유지해 설명 없이 <b>JSON만</b> 작성해 달라고 요청합니다.</li>
              <li>LLM이 작성한 답변에서 JSON 코드만 복사해 아래 입력창에 붙여넣습니다.</li>
              <li><b>일정 가져오기</b>를 눌러 여행 일정으로 저장합니다.</li>
            </ol>
            <p>추천 문장: “아래 예시 JSON 형식을 유지해 [여행지]의 [여행 날짜] 여행 일정을 만들어줘. [방문할 장소·시간]을 반영하고, 설명 없이 JSON 코드만 반환해줘.”</p>
          </div>
          <textarea ref={inputRef} className="ai-itinerary-json-input" value={value} onChange={event => onChange(event.target.value)} aria-label="일정 JSON 붙여넣기" aria-describedby={!hasInput ? inputHintId : undefined} placeholder={'{"name": "여행 제목", "itinerary": [{"day": 1, "items": []}]}'} />
        </div>
        <footer className="ai-itinerary-modal-footer">
          <button type="button" className="ai-itinerary-file-import" onClick={onFileImport}><Upload size={14} aria-hidden="true" /> JSON 파일로 가져오기</button>
          {!hasInput && <p id={inputHintId} className="ai-itinerary-input-hint" role="status">일정 JSON을 먼저 붙여넣어 주세요.</p>}
          <div className="ai-itinerary-modal-actions">
            <button type="button" className="ai-itinerary-cancel" onClick={onClose}>취소</button>
            <button type="button" className="ai-itinerary-import" onClick={onImport} disabled={!hasInput} aria-describedby={!hasInput ? inputHintId : undefined}>일정 가져오기</button>
          </div>
        </footer>
      </section>
    </div>, document.body
  );
}
