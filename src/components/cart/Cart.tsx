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
      {/* h-full fills the flex parent without overflowing */}
      <div className="w-96 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-hidden">

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

        {/* Items — scrollable */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <span className="text-4xl mb-2">🛒</span>
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

        {/* Footer — always visible */}
        <div className="flex-shrink-0 border-t border-gray-700 p-4 space-y-2 bg-gray-800">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal</span>
            <span>{currencySymbol}{subtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>VAT (20%)</span>
            <span>{currencySymbol}{vat().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-white border-t border-gray-600 pt-2">
            <span>Total</span>
            <span className="text-orange-400">{currencySymbol}{total().toFixed(2)}</span>
          </div>
          <button
            onClick={() => setShowPayment(true)}
            disabled={items.length === 0}
            className={`w-full py-3 rounded-xl text-lg font-bold transition-all ${
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
