import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BluetoothDevice } from '../services/thermalPrinter'

interface PrinterState {
  // Saved printer MAC address (Android)
  savedAddress: string | null
  savedName: string | null
  // Auto-print after payment
  autoPrint: boolean
  // Paper width: 58mm (32 chars) or 80mm (48 chars)
  paperWidth: 32 | 48

  setSavedPrinter: (device: BluetoothDevice | null) => void
  setAutoPrint: (v: boolean) => void
  setPaperWidth: (w: 32 | 48) => void
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      savedAddress: null,
      savedName: null,
      autoPrint: false,
      paperWidth: 32,

      setSavedPrinter: (device) =>
        set({ savedAddress: device?.address ?? null, savedName: device?.name ?? null }),
      setAutoPrint: (v) => set({ autoPrint: v }),
      setPaperWidth: (w) => set({ paperWidth: w }),
    }),
    { name: 'pos-printer-settings' }
  )
)
