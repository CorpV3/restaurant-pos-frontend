import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { getStoredApiUrl, setApiUrl } from '../services/api'

export default function LoginPage() {
  const { login, isLoading, error } = useAuthStore()
  const [restaurantCode, setRestaurantCode] = useState(
    localStorage.getItem('pos_restaurant_code') || ''
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState(getStoredApiUrl())
  const [codeError, setCodeError] = useState('')

  const handleCodeChange = (val: string) => {
    // Only allow alphanumeric, max 5 chars
    const clean = val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toLowerCase()
    setRestaurantCode(clean)
    setCodeError('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantCode || restaurantCode.length < 4) {
      setCodeError('Enter at least 4 characters of your Restaurant ID')
      return
    }
    if (!username || !password) return

    localStorage.setItem('pos_restaurant_code', restaurantCode)
    const success = await login(username, password, restaurantCode)
    if (!success) {
      // error shown via store
    }
  }

  const handleSaveApiUrl = () => {
    setApiUrl(apiUrlInput.replace(/\/+$/, ''))
    setShowSettings(false)
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 rounded-2xl p-8 w-[420px] shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🍽️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Restaurant POS</h1>
          <p className="text-gray-400 text-sm mt-1">Sign in with your staff account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Restaurant Code */}
          <div>
            <label className="text-gray-400 text-sm block mb-1">
              Restaurant Code
              <span className="text-gray-500 text-xs ml-2">(first 5 chars of Restaurant ID)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={restaurantCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                className={`w-full bg-gray-700 border rounded-lg px-4 py-3 text-white text-lg font-mono tracking-widest focus:outline-none transition-colors ${
                  codeError ? 'border-red-500' : 'border-gray-600 focus:border-orange-500'
                }`}
                placeholder="e.g. 69560"
                maxLength={5}
                autoFocus
                disabled={isLoading}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                {restaurantCode.length}/5
              </span>
            </div>
            {codeError && <p className="text-red-400 text-xs mt-1">{codeError}</p>}
            <p className="text-gray-600 text-xs mt-1">
              Ask your manager for your restaurant's 5-character code
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-gray-500 text-xs">Staff Credentials</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          {/* Username */}
          <div>
            <label className="text-gray-400 text-sm block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Enter username"
              disabled={isLoading}
            />
          </div>

          {/* Password */}
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
            disabled={isLoading || !restaurantCode || !username || !password}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold text-lg transition-all active:scale-[0.98]"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Server Settings */}
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-500 hover:text-gray-300 text-xs w-full text-center transition-colors"
          >
            {showSettings ? 'Hide' : '⚙️ Server Settings'}
          </button>
          {showSettings && (
            <div className="mt-3 space-y-2">
              <label className="text-gray-400 text-xs block">API Server URL</label>
              <input
                type="text"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                placeholder="http://192.168.x.x:9000"
              />
              <button
                onClick={handleSaveApiUrl}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Save
              </button>
              <p className="text-gray-600 text-xs text-center">
                Default: http://localhost:9000
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
