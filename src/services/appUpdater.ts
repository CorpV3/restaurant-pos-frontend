/**
 * appUpdater — wraps the Android AppUpdater Capacitor plugin.
 * Downloads the APK and fires the system install prompt.
 */

function getPlugin(): any {
  return (window as any).Capacitor?.Plugins?.AppUpdater ?? null
}

export function isAndroidUpdateSupported(): boolean {
  return !!getPlugin()
}

/**
 * Download APK from `url`, report progress via `onProgress(0-100)`,
 * then fire the system install prompt.
 * Returns a cleanup function that removes the listener.
 */
export async function downloadAndInstallAndroid(
  url: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const plugin = getPlugin()
  if (!plugin) throw new Error('AppUpdater plugin not available')

  // Add progress listener
  const handle = await plugin.addListener('downloadProgress', (ev: { percent: number }) => {
    onProgress(ev.percent)
  })

  try {
    await plugin.downloadAndInstall({ url })
  } finally {
    handle.remove()
  }
}
