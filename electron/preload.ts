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
})
