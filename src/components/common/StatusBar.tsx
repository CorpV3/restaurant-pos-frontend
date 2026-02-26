import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'

const APP_VERSION = 'v1.0.2'

const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Master Admin',
  restaurant_admin: 'Manager',
  chef: 'Chef',
  customer: 'Customer',
  staff: 'Staff',
}

interface StatusBarProps {
  onLogout: () => void
}

export default function StatusBar({ onLogout }: StatusBarProps) {
  const { user, restaurant } = useAuthStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="h-12 flex-shrink-0 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-3 min-w-0">
        {/* Restaurant name + version */}
        {restaurant && (
          <>
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: restaurant.theme_color || '#f97316' }}
            />
            <span className="text-white font-semibold text-sm truncate max-w-[160px]">
              {restaurant.name}
            </span>
            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded font-mono flex-shrink-0">
              {APP_VERSION}
            </span>
            <span className="text-gray-600">|</span>
          </>
        )}
        {/* Staff info */}
        {user && (
          <span className="text-gray-300 text-sm">
            {user.full_name || user.username}
            <span className="ml-1.5 text-xs text-gray-500 capitalize">
              [{ROLE_LABELS[user.role] || user.role}]
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-gray-300 text-sm font-mono">
          {time.toLocaleTimeString('en-GB')}
        </span>
        <div className="flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-400 text-xs">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <button
          onClick={onLogout}
          className="text-gray-400 hover:text-white text-sm px-3 py-1 rounded hover:bg-gray-700 transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
