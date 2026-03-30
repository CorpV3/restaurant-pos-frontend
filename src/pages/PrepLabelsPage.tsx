import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { usePrinterStore } from '../stores/printerStore'
import { thermalPrinter, type PrepLabelData } from '../services/thermalPrinter'
import { appLog } from '../services/appLogger'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import { format, isPast } from 'date-fns'

interface PreparedFoodItem {
  id: string
  name: string
  quantity: number
  batch_number: string | null
  prepared_at: string
  expires_at: string
  status: 'active' | 'offer' | 'expired' | 'consumed'
  notes: string | null
}

export default function PrepLabelsPage() {
  const { restaurant, user } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()

  const [items, setItems] = useState<PreparedFoodItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<PreparedFoodItem | null>(null)
  const [copies, setCopies] = useState(1)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!restaurant?.id) return
    api.get(`/api/v1/restaurants/${restaurant.id}/inventory/prepared`)
      .then((res) => {
        const arr = Array.isArray(res.data) ? res.data : []
        // Show active + offer + expired items (not consumed)
        setItems(arr.filter((i: PreparedFoodItem) => i.status !== 'consumed'))
      })
      .catch(() => toast.error('Failed to load prepared food'))
      .finally(() => setLoading(false))
  }, [restaurant?.id])

  const filtered = items.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  const handlePrint = async () => {
    if (!selectedItem) return
    setPrinting(true)
    try {
      const preparedAt = new Date(selectedItem.prepared_at)
      const expiresAt = new Date(selectedItem.expires_at)
      const label: PrepLabelData = {
        itemName: selectedItem.name,
        itemCode: selectedItem.batch_number || `BAT-${selectedItem.id.slice(0, 8).toUpperCase()}`,
        preparedAt: format(preparedAt, 'dd/MM/yy HH:mm'),
        useBy: format(expiresAt, 'dd/MM/yy HH:mm'),
        allergens: [],
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

  const statusBadge = (item: PreparedFoodItem) => {
    if (item.status === 'expired' || isPast(new Date(item.expires_at))) {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">Expired</span>
    }
    if (item.status === 'offer') {
      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">Offer</span>
    }
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">Active</span>
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-700">
        <h2 className="text-white font-bold text-lg">Prep Labels</h2>
        <p className="text-gray-400 text-xs mt-0.5">Print labels for prepared food items from inventory</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4 gap-4">
        {/* Search */}
        <div className="flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prepared food..."
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 text-sm"
          />
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No prepared food items found</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedItem?.id === item.id
                    ? 'bg-orange-500/20 border-orange-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium text-sm">{item.name}</span>
                  {statusBadge(item)}
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-gray-400 text-xs">
                    Batch: {item.batch_number || '—'}
                  </span>
                  <span className="text-gray-400 text-xs">
                    Qty: {item.quantity}
                  </span>
                  <span className={`text-xs ${isPast(new Date(item.expires_at)) ? 'text-red-400' : 'text-gray-400'}`}>
                    Exp: {format(new Date(item.expires_at), 'dd/MM/yy HH:mm')}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Bottom panel — only shown when item selected */}
        {selectedItem && (
          <div className="flex-shrink-0 space-y-3">
            {/* Label preview */}
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 font-mono text-xs space-y-1">
              <p className="text-gray-400 text-center text-xs uppercase tracking-widest mb-2">Label Preview</p>
              <p className="text-white text-center font-bold text-base">{selectedItem.name}</p>
              <p className="text-gray-300 text-center">{selectedItem.batch_number || `BAT-${selectedItem.id.slice(0, 8).toUpperCase()}`}</p>
              <div className="border-t border-gray-600 pt-2 mt-2 space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Prep:</span>
                  <span className="text-white">{format(new Date(selectedItem.prepared_at), 'dd/MM/yy HH:mm')}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isPast(new Date(selectedItem.expires_at)) ? 'text-red-400 font-bold' : 'text-orange-400 font-bold'}>Use By:</span>
                  <span className={isPast(new Date(selectedItem.expires_at)) ? 'text-red-400 font-bold' : 'text-orange-400 font-bold'}>
                    {format(new Date(selectedItem.expires_at), 'dd/MM/yy HH:mm')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Qty:</span>
                  <span className="text-white">{selectedItem.quantity} portions</span>
                </div>
                {user && (
                  <p className="text-gray-400 text-center">By: {user.full_name || user.username}</p>
                )}
              </div>
            </div>

            {/* Copies + Print */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600"
              >−</button>
              <span className="text-white text-xl font-bold w-8 text-center">{copies}</span>
              <button
                onClick={() => setCopies((c) => Math.min(20, c + 1))}
                className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600"
              >+</button>
              <button
                onClick={handlePrint}
                disabled={printing}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
              >
                {printing ? 'Printing...' : `🖨 Print ${copies} Label${copies > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
