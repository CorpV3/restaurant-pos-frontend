import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BluetoothDevice } from '../services/thermalPrinter'

export type PrinterType = 'serial' | 'bluetooth'

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
  // Number of copies for auto-print (1–5)
  printCopies: number
  // Paper width: 58mm (32 chars), 75mm (42 chars), or 80mm (48 chars)
  paperWidth: 32 | 42 | 48
  // Print darkness 0 (lightest) – 7 (darkest), ESC/POS DC2 # n
  printDensity: number

  setPrinterType: (t: PrinterType) => void
  setSerialPath: (p: string) => void
  setSavedPrinter: (device: BluetoothDevice | null) => void
  setAutoPrint: (v: boolean) => void
  setPrintCopies: (n: number) => void
  setPaperWidth: (w: 32 | 42 | 48) => void
  setPrintDensity: (d: number) => void
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      printerType: 'serial',
      serialPath: '/dev/ttyS1',
      savedAddress: null,
      savedName: null,
      autoPrint: false,
      printCopies: 1,
      paperWidth: 48,
      printDensity: 3,

      setPrinterType: (t) => set({ printerType: t }),
      setSerialPath: (p) => set({ serialPath: p }),
      setSavedPrinter: (device) =>
        set({ savedAddress: device?.address ?? null, savedName: device?.name ?? null }),
      setAutoPrint: (v) => set({ autoPrint: v }),
      setPrintCopies: (n) => set({ printCopies: Math.max(1, Math.min(5, n)) }),
      setPaperWidth: (w) => set({ paperWidth: w }),
      setPrintDensity: (d) => set({ printDensity: Math.max(0, Math.min(7, d)) }),
    }),
    { name: 'pos-printer-settings' }
  )
)
