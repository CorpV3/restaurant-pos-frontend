/// <reference types="vite/client" />

interface ElectronAPI {
  getAppVersion: () => Promise<string>
  getAppPath: (name: string) => Promise<string>
  platform: string
}

interface Window {
  electronAPI: ElectronAPI
}
