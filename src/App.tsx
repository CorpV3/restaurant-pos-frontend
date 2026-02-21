import { useState } from 'react'
import POSLayout from './components/layout/POSLayout'
import LoginPage from './pages/LoginPage'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />
  }

  return <POSLayout onLogout={() => setIsLoggedIn(false)} />
}

export default App
