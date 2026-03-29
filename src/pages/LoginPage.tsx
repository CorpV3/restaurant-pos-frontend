import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useServerSettings } from '../stores/serverSettingsStore'
import { getStoredApiUrl, setApiUrl } from '../services/api'
import { fetchPOSStaff, posPasscodeLogin, resolveRestaurantByCode } from '../services/posAuthService'
import type { POSStaffMember } from '../services/posAuthService'

export default function LoginPage() {
  const { loginWithToken, login } = useAuthStore()
  const settings = useServerSettings()

  // ── Setup mode state ──────────────────────────────────────────────────────
  const [setupMode, setSetupMode] = useState(!settings.isConfigured)
  const [setupUrl, setSetupUrl] = useState(settings.serverUrl || getStoredApiUrl())
  const [setupCode, setSetupCode] = useState(settings.restaurantCode || '')
  const [setupError, setSetupError] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)

  // ── Passcode login state ──────────────────────────────────────────────────
  const [staff, setStaff] = useState<POSStaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<POSStaffMember | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // Load staff list once we have restaurant configured
  useEffect(() => {
    if (!setupMode && settings.restaurantId) {
      setStaffLoading(true)
      fetchPOSStaff(settings.restaurantId)
        .then(setStaff)
        .catch(() => setStaff([]))
        .finally(() => setStaffLoading(false))
    }
  }, [setupMode, settings.restaurantId])

  // ── Setup: validate server + restaurant code ──────────────────────────────
  const handleSetupSave = async () => {
    const url = setupUrl.replace(/\/+$/, '')
    const code = setupCode.trim().toLowerCase()
    if (!url) { setSetupError('Enter the server URL'); return }
    if (!code || code.length < 4) { setSetupError('Enter at least 4 characters of the restaurant code'); return }

    setSetupLoading(true)
    setSetupError('')
    try {
      setApiUrl(url)
      // Fetch restaurant list with a temp admin login isn't feasible here.
      // Instead, try to fetch POS staff directly with the code as a UUID prefix.
      // We need to resolve the full restaurant ID from the code.
      // Use the auth login endpoint to get a temp token to resolve the restaurant.
      // Simpler: try fetching /api/v1/restaurants (public or with admin token not available).
      // Best approach: resolve via a dedicated public endpoint.
      // For now: store the code and resolve restaurant_id on first passcode login attempt.
      // If staff list loads successfully → restaurant_id is valid.
      // We'll use a "lookup by code" approach: POST /api/v1/auth/pos/resolve-restaurant
      // But that endpoint doesn't exist yet. For now, use admin login to resolve.

      // Try to fetch restaurants list (requires auth) — use admin login
      // Actually: the simpler approach is to store restaurantCode and resolve ID from
      // the staff list endpoint which takes restaurant_id. We need to resolve code→ID first.
      // Let's use the existing resolveRestaurantByCode which needs a token.
      // Since we don't have a token at setup time, we'll add a public endpoint.
      // TEMP: require admin username/password just once at setup to resolve restaurant ID.

      // For now, try fetching POS staff assuming the code IS the restaurant_id prefix
      // by trying to look up the restaurant directly via a public endpoint.
      const res = await fetch(`${url}/api/v1/restaurants?search=${code}`, {
        headers: { 'Content-Type': 'application/json' }
      })

      // If that fails, try without auth — restaurant list may require auth
      // In that case fall back: store code and prompt for admin creds to verify once
      if (!res.ok && res.status === 401) {
        // Can't resolve without auth — ask for admin password once
        setSetupError('Server requires authentication to verify restaurant. Please contact your administrator.')
        setSetupLoading(false)
        return
      }

      // Try parsing response
      let restaurants: any[] = []
      try { restaurants = await res.json() } catch { restaurants = [] }

      const clean = code.replace(/-/g, '')
      const match = Array.isArray(restaurants)
        ? restaurants.find((r: any) => r.id?.replace(/-/g, '').toLowerCase().startsWith(clean))
        : null

      if (!match) {
        setSetupError('Restaurant not found — check the code and try again')
        setSetupLoading(false)
        return
      }

      settings.save(url, code, match.id, match.name, match.currency_symbol || '£')
      setSetupMode(false)
    } catch (e: any) {
      setSetupError(e?.message || 'Could not connect to server — check the URL')
    }
    setSetupLoading(false)
  }

  // ── Password login state ──────────────────────────────────────────────────
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [pwUsername, setPwUsername] = useState('')
  const [pwPassword, setPwPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwUsername.trim() || !pwPassword.trim()) {
      setPwError('Please enter username and password')
      return
    }
    setPwLoading(true)
    setPwError('')
    try {
      const ok = await login(pwUsername.trim(), pwPassword, settings.restaurantCode || '')
      if (!ok) {
        // error is set in authStore, but we can also read it
        setPwError('Invalid credentials or restaurant not found')
      }
    } catch (e: any) {
      setPwError(e?.response?.data?.detail || e?.message || 'Login failed')
    }
    setPwLoading(false)
  }

  // ── PIN pad logic ─────────────────────────────────────────────────────────
  const handlePinDigit = (d: string) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setPinError('')
    if (next.length === 4) attemptLogin(next)
  }

  const handlePinDelete = () => setPin((p) => p.slice(0, -1))

  const attemptLogin = async (code: string) => {
    if (!settings.restaurantId) return
    setPinLoading(true)
    setPinError('')
    try {
      const data = await posPasscodeLogin(settings.restaurantId, code)
      // Store tokens
      localStorage.setItem('pos_access_token', data.access_token)
      localStorage.setItem('pos_refresh_token', data.refresh_token)
      localStorage.setItem('pos_user', JSON.stringify(data.user))
      // Restaurant info from settings
      const restaurant = {
        id: settings.restaurantId,
        name: settings.restaurantName ?? '',
        slug: '',
        currency_symbol: settings.currencySymbol,
        currency_code: 'GBP',
        theme_color: '#f97316',
      }
      localStorage.setItem('pos_restaurant', JSON.stringify(restaurant))
      localStorage.setItem('pos_restaurant_id', settings.restaurantId)
      loginWithToken(data.access_token, data.user, restaurant)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Wrong passcode'
      setPinError(msg)
      setPin('')
    }
    setPinLoading(false)
  }

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (setupMode) {
    return (
      <div className="h-screen h-[100dvh] flex items-center justify-center bg-gray-900 px-4">
        <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-[420px] shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">🍽️</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Restaurant POS</h1>
            <p className="text-gray-400 text-sm mt-1">One-time device setup</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Server URL</label>
              <input
                type="text"
                value={setupUrl}
                onChange={(e) => setSetupUrl(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="https://testenv.corpv3.com"
                disabled={setupLoading}
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Restaurant Code</label>
              <input
                type="text"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase())}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono tracking-widest focus:outline-none focus:border-orange-500"
                placeholder="e.g. 69560"
                disabled={setupLoading}
              />
              <p className="text-gray-600 text-xs mt-1">First 5–8 characters of your Restaurant ID</p>
            </div>

            {setupError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-red-400 text-sm">{setupError}</p>
              </div>
            )}

            <button
              onClick={handleSetupSave}
              disabled={setupLoading || !setupUrl || !setupCode}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold text-lg"
            >
              {setupLoading ? 'Connecting...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Passcode login screen ─────────────────────────────────────────────────
  return (
    <div className="h-screen h-[100dvh] flex flex-col items-center justify-center bg-gray-900 px-4 gap-6">
      {/* Restaurant name */}
      <div className="text-center">
        <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2">
          <span className="text-2xl">🍽️</span>
        </div>
        <h1 className="text-xl font-bold text-white">{settings.restaurantName || 'Restaurant POS'}</h1>
        {!selectedStaff && <p className="text-gray-400 text-sm mt-1">Select your name to log in</p>}
        {selectedStaff && <p className="text-gray-400 text-sm mt-1">Enter your 4-digit PIN</p>}
      </div>

      {showPasswordForm ? (
        /* Password login form */
        <div className="w-full max-w-xs">
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Username</label>
              <input
                type="text"
                value={pwUsername}
                onChange={(e) => setPwUsername(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="username"
                disabled={pwLoading}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Password</label>
              <input
                type="password"
                value={pwPassword}
                onChange={(e) => setPwPassword(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                placeholder="••••••••"
                disabled={pwLoading}
                autoComplete="current-password"
              />
            </div>

            {pwError && (
              <p className="text-red-400 text-sm text-center">{pwError}</p>
            )}

            <button
              type="submit"
              disabled={pwLoading || !pwUsername || !pwPassword}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold text-base"
            >
              {pwLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={() => { setShowPasswordForm(false); setPwError(''); setPwUsername(''); setPwPassword('') }}
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              ← Back to PIN
            </button>
          </div>
        </div>
      ) : !selectedStaff ? (
        /* Staff grid */
        <div className="w-full max-w-sm">
          {staffLoading ? (
            <div className="text-center text-gray-500 py-8">Loading staff...</div>
          ) : staff.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">
              No staff set up for passcode login yet.<br />
              Ask your manager to add a POS Passcode in the admin panel.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedStaff(s); setPin(''); setPinError('') }}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl p-4 text-left transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                    <span className="text-orange-400 font-bold text-lg">
                      {(s.full_name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <p className="text-white font-medium text-sm truncate">{s.full_name}</p>
                  <p className="text-gray-500 text-xs capitalize">{s.role}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* PIN pad */
        <div className="w-full max-w-xs">
          <div className="text-center mb-4">
            <button
              onClick={() => { setSelectedStaff(null); setPin('') }}
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              ← {selectedStaff.full_name}
            </button>
          </div>

          {/* PIN dots */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-colors ${
                  i < pin.length ? 'bg-orange-500' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-red-400 text-sm text-center mb-4">{pinError}</p>
          )}

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-3">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
              <button
                key={i}
                onClick={() => d === '⌫' ? handlePinDelete() : d ? handlePinDigit(d) : undefined}
                disabled={pinLoading || !d}
                className={`h-14 rounded-xl text-xl font-bold transition-all active:scale-95 ${
                  !d ? 'invisible' :
                  d === '⌫' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' :
                  'bg-gray-700 text-white hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {pinLoading && pin.length === 4 ? '...' : d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Login with password link */}
      {!showPasswordForm && (
        <button
          onClick={() => { setShowPasswordForm(true); setSelectedStaff(null); setPin('') }}
          className="text-gray-500 hover:text-gray-300 text-sm mt-1"
        >
          Login with password
        </button>
      )}

      {/* Settings link */}
      <button
        onClick={() => setSetupMode(true)}
        className="text-gray-600 hover:text-gray-400 text-xs mt-2"
      >
        ⚙ Server Settings
      </button>
    </div>
  )
}
