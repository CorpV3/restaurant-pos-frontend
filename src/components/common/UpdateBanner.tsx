import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { fetchAppVersion, isNewerVersion, type AppVersionInfo } from '../../services/systemService'
import { downloadAndInstallAndroid, isAndroidUpdateSupported } from '../../services/appUpdater'

const APP_VERSION = '1.0.66' // Keep in sync with package.json

const AUTO_INSTALL_COUNTDOWN = 30 // seconds before Windows auto-restarts

type UpdateState = 'available' | 'downloading' | 'ready' | 'error'

function getPlatform(): 'windows' | 'android' | null {
  if (typeof window !== 'undefined' && (window as any).electronAPI) return 'windows'
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android'
  return null
}

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('available')
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [countdown, setCountdown] = useState(AUTO_INSTALL_COUNTDOWN)
  const autoStartedRef = useRef(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-start download as soon as update is detected
  useEffect(() => {
    if (!updateInfo || autoStartedRef.current) return
    autoStartedRef.current = true
    triggerDownload(updateInfo)
  }, [updateInfo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Windows: start 30-second countdown to auto-install once download is ready
  useEffect(() => {
    if (updateState !== 'ready' || getPlatform() !== 'windows') return
    setCountdown(AUTO_INSTALL_COUNTDOWN)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!)
          ;(window as any).electronAPI?.updateInstall?.()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current!)
  }, [updateState])

  useEffect(() => {
    const platform = getPlatform()
    if (!platform) return

    fetchAppVersion(platform).then((info) => {
      if (info && isNewerVersion(info.version_string, APP_VERSION)) {
        setUpdateInfo(info)
      }
    })

    if (platform === 'windows') {
      const api = (window as any).electronAPI
      api?.onUpdateAvailable?.((info: { version: string; releaseNotes: string }) => {
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

  const triggerDownload = async (info: AppVersionInfo) => {
    const platform = getPlatform()

    if (platform === 'windows') {
      const api = (window as any).electronAPI
      if (api?.updateStartDownload) {
        setUpdateState('downloading')
        setDownloadProgress(0)
        try {
          await api.updateStartDownload()
        } catch {
          // dev mode — no-op, electron-updater handles it via autoDownload
        }
        return
      }
    }

    if (platform === 'android' && isAndroidUpdateSupported() && info.download_url) {
      setUpdateState('downloading')
      setDownloadProgress(0)
      try {
        await downloadAndInstallAndroid(info.download_url, (pct) => {
          setDownloadProgress(pct)
        })
        setUpdateState('ready')
      } catch (e: any) {
        setErrorMsg(e?.message ?? 'Download failed')
        setUpdateState('error')
      }
      return
    }

    // Fallback: open in browser
    if (info.download_url) {
      window.open(info.download_url, '_system')
    }
  }

  if (!updateInfo) return null

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
                Updating to v{updateInfo.version_string}... {downloadProgress}%
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
                ? 'Follow the on-screen install steps to complete update'
                : `v${updateInfo.version_string} ready — restarting in ${countdown}s`}
            </p>
          ) : updateState === 'error' ? (
            <p className="text-white font-semibold text-sm truncate">
              Update failed: {errorMsg}
            </p>
          ) : (
            <p className="text-amber-900 font-semibold text-sm leading-tight">
              Update v{updateInfo.version_string} found — starting download...
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {updateState === 'ready' && getPlatform() === 'windows' && (
          <button
            onClick={() => {
              clearInterval(countdownRef.current!)
              ;(window as any).electronAPI?.updateInstall?.()
            }}
            className="px-4 py-1.5 bg-green-700 hover:bg-green-800 text-white text-sm font-bold rounded-lg"
          >
            Restart Now
          </button>
        )}
        {updateState === 'error' && (
          <>
            <button
              onClick={() => {
                autoStartedRef.current = false
                setUpdateState('available')
                setErrorMsg('')
                if (updateInfo) triggerDownload(updateInfo)
              }}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg"
            >
              Retry
            </button>
            <button
              onClick={() => setUpdateInfo(null)}
              className="text-white/70 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  )
}
