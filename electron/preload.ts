import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name: string) => ipcRenderer.invoke('get-app-path', name),
  platform: process.platform,
  openCashDrawer: (opts: { ip: string; port: number; bytes: number[] }) =>
    ipcRenderer.invoke('open-cash-drawer', opts),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printRawUSB: (opts: { printerName: string; data: number[] }) =>
    ipcRenderer.invoke('print-raw-usb', opts),

  // Auto-update
  updateStartDownload: () => ipcRenderer.invoke('update-start-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => {
    ipcRenderer.on('update-available', (_e, info) => cb(info))
  },
  onUpdateProgress: (cb: (percent: number) => void) => {
    ipcRenderer.on('update-progress', (_e, pct) => cb(pct))
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update-downloaded', () => cb())
  },
  onUpdateError: (cb: (msg: string) => void) => {
    ipcRenderer.on('update-error', (_e, msg) => cb(msg))
  },
})
