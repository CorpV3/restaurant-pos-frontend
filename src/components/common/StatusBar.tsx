import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'

interface StatusBarProps {
  onLogout: () => void
}

export default function StatusBar({ onLogout }: StatusBarProps) {
  const user = useAuthStore((s) => s.user)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <span className="text-orange-500 font-bold text-lg">POS</span>
        {user && (
          <span className="text-gray-300 text-sm">
            {user.full_name || user.username}
            <span className="text-gray-500 ml-1">({user.role})</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-gray-300 text-sm">
          {time.toLocaleTimeString('en-GB')}
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-gray-400 text-xs">
            {isOnline ? 'Online' : 'Offline'}
          </span>
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
