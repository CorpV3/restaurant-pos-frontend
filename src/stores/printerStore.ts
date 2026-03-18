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
  // Paper width: 58mm (32 chars), 75mm (42 chars), or 80mm (48 chars)
  paperWidth: 32 | 42 | 48

  setPrinterType: (t: PrinterType) => void
  setSerialPath: (p: string) => void
  setSavedPrinter: (device: BluetoothDevice | null) => void
  setAutoPrint: (v: boolean) => void
  setPaperWidth: (w: 32 | 42 | 48) => void
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

      setPrinterType: (t) => set({ printerType: t }),
      setSerialPath: (p) => set({ serialPath: p }),
      setSavedPrinter: (device) =>
        set({ savedAddress: device?.address ?? null, savedName: device?.name ?? null }),
      setAutoPrint: (v) => set({ autoPrint: v }),
      setPaperWidth: (w) => set({ paperWidth: w }),
    }),
    { name: 'pos-printer-settings' }
  )
)
