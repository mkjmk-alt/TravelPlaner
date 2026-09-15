# 삭제 전 백업: 헤더 수동 화면 모드 표시

이 백업은 헤더 옆에 표시되던 `1·2` 화면 모드 마크업과 전용 CSS를 보관합니다.
현재 반응형 화면 모드는 `src/splitView.js`의 자동 판정으로 계속 유지합니다.

## 원본 위치: `src/App.jsx`

```jsx
<div className="sidebar-brand-mode-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
  <div className="sidebar-brand-copy">
  <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.05em' }}>TravelPlaner</h1>
  <p style={{ fontSize: '9px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '2px 0 0 0' }}>여행 일정 플래너</p>
  </div>
  <div
    className="sidebar-display-mode-switch"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-label={`자동 화면 모드: ${displayMode === DISPLAY_MODES.CLASSIC ? '1번 현재 화면' : '2번 지도·일정 스플릿 뷰'}`}
  >
    <span
      className={`sidebar-display-mode-indicator${displayMode === DISPLAY_MODES.CLASSIC ? ' is-selected' : ''}`}
      aria-hidden="true"
      title="1번: 현재 화면"
    >1</span>
    <span
      className={`sidebar-display-mode-indicator${displayMode === DISPLAY_MODES.SPLIT ? ' is-selected' : ''}`}
      aria-hidden="true"
      title="2번: 지도·일정 스플릿 뷰"
    >2</span>
  </div>
</div>
```

## 원본 위치: `src/index.css`

```css
.sidebar-brand-mode-row {
  flex: 1 1 auto;
}

.sidebar-brand-copy {
  min-width: 0;
}

.sidebar-display-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.sidebar-display-mode-indicator {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  cursor: default;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.sidebar-display-mode-indicator.is-selected {
  background: white;
  color: #2563eb;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.15);
}
```
