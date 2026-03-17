import { useState } from 'react'
import toast from 'react-hot-toast'
import type { CartItem } from '../../types'
import { createOrder, completeOrder } from '../../services/orderService'
import { api } from '../../services/api'

interface PaymentModalProps {
  total: number
  currencySymbol: string
  tableName: string
  onClose: () => void
  onComplete: (method: 'cash' | 'card', orderId: string, cashReceived?: number) => void
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
  const [terminalStatus, setTerminalStatus] = useState<'idle' | 'waiting' | 'approved' | 'declined'>('idle')
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
      const cr = cashReceived ? parseFloat(cashReceived) : undefined
      onComplete(method, orderId, cr)
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

  const handleCardTerminal = async () => {
    setProcessing(true)
    setTerminalStatus('waiting')
    try {
      let orderId = existingOrderId
      if (!orderId) {
        const order = await createOrder(cartItems!, restaurantId!, tableId ?? null)
        orderId = order.id
      }
      // Charge the physical terminal — blocks until card is presented (up to 90s)
      const res = await api.post(
        '/api/v1/payments/card-terminal',
        { order_id: orderId, amount: total },
        { timeout: 120000 }
      )
      if (res.data.approved) {
        setTerminalStatus('approved')
        await completeOrder(orderId, 'card')
        toast.success(`Card payment approved — ${tableName}`)
        onComplete('card', orderId)
      } else {
        setTerminalStatus('declined')
        toast.error(`Card declined: ${res.data.message}`)
        setProcessing(false)
      }
    } catch (err: unknown) {
      setTerminalStatus('declined')
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Terminal error'
      toast.error(msg)
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        {/* Header — always visible */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white">Payment</h2>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-gray-400 hover:text-white text-2xl disabled:opacity-50 leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <div className="text-center">
            <span className="text-xs bg-gray-700 text-gray-400 px-3 py-1 rounded-full">
              {tableName}
            </span>
          </div>

          <div className="text-center py-2">
            <p className="text-gray-400 text-sm">Amount Due</p>
            <p className="text-4xl font-bold text-orange-400">
              {currencySymbol}{total.toFixed(2)}
            </p>
          </div>

          {!method ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMethod('cash')}
                className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-green-500 rounded-xl p-4 transition-all"
              >
                <span className="text-3xl">💵</span>
                <span className="text-white font-medium">Cash</span>
              </button>
              <button
                onClick={() => setMethod('card')}
                className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-500 rounded-xl p-4 transition-all"
              >
                <span className="text-3xl">💳</span>
                <span className="text-white font-medium">Card</span>
              </button>
            </div>
          ) : method === 'cash' ? (
            <div className="space-y-3">
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
              <div className="flex gap-3 pt-1">
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
            <div className="space-y-3">
              <div className="text-center bg-gray-700 rounded-xl p-5">
                {terminalStatus === 'waiting' ? (
                  <>
                    <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-white font-medium text-lg">Waiting for card...</p>
                    <p className="text-gray-400 text-sm mt-1">Ask customer to tap, insert, or swipe</p>
                  </>
                ) : terminalStatus === 'approved' ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-xl">OK</span>
                    </div>
                    <p className="text-green-400 font-bold text-lg">Approved</p>
                  </>
                ) : terminalStatus === 'declined' ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-xl">X</span>
                    </div>
                    <p className="text-red-400 font-bold text-lg">Declined</p>
                    <p className="text-gray-400 text-sm mt-1">Please try again or use cash</p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-lg">CARD</span>
                    </div>
                    <p className="text-white font-medium">Ready to charge terminal</p>
                    <p className="text-gray-400 text-sm mt-1">
                      {currencySymbol}{total.toFixed(2)} will be sent to card reader
                    </p>
                  </>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setMethod(null); setTerminalStatus('idle'); setProcessing(false) }}
                  disabled={terminalStatus === 'waiting'}
                  className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                >
                  Back
                </button>
                {(terminalStatus === 'idle' || terminalStatus === 'declined') && (
                  <button
                    onClick={() => { setTerminalStatus('idle'); setProcessing(false); handleCardTerminal() }}
                    disabled={processing}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {terminalStatus === 'declined' ? 'Retry' : 'Charge Terminal'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
