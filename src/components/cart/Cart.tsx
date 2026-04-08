import { useState, useEffect } from 'react'
import { ShoppingCart, Tag } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { usePrinterStore } from '../../stores/printerStore'
import { thermalPrinter } from '../../services/thermalPrinter'
import { appLog } from '../../services/appLogger'
import { refundOrder, type DeliveryDetails } from '../../services/orderService'
import PaymentModal from '../payment/PaymentModal'
import DeliveryModal from './DeliveryModal'
import { fetchTables, type Table } from '../../services/tableService'

interface ReceiptSnapshot {
  orderId: string
  items: { name: string; qty: number; price: number }[]
  subtotalAmt: number
  vatAmt: number
  vatRate: number
  vatEnabled: boolean
  discountAmt: number
  discountReason: string
  totalAmt: number
  tableName: string
  method: 'cash' | 'card'
  cashReceived?: number
  change?: number
  date: string
}

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, vat, total, discountAmount, discountReason, setDiscount, clearDiscount, vatEnabled, vatRate, setVat } =
    useCartStore()
  const { restaurant } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()
  const [showPayment, setShowPayment] = useState(false)
  const [orderType, setOrderType] = useState<'dine-in' | 'delivery'>('dine-in')
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails | null>(null)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptSnapshot | null>(null)
  const [printing, setPrinting] = useState(false)
  const [printingLabels, setPrintingLabels] = useState(false)
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed')
  const [discountReasonInput, setDiscountReasonInput] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card'>('cash')
  const [refundReason, setRefundReason] = useState('')
  const [refunding, setRefunding] = useState(false)

  // Sync VAT settings from restaurant whenever restaurant data changes
  useEffect(() => {
    if (restaurant) {
      const enabled = restaurant.vat_enabled ?? true
      const rate = restaurant.vat_rate ?? 20.0
      setVat(enabled, rate)
    }
  }, [restaurant?.id, restaurant?.vat_enabled, restaurant?.vat_rate])

  useEffect(() => {
    if (restaurant?.id) {
      fetchTables(restaurant.id)
        .then(setTables)
        .catch(() => setTables([]))
    }
  }, [restaurant?.id])

  const currencySymbol = restaurant?.currency_symbol || '£'

  const vatLabel = vatEnabled
    ? `VAT (${(vatRate * 100).toFixed(0)}%)`
    : 'VAT (N/A)'

  const handlePrint = async (receipt: ReceiptSnapshot) => {
    setPrinting(true)
    try {
      await thermalPrinter.printReceipt({
        restaurantName: restaurant?.name ?? 'Restaurant',
        orderRef: receipt.orderId.slice(0, 8).toUpperCase(),
        tableName: receipt.tableName,
        date: receipt.date,
        items: receipt.items,
        subtotal: receipt.subtotalAmt,
        tax: receipt.vatAmt,
        discount: receipt.discountAmt > 0 ? receipt.discountAmt : undefined,
        discountReason: receipt.discountReason || undefined,
        total: receipt.totalAmt,
        paymentMethod: receipt.method,
        cashReceived: receipt.cashReceived,
        change: receipt.change,
        currencySymbol,
      }, paperWidth, printerType, savedAddress, printDensity)
    } catch (e: any) {
      appLog.error(`Cart print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Print failed — check printer connection')
    }
    setPrinting(false)
  }

  const handlePrintLabels = async (receipt: ReceiptSnapshot) => {
    setPrintingLabels(true)
    try {
      await thermalPrinter.printLabels(
        receipt.items.map((i) => ({ name: i.name, qty: i.qty })),
        receipt.tableName,
        receipt.orderId.slice(0, 8).toUpperCase(),
        restaurant?.name ?? 'Restaurant',
        32, // 58mm label width
        printerType, savedAddress, printDensity,
      )
      toast.success('Labels printed')
    } catch (e: any) {
      appLog.error(`Label print failed: ${e?.message ?? e}`)
      toast.error(e?.message ?? 'Label print failed')
    }
    setPrintingLabels(false)
  }

  const applyDiscount = () => {
    const val = parseFloat(discountInput)
    if (isNaN(val) || val <= 0) { toast.error('Enter a valid discount value'); return }
    const baseTotal = subtotal() + vat()
    const amount = discountType === 'percent' ? baseTotal * (val / 100) : val
    if (amount >= baseTotal) { toast.error('Discount cannot exceed the total'); return }
    setDiscount(parseFloat(amount.toFixed(2)), discountReasonInput.trim())
    setShowDiscountModal(false)
    setDiscountInput('')
    setDiscountReasonInput('')
    toast.success(`Offer applied: -${currencySymbol}${amount.toFixed(2)}`)
  }

  const handleRefund = async () => {
    if (!completedReceipt) return
    const amt = parseFloat(refundAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid refund amount'); return }
    if (amt > completedReceipt.totalAmt) { toast.error('Refund cannot exceed total paid'); return }
    setRefunding(true)
    appLog.info(`Refund start: orderId=${completedReceipt.orderId} method=${refundMethod} amount=${amt}`)
    try {
      await refundOrder(completedReceipt.orderId, amt, refundMethod, refundReason)
      appLog.info(`Refund success: orderId=${completedReceipt.orderId} amount=${amt} method=${refundMethod}`)
      toast.success(`Refund of ${currencySymbol}${amt.toFixed(2)} processed (${refundMethod})`)
      setShowRefund(false)
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'Refund failed'
      appLog.error(`Refund failed: method=${refundMethod} amount=${amt} error=${msg}`)
      toast.error(msg)
    }
    setRefunding(false)
  }

  if (completedReceipt) {
    const r = completedReceipt
    return (
      <div className="w-72 md:w-96 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-gray-700 rounded-2xl p-5 w-full border border-green-700 shadow-xl">
            <div className="text-center mb-4">
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center mx-auto mb-1">
                <span className="text-white font-bold text-xl">OK</span>
              </div>
              <h2 className="text-white text-lg font-bold">Payment Collected</h2>
              <p className="text-gray-400 text-sm">{r.tableName} · {r.date}</p>
            </div>
            <div className="border-t border-gray-600 pt-3 mb-3 space-y-1">
              {r.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-300">{item.qty}× {item.name}</span>
                  <span className="text-gray-400">{currencySymbol}{(item.qty * item.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-600 pt-3 mb-4 space-y-1">
              <div className="flex justify-between text-sm text-gray-400">
                <span>Subtotal</span><span>{currencySymbol}{r.subtotalAmt.toFixed(2)}</span>
              </div>
              {r.vatEnabled && (
                <div className="flex justify-between text-sm text-gray-400">
                  <span>VAT ({(r.vatRate * 100).toFixed(0)}%)</span>
                  <span>{currencySymbol}{r.vatAmt.toFixed(2)}</span>
                </div>
              )}
              {r.discountAmt > 0 && (
                <div className="flex justify-between text-sm text-green-400">
                  <span>Offer{r.discountReason ? ` (${r.discountReason})` : ''}</span>
                  <span>-{currencySymbol}{r.discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center mt-1">
                <span className="text-white font-semibold">Total</span>
                <span className="text-orange-400 text-xl font-bold">{currencySymbol}{r.totalAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Payment</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  r.method === 'cash' ? 'bg-green-900/60 text-green-400' : 'bg-blue-900/60 text-blue-400'
                }`}>{r.method.toUpperCase()}</span>
              </div>
              {r.method === 'cash' && r.cashReceived !== undefined && (
                <>
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Cash</span><span>{currencySymbol}{r.cashReceived.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Change</span><span>{currencySymbol}{(r.change ?? 0).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Refund section */}
            {showRefund ? (
              <div className="bg-gray-600 rounded-xl p-3 mb-3 space-y-2">
                <p className="text-white text-sm font-semibold">Process Refund</p>
                <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder={`Amount (max ${currencySymbol}${r.totalAmt.toFixed(2)})`} step="0.01" />
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'card'] as const).map(m => (
                    <button key={m} onClick={() => setRefundMethod(m)}
                      className={`py-1.5 rounded-lg text-sm font-medium ${refundMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                      {m === 'cash' ? '💵 Cash' : '💳 Card'}
                    </button>
                  ))}
                </div>
                <input value={refundReason} onChange={e => setRefundReason(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-500 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Reason (optional)" />
                <div className="flex gap-2">
                  <button onClick={() => setShowRefund(false)} className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>
                  <button onClick={handleRefund} disabled={refunding}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                    {refunding ? 'Processing...' : 'Confirm Refund'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setShowRefund(true); setRefundAmount(r.totalAmt.toFixed(2)) }}
                className="w-full py-2 mb-2 bg-gray-700 hover:bg-gray-600 text-red-400 text-sm rounded-xl border border-red-900/40">
                ↩ Refund
              </button>
            )}

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handlePrint(r)}
                disabled={printing}
                className="py-2.5 bg-gray-600 hover:bg-gray-500 text-gray-200 text-sm rounded-xl font-medium disabled:opacity-50"
              >
                {printing ? '...' : 'Receipt'}
              </button>
              <button
                onClick={() => handlePrintLabels(r)}
                disabled={printingLabels}
                className="py-2.5 bg-gray-600 hover:bg-gray-500 text-yellow-300 text-sm rounded-xl font-medium disabled:opacity-50"
              >
                {printingLabels ? '...' : 'Labels'}
              </button>
              <button
                onClick={() => { setCompletedReceipt(null); setShowRefund(false) }}
                className="py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-xl font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="w-72 md:w-96 flex-shrink-0 bg-gray-800 border-l border-gray-700">

        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">
              Current Order{' '}
              {items.length > 0 && (
                <span className="text-sm text-orange-400 font-normal">
                  ({items.reduce((s, i) => s + i.quantity, 0)} items)
                </span>
              )}
            </h2>
            {items.length > 0 && (
              <button onClick={clearCart} className="text-red-400 hover:text-red-300 text-sm">
                Clear
              </button>
            )}
          </div>

          {/* Order type toggle */}
          <div className="flex gap-1 bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => { setOrderType('dine-in'); setDeliveryDetails(null) }}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                orderType === 'dine-in' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🍽 Dine-in
            </button>
            <button
              onClick={() => setOrderType('delivery')}
              className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                orderType === 'delivery' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🛵 Delivery
            </button>
          </div>

          {/* Table selector — only for dine-in */}
          {orderType === 'dine-in' && tables.length > 0 && (
            <div>
              <button
                onClick={() => setShowTablePicker((v) => !v)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                  selectedTable
                    ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-xs uppercase tracking-wide text-gray-500 block">Table</span>
                <span className="font-medium">
                  {selectedTable ? `Table ${selectedTable.table_number}` : 'Tap to select table'}
                </span>
              </button>

              {showTablePicker && (
                <div className="mt-2 p-2 bg-gray-700 rounded-lg border border-gray-600">
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {tables
                      .sort((a, b) => a.table_number - b.table_number)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTable(t); setShowTablePicker(false) }}
                          className={`py-2 rounded text-xs font-bold transition-colors ${
                            selectedTable?.id === t.id
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}
                        >
                          {t.table_number}
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => { setSelectedTable(null); setShowTablePicker(false) }}
                    className="w-full py-1.5 rounded text-xs bg-gray-600 text-gray-300 hover:bg-gray-500"
                  >
                    Takeaway / Counter
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Delivery details summary */}
          {orderType === 'delivery' && (
            <button
              onClick={() => setShowDeliveryModal(true)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                deliveryDetails
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                  : 'bg-gray-700 border-orange-600/50 text-orange-400 hover:border-orange-500 border-dashed'
              }`}
            >
              <span className="text-xs uppercase tracking-wide text-gray-500 block">Customer</span>
              {deliveryDetails ? (
                <>
                  <span className="font-medium text-white">{deliveryDetails.customerName}</span>
                  <span className="text-gray-400 text-xs block truncate">{deliveryDetails.deliveryAddress}</span>
                </>
              ) : (
                <span className="font-medium">Tap to enter customer details →</span>
              )}
            </button>
          )}
        </div>

        {/* Items — fixed max height so totals+pay always visible below */}
        <div className="max-h-[22vh] overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <ShoppingCart size={40} className="mb-2 text-gray-600" />
              <p>No items yet</p>
              <p className="text-sm">Tap menu items to add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const key = item.cartKey ?? item.menuItem.id
                return (
                  <div key={key} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {item.menuItem.is_deal && (
                            <span className="text-orange-400 text-xs mr-1">DEAL</span>
                          )}
                          {item.menuItem.icon} {item.menuItem.name}
                        </p>
                        {/* Deal selections — show chosen items indented */}
                        {item.is_deal_item && item.deal_selections && item.deal_selections.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.deal_selections.map((sel, si) => {
                              const chosen = sel.item_name
                                ? sel.item_name
                                : sel.item_names?.join(', ') ?? ''
                              return (
                                <p key={si} className="text-gray-400 text-xs pl-2 border-l border-orange-500/40">
                                  {sel.label}: {chosen}
                                </p>
                              )
                            })}
                          </div>
                        )}
                        <p className="text-orange-400 text-sm">
                          {currencySymbol}{(item.menuItem.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(key, item.quantity - 1)}
                          className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                        >-</button>
                        <span className="text-white w-5 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(key, item.quantity + 1)}
                          className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                        >+</button>
                        <button
                          onClick={() => removeItem(key)}
                          className="w-7 h-7 rounded bg-red-600/30 text-red-400 flex items-center justify-center hover:bg-red-600/50 ml-1"
                        >×</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="flex-shrink-0 border-t border-gray-700 px-4 pt-3 pb-2 space-y-1 bg-gray-800">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal</span>
            <span>{currencySymbol}{subtotal().toFixed(2)}</span>
          </div>
          {vatEnabled ? (
            <div className="flex justify-between text-sm text-gray-400">
              <span>{vatLabel}</span>
              <span>{currencySymbol}{vat().toFixed(2)}</span>
            </div>
          ) : null}
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-400">
              <span className="flex items-center gap-1">
                <Tag size={12} /> Offer{discountReason ? ` (${discountReason})` : ''}
                <button onClick={clearDiscount} className="text-gray-500 hover:text-red-400 ml-1 text-xs">✕</button>
              </span>
              <span>-{currencySymbol}{discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-white border-t border-gray-600 pt-2">
            <span>Total</span>
            <span className="text-orange-400">{currencySymbol}{total().toFixed(2)}</span>
          </div>
        </div>

        {/* Offer + Pay buttons */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-gray-800 space-y-2">
          {items.length > 0 && (
            <button
              onClick={() => setShowDiscountModal(true)}
              className="w-full py-2 rounded-xl text-sm font-medium border border-green-700/50 text-green-400 hover:bg-green-900/30 flex items-center justify-center gap-2"
            >
              <Tag size={14} /> {discountAmount > 0 ? `Offer: -${currencySymbol}${discountAmount.toFixed(2)}` : 'Apply Offer / Discount'}
            </button>
          )}
          <button
            onClick={() => {
              if (orderType === 'delivery' && !deliveryDetails) {
                setShowDeliveryModal(true)
              } else {
                setShowPayment(true)
              }
            }}
            disabled={items.length === 0}
            className={`w-full py-3 rounded-xl text-base font-bold transition-all ${
              items.length > 0
                ? 'bg-orange-500 hover:bg-orange-600 text-white active:scale-[0.98]'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {items.length > 0 ? `Pay ${currencySymbol}${total().toFixed(2)}` : 'Add items to order'}
          </button>
        </div>

        {/* Discount Modal */}
        {showDiscountModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Apply Offer</h3>
                <button onClick={() => setShowDiscountModal(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['fixed', 'percent'] as const).map(t => (
                  <button key={t} onClick={() => setDiscountType(t)}
                    className={`py-2 rounded-xl text-sm font-medium ${discountType === t ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    {t === 'fixed' ? `${currencySymbol} Fixed Amount` : '% Percentage'}
                  </button>
                ))}
              </div>
              <input type="number" value={discountInput} onChange={e => setDiscountInput(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-green-500"
                placeholder={discountType === 'fixed' ? '0.00' : '0-100'} step="0.01" min="0" autoFocus />
              <input value={discountReasonInput} onChange={e => setDiscountReasonInput(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder="Reason (e.g. Regular customer, loyalty)" />
              <div className="flex gap-3">
                <button onClick={() => setShowDiscountModal(false)} className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600">Cancel</button>
                <button onClick={applyDiscount} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold">Apply</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showDeliveryModal && (
        <DeliveryModal
          onConfirm={(details) => { setDeliveryDetails(details); setShowDeliveryModal(false); setShowPayment(true) }}
          onCancel={() => setShowDeliveryModal(false)}
        />
      )}

      {showPayment && restaurant && (
        <PaymentModal
          total={total()}
          currencySymbol={currencySymbol}
          cartItems={items}
          restaurantId={restaurant.id}
          tableId={orderType === 'delivery' ? null : (selectedTable?.id ?? null)}
          tableName={
            orderType === 'delivery'
              ? (deliveryDetails ? `${deliveryDetails.customerName} (Delivery)` : 'Delivery')
              : (selectedTable ? `Table ${selectedTable.table_number}` : 'Takeaway')
          }
          discountAmount={discountAmount}
          discountReason={discountReason}
          delivery={orderType === 'delivery' ? deliveryDetails ?? undefined : undefined}
          onClose={() => setShowPayment(false)}
          onComplete={(method, orderId, cashReceived) => {
            const tName = orderType === 'delivery'
              ? (deliveryDetails ? `${deliveryDetails.customerName} (Delivery)` : 'Delivery')
              : (selectedTable ? `Table ${selectedTable.table_number}` : 'Takeaway')
            const snap: ReceiptSnapshot = {
              orderId,
              items: items.map((i) => ({ name: i.menuItem.name, qty: i.quantity, price: i.menuItem.price })),
              subtotalAmt: subtotal(),
              vatAmt: vat(),
              vatRate,
              vatEnabled,
              discountAmt: discountAmount,
              discountReason,
              totalAmt: total(),
              tableName: tName,
              method,
              cashReceived,
              change: cashReceived !== undefined ? cashReceived - total() : undefined,
              date: format(new Date(), 'HH:mm dd/MM/yyyy'),
            }
            clearCart()
            setSelectedTable(null)
            setDeliveryDetails(null)
            setOrderType('dine-in')
            setShowPayment(false)
            setCompletedReceipt(snap)
          }}
        />
      )}
    </>
  )
}
