import { useState, useEffect } from 'react'
import { appLog, type LogEntry } from '../services/appLogger'

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>(appLog.getEntries())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const unsub = appLog.subscribe(() => setEntries(appLog.getEntries()))
    return unsub
  }, [])

  const copyAll = () => {
    const text = entries
      .map((e) => `[${new Date(e.ts).toLocaleTimeString()}] [${e.level.toUpperCase()}] ${e.msg}`)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const levelColor = (level: LogEntry['level']) => {
    if (level === 'error') return 'text-red-400'
    if (level === 'warn')  return 'text-yellow-400'
    return 'text-green-400'
  }

  const levelBg = (level: LogEntry['level']) => {
    if (level === 'error') return 'bg-red-900/30 border-red-800'
    if (level === 'warn')  return 'bg-yellow-900/20 border-yellow-800'
    return 'bg-gray-800 border-gray-700'
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700 flex items-center gap-3">
        <h2 className="text-white font-semibold text-base flex-1">
          Debug Logs
          {entries.length > 0 && (
            <span className="ml-2 text-gray-500 text-xs font-normal">
              {entries.length} entries
            </span>
          )}
        </h2>
        <button
          onClick={copyAll}
          disabled={entries.length === 0}
          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg disabled:opacity-40"
        >
          {copied ? 'Copied!' : 'Copy All'}
        </button>
        <button
          onClick={() => { appLog.clear(); setEntries([]) }}
          disabled={entries.length === 0}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-sm">No logs yet.</p>
            <p className="text-xs mt-1">Try a test print from Settings → Printer.</p>
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className={`rounded-lg border px-3 py-2 text-xs ${levelBg(e.level)}`}
            >
              <span className="text-gray-500 mr-2">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              <span className={`font-bold mr-2 ${levelColor(e.level)}`}>
                {e.level.toUpperCase()}
              </span>
              <span className="text-gray-200 break-all">{e.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
