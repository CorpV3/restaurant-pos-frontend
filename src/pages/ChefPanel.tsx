import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { api } from '../services/api'
import StatusBar from '../components/common/StatusBar'
import PrinterSettings from '../components/settings/PrinterSettings'
import InventoryPage from './InventoryPage'

interface ChefOrderItem {
  id: string
  menu_item_id: string
  menu_item_name: string
  item_name?: string
  quantity: number
  unit_price: number
  item_price?: number
  special_instructions?: string
}

interface ChefOrder {
  id: string
  order_number?: string
  status: string
  total_amount?: number
  total?: number
  table_id: string | null
  order_type?: string
  customer_name?: string
  special_instructions?: string
  table?: { id: string; table_number: string | number; status: string } | null
  created_at: string
  completed_at?: string | null
  payment_method?: string | null
  items: ChefOrderItem[]
}

type ChefTab = 'kitchen' | 'inventory' | 'history' | 'settings'

interface ChefPanelProps {
  onLogout: () => void
}

function timeSince(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

function ageMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChefPanel({ onLogout }: ChefPanelProps) {
  const { restaurant } = useAuthStore()
  const [tab, setTab] = useState<ChefTab>('kitchen')
  const [orders, setOrders] = useState<ChefOrder[]>([])
  const [historyOrders, setHistoryOrders] = useState<ChefOrder[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [markingReady, setMarkingReady] = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)

  const fetchOrders = useCallback(async () => {
    if (!restaurant?.id) return
    try {
      const res = await api.get(`/api/v1/restaurants/${restaurant.id}/orders`, {
        params: { status: 'pending', limit: 50 },
      })
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.orders ?? [])
      const mapped: ChefOrder[] = raw
        .map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total_amount: o.total_amount ?? o.total ?? 0,
          table_id: o.table_id ?? null,
          order_type: o.order_type,
          customer_name: o.customer_name,
          special_instructions: o.special_instructions,
          table: o.table ?? null,
          created_at: o.created_at,
          items: (o.items ?? []).map((item: any) => ({
            id: item.id,
            menu_item_id: item.menu_item_id,
            menu_item_name: item.menu_item_name ?? item.item_name ?? 'Unknown',
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price ?? item.item_price ?? 0,
            special_instructions: item.special_instructions,
          })),
        }))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setOrders(mapped)
    } catch {
      // silently ignore poll errors
    } finally {
      setLoading(false)
    }
  }, [restaurant?.id])

  const fetchHistory = useCallback(async () => {
    if (!restaurant?.id) return
    setHistoryLoading(true)
    try {
      const res = await api.get(`/api/v1/restaurants/${restaurant.id}/orders`, {
        params: { limit: 100 },
      })
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.orders ?? [])
      const history: ChefOrder[] = raw
        .filter(o => ['completed', 'cancelled', 'served'].includes(o.status))
        .map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total_amount: o.total_amount ?? o.total ?? 0,
          total: o.total,
          table_id: o.table_id ?? null,
          order_type: o.order_type,
          customer_name: o.customer_name,
          special_instructions: o.special_instructions,
          table: o.table ?? null,
          created_at: o.created_at,
          completed_at: o.completed_at,
          payment_method: o.payment_method,
          items: (o.items ?? []).map((item: any) => ({
            id: item.id,
            menu_item_id: item.menu_item_id,
            menu_item_name: item.menu_item_name ?? item.item_name ?? 'Unknown',
            quantity: item.quantity,
            unit_price: item.unit_price ?? item.item_price ?? 0,
            special_instructions: item.special_instructions,
          })),
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setHistoryOrders(history)
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [restaurant?.id])

  useEffect(() => {
    setLoading(true)
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    const interval = setInterval(fetchOrders, 8000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (tab === 'history') fetchHistory()
  }, [tab, fetchHistory])

  const markReady = async (orderId: string) => {
    setMarkingReady((prev) => new Set(prev).add(orderId))
    try {
      await api.patch(`/api/v1/orders/${orderId}/status`, { status: 'ready' })
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } catch (e: any) {
      alert('Failed to mark ready: ' + (e?.response?.data?.detail || e?.message || 'Unknown error'))
    } finally {
      setMarkingReady((prev) => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  const tableName = (order: ChefOrder): string => {
    if (order.order_type === 'online') return 'Online'
    if (order.order_type === 'takeaway') return 'Takeaway'
    if (order.table) return `Table ${order.table.table_number}`
    if (order.table_id) return 'Table'
    return 'Takeaway'
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      case 'served': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-white">
      <StatusBar onLogout={onLogout} />

      {/* Tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 flex">
        {([
          { key: 'kitchen', label: 'Kitchen' },
          { key: 'inventory', label: 'Inventory' },
          { key: 'history', label: 'Order History' },
          { key: 'settings', label: 'Settings' },
        ] as { key: ChefTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
              tab === key
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
            {key === 'kitchen' && orders.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                {orders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {tab === 'settings' ? (
          <div className="p-4 max-w-lg">
            <PrinterSettings />
          </div>
        ) : tab === 'inventory' ? (
          /* Inventory uses its own dark container */
          <div className="h-full flex flex-col">
            <InventoryPage />
          </div>
        ) : tab === 'history' ? (
          <HistoryTab
            orders={historyOrders}
            loading={historyLoading}
            expandedId={expandedHistory}
            onToggle={(id) => setExpandedHistory(h => h === id ? null : id)}
            onRefresh={fetchHistory}
            statusColor={statusColor}
          />
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <span className="text-5xl">✓</span>
            <p className="text-lg font-semibold text-gray-600">No pending orders</p>
            <p className="text-sm text-gray-400">New orders will appear here automatically</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map((order) => {
              const mins = ageMinutes(order.created_at)
              const borderCls = mins >= 10 ? 'border-red-400' : mins >= 5 ? 'border-yellow-400' : 'border-green-400'
              const ageCls = mins >= 10 ? 'bg-red-50 text-red-600' : mins >= 5 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
              return (
                <div key={order.id} className={`bg-white rounded-xl border-2 ${borderCls} shadow-sm flex flex-col overflow-hidden`}>
                  {/* Card header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div>
                      <p className="text-gray-900 font-bold font-mono text-sm">
                        {order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">{tableName(order)}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ageCls}`}>
                      {timeSince(order.created_at)}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="p-3 flex-1 space-y-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="bg-orange-500 text-white text-xs font-bold rounded px-1.5 py-0.5 flex-shrink-0">
                          ×{item.quantity}
                        </span>
                        <div>
                          <span className="text-gray-800 text-sm leading-tight font-medium">{item.menu_item_name}</span>
                          {item.special_instructions && (
                            <p className="text-red-500 text-xs mt-0.5">Note: {item.special_instructions}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {order.special_instructions && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800 text-xs font-medium">Order note: {order.special_instructions}</p>
                      </div>
                    )}
                  </div>

                  {/* Mark Ready button */}
                  <div className="p-3 pt-0">
                    <button
                      onClick={() => markReady(order.id)}
                      disabled={markingReady.has(order.id)}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      {markingReady.has(order.id) ? 'Marking...' : 'Mark Ready'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ orders, loading, expandedId, onToggle, onRefresh, statusColor }: {
  orders: ChefOrder[]
  loading: boolean
  expandedId: string | null
  onToggle: (id: string) => void
  onRefresh: () => void
  statusColor: (s: string) => string
}) {
  const [search, setSearch] = useState('')

  const filtered = orders.filter(o =>
    !search ||
    o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.items.some(i => i.menu_item_name.toLowerCase().includes(search.toLowerCase()))
  )

  const today = filtered.filter(o => {
    const d = new Date(o.created_at)
    const now = new Date()
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const earlier = filtered.filter(o => !today.find(t => t.id === o.id))

  const OrderGroup = ({ title, items }: { title: string; items: ChefOrder[] }) => (
    <div className="mb-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-4 mb-2">{title} ({items.length})</p>
      <div className="space-y-2 px-4">
        {items.map(order => (
          <div key={order.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 text-left"
              onClick={() => onToggle(order.id)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div>
                  <p className="text-gray-900 font-bold text-sm font-mono">
                    {order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {new Date(order.created_at).toLocaleDateString()} {formatTime(order.created_at)}
                    {order.customer_name ? ` · ${order.customer_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className="text-gray-700 font-bold text-sm">£{(order.total ?? order.total_amount ?? 0).toFixed(2)}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-gray-400 text-xs">{expandedId === order.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expandedId === order.id && (
              <div className="border-t border-gray-100 px-4 pb-4">
                {/* Order details */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type:</span>
                    <span className="text-gray-700 capitalize">{order.order_type || 'table'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Payment:</span>
                    <span className="text-gray-700 capitalize">{order.payment_method || '—'}</span>
                  </div>
                  {order.completed_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Completed:</span>
                      <span className="text-gray-700">{formatTime(order.completed_at)}</span>
                    </div>
                  )}
                </div>
                {/* Items */}
                <div className="space-y-1.5">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="bg-orange-100 text-orange-700 text-xs font-bold rounded px-1.5 py-0.5 flex-shrink-0">×{item.quantity}</span>
                        <div className="min-w-0">
                          <p className="text-gray-800 text-sm font-medium truncate">{item.menu_item_name}</p>
                          {item.special_instructions && (
                            <p className="text-red-500 text-xs">Note: {item.special_instructions}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-600 text-sm flex-shrink-0">£{((item.unit_price || 0) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {order.special_instructions && (
                  <div className="mt-2 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-xs">Order note: {order.special_instructions}</p>
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <span className="text-gray-900 font-bold text-sm">Total: £{(order.total ?? order.total_amount ?? 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search + refresh */}
      <div className="flex-shrink-0 p-4 flex gap-3">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search orders, customers, items..."
          className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 text-sm focus:outline-none focus:border-orange-500 shadow-sm"
        />
        <button onClick={onRefresh} className="px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-600 text-sm font-medium shadow-sm hover:bg-gray-50">
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading history...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {search ? 'No orders match your search' : 'No order history yet'}
          </div>
        ) : (
          <>
            {today.length > 0 && <OrderGroup title="Today" items={today} />}
            {earlier.length > 0 && <OrderGroup title="Earlier" items={earlier} />}
          </>
        )}
      </div>
    </div>
  )
}
