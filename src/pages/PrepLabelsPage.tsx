import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { usePrinterStore } from '../stores/printerStore'
import { thermalPrinter, type PrepLabelData } from '../services/thermalPrinter'
import { fetchMenuItems, type BackendMenuItem } from '../services/menuService'
import { appLog } from '../services/appLogger'
import toast from 'react-hot-toast'
import { format, addHours, addDays } from 'date-fns'

// Shelf life options
const SHELF_LIFE_OPTIONS = [
  { label: '2 Hours',   hours: 2 },
  { label: '4 Hours',   hours: 4 },
  { label: '8 Hours',   hours: 8 },
  { label: '24 Hours',  hours: 24 },
  { label: '2 Days',    hours: 48 },
  { label: '3 Days',    hours: 72 },
  { label: '5 Days',    hours: 120 },
  { label: '7 Days',    hours: 168 },
]

// Generate a short item code: first 3 chars of name (uppercase) + DDMM + 3-digit counter
let labelCounter = 1
function generateCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X')
  const today = format(new Date(), 'ddMM')
  const seq = String(labelCounter++).padStart(3, '0')
  return `${prefix}-${today}-${seq}`
}

export default function PrepLabelsPage() {
  const { restaurant, user } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()

  const [menuItems, setMenuItems] = useState<BackendMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<BackendMenuItem | null>(null)
  const [shelfLifeHours, setShelfLifeHours] = useState(24)
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!restaurant?.id) return
    fetchMenuItems(restaurant.id)
      .then(setMenuItems)
      .catch(() => toast.error('Failed to load menu'))
      .finally(() => setLoading(false))
  }, [restaurant?.id])

  const filtered = menuItems.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  const handlePrint = async () => {
    if (!selectedItem) return
    setPrinting(true)
    try {
      const now = new Date()
      const useBy = addHours(now, shelfLifeHours)
      const label: PrepLabelData = {
        itemName: selectedItem.name,
        itemCode: generateCode(selectedItem.name),
        preparedAt: format(now, 'dd/MM/yy HH:mm'),
        useBy: format(useBy, 'dd/MM/yy HH:mm'),
        allergens: selectedItem.allergens ?? [],
        preparedBy: user?.full_name || user?.username,
        restaurantName: restaurant?.name,
      }
      appLog.info(`Printing prep label: ${label.itemCode} for "${label.itemName}" useBy=${label.useBy}`)
      await thermalPrinter.printPrepLabel(label, copies, paperWidth, printerType, savedAddress, printDensity)
      toast.success(`Printed ${copies} label${copies > 1 ? 's' : ''} for ${selectedItem.name}`)
    } catch (e: any) {
      appLog.error(`Prep label print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Print failed — check printer')
    }
    setPrinting(false)
  }

  const now = new Date()
  const useBy = addHours(now, shelfLifeHours)

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-700">
        <h2 className="text-white font-bold text-lg">Prep Labels</h2>
        <p className="text-gray-400 text-xs mt-0.5">Print food preparation labels with use-by date</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search / item picker */}
        <div>
          <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Select Item</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedItem(null) }}
            placeholder="Search menu items..."
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 text-sm"
          />
          {search && !selectedItem && (
            <div className="mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {loading ? (
                <p className="text-gray-400 text-sm p-3">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-gray-500 text-sm p-3">No items found</p>
              ) : (
                filtered.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setSelectedItem(item); setSearch(item.name) }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-700 border-b border-gray-700 last:border-0"
                  >
                    <span className="text-white text-sm">{item.name}</span>
                    {item.allergens?.length > 0 && (
                      <span className="text-orange-400 text-xs ml-2">⚠ {item.allergens.join(', ')}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected item preview */}
        {selectedItem && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-1">
            <p className="text-white font-semibold">{selectedItem.name}</p>
            {selectedItem.allergens?.length > 0 ? (
              <p className="text-orange-400 text-sm">⚠ Allergens: {selectedItem.allergens.join(', ')}</p>
            ) : (
              <p className="text-gray-500 text-sm">No allergens listed</p>
            )}
          </div>
        )}

        {/* Shelf life */}
        <div>
          <label className="text-gray-400 text-xs uppercase tracking-wide block mb-2">Use Within</label>
          <div className="grid grid-cols-4 gap-2">
            {SHELF_LIFE_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                onClick={() => setShelfLifeHours(opt.hours)}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  shelfLifeHours === opt.hours
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 font-mono text-xs space-y-1">
          <p className="text-gray-400 text-center text-xs uppercase tracking-widest mb-2">Label Preview</p>
          <p className="text-white text-center font-bold text-base">{selectedItem?.name ?? '—'}</p>
          <p className="text-gray-300 text-center">{selectedItem ? generateCode(selectedItem.name) : '---'}</p>
          <div className="border-t border-gray-600 pt-2 mt-2 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-400">Prep:</span>
              <span className="text-white">{format(now, 'dd/MM/yy HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-orange-400 font-bold">Use By:</span>
              <span className="text-orange-400 font-bold">{format(useBy, 'dd/MM/yy HH:mm')}</span>
            </div>
            {selectedItem?.allergens?.length ? (
              <p className="text-orange-300 text-center pt-1 border-t border-gray-600 mt-1">
                ⚠ {selectedItem.allergens.join(', ')}
              </p>
            ) : null}
            {user && (
              <p className="text-gray-400 text-center">By: {user.full_name || user.username}</p>
            )}
          </div>
        </div>

        {/* Copies */}
        <div>
          <label className="text-gray-400 text-xs uppercase tracking-wide block mb-2">Copies</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCopies((c) => Math.max(1, c - 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600"
            >−</button>
            <span className="text-white text-2xl font-bold w-8 text-center">{copies}</span>
            <button
              onClick={() => setCopies((c) => Math.min(20, c + 1))}
              className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600"
            >+</button>
          </div>
        </div>

        {/* Print button */}
        <button
          onClick={handlePrint}
          disabled={!selectedItem || printing}
          className="w-full py-4 rounded-xl font-bold text-base bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
        >
          {printing ? 'Printing...' : `🖨 Print ${copies} Label${copies > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
