import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadRuntimeConfig } from './startupRecovery.js'
import StartupRecoveryScreen from './StartupRecoveryScreen.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Crash Caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <StartupRecoveryScreen
          error={this.state.error}
          onRetry={() => {
            this.setState({ hasError: false, error: null })
            window.location.reload()
          }}
        />
      )
    }

    return this.props.children
  }
}

const root = createRoot(document.getElementById('root'))

async function bootApp() {
  try {
    const runtimeConfig = await loadRuntimeConfig()
    window.__TRAVELPLANER_CONFIG__ = runtimeConfig
    const { default: App } = await import('./App.jsx')

    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    )
  } catch (error) {
    root.render(<StartupRecoveryScreen error={error} onRetry={bootApp} />)
  }
}

bootApp()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
