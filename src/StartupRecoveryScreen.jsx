import React from 'react'
import { classifyStartupError } from './startupRecovery.js'

const recoveryCopy = {
  offline: {
    title: '인터넷 연결이 없습니다',
    message: '저장된 일정은 기기에 남아 있습니다. 연결을 확인한 뒤 다시 시도해주세요.',
  },
  timeout: {
    title: '연결이 지연되고 있습니다',
    message: '잠시 후 다시 시도해주세요. 저장된 일정은 자동으로 삭제되지 않습니다.',
  },
  app: {
    title: '앱을 불러오지 못했습니다',
    message: '일시적인 오류입니다. 다시 시도하면 앱을 복구할 수 있습니다.',
  },
}

export default function StartupRecoveryScreen({ error, onRetry }) {
  const kind = classifyStartupError(error)
  const copy = recoveryCopy[kind]

  return (
    <main
      className="startup-recovery"
      role="alert"
      style={{
        alignItems: 'center',
        background: '#f8fafc',
        boxSizing: 'border-box',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        height: '100vh',
        justifyContent: 'center',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <div aria-hidden="true" style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
      <h1 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 10px' }}>{copy.title}</h1>
      <p style={{ color: '#64748b', fontSize: '15px', lineHeight: 1.6, margin: '0 0 24px', maxWidth: '320px' }}>
        {copy.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: '#2563eb',
          border: 0,
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: '800',
          padding: '13px 30px',
        }}
      >
        다시 시도
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: 'transparent',
          border: 0,
          color: '#64748b',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '700',
          marginTop: '14px',
          padding: '8px 12px',
        }}
      >
        앱 다시 시작
      </button>
      <details style={{ color: '#94a3b8', fontSize: '11px', marginTop: '14px', maxWidth: '320px', textAlign: 'left' }}>
        <summary style={{ cursor: 'pointer' }}>오류 상세</summary>
        <pre style={{ marginTop: '8px', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {error?.toString() || '알 수 없는 초기화 오류'}
        </pre>
      </details>
    </main>
  )
}
