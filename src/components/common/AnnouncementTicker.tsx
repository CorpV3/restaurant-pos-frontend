import { useState, useEffect, useRef } from 'react'
import { fetchActiveAnnouncements, type Announcement } from '../../services/systemService'

const POLL_INTERVAL = 10 * 60 * 1000 // 10 minutes

export default function AnnouncementTicker() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    const data = await fetchActiveAnnouncements()
    setAnnouncements(data.filter((a) => a.is_active))
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, POLL_INTERVAL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  if (announcements.length === 0) return null

  const text = announcements.map((a) => a.message).join('   •   ')

  return (
    <div className="w-full bg-gray-900 border-b border-orange-500/40 h-7 flex items-center overflow-hidden flex-shrink-0">
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 bg-orange-500 h-full">
        <span className="text-white text-xs font-bold tracking-wide">NEWS</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <p
          className="whitespace-nowrap text-xs text-orange-200 font-medium"
          style={{
            display: 'inline-block',
            paddingLeft: '100%',
            animation: `ticker-scroll ${Math.max(15, text.length * 0.12)}s linear infinite`,
          }}
        >
          {text}
        </p>
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
