import { useState } from 'react'
import { useCartStore } from '../../stores/cartStore'
import PaymentModal from '../payment/PaymentModal'

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, vat, total } =
    useCartStore()
  const [showPayment, setShowPayment] = useState(false)

  return (
    <>
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
        {/* Cart Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Current Order</h2>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Clear
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <span className="text-4xl mb-2">🛒</span>
              <p>No items yet</p>
              <p className="text-sm">Tap menu items to add</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.menuItem.id}
                  className="bg-gray-700 rounded-lg p-3 cart-slide-in"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">
                        {item.menuItem.icon} {item.menuItem.name}
                      </p>
                      <p className="text-orange-400 text-sm">
                        £{(item.menuItem.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.menuItem.id,
                            item.quantity - 1
                          )
                        }
                        className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                      >
                        -
                      </button>
                      <span className="text-white w-6 text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.menuItem.id,
                            item.quantity + 1
                          )
                        }
                        className="w-7 h-7 rounded bg-gray-600 text-white flex items-center justify-center hover:bg-gray-500"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeItem(item.menuItem.id)}
                        className="w-7 h-7 rounded bg-red-600/30 text-red-400 flex items-center justify-center hover:bg-red-600/50 ml-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t border-gray-700 p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal</span>
            <span>£{subtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>VAT (20%)</span>
            <span>£{vat().toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-white border-t border-gray-600 pt-2">
            <span>Total</span>
            <span className="text-orange-400">£{total().toFixed(2)}</span>
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
            Pay £{total().toFixed(2)}
          </button>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          total={total()}
          onClose={() => setShowPayment(false)}
          onComplete={() => {
            clearCart()
            setShowPayment(false)
          }}
        />
      )}
    </>
  )
}
