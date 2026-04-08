import { api } from './api'

export interface Announcement {
  id: string
  message: string
  is_active: boolean
  created_at: string
}

export interface AppVersionInfo {
  platform: string
  version_string: string
  download_url: string
  release_notes: string | null
  updated_at: string
}

export async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await api.get('/api/v1/system/announcements', { params: { active_only: true } })
    return Array.isArray(res.data) ? res.data : []
  } catch {
    return []
  }
}

export async function fetchAppVersion(platform: 'windows' | 'android'): Promise<AppVersionInfo | null> {
  try {
    const res = await api.get(`/api/v1/system/app-versions/${platform}`)
    return res.data
  } catch {
    return null
  }
}

/** Compare semver strings. Returns true if remote > local. */
export function isNewerVersion(remote: string, local: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const r = parse(remote)
  const l = parse(local)
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0
    const lv = l[i] ?? 0
    if (rv > lv) return true
    if (rv < lv) return false
  }
  return false
}
