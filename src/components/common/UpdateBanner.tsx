import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { fetchAppVersion, isNewerVersion, type AppVersionInfo } from '../../services/systemService'
import { downloadAndInstallAndroid, isAndroidUpdateSupported } from '../../services/appUpdater'

const APP_VERSION = '1.0.50' // Keep in sync with package.json

type UpdateState = 'available' | 'downloading' | 'ready' | 'error'

function getPlatform(): 'windows' | 'android' | null {
  if (typeof window !== 'undefined' && (window as any).electronAPI) return 'windows'
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android'
  return null
}

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('available')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const platform = getPlatform()
    if (!platform) return

    // API-based version check (admin-controlled via Support page)
    fetchAppVersion(platform).then((info) => {
      if (info && isNewerVersion(info.version_string, APP_VERSION)) {
        setUpdateInfo(info)
      }
    })

    // Electron: also listen for auto-updater events from main process
    if (platform === 'windows') {
      const api = (window as any).electronAPI
      api?.onUpdateAvailable?.((info: { version: string; releaseNotes: string }) => {
        // auto-updater found update on GitHub — show banner if not already showing
        setUpdateInfo((prev) => prev ?? {
          version_string: info.version,
          download_url: '',
          release_notes: info.releaseNotes,
          platform: 'windows',
          updated_at: new Date().toISOString(),
        })
      })
      api?.onUpdateProgress?.((pct: number) => {
        setDownloadProgress(pct)
        setUpdateState('downloading')
      })
      api?.onUpdateDownloaded?.(() => {
        setUpdateState('ready')
      })
      api?.onUpdateError?.((msg: string) => {
        setErrorMsg(msg)
        setUpdateState('error')
      })
    }
  }, [])

  const handleDownload = async () => {
    const platform = getPlatform()

    if (platform === 'windows') {
      const api = (window as any).electronAPI
      if (api?.updateStartDownload) {
        setUpdateState('downloading')
        setDownloadProgress(0)
        try {
          await api.updateStartDownload()
        } catch {
          // Packaged-app guard failed (dev mode) — fall back to browser
          window.open(updateInfo?.download_url || '', '_blank')
          setDismissed(true)
        }
        return
      }
    }

    if (platform === 'android' && isAndroidUpdateSupported() && updateInfo?.download_url) {
      setUpdateState('downloading')
      setDownloadProgress(0)
      try {
        await downloadAndInstallAndroid(updateInfo.download_url, (pct) => {
          setDownloadProgress(pct)
        })
        // Install intent fired — Android shows system prompt, banner can go idle
        setUpdateState('ready')
      } catch (e: any) {
        setErrorMsg(e?.message ?? 'Download failed')
        setUpdateState('error')
      }
      return
    }

    // Fallback: open APK URL in system browser
    if (updateInfo?.download_url) {
      window.open(updateInfo.download_url, '_system')
    }
  }

  const handleInstall = async () => {
    if (!window.confirm('The app will close and restart to apply the update. Ready?')) return
    ;(window as any).electronAPI?.updateInstall?.()
  }

  if (!updateInfo || dismissed) return null

  return (
    <div className={`w-full flex items-center justify-between px-4 py-2 flex-shrink-0 gap-3 ${
      updateState === 'error' ? 'bg-red-600' : 'bg-amber-500'
    }`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-lg flex-shrink-0">
          {updateState === 'ready' ? '✅' : updateState === 'error' ? '⚠️' : '⬆️'}
        </span>
        <div className="min-w-0 flex-1">
          {updateState === 'downloading' ? (
            <>
              <p className="text-amber-900 font-semibold text-sm leading-tight">
                Downloading update... {downloadProgress}%
              </p>
              <div className="mt-1 h-1.5 bg-amber-300 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-900 rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </>
          ) : updateState === 'ready' ? (
            <p className="text-amber-900 font-semibold text-sm">
              {getPlatform() === 'android'
                ? 'Install prompt opened — follow the on-screen steps'
                : `v${updateInfo.version_string} downloaded — ready to install`}
            </p>
          ) : updateState === 'error' ? (
            <p className="text-white font-semibold text-sm truncate">
              Update failed: {errorMsg}
            </p>
          ) : (
            <>
              <p className="text-amber-900 font-semibold text-sm leading-tight">
                Update Available — v{updateInfo.version_string}
              </p>
              {updateInfo.release_notes && (
                <p className="text-amber-800 text-xs truncate">{updateInfo.release_notes}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {updateState === 'available' && (
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 bg-amber-900 hover:bg-amber-950 text-white text-sm font-bold rounded-lg"
          >
            Download & Update
          </button>
        )}
        {updateState === 'ready' && getPlatform() === 'windows' && (
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-bold rounded-lg animate-pulse"
          >
            Install & Restart
          </button>
        )}
        {updateState === 'error' && (
          <button
            onClick={() => { setUpdateState('available'); setErrorMsg('') }}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg"
          >
            Retry
          </button>
        )}
        {updateState !== 'downloading' && (
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-800 hover:text-amber-900 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
