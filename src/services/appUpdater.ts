/**
 * appUpdater — wraps the Android AppUpdater Capacitor plugin.
 * Downloads the APK and fires the system install prompt.
 */

import { appLog } from './appLogger'

function getPlugin(): any {
  return (window as any).Capacitor?.Plugins?.AppUpdater ?? null
}

export function isAndroidUpdateSupported(): boolean {
  return !!getPlugin()
}

/**
 * Download APK from `url`, report progress via `onProgress(0-100)`,
 * then fire the system install prompt.
 * All Java-side log lines are forwarded to appLog so they appear in the Logs tab.
 */
export async function downloadAndInstallAndroid(
  url: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const plugin = getPlugin()
  if (!plugin) throw new Error('AppUpdater plugin not available')

  const handles = await Promise.all([
    plugin.addListener('downloadProgress', (ev: { percent: number }) => {
      onProgress(ev.percent)
    }),
    plugin.addListener('updateLog', (ev: { level: string; msg: string }) => {
      const msg = '[UpdatePlugin] ' + ev.msg
      if (ev.level === 'ERROR') appLog.error(msg)
      else if (ev.level === 'WARN') appLog.warn(msg)
      else appLog.info(msg)
    }),
  ])

  try {
    await plugin.downloadAndInstall({ url })
  } finally {
    handles.forEach((h) => h.remove())
  }
}

/** Read the persistent update log written by UpdatePlugin.java (survives crashes). */
export async function readAndroidUpdateLog(): Promise<string> {
  const plugin = getPlugin()
  if (!plugin) return '(AppUpdater plugin not available)'
  try {
    const result = await plugin.readUpdateLog()
    return result?.log ?? '(empty log)'
  } catch (e: any) {
    return '(error reading log: ' + (e?.message ?? e) + ')'
  }
}

/** Clear the persistent update log. */
export async function clearAndroidUpdateLog(): Promise<void> {
  const plugin = getPlugin()
  if (plugin) {
    try { await plugin.clearUpdateLog() } catch {}
  }
}
