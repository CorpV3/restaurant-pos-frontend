import { useState } from 'react'
import toast from 'react-hot-toast'
import type { CartItem } from '../../types'
import { createOrder, completeOrder } from '../../services/orderService'

interface PaymentModalProps {
  total: number
  currencySymbol: string
  tableName: string
  onClose: () => void
  onComplete: (method: 'cash' | 'card') => void
  // New order from cart:
  cartItems?: CartItem[]
  restaurantId?: string
  tableId?: string | null
  // Existing order (from pending receipts):
  existingOrderId?: string
}

export default function PaymentModal({
  total,
  currencySymbol,
  tableName,
  onClose,
  onComplete,
  cartItems,
  restaurantId,
  tableId,
  existingOrderId,
}: PaymentModalProps) {
  const [method, setMethod] = useState<'cash' | 'card' | null>(null)
  const [processing, setProcessing] = useState(false)
  const [cashReceived, setCashReceived] = useState('')

  const change = cashReceived ? parseFloat(cashReceived) - total : 0

  const handlePay = async () => {
    if (!method) return
    setProcessing(true)
    try {
      let orderId = existingOrderId
      if (!orderId) {
        const order = await createOrder(cartItems!, restaurantId!, tableId ?? null)
        orderId = order.id
      }
      await completeOrder(orderId, method)
      toast.success(`Payment complete — ${tableName}`)
      onComplete(method)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Payment failed'
      toast.error(msg)
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-2xl p-6 w-[420px] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Payment</h2>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-gray-400 hover:text-white text-2xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="text-center mb-2">
          <span className="text-xs bg-gray-700 text-gray-400 px-3 py-1 rounded-full">
            {tableName}
          </span>
        </div>

        <div className="text-center mb-6">
          <p className="text-gray-400 text-sm">Amount Due</p>
          <p className="text-4xl font-bold text-orange-400">
            {currencySymbol}{total.toFixed(2)}
          </p>
        </div>

        {!method ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMethod('cash')}
              className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-green-500 rounded-xl p-6 transition-all"
            >
              <span className="text-4xl">💵</span>
              <span className="text-white font-medium">Cash</span>
            </button>
            <button
              onClick={() => setMethod('card')}
              className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-500 rounded-xl p-6 transition-all"
            >
              <span className="text-4xl">💳</span>
              <span className="text-white font-medium">Card</span>
            </button>
          </div>
        ) : method === 'cash' ? (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cash Received</label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-orange-500"
                placeholder="0.00"
                step="0.01"
                autoFocus
                disabled={processing}
              />
            </div>
            {cashReceived && change >= 0 && (
              <div className="text-center bg-gray-700 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Change</p>
                <p className="text-2xl font-bold text-green-400">
                  {currencySymbol}{change.toFixed(2)}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setMethod(null)}
                disabled={processing}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handlePay}
                disabled={processing || !cashReceived || parseFloat(cashReceived) < total}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {processing ? 'Saving...' : 'Complete'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center bg-gray-700 rounded-xl p-6">
              <span className="text-5xl block mb-3">💳</span>
              <p className="text-white font-medium">
                {processing ? 'Saving order...' : 'Tap, Insert, or Swipe Card'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {processing ? 'Please wait' : 'Waiting for card reader'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setMethod(null)}
                disabled={processing}
                className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handlePay}
                disabled={processing}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {processing ? 'Saving...' : 'Card Paid'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
