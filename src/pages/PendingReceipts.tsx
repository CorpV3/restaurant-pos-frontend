import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { useAuthStore } from '../stores/authStore'
import { usePrinterStore } from '../stores/printerStore'
import { thermalPrinter } from '../services/thermalPrinter'
import { appLog } from '../services/appLogger'
import { fetchPendingOrders, fetchActiveOrders, refundOrder, type PendingOrder } from '../services/orderService'
import { api } from '../services/api'
import PaymentModal from '../components/payment/PaymentModal'
import toast from 'react-hot-toast'
import { ledService } from '../services/ledService'

const POLL_INTERVAL_MS = 10_000

interface PendingReceiptsProps {
  onCountChange: (count: number) => void
}

interface CompletedReceipt {
  order: PendingOrder
  method: 'cash' | 'card'
}

export default function PendingReceipts({ onCountChange }: PendingReceiptsProps) {
  const { restaurant } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()
  const [orders, setOrders] = useState<PendingOrder[]>([])        // served — awaiting payment
  const [activeOrders, setActiveOrders] = useState<PendingOrder[]>([]) // preparing — needs serving
  const [markingServedId, setMarkingServedId] = useState<string | null>(null)
  const markingServedRef = useRef<Set<string>>(new Set()) // synchronous double-tap guard
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null)
  const [completedReceipt, setCompletedReceipt] = useState<CompletedReceipt | null>(null)
  const [showRefund, setShowRefund] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card'>('cash')
  const [refundReason, setRefundReason] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [cardRefundStatus, setCardRefundStatus] = useState<'idle' | 'waiting' | 'approved' | 'declined'>('idle')

  const currencySymbol = restaurant?.currency_symbol || '£'

  const noChefDisplay = restaurant?.chef_display_enabled === false

  const load = useCallback(
    async (silent = false) => {
      if (!restaurant?.id) return
      if (!silent) setLoading(true)
      try {
        const fetches: Promise<void>[] = [
          fetchPendingOrders(restaurant.id).then((data) => {
            setOrders(data)
            onCountChange(data.length)
          }),
        ]
        if (noChefDisplay) {
          fetches.push(
            fetchActiveOrders(restaurant.id).then((data) => setActiveOrders(data))
          )
        }
        await Promise.all(fetches)
      } catch {
        if (!silent) toast.error('Failed to load pending receipts')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [restaurant?.id, onCountChange, noChefDisplay]
  )

  const handleMarkServed = async (order: PendingOrder) => {
    if (markingServedRef.current.has(order.id)) return
    markingServedRef.current.add(order.id)
    setMarkingServedId(order.id)
    try {
      await api.patch(`/api/v1/orders/${order.id}/status`, { status: 'served' })
      appLog.info(`Marked served: ${order.order_number ?? order.id.slice(0, 8)}`)
      toast.success(`${tableName(order)} marked as served`)
      load(true)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Failed to mark served'
      appLog.error(`Mark served failed: ${msg}`)
      toast.error(msg)
    } finally {
      markingServedRef.current.delete(order.id)
      setMarkingServedId(null)
    }
  }

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

  const handleRefund = async () => {
    if (!completedReceipt) return
    const amt = parseFloat(refundAmount)
    if (!amt || amt <= 0 || amt > completedReceipt.order.total_amount) {
      toast.error('Invalid refund amount')
      return
    }
    setRefunding(true)
    try {
      if (refundMethod === 'card') {
        // Card refund: send to physical terminal first
        setCardRefundStatus('waiting')
        appLog.info(`Card refund: orderId=${completedReceipt.order.id} amount=${amt}`)
        const res = await api.post(
          '/api/v1/payments/card-refund',
          {
            restaurant_id: restaurant?.id,
            order_id: completedReceipt.order.id,
            amount: amt,
            lane_id: 9999,
          },
          { timeout: 120000 }
        )
        if (!res.data.approved) {
          setCardRefundStatus('declined')
          toast.error(`Card refund declined: ${res.data.message}`)
          setRefunding(false)
          return
        }
        setCardRefundStatus('approved')
        appLog.info(`Card refund approved: txId=${res.data.transaction_id}`)
      }

      appLog.info(`Refund DB update: orderId=${completedReceipt.order.id} method=${refundMethod} amount=${amt}`)
      await refundOrder(completedReceipt.order.id, amt, refundMethod, refundReason)
      appLog.info(`Refund success: orderId=${completedReceipt.order.id} amount=${amt} method=${refundMethod}`)
      toast.success(`Refund of ${currencySymbol}${amt.toFixed(2)} processed`)
      setShowRefund(false)
      setCardRefundStatus('idle')
      setRefundAmount('')
      setRefundReason('')
    } catch (e: any) {
      setCardRefundStatus('idle')
      const msg = e?.response?.data?.detail || e?.message || 'Refund failed'
      appLog.error(`Refund failed: method=${refundMethod} amount=${amt} error=${msg}`)
      toast.error(msg)
    } finally {
      setRefunding(false)
    }
  }

  const [printingLabels, setPrintingLabels] = useState(false)
  const [printingLabelOrderId, setPrintingLabelOrderId] = useState<string | null>(null)
  const [printingKitchenOrderId, setPrintingKitchenOrderId] = useState<string | null>(null)
  const [openingDrawer, setOpeningDrawer] = useState(false)

  const handlePrintLabelsForOrder = async (order: PendingOrder) => {
    setPrintingLabelOrderId(order.id)
    try {
      await thermalPrinter.printLabels(
        order.items.map((i) => ({ name: i.menu_item_name, qty: i.quantity })),
        tableName(order),
        order.id.slice(0, 8).toUpperCase(),
        restaurant?.name ?? 'Restaurant',
        32,
        printerType, savedAddress, printDensity,
      )
      toast.success('Labels printed')
    } catch (e: any) {
      appLog.error(`Label print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Label print failed')
    }
    setPrintingLabelOrderId(null)
  }

  const handlePrintKitchenTicket = async (order: PendingOrder) => {
    setPrintingKitchenOrderId(order.id)
    appLog.info(`Kitchen ticket (manual): order=${order.order_number ?? order.id.slice(0,8)}`)
    try {
      await thermalPrinter.printKitchenTicket(
        {
          orderNumber: order.order_number ?? order.id.slice(0, 8),
          orderType: (order.order_type ?? 'table').toLowerCase(),
          tableName: tableName(order),
          customerName: order.customer_name ?? undefined,
          time: format(new Date(order.created_at), 'HH:mm'),
          items: order.items.map((i) => ({
            name: i.menu_item_name,
            qty: i.quantity,
            note: i.special_instructions ?? undefined,
          })),
        },
        1,
        paperWidth,
        printerType,
        savedAddress,
        printDensity,
      )
      appLog.info('Kitchen ticket printed OK')
      toast.success('Kitchen ticket printed')
    } catch (e: any) {
      appLog.error(`Kitchen ticket failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Kitchen ticket print failed')
    }
    setPrintingKitchenOrderId(null)
  }

  const handleOpenCashDrawer = async () => {
    setOpeningDrawer(true)
    appLog.info('Cash drawer open request')
    try {
      const { drawerIp, drawerTcpPort } = usePrinterStore.getState()
      await thermalPrinter.openCashDrawer(printerType, savedAddress, drawerIp, drawerTcpPort)
      appLog.info('Cash drawer opened OK')
      toast.success('Cash drawer opened')
    } catch (e: any) {
      appLog.error(`Cash drawer failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Failed to open cash drawer')
    }
    setOpeningDrawer(false)
  }

  const handlePrintLabels = async () => {
    if (!completedReceipt) return
    const { order } = completedReceipt
    setPrintingLabels(true)
    try {
      await thermalPrinter.printLabels(
        order.items.map((i) => ({ name: i.menu_item_name, qty: i.quantity })),
        tableName(order),
        order.id.slice(0, 8).toUpperCase(),
        restaurant?.name ?? 'Restaurant',
        32,
        printerType, savedAddress, printDensity,
      )
      toast.success('Labels printed')
    } catch (e: any) {
      appLog.error(`Label print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Label print failed')
    }
    setPrintingLabels(false)
  }

  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    if (!completedReceipt) return
    const { order, method } = completedReceipt
    setPrinting(true)
    try {
      await thermalPrinter.printReceipt({
        restaurantName: restaurant?.name ?? 'Restaurant',
        orderRef: order.id.slice(0, 8).toUpperCase(),
        tableName: tableName(order),
        date: format(new Date(order.created_at), 'HH:mm dd/MM/yyyy'),
        items: order.items.map((i) => ({ name: i.menu_item_name, qty: i.quantity, price: i.unit_price })),
        total: order.total_amount,
        paymentMethod: method,
        currencySymbol,
      }, paperWidth, printerType, savedAddress, printDensity)
    } catch (e: any) {
      appLog.error(`Receipts print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Print failed — check printer connection')
    }
    setPrinting(false)
  }

  // Receipt slip shown after payment collected
  if (completedReceipt) {
    const { order, method } = completedReceipt
    return (
      <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">

        {/* ── Sticky action bar — always visible at top ── */}
        <div className="flex-shrink-0 bg-gray-800 border-b border-green-700 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-green-400 font-bold text-sm">Payment Collected</p>
            <p className="text-gray-400 text-xs truncate">{tableName(order)} · {format(new Date(order.created_at), 'HH:mm dd/MM/yyyy')}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg font-medium disabled:opacity-50"
            >
              {printing ? '...' : '🖨 Receipt'}
            </button>
            <button
              onClick={handlePrintLabels}
              disabled={printingLabels}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-yellow-300 text-sm rounded-lg font-medium disabled:opacity-50"
            >
              {printingLabels ? '...' : '🏷 Labels'}
            </button>
            <button
              onClick={() => {
                setCompletedReceipt(null)
                setShowRefund(false)
                load()
              }}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-bold"
            >
              Done ✓
            </button>
          </div>
        </div>

        {/* ── Scrollable receipt content ── */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-sm mx-auto border border-green-700/50 shadow-2xl">
            {/* Success header */}
            <div className="text-center p-5 pb-4">
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center mx-auto mb-2">
                <span className="text-white font-bold">OK</span>
              </div>
              <h2 className="text-white text-lg font-bold">
                {currencySymbol}{order.total_amount.toFixed(2)}
              </h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 inline-block ${
                method === 'cash' ? 'bg-green-900/60 text-green-400' : 'bg-blue-900/60 text-blue-400'
              }`}>
                {method.toUpperCase()}
              </span>
            </div>

            {/* Items */}
            <div className="border-t border-gray-700 px-5 py-4 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-300">{item.quantity}× {item.menu_item_name}</span>
                  <span className="text-gray-400">{currencySymbol}{(item.unit_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="border-t border-gray-700 px-5 py-4">
              <div className="flex justify-between items-center">
                <span className="text-white font-semibold">Total</span>
                <span className="text-orange-400 text-xl font-bold">
                  {currencySymbol}{order.total_amount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Refund section */}
          <div className="w-full max-w-sm mx-auto mt-3">
            {!showRefund ? (
              <button
                onClick={() => setShowRefund(true)}
                className="w-full py-2 text-red-400 hover:text-red-300 text-sm underline"
              >
                Issue Refund
              </button>
            ) : (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4 space-y-2">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Refund</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefundMethod('cash')}
                    className={`flex-1 py-1.5 text-sm rounded-lg font-medium ${refundMethod === 'cash' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Cash
                  </button>
                  <button
                    onClick={() => setRefundMethod('card')}
                    className={`flex-1 py-1.5 text-sm rounded-lg font-medium ${refundMethod === 'card' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Card
                  </button>
                </div>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={`Amount (max ${currencySymbol}${completedReceipt.order.total_amount.toFixed(2)})`}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                  step="0.01"
                  max={completedReceipt.order.total_amount}
                />
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"
                />
                {refundMethod === 'card' && cardRefundStatus === 'waiting' && (
                  <div className="flex flex-col items-center gap-2 py-3 bg-blue-900/40 rounded-xl border border-blue-700">
                    <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full" />
                    <p className="text-blue-300 text-sm font-medium">Tap card on terminal to refund...</p>
                  </div>
                )}
                {refundMethod === 'card' && cardRefundStatus === 'declined' && (
                  <p className="text-red-400 text-sm text-center">Card refund declined. Try again.</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowRefund(false); setCardRefundStatus('idle') }}
                    disabled={refunding}
                    className="flex-1 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRefund}
                    disabled={refunding || !refundAmount}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                  >
                    {refunding && refundMethod === 'card' && cardRefundStatus === 'waiting'
                      ? 'Waiting...'
                      : refunding ? 'Processing...' : 'Confirm Refund'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-4" /> {/* bottom padding */}
        </div>
      </div>
    )
  }

  // Reusable order card — shared between active and served sections
  const renderOrderCard = (order: PendingOrder, mode: 'active' | 'served') => (
    <div
      key={order.id}
      className={`border rounded-xl p-4 flex flex-col ${
        mode === 'active'
          ? 'bg-gray-800 border-blue-700/50'
          : 'bg-gray-800 border-gray-700'
      }`}
    >
      {/* Table badge + time */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-bold px-3 py-1 rounded-lg border ${
          mode === 'active'
            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        }`}>
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
          <p className="text-gray-500 text-xs">+{order.items.length - 3} more items</p>
        )}
      </div>

      {/* Total */}
      <div className="border-t border-gray-700 pt-3 flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">Total</span>
        <span className="text-orange-400 text-xl font-bold">
          {currencySymbol}{order.total_amount.toFixed(2)}
        </span>
      </div>

      {mode === 'active' ? (
        /* Active order actions: reprint ticket + mark served */
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <button
            onClick={() => handlePrintKitchenTicket(order)}
            disabled={printingKitchenOrderId === order.id}
            className="py-2.5 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {printingKitchenOrderId === order.id ? 'Printing...' : '🍳 Reprint'}
          </button>
          <button
            onClick={() => handleMarkServed(order)}
            disabled={markingServedId === order.id}
            className="py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors"
          >
            {markingServedId === order.id ? 'Saving...' : '✓ Mark Served'}
          </button>
        </div>
      ) : (
        /* Served order actions: labels, kitchen reprint, cash drawer, collect payment */
        <>
          <div className="grid grid-cols-2 gap-2 mt-auto">
            <button
              onClick={() => handlePrintLabelsForOrder(order)}
              disabled={printingLabelOrderId === order.id}
              className="py-2 bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-300 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {printingLabelOrderId === order.id ? 'Printing...' : '🏷 Labels'}
            </button>
            <button
              onClick={() => handlePrintKitchenTicket(order)}
              disabled={printingKitchenOrderId === order.id}
              className="py-2 bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {printingKitchenOrderId === order.id ? 'Printing...' : '🍳 Kitchen'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={handleOpenCashDrawer}
              disabled={openingDrawer}
              className="py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {openingDrawer ? '...' : '🪙 Cash Drawer'}
            </button>
            <button
              onClick={() => setSelectedOrder(order)}
              className="py-2 bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white text-sm font-medium rounded-lg transition-all"
            >
              Collect Payment
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700 flex items-center gap-3">
        <h2 className="text-white font-semibold text-base flex-1">
          {noChefDisplay ? 'Orders' : 'Pending Receipts'}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* ── Needs Serving section (only when chef display disabled) ── */}
        {noChefDisplay && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-blue-300 text-sm font-bold uppercase tracking-wide">Needs Serving</h3>
              {activeOrders.length > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeOrders.length}
                </span>
              )}
            </div>
            {activeOrders.length === 0 ? (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                No active orders — all clear
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeOrders
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                  .map((order) => renderOrderCard(order, 'active'))}
              </div>
            )}
          </div>
        )}

        {/* ── Awaiting Payment section ── */}
        <div>
          {noChefDisplay && (
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-orange-400 text-sm font-bold uppercase tracking-wide">Awaiting Payment</h3>
              {orders.length > 0 && (
                <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {orders.length}
                </span>
              )}
            </div>
          )}
          {orders.length === 0 ? (
            noChefDisplay ? (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                No orders awaiting payment
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 py-16">
                <div className="w-14 h-14 rounded-xl bg-gray-700 flex items-center justify-center mb-3">
                  <span className="text-gray-400 text-lg font-bold">REC</span>
                </div>
                <p className="text-lg font-medium">No pending receipts</p>
                <p className="text-sm mt-1">Auto-refreshes every 10 seconds</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((order) => renderOrderCard(order, 'served'))}
            </div>
          )}
        </div>

      </div>

      {selectedOrder && (
        <PaymentModal
          total={selectedOrder.total_amount}
          currencySymbol={currencySymbol}
          tableName={tableName(selectedOrder)}
          existingOrderId={selectedOrder.id}
          restaurantId={restaurant?.id}
          sumupEnabled={restaurant?.sumup_enabled ?? false}
          triposEnabled={restaurant?.tripos_enabled ?? false}
          manualCardEnabled={restaurant?.manual_card_enabled ?? false}
          onClose={() => setSelectedOrder(null)}
          onComplete={(method) => {
            setCompletedReceipt({ order: selectedOrder!, method })
            setSelectedOrder(null)
            ledService.paymentSuccess()
          }}
        />
      )}
    </div>
  )
}
