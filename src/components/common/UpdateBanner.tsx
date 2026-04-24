import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { fetchAppVersion, isNewerVersion, type AppVersionInfo } from '../../services/systemService'

const APP_VERSION = '1.0.46' // Keep in sync with package.json

function getPlatform(): 'windows' | 'android' | null {
  // Electron (Windows)
  if (typeof window !== 'undefined' && (window as any).__ELECTRON__) return 'windows'
  if (typeof window !== 'undefined' && (window as any).require) {
    try { (window as any).require('electron'); return 'windows' } catch { /* not electron */ }
  }
  // Capacitor (Android)
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android'
  return null
}

function triggerUpdate(info: AppVersionInfo) {
  const platform = getPlatform()
  if (platform === 'windows') {
    // Electron: open in default browser
    try {
      const { shell } = (window as any).require('electron')
      shell.openExternal(info.download_url)
    } catch {
      window.open(info.download_url, '_blank')
    }
  } else if (platform === 'android') {
    // Capacitor Android: open APK URL — triggers download + install prompt
    window.open(info.download_url, '_system')
  }
}

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const platform = getPlatform()
    if (!platform) return

    fetchAppVersion(platform).then((info) => {
      if (info && isNewerVersion(info.version_string, APP_VERSION)) {
        setUpdateInfo(info)
      }
    })
  }, [])

  if (!updateInfo || dismissed) return null

  return (
    <div className="w-full bg-amber-500 flex items-center justify-between px-4 py-2 flex-shrink-0 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg flex-shrink-0">⬆️</span>
        <div className="min-w-0">
          <p className="text-amber-900 font-semibold text-sm leading-tight">
            Update Available — v{updateInfo.version_string}
          </p>
          {updateInfo.release_notes && (
            <p className="text-amber-800 text-xs truncate">{updateInfo.release_notes}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => triggerUpdate(updateInfo)}
          className="px-4 py-1.5 bg-amber-900 hover:bg-amber-950 text-white text-sm font-bold rounded-lg"
        >
          Download & Update
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-800 hover:text-amber-900 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
