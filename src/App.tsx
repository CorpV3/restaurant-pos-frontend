import { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import POSLayout from './components/layout/POSLayout'
import LoginPage from './pages/LoginPage'

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

export default App
