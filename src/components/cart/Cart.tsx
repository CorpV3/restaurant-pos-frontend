import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import PaymentModal from '../payment/PaymentModal'
import { fetchTables, type Table } from '../../services/tableService'

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, vat, total } =
    useCartStore()
  const { restaurant } = useAuthStore()
  const [showPayment, setShowPayment] = useState(false)
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [showTablePicker, setShowTablePicker] = useState(false)

  useEffect(() => {
    if (restaurant?.id) {
      fetchTables(restaurant.id)
        .then(setTables)
        .catch(() => setTables([]))
    }
  }, [restaurant?.id])

  const currencySymbol = restaurant?.currency_symbol || '£'

  return (
    <>
      <div className="w-72 xl:w-80 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col" style={{ height: '100%' }}>

        {/* Fixed header: title + table selector */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-white">
              Order{' '}
              {items.length > 0 && (
                <span className="text-xs text-orange-400 font-normal">
                  ({items.reduce((s, i) => s + i.quantity, 0)} items)
                </span>
              )}
            </h2>
            {items.length > 0 && (
              <button onClick={clearCart} className="text-red-400 hover:text-red-300 text-xs">
                Clear
              </button>
            )}
          </div>

          {/* Table selector */}
          {tables.length > 0 && (
            <div>
              <button
                onClick={() => setShowTablePicker((v) => !v)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                  selectedTable
                    ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-xs uppercase tracking-wide text-gray-500 block leading-none mb-0.5">Table</span>
                <span className="font-medium text-xs">
                  {selectedTable ? `Table ${selectedTable.table_number}` : 'Tap to select table'}
                </span>
              </button>

              {showTablePicker && (
                <div className="mt-1 p-1.5 bg-gray-700 rounded-lg border border-gray-600">
                  <div className="grid grid-cols-5 gap-1 mb-1">
                    {tables
                      .sort((a, b) => a.table_number - b.table_number)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTable(t); setShowTablePicker(false) }}
                          className={`py-1.5 rounded text-xs font-bold transition-colors ${
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
                    className="w-full py-1 rounded text-xs bg-gray-600 text-gray-300 hover:bg-gray-500"
                  >
                    Takeaway / Counter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable middle: items list + totals summary */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Items */}
          <div className="p-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <span className="text-3xl mb-1">🛒</span>
                <p className="text-xs">No items yet</p>
                <p className="text-xs">Tap menu items to add</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.menuItem.id} className="bg-gray-700 rounded-lg px-2.5 py-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">
                          {item.menuItem.icon} {item.menuItem.name}
                        </p>
                        <p className="text-orange-400 text-xs">
                          {currencySymbol}{(item.menuItem.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.menuItem.id, item.quantity - 1)}
                          className="w-6 h-6 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500 text-xs"
                        >-</button>
                        <span className="text-white w-5 text-center text-xs">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.menuItem.id, item.quantity + 1)}
                          className="w-6 h-6 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500 text-xs"
                        >+</button>
                        <button
                          onClick={() => removeItem(item.menuItem.id)}
                          className="w-6 h-6 rounded bg-red-600/30 text-red-400 flex items-center justify-center hover:bg-red-600/50 ml-0.5 text-xs"
                        >×</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals — inside scroll area, below items */}
          {items.length > 0 && (
            <div className="px-3 pt-1.5 pb-2 border-t border-gray-700 space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Subtotal</span>
                <span>{currencySymbol}{subtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT (20%)</span>
                <span>{currencySymbol}{vat().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-gray-600 pt-1.5">
                <span>Total</span>
                <span className="text-orange-400">{currencySymbol}{total().toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Pay button — pinned at bottom, always visible */}
        <div className="flex-shrink-0 px-3 py-2 border-t border-gray-700 bg-gray-800">
          <button
            onClick={() => setShowPayment(true)}
            disabled={items.length === 0}
            className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
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
          onComplete={(_method) => {
            clearCart()
            setSelectedTable(null)
            setShowPayment(false)
          }}
        />
      )}
    </>
  )
}
