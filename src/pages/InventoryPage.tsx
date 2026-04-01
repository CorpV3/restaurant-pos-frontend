import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { usePrinterStore } from '../stores/printerStore'
import { api } from '../services/api'
import { thermalPrinter, type PrepLabelData } from '../services/thermalPrinter'
import { appLog } from '../services/appLogger'
import PrinterSettings from '../components/settings/PrinterSettings'
import toast from 'react-hot-toast'
import { format, isPast, isValid } from 'date-fns'

function safeFormat(dateStr: string | null | undefined, fmt: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return isValid(d) ? format(d, fmt) : '—'
}

function safeIsPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return isValid(d) ? isPast(d) : false
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string
  name: string
  quantity: number
  unit: string
  category: string
  min_threshold: number  // API field name
  reorder_level?: number // kept for compat
}

interface PreparedFood {
  id: string
  name: string
  quantity: number
  batch_number: string | null
  prepared_at: string
  expires_at: string
  status: 'active' | 'offer' | 'expired' | 'consumed'
  notes: string | null
  offer_discount?: number | null
}

type Tab = 'ingredients' | 'prepared' | 'alerts'

const UNITS = ['pieces', 'kg', 'g', 'L', 'ml', 'portions', 'bottles', 'boxes', 'bags']
const CATEGORIES = ['meat', 'vegetables', 'dairy', 'bakery', 'spices', 'beverages', 'seafood', 'frozen', 'other']

function genBatch() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const r = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `BT-${d}-${r}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ item }: { item: PreparedFood }) {
  if (item.status === 'consumed') return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Consumed</span>
  if (item.status === 'expired' || safeIsPast(item.expires_at)) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300">Expired</span>
  if (item.status === 'offer') return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-300">Offer {item.offer_discount ? `${item.offer_discount}%` : ''}</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300">Active</span>
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { restaurant, user } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()

  const [tab, setTab] = useState<Tab>('ingredients')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [prepared, setPrepared] = useState<PreparedFood[]>([])
  const [alerts, setAlerts] = useState<{ low_stock: Ingredient[]; expiring_soon: PreparedFood[]; expired: PreparedFood[] }>({
    low_stock: [], expiring_soon: [], expired: []
  })
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAddIngredient, setShowAddIngredient] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null)
  const [showAddPrepared, setShowAddPrepared] = useState(false)
  const [editIngredient, setEditIngredient] = useState<Ingredient | null>(null)

  // Label printing state
  const [printTarget, setPrintTarget] = useState<PreparedFood | null>(null)
  const [printCopies, setPrintCopies] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [showPrinterSettings, setShowPrinterSettings] = useState(false)

  const rid = restaurant?.id

  const fetchAll = useCallback(async () => {
    if (!rid) return
    setLoading(true)
    try {
      const [ingRes, prepRes, alertRes] = await Promise.all([
        api.get(`/api/v1/restaurants/${rid}/inventory/items`),
        api.get(`/api/v1/restaurants/${rid}/inventory/prepared`),
        api.get(`/api/v1/restaurants/${rid}/inventory/alerts`),
      ])
      setIngredients(Array.isArray(ingRes.data) ? ingRes.data : [])
      setPrepared(Array.isArray(prepRes.data) ? prepRes.data : [])
      const ad = alertRes.data || {}
      setAlerts({
        low_stock: Array.isArray(ad.low_stock) ? ad.low_stock : [],
        expiring_soon: Array.isArray(ad.expiring_soon) ? ad.expiring_soon : [],
        expired: Array.isArray(ad.expired) ? ad.expired : [],
      })
    } catch {
      toast.error('Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [rid])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalAlerts = alerts.low_stock.length + alerts.expiring_soon.length + alerts.expired.length

  const handlePrintLabel = async (item: PreparedFood) => {
    setPrinting(true)
    try {
      const label: PrepLabelData = {
        itemName: item.name,
        itemCode: item.batch_number || `BAT-${item.id.slice(0, 8).toUpperCase()}`,
        preparedAt: safeFormat(item.prepared_at, 'dd/MM/yy HH:mm'),
        useBy: safeFormat(item.expires_at, 'dd/MM/yy HH:mm'),
        allergens: [],
        preparedBy: user?.full_name || user?.username,
        restaurantName: restaurant?.name,
      }
      appLog.info(`Printing prep label: ${label.itemCode} for "${label.itemName}"`)
      await thermalPrinter.printPrepLabel(label, printCopies, paperWidth, printerType, savedAddress, printDensity)
      toast.success(`Printed ${printCopies} label${printCopies > 1 ? 's' : ''}`)
    } catch (e: any) {
      appLog.error(`Prep label print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Print failed — check printer settings')
    }
    setPrinting(false)
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-white font-bold text-lg">Inventory</h2>
            <p className="text-gray-400 text-xs mt-0.5">Manage ingredients &amp; prepared food</p>
          </div>
          {totalAlerts > 0 && (
            <button onClick={() => setTab('alerts')} className="flex items-center gap-1.5 bg-red-900/50 border border-red-700 text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium">
              ⚠ {totalAlerts} alert{totalAlerts > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {(['ingredients', 'prepared', 'alerts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t === 'prepared' ? 'Prepared Food' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'alerts' && totalAlerts > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{totalAlerts}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>
      ) : tab === 'ingredients' ? (
        <IngredientsTab
          items={ingredients}
          onAdd={() => { setEditIngredient(null); setShowAddIngredient(true) }}
          onEdit={(item) => { setEditIngredient(item); setShowAddIngredient(true) }}
          onAdjust={(item) => { setAdjustTarget(item); setShowAdjust(true) }}
          onDelete={async (id) => {
            if (!confirm('Delete this ingredient?')) return
            try { await api.delete(`/api/v1/restaurants/${rid}/inventory/items/${id}`); fetchAll(); toast.success('Deleted') }
            catch { toast.error('Failed to delete') }
          }}
        />
      ) : tab === 'prepared' ? (
        <PreparedTab
          items={prepared}
          printTarget={printTarget}
          printCopies={printCopies}
          printing={printing}
          showPrinterSettings={showPrinterSettings}
          onSetPrintTarget={setPrintTarget}
          onSetCopies={setPrintCopies}
          onPrint={handlePrintLabel}
          onTogglePrinterSettings={() => setShowPrinterSettings(s => !s)}
          onAdd={() => setShowAddPrepared(true)}
          onConsume={async (id) => {
            try {
              await api.patch(`/api/v1/restaurants/${rid}/inventory/prepared/${id}`, { status: 'consumed' })
              fetchAll(); toast.success('Marked as consumed')
            } catch { toast.error('Failed to update') }
          }}
          onDelete={async (id) => {
            if (!confirm('Delete this item?')) return
            try { await api.delete(`/api/v1/restaurants/${rid}/inventory/prepared/${id}`); fetchAll(); toast.success('Deleted') }
            catch { toast.error('Failed to delete') }
          }}
        />
      ) : (
        <AlertsTab alerts={alerts} onRefresh={fetchAll} />
      )}

      {/* Add/Edit Ingredient Modal */}
      {showAddIngredient && (
        <IngredientModal
          item={editIngredient}
          onClose={() => setShowAddIngredient(false)}
          onSave={async (data) => {
            try {
              if (editIngredient) {
                await api.patch(`/api/v1/restaurants/${rid}/inventory/items/${editIngredient.id}`, data)
                toast.success('Updated')
              } else {
                await api.post(`/api/v1/restaurants/${rid}/inventory/items`, data)
                toast.success('Ingredient added')
              }
              setShowAddIngredient(false); fetchAll()
            } catch { toast.error('Failed to save') }
          }}
        />
      )}

      {/* Adjust Stock Modal */}
      {showAdjust && adjustTarget && (
        <AdjustModal
          item={adjustTarget}
          onClose={() => setShowAdjust(false)}
          onSave={async (qty, reason) => {
            try {
              await api.post(`/api/v1/restaurants/${rid}/inventory/items/${adjustTarget.id}/adjust`, { quantity_change: qty, reason })
              toast.success('Stock adjusted'); setShowAdjust(false); fetchAll()
            } catch { toast.error('Failed to adjust') }
          }}
        />
      )}

      {/* Add Prepared Food Modal */}
      {showAddPrepared && (
        <AddPreparedModal
          onClose={() => setShowAddPrepared(false)}
          onSave={async (data) => {
            try {
              await api.post(`/api/v1/restaurants/${rid}/inventory/prepared`, data)
              toast.success('Batch added'); setShowAddPrepared(false); fetchAll()
            } catch { toast.error('Failed to add') }
          }}
        />
      )}
    </div>
  )
}

// ─── Ingredients Tab ─────────────────────────────────────────────────────────

function IngredientsTab({ items, onAdd, onEdit, onAdjust, onDelete }: {
  items: Ingredient[]
  onAdd: () => void
  onEdit: (i: Ingredient) => void
  onAdjust: (i: Ingredient) => void
  onDelete: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
      <div className="flex gap-2 flex-shrink-0">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search ingredients..."
          className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
        />
        <button onClick={onAdd} className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold">
          + Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No ingredients found</p>
        ) : filtered.map(item => (
          <div key={item.id} className={`bg-gray-800 rounded-xl p-3 border ${item.quantity <= (item.min_threshold ?? item.reorder_level ?? 0) ? 'border-red-700' : 'border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm truncate">{item.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 capitalize flex-shrink-0">{item.category}</span>
                  {item.quantity <= (item.min_threshold ?? item.reorder_level ?? 0) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-300 flex-shrink-0">Low</span>
                  )}
                </div>
                <p className="text-gray-400 text-xs mt-0.5">
                  {item.quantity} {item.unit} &nbsp;·&nbsp; Reorder at {item.min_threshold ?? item.reorder_level ?? 0} {item.unit}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button onClick={() => onAdjust(item)} className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium">Adjust</button>
                <button onClick={() => onEdit(item)} className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs">Edit</button>
                <button onClick={() => onDelete(item.id)} className="px-2.5 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-xs">Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Prepared Food Tab ───────────────────────────────────────────────────────

function PreparedTab({ items, printTarget, printCopies, printing, showPrinterSettings,
  onSetPrintTarget, onSetCopies, onPrint, onTogglePrinterSettings, onAdd, onConsume, onDelete }: {
  items: PreparedFood[]
  printTarget: PreparedFood | null
  printCopies: number
  printing: boolean
  showPrinterSettings: boolean
  onSetPrintTarget: (i: PreparedFood | null) => void
  onSetCopies: (c: number) => void
  onPrint: (i: PreparedFood) => void
  onTogglePrinterSettings: () => void
  onAdd: () => void
  onConsume: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = items.filter(i => i.status !== 'consumed' && i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
      <div className="flex gap-2 flex-shrink-0">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search prepared food..."
          className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
        />
        <button onClick={onTogglePrinterSettings} className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${showPrinterSettings ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
          ⚙
        </button>
        <button onClick={onAdd} className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold">
          + Add
        </button>
      </div>
      {showPrinterSettings && (
        <div className="flex-shrink-0 bg-gray-800 rounded-xl border border-gray-700 p-3">
          <PrinterSettings />
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No prepared food items</p>
        ) : filtered.map(item => (
          <div
            key={item.id}
            onClick={() => onSetPrintTarget(printTarget?.id === item.id ? null : item)}
            className={`bg-gray-800 rounded-xl border transition-colors cursor-pointer ${
              printTarget?.id === item.id ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-medium text-sm">{item.name}</span>
                <StatusBadge item={item} />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-gray-400 text-xs">Batch: {item.batch_number || '—'}</span>
                <span className="text-gray-400 text-xs">Qty: {item.quantity}</span>
                <span className={`text-xs ${safeIsPast(item.expires_at) ? 'text-red-400' : 'text-gray-400'}`}>
                  Exp: {safeFormat(item.expires_at, 'dd/MM/yy HH:mm')}
                </span>
              </div>
            </div>

            {/* Expanded actions when selected */}
            {printTarget?.id === item.id && (
              <div className="border-t border-gray-700 p-3 space-y-3" onClick={e => e.stopPropagation()}>
                {/* Label preview */}
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs space-y-1">
                  <p className="text-gray-400 text-center uppercase tracking-widest text-xs mb-1">Label Preview</p>
                  <p className="text-white text-center font-bold">{item.name}</p>
                  <p className="text-gray-300 text-center text-xs">{item.batch_number || `BAT-${item.id.slice(0, 8).toUpperCase()}`}</p>
                  <div className="border-t border-gray-700 pt-1.5 mt-1.5 space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Prep:</span>
                      <span className="text-white">{safeFormat(item.prepared_at, 'dd/MM/yy HH:mm')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={safeIsPast(item.expires_at) ? 'text-red-400 font-bold' : 'text-orange-400 font-bold'}>Use By:</span>
                      <span className={safeIsPast(item.expires_at) ? 'text-red-400 font-bold' : 'text-orange-400 font-bold'}>
                        {safeFormat(item.expires_at, 'dd/MM/yy HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Print controls */}
                <div className="flex items-center gap-2">
                  <button onClick={() => onSetCopies(Math.max(1, printCopies - 1))} className="w-9 h-9 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600">−</button>
                  <span className="text-white font-bold w-6 text-center">{printCopies}</span>
                  <button onClick={() => onSetCopies(Math.min(20, printCopies + 1))} className="w-9 h-9 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600">+</button>
                  <button
                    onClick={() => onPrint(item)}
                    disabled={printing}
                    className="flex-1 py-2 rounded-lg font-semibold text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white"
                  >
                    {printing ? 'Printing...' : `🖨 Print ${printCopies} Label${printCopies > 1 ? 's' : ''}`}
                  </button>
                  <button onClick={() => onConsume(item.id)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium">
                    Consumed
                  </button>
                  <button onClick={() => onDelete(item.id)} className="px-2 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-xs">
                    Del
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Alerts Tab ──────────────────────────────────────────────────────────────

function AlertsTab({ alerts, onRefresh }: { alerts: { low_stock: Ingredient[]; expiring_soon: PreparedFood[]; expired: PreparedFood[] }; onRefresh: () => void }) {
  const total = alerts.low_stock.length + alerts.expiring_soon.length + alerts.expired.length
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-white font-semibold">{total} active alert{total !== 1 ? 's' : ''}</span>
        <button onClick={onRefresh} className="text-gray-400 text-xs hover:text-white">Refresh</button>
      </div>

      {alerts.low_stock.length > 0 && (
        <div>
          <p className="text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">Low Stock ({alerts.low_stock.length})</p>
          <div className="space-y-1.5">
            {alerts.low_stock.map((i: Ingredient) => (
              <div key={i.id} className="bg-orange-900/20 border border-orange-800/50 rounded-xl p-3">
                <p className="text-white text-sm font-medium">{i.name}</p>
                <p className="text-orange-300 text-xs">{i.quantity} {i.unit} remaining (reorder at {i.min_threshold ?? i.reorder_level ?? 0})</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.expiring_soon.length > 0 && (
        <div>
          <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">Expiring Soon ({alerts.expiring_soon.length})</p>
          <div className="space-y-1.5">
            {alerts.expiring_soon.map((i: PreparedFood) => (
              <div key={i.id} className="bg-yellow-900/20 border border-yellow-800/50 rounded-xl p-3">
                <p className="text-white text-sm font-medium">{i.name}</p>
                <p className="text-yellow-300 text-xs">Expires {safeFormat(i.expires_at, 'dd/MM/yy HH:mm')} · Batch: {i.batch_number || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.expired.length > 0 && (
        <div>
          <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2">Expired ({alerts.expired.length})</p>
          <div className="space-y-1.5">
            {alerts.expired.map((i: PreparedFood) => (
              <div key={i.id} className="bg-red-900/20 border border-red-800/50 rounded-xl p-3">
                <p className="text-white text-sm font-medium">{i.name}</p>
                <p className="text-red-300 text-xs">Expired {safeFormat(i.expires_at, 'dd/MM/yy HH:mm')} · Batch: {i.batch_number || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <span className="text-4xl mb-3">✓</span>
          <p className="text-lg font-medium">No alerts</p>
        </div>
      )}
    </div>
  )
}

// ─── Ingredient Modal ─────────────────────────────────────────────────────────

function IngredientModal({ item, onClose, onSave }: {
  item: Ingredient | null
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [form, setForm] = useState({
    name: item?.name || '',
    quantity: item?.quantity ?? 0,
    unit: item?.unit || 'pieces',
    category: item?.category || 'other',
    min_threshold: item?.min_threshold ?? item?.reorder_level ?? 0,
  })
  const [saving, setSaving] = useState(false)

  const field = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-bold">{item ? 'Edit Ingredient' : 'Add Ingredient'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <input value={form.name} onChange={e => field('name', e.target.value)} placeholder="Name" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={form.quantity} onChange={e => field('quantity', parseFloat(e.target.value) || 0)} placeholder="Quantity" className="bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
            <select value={form.unit} onChange={e => field('unit', e.target.value)} className="bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={form.category} onChange={e => field('category', e.target.value)} className="bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500">
              {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
            <input type="number" value={form.min_threshold} onChange={e => field('min_threshold', parseFloat(e.target.value) || 0)} placeholder="Reorder level" className="bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium">Cancel</button>
          <button
            disabled={!form.name || saving}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false) }}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl text-sm font-semibold"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────

function AdjustModal({ item, onClose, onSave }: {
  item: Ingredient
  onClose: () => void
  onSave: (qty: number, reason: string) => Promise<void>
}) {
  const [qty, setQty] = useState(0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-gray-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h3 className="text-white font-bold">Adjust Stock</h3>
            <p className="text-gray-400 text-xs mt-0.5">{item.name} — current: {item.quantity} {item.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Change (use negative to reduce)</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => q - 1)} className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600">−</button>
              <input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm text-center focus:outline-none focus:border-orange-500" />
              <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 rounded-xl bg-gray-700 text-white text-xl font-bold hover:bg-gray-600">+</button>
            </div>
            <p className="text-gray-400 text-xs mt-1.5 text-center">
              New total: <span className={`font-bold ${(item.quantity + qty) < 0 ? 'text-red-400' : 'text-white'}`}>
                {item.quantity + qty} {item.unit}
              </span>
            </p>
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium">Cancel</button>
          <button
            disabled={qty === 0 || saving}
            onClick={async () => { setSaving(true); await onSave(qty, reason); setSaving(false) }}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl text-sm font-semibold"
          >
            {saving ? 'Saving...' : 'Adjust'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Prepared Food Modal ──────────────────────────────────────────────────

function AddPreparedModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const now = new Date()
  const expiryDefault = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [form, setForm] = useState({
    name: '',
    quantity: 1,
    batch_number: genBatch(),
    prepared_at: toLocal(now),
    expires_at: toLocal(expiryDefault),
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const field = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm border border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-bold">Add Prepared Batch</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <input value={form.name} onChange={e => field('name', e.target.value)} placeholder="Item name *" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Quantity</label>
              <input type="number" value={form.quantity} onChange={e => field('quantity', parseFloat(e.target.value) || 1)} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Batch No.</label>
              <input value={form.batch_number} onChange={e => field('batch_number', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Prepared At</label>
            <input type="datetime-local" value={form.prepared_at} onChange={e => field('prepared_at', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Expires At</label>
            <input type="datetime-local" value={form.expires_at} onChange={e => field('expires_at', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <input value={form.notes} onChange={e => field('notes', e.target.value)} placeholder="Notes (optional)" className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm font-medium">Cancel</button>
          <button
            disabled={!form.name || saving}
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false) }}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl text-sm font-semibold"
          >
            {saving ? 'Saving...' : 'Add Batch'}
          </button>
        </div>
      </div>
    </div>
  )
}
