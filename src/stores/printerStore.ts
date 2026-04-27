import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BluetoothDevice } from '../services/thermalPrinter'

export type PrinterType = 'serial' | 'bluetooth' | 'usb'

interface PrinterState {
  // Printer connection type
  printerType: PrinterType
  // Serial port path (Android built-in printer, e.g. H10-3)
  serialPath: string
  // Saved Bluetooth printer MAC address
  savedAddress: string | null
  savedName: string | null
  // Auto-print after payment
  autoPrint: boolean
  // Paper width: 58mm (32 chars), 75mm (42 chars), or 80mm (48 chars)
  paperWidth: 32 | 42 | 48
  // Print darkness 0 (lightest) – 7 (darkest), ESC/POS DC2 # n
  printDensity: number
  // Number of receipt copies to print
  printCopies: number
  // Cash drawer: auto-open after payment (cash + card)
  cashDrawerEnabled: boolean
  // Windows only: receipt printer IP for TCP cash drawer kick (port 9100)
  drawerIp: string
  drawerTcpPort: number
  // Windows USB printer name (as shown in Windows printers list)
  usbPrinterName: string

  setPrinterType: (t: PrinterType) => void
  setSerialPath: (p: string) => void
  setSavedPrinter: (device: BluetoothDevice | null) => void
  setAutoPrint: (v: boolean) => void
  setPaperWidth: (w: 32 | 42 | 48) => void
  setPrintDensity: (d: number) => void
  setPrintCopies: (n: number) => void
  setCashDrawerEnabled: (v: boolean) => void
  setDrawerIp: (ip: string) => void
  setDrawerTcpPort: (p: number) => void
  setUsbPrinterName: (name: string) => void
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      printerType: 'serial',
      serialPath: '/dev/ttyS1',
      savedAddress: null,
      savedName: null,
      autoPrint: false,
      paperWidth: 48,
      printDensity: 3,
      printCopies: 1,
      cashDrawerEnabled: false,
      drawerIp: '',
      drawerTcpPort: 9100,
      usbPrinterName: '',

      setPrinterType: (t) => set({ printerType: t }),
      setSerialPath: (p) => set({ serialPath: p }),
      setSavedPrinter: (device) =>
        set({ savedAddress: device?.address ?? null, savedName: device?.name ?? null }),
      setAutoPrint: (v) => set({ autoPrint: v }),
      setPaperWidth: (w) => set({ paperWidth: w }),
      setPrintDensity: (d) => set({ printDensity: Math.max(0, Math.min(7, d)) }),
      setPrintCopies: (n) => set({ printCopies: Math.max(1, Math.min(5, n)) }),
      setCashDrawerEnabled: (v) => set({ cashDrawerEnabled: v }),
      setDrawerIp: (ip) => set({ drawerIp: ip }),
      setDrawerTcpPort: (p) => set({ drawerTcpPort: p }),
      setUsbPrinterName: (name) => set({ usbPrinterName: name }),
    }),
    { name: 'pos-printer-settings' }
  )
)
