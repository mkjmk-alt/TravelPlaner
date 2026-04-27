import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App Crash Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', fontFamily: 'Inter, sans-serif', backgroundColor: '#f9fafb', padding: '32px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: '900', color: '#111827', marginBottom: '8px' }}>오류가 발생했습니다</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '300px' }}>
            일시적인 오류입니다. 아래 버튼을 눌러 앱을 다시 시작해주세요.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '12px 32px', backgroundColor: '#2563eb', color: 'white',
              border: 'none', borderRadius: '12px', fontWeight: '800', fontSize: '14px',
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
            }}
          >
            앱 다시 시작
          </button>
          <details style={{ marginTop: '24px', fontSize: '11px', color: '#9ca3af', maxWidth: '300px' }}>
            <summary style={{ cursor: 'pointer' }}>오류 상세</summary>
            <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '8px' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
