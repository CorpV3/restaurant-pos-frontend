import { useEffect, Component, type ReactNode } from 'react'
import { useAuthStore } from './stores/authStore'
import POSLayout from './components/layout/POSLayout'
import LoginPage from './pages/LoginPage'

// ── Error Boundary — catches React render errors and displays them on screen ──
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      const platform = (window as any).Capacitor?.getPlatform?.() ?? 'web'
      const apiUrl = localStorage.getItem('pos_api_url') ?? 'default'
      return (
        <div style={{
          background: '#1a1a1a', color: '#fff', fontFamily: 'monospace',
          fontSize: 13, padding: 16, minHeight: '100vh', wordBreak: 'break-all',
          whiteSpace: 'pre-wrap', overflowY: 'auto',
        }}>
          <div style={{ color: '#f87171', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
            ⚠ React Render Error — Screenshot this
          </div>
          <div style={{ color: '#86efac', marginBottom: 12 }}>
            Platform: {platform} | API: {apiUrl}{'\n'}
            UA: {navigator.userAgent.slice(0, 80)}
          </div>
          <div style={{ background: '#2a2a2a', padding: 12, borderLeft: '3px solid #f87171' }}>
            {err.message}{'\n\n'}{err.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16, padding: '10px 20px', background: '#3b82f6',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const { isAuthenticated, logout, restoreSession } = useAuthStore()

  useEffect(() => {
    restoreSession()
  }, [])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <POSLayout onLogout={logout} />
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
