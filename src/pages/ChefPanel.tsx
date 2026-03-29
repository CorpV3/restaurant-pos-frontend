import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { api } from '../services/api'
import StatusBar from '../components/common/StatusBar'
import PrinterSettings from '../components/settings/PrinterSettings'

interface ChefOrderItem {
  id: string
  menu_item_id: string
  menu_item_name: string
  quantity: number
  unit_price: number
}

interface ChefOrder {
  id: string
  status: string
  total_amount: number
  table_id: string | null
  table?: { id: string; table_number: string | number; status: string } | null
  created_at: string
  items: ChefOrderItem[]
}

type ChefTab = 'kitchen' | 'settings'

interface ChefPanelProps {
  onLogout: () => void
}

function timeSince(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

function ageMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

function borderColor(dateStr: string): string {
  const mins = ageMinutes(dateStr)
  if (mins >= 10) return 'border-red-500'
  if (mins >= 5) return 'border-yellow-400'
  return 'border-green-500'
}

export default function ChefPanel({ onLogout }: ChefPanelProps) {
  const { restaurant } = useAuthStore()
  const [tab, setTab] = useState<ChefTab>('kitchen')
  const [orders, setOrders] = useState<ChefOrder[]>([])
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
          status: o.status,
          total_amount: o.total_amount ?? o.total ?? 0,
          table_id: o.table_id ?? null,
          table: o.table ?? null,
          created_at: o.created_at,
          items: (o.items ?? []).map((item: any) => ({
            id: item.id,
            menu_item_id: item.menu_item_id,
            menu_item_name: item.menu_item_name ?? item.item_name ?? 'Unknown',
            quantity: item.quantity,
            unit_price: item.unit_price ?? item.item_price ?? 0,
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

  // Initial load
  useEffect(() => {
    setLoading(true)
    fetchOrders()
  }, [fetchOrders])

  // Poll every 8 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrders, 8000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  // Tick every 30s to refresh age display
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const markReady = async (orderId: string) => {
    setMarkingReady((prev) => new Set(prev).add(orderId))
    try {
      await api.patch(`/api/v1/orders/${orderId}/status`, { status: 'served' })
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
    if (order.table) return `Table ${order.table.table_number}`
    if (order.table_id) return `Table`
    return 'Takeaway'
  }

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-gray-900">
      <StatusBar onLogout={onLogout} />

      {/* Tab bar */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 flex">
        <button
          onClick={() => setTab('kitchen')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
            tab === 'kitchen'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Kitchen
          {orders.length > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
              {orders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
            tab === 'settings'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'settings' ? (
          <PrinterSettings />
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <span className="text-5xl">✓</span>
            <p className="text-lg font-medium">No pending orders</p>
            <p className="text-sm text-gray-600">New orders will appear here automatically</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map((order) => {
              const border = borderColor(order.created_at)
              const mins = ageMinutes(order.created_at)
              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-xl border-2 ${border} flex flex-col overflow-hidden`}
                >
                  {/* Card header */}
                  <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                    <div>
                      <p className="text-white font-bold font-mono text-sm">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-gray-400 text-xs mt-0.5">{tableName(order)}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          mins >= 10
                            ? 'bg-red-900/50 text-red-400'
                            : mins >= 5
                            ? 'bg-yellow-900/50 text-yellow-400'
                            : 'bg-green-900/50 text-green-400'
                        }`}
                      >
                        {timeSince(order.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="p-3 flex-1 space-y-1.5">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="bg-orange-500 text-white text-xs font-bold rounded px-1.5 py-0.5 flex-shrink-0">
                          x{item.quantity}
                        </span>
                        <span className="text-gray-200 text-sm leading-tight">{item.menu_item_name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Mark Ready button */}
                  <div className="p-3 pt-0">
                    <button
                      onClick={() => markReady(order.id)}
                      disabled={markingReady.has(order.id)}
                      className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-semibold transition-colors"
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
