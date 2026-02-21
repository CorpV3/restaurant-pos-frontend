import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { getStoredApiUrl, setApiUrl } from '../services/api'

export default function LoginPage() {
  const { login, isLoading, error } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState(getStoredApiUrl())

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    await login(username, password)
  }

  const handleSaveApiUrl = () => {
    const url = apiUrlInput.replace(/\/+$/, '')
    setApiUrl(url)
    setShowSettings(false)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 rounded-2xl p-8 w-96 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Restaurant POS</h1>
          <p className="text-gray-400 text-sm mt-1">Sign in with your staff account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Enter username"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Enter password"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold text-lg transition-all active:scale-[0.98]"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-500 hover:text-gray-300 text-xs w-full text-center transition-colors"
          >
            {showSettings ? 'Hide' : 'Server Settings'}
          </button>

          {showSettings && (
            <div className="mt-3 space-y-2">
              <label className="text-gray-400 text-xs block">API Server URL</label>
              <input
                type="text"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                placeholder="http://localhost:8000"
              />
              <button
                onClick={handleSaveApiUrl}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
