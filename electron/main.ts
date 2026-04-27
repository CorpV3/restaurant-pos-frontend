import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import net from 'net'
import { exec } from 'child_process'

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

// List installed Windows printers
ipcMain.handle('list-printers', () => {
  return new Promise<string[]>((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return }
    exec('wmic printer get name /format:list', (err, stdout) => {
      if (err) { resolve([]); return }
      const names = stdout.split('\n')
        .map((l) => l.replace(/^Name=/, '').trim())
        .filter((l) => l.length > 0)
      resolve(names)
    })
  })
})

// Send raw ESC/POS bytes to a named Windows USB/network printer via rundll32
ipcMain.handle('print-raw-usb', (_event, { printerName, data }: { printerName: string; data: number[] }) => {
  return new Promise<void>((resolve, reject) => {
    if (process.platform !== 'win32') { reject(new Error('USB printing only supported on Windows')); return }
    if (!printerName) { reject(new Error('No printer name configured. Set it in Settings → Printer.')); return }
    const buf = Buffer.from(data)
    // Write bytes to a temp file then copy /B to the printer port via net use or direct copy
    const fs = require('fs') as typeof import('fs')
    const os = require('os') as typeof import('os')
    const tmpFile = path.join(os.tmpdir(), `pos_print_${Date.now()}.bin`)
    fs.writeFile(tmpFile, buf, (writeErr) => {
      if (writeErr) { reject(writeErr); return }
      // "copy /B file \\.\printerName" is the raw-print trick on Windows
      const cmd = `copy /B "${tmpFile}" "\\\\.\\${printerName}"`
      exec(cmd, (err) => {
        fs.unlink(tmpFile, () => {})
        if (err) reject(new Error(`USB print failed: ${err.message}`))
        else resolve()
      })
    })
  })
})

ipcMain.handle('get-app-path', (_, name: string) => {
  return app.getPath(name as any)
})

// Cash drawer: send ESC/POS kick command via TCP to receipt printer (port 9100)
ipcMain.handle('open-cash-drawer', (_event, { ip, port, bytes }: { ip: string; port: number; bytes: number[] }) => {
  return new Promise<boolean>((resolve, reject) => {
    if (!ip) {
      reject(new Error('Printer IP not configured. Set it in Settings → Printer.'))
      return
    }
    const buf = Buffer.from(bytes)
    const socket = new net.Socket()
    socket.setTimeout(3000)
    socket.connect(port, ip, () => {
      socket.write(buf, () => {
        socket.end()
        resolve(true)
      })
    })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Cash drawer: connection to ${ip}:${port} timed out`))
    })
    socket.on('error', (err) => {
      reject(new Error(`Cash drawer: ${err.message}`))
    })
  })
})
