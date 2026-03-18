/**
 * In-app logger — stores entries in memory so they can be displayed in the Logs tab.
 * Also forwards to console so Chrome DevTools / adb logcat still work.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  msg: string
}

const MAX_ENTRIES = 300
const entries: LogEntry[] = []
let seq = 0
const listeners = new Set<() => void>()

function push(level: LogLevel, msg: string) {
  entries.unshift({ id: seq++, ts: Date.now(), level, msg })
  if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES)
  listeners.forEach((fn) => fn())
  if (level === 'error') console.error('[App]', msg)
  else if (level === 'warn') console.warn('[App]', msg)
  else console.log('[App]', msg)
}

export const appLog = {
  info:  (msg: string) => push('info', msg),
  warn:  (msg: string) => push('warn', msg),
  error: (msg: string) => push('error', msg),
  getEntries: (): LogEntry[] => [...entries],
  clear: () => { entries.splice(0); listeners.forEach((fn) => fn()) },
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
