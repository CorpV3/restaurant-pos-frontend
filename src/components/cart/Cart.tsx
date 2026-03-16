import { useState, useEffect } from 'react'
import { ShoppingCart } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { usePrinterStore } from '../../stores/printerStore'
import { thermalPrinter } from '../../services/thermalPrinter'
import PaymentModal from '../payment/PaymentModal'
import { fetchTables, type Table } from '../../services/tableService'

interface ReceiptSnapshot {
  orderId: string
  items: { name: string; qty: number; price: number }[]
  subtotalAmt: number
  vatAmt: number
  totalAmt: number
  tableName: string
  method: 'cash' | 'card'
  cashReceived?: number
  change?: number
  date: string
}

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, vat, total } =
    useCartStore()
  const { restaurant } = useAuthStore()
  const { paperWidth } = usePrinterStore()
  const [showPayment, setShowPayment] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [completedReceipt, setCompletedReceipt] = useState<ReceiptSnapshot | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (restaurant?.id) {
      fetchTables(restaurant.id)
        .then(setTables)
        .catch(() => setTables([]))
    }
  }, [restaurant?.id])

  const currencySymbol = restaurant?.currency_symbol || '£'

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
        total: receipt.totalAmt,
        paymentMethod: receipt.method,
        cashReceived: receipt.cashReceived,
        change: receipt.change,
        currencySymbol,
      }, paperWidth)
    } catch {
      toast.error('Print failed — check printer connection')
    }
    setPrinting(false)
  }

  if (completedReceipt) {
    const r = completedReceipt
    return (
      <div className="w-72 md:w-96 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-gray-700 rounded-2xl p-5 w-full border border-green-700 shadow-xl">
            <div className="text-center mb-4">
              <div className="text-4xl mb-1">✅</div>
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
              <div className="flex justify-between text-sm text-gray-400">
                <span>VAT (20%)</span><span>{currencySymbol}{r.vatAmt.toFixed(2)}</span>
              </div>
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
            <div className="flex gap-3">
              <button
                onClick={() => handlePrint(r)}
                disabled={printing}
                className="flex-1 py-2.5 bg-gray-600 hover:bg-gray-500 text-gray-200 text-sm rounded-xl font-medium disabled:opacity-50"
              >
                {printing ? 'Printing...' : '🖨 Print'}
              </button>
              <button
                onClick={() => setCompletedReceipt(null)}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-xl font-bold"
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

          {/* Table selector */}
          {tables.length > 0 && (
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
        </div>

        {/* Items — fixed max height so totals+pay always visible below */}
        <div className="max-h-[45vh] overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <ShoppingCart size={40} className="mb-2 text-gray-600" />
              <p>No items yet</p>
              <p className="text-sm">Tap menu items to add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.menuItem.id} className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {item.menuItem.icon} {item.menuItem.name}
                      </p>
                      <p className="text-orange-400 text-sm">
                        {currencySymbol}{(item.menuItem.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, item.quantity - 1)}
                        className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                      >-</button>
                      <span className="text-white w-5 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, item.quantity + 1)}
                        className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                      >+</button>
                      <button
                        onClick={() => removeItem(item.menuItem.id)}
                        className="w-7 h-7 rounded bg-red-600/30 text-red-400 flex items-center justify-center hover:bg-red-600/50 ml-1"
                      >×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="flex-shrink-0 border-t border-gray-700 px-4 pt-3 pb-2 space-y-1 bg-gray-800">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal</span>
            <span>{currencySymbol}{subtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>VAT (20%)</span>
            <span>{currencySymbol}{vat().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-white border-t border-gray-600 pt-2">
            <span>Total</span>
            <span className="text-orange-400">{currencySymbol}{total().toFixed(2)}</span>
          </div>
        </div>

        {/* Pay button */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-gray-800">
          <button
            onClick={() => setShowPayment(true)}
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
      </div>

      {showPayment && restaurant && (
        <PaymentModal
          total={total()}
          currencySymbol={currencySymbol}
          cartItems={items}
          restaurantId={restaurant.id}
          tableId={selectedTable?.id ?? null}
          tableName={selectedTable ? `Table ${selectedTable.table_number}` : 'Takeaway'}
          onClose={() => setShowPayment(false)}
          onComplete={(method, orderId, cashReceived) => {
            const tName = selectedTable ? `Table ${selectedTable.table_number}` : 'Takeaway'
            const snap: ReceiptSnapshot = {
              orderId,
              items: items.map((i) => ({ name: i.menuItem.name, qty: i.quantity, price: i.menuItem.price })),
              subtotalAmt: subtotal(),
              vatAmt: vat(),
              totalAmt: total(),
              tableName: tName,
              method,
              cashReceived,
              change: cashReceived !== undefined ? cashReceived - total() : undefined,
              date: format(new Date(), 'HH:mm dd/MM/yyyy'),
            }
            clearCart()
            setSelectedTable(null)
            setShowPayment(false)
            setCompletedReceipt(snap)
          }}
        />
      )}
    </>
  )
}
