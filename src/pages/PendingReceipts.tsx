import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useAuthStore } from '../stores/authStore'
import { fetchPendingOrders, type PendingOrder } from '../services/orderService'
import PaymentModal from '../components/payment/PaymentModal'
import toast from 'react-hot-toast'

const POLL_INTERVAL_MS = 10_000

interface PendingReceiptsProps {
  onCountChange: (count: number) => void
}

export default function PendingReceipts({ onCountChange }: PendingReceiptsProps) {
  const { restaurant } = useAuthStore()
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null)

  const currencySymbol = restaurant?.currency_symbol || '£'

  const load = useCallback(
    async (silent = false) => {
      if (!restaurant?.id) return
      if (!silent) setLoading(true)
      try {
        const data = await fetchPendingOrders(restaurant.id)
        setOrders(data)
        onCountChange(data.length)
      } catch {
        if (!silent) toast.error('Failed to load pending receipts')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [restaurant?.id, onCountChange]
  )

  // Initial load + poll
  useEffect(() => {
    load()
    const timer = setInterval(() => load(true), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  const tableName = (order: PendingOrder) => {
    if (order.table) return `Table ${order.table.table_number}`
    return 'Takeaway'
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700 flex items-center gap-3">
        <h2 className="text-white font-semibold text-base flex-1">
          Pending Receipts
          {orders.length > 0 && (
            <span className="ml-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {orders.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => load()}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <span className="text-5xl mb-3">🧾</span>
            <p className="text-lg font-medium">No pending receipts</p>
            <p className="text-sm mt-1">Auto-refreshes every 10 seconds</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-gray-800 border border-gray-700 hover:border-orange-500 rounded-xl p-4 text-left transition-all group"
                >
                  {/* Table badge */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-sm font-bold px-3 py-1 rounded-lg">
                      {tableName(order)}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {format(new Date(order.created_at), 'HH:mm')}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="space-y-1 mb-3 min-h-[48px]">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-gray-300 truncate mr-2">
                          {item.quantity}× {item.menu_item_name}
                        </span>
                        <span className="text-gray-500 flex-shrink-0">
                          {currencySymbol}{(item.unit_price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-gray-500 text-xs">
                        +{order.items.length - 3} more items
                      </p>
                    )}
                  </div>

                  {/* Total */}
                  <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Total</span>
                    <span className="text-orange-400 text-xl font-bold">
                      {currencySymbol}{parseFloat(order.total_amount.toString()).toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-3 w-full py-2 bg-orange-500/10 group-hover:bg-orange-500 text-orange-400 group-hover:text-white text-sm font-medium rounded-lg text-center transition-all">
                    Collect Payment
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {selectedOrder && (
        <PaymentModal
          total={parseFloat(selectedOrder.total_amount.toString())}
          currencySymbol={currencySymbol}
          tableName={tableName(selectedOrder)}
          existingOrderId={selectedOrder.id}
          onClose={() => setSelectedOrder(null)}
          onComplete={() => {
            setSelectedOrder(null)
            load()
          }}
        />
      )}
    </div>
  )
}
