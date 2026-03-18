import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { SerialPort } from 'serialport'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'Restaurant POS',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Scale down to fit all screen sizes — pay button always visible
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(0.85)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('get-app-path', (_, name: string) => {
  return app.getPath(name as any)
})

// List available serial/COM ports
ipcMain.handle('printer:list-ports', async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer ?? '' }))
  } catch {
    return []
  }
})

// Write raw ESC/POS bytes (base64) to a serial/COM port
ipcMain.handle('printer:print-raw', (_event, portPath: string, base64Data: string) => {
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false })
    port.open((openErr) => {
      if (openErr) {
        resolve({ ok: false, error: openErr.message })
        return
      }
      const buf = Buffer.from(base64Data, 'base64')
      port.write(buf, (writeErr) => {
        port.drain(() => {
          port.close()
          resolve(writeErr ? { ok: false, error: writeErr.message } : { ok: true })
        })
      })
    })
  })
})
