import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name: string) => ipcRenderer.invoke('get-app-path', name),
  platform: process.platform,
  printer: {
    listPorts: (): Promise<{ path: string; manufacturer: string }[]> =>
      ipcRenderer.invoke('printer:list-ports'),
    printRaw: (portPath: string, base64Data: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('printer:print-raw', portPath, base64Data),
  },
})
