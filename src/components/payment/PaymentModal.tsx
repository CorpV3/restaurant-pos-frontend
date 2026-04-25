import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { CartItem } from '../../types'
import { createOrder, completeOrder, type DeliveryDetails } from '../../services/orderService'
import { api } from '../../services/api'
import { appLog } from '../../services/appLogger'
import { isSumUpAvailable, sumUpCheckout } from '../../services/sumupService'
import { thermalPrinter } from '../../services/thermalPrinter'
import { usePrinterStore } from '../../stores/printerStore'
import NumPad from '../ui/NumPad'

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
  discountAmount?: number
  discountReason?: string
  delivery?: DeliveryDetails
  // Existing order (from pending receipts):
  existingOrderId?: string
  // Gateway config from restaurant:
  sumupEnabled?: boolean
  triposEnabled?: boolean
  manualCardEnabled?: boolean
}

type CardFlow = 'sumup' | 'tripos' | 'manual'

export default function PaymentModal({
  total,
  currencySymbol,
  tableName,
  onClose,
  onComplete,
  cartItems,
  restaurantId,
  tableId,
  discountAmount = 0,
  discountReason = '',
  delivery,
  existingOrderId,
  sumupEnabled = false,
  triposEnabled = false,
  manualCardEnabled = false,
}: PaymentModalProps) {
  const { cashDrawerEnabled, printerType, savedAddress, drawerIp, drawerTcpPort } = usePrinterStore()

  const kickDrawer = () => {
    if (!cashDrawerEnabled) return
    thermalPrinter.openCashDrawer(printerType, savedAddress, drawerIp, drawerTcpPort)
      .then(() => appLog.info('Cash drawer opened after payment'))
      .catch((e) => appLog.warn(`Cash drawer: ${e?.message ?? e}`))
  }

  const [method, setMethod] = useState<'cash' | 'card' | null>(null)
  const [cardFlow, setCardFlow] = useState<CardFlow | null>(null)
  const [processing, setProcessing] = useState(false)
  const [terminalStatus, setTerminalStatus] = useState<'idle' | 'waiting' | 'approved' | 'declined'>('idle')
  const [cashReceived, setCashReceived] = useState('')

  // SumUp checkout state
  const [sumupUrl, setSumupUrl] = useState<string | null>(null)
  const [sumupStatus, setSumupStatus] = useState<'creating' | 'waiting' | 'paid' | 'failed'>('creating')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const change = cashReceived ? parseFloat(cashReceived) - total : 0

  // Determine which card flows are available
  const enabledCardFlows = [
    sumupEnabled && 'sumup',
    triposEnabled && 'tripos',
    manualCardEnabled && 'manual',
  ].filter(Boolean) as CardFlow[]
  const multipleCardFlows = enabledCardFlows.length > 1

  // Auto-select card flow if only one is enabled
  useEffect(() => {
    if (method === 'card' && !multipleCardFlows) {
      if (enabledCardFlows.length === 1) setCardFlow(enabledCardFlows[0])
    }
  }, [method, sumupEnabled, triposEnabled, manualCardEnabled])

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handlePay = async () => {
    if (!method) return
    setProcessing(true)
    try {
      let orderId = existingOrderId
      if (!orderId) {
        const order = await createOrder(cartItems!, restaurantId!, tableId ?? null, discountAmount, discountReason, delivery)
        orderId = order.id
      }
      await completeOrder(orderId, method)
      kickDrawer()
      toast.success(`Payment complete — ${tableName}`)
      const cr = cashReceived ? parseFloat(cashReceived) : undefined
      onComplete(method, orderId, cr)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'Payment failed'
      appLog.error(`Cash payment failed: ${msg}`)
      toast.error(msg)
      setProcessing(false)
    }
  }

  // ── SumUp flow ──────────────────────────────────────────────────────────────
  const handleSumupStart = async () => {
    setProcessing(true)
    setSumupStatus('creating')
    appLog.info(`SumUp: starting for table=${tableName} total=${total}`)
    try {
      let orderId = existingOrderId
      if (!orderId) {
        const order = await createOrder(cartItems!, restaurantId!, tableId ?? null, discountAmount, discountReason, delivery)
        orderId = order.id
      }
      // ── Native Tap to Pay (Android APK with SumUp SDK) ─────────────────────
      if (isSumUpAvailable()) {
        appLog.info(`SumUp: using native Tap to Pay SDK`)
        setSumupStatus('waiting')
        try {
          const result = await sumUpCheckout(total, 'GBP', `Table: ${tableName}`)
          if (result.approved) {
            setSumupStatus('paid')
            await completeOrder(orderId, 'card')
            kickDrawer()
            appLog.info(`SumUp native: approved tx=${result.transactionCode}`)
            toast.success(`Card payment approved — ${tableName}`)
            onComplete('card', orderId)
          } else {
            setSumupStatus('failed')
            toast.error('Payment declined')
            setProcessing(false)
          }
        } catch (err: unknown) {
          const msg = (err as { message?: string })?.message || 'Payment cancelled'
          appLog.warn(`SumUp native: ${msg}`)
          setSumupStatus('failed')
          toast.error(msg)
          setProcessing(false)
        }
        return
      }

      // ── Hosted Checkout (web / non-Android fallback) ────────────────────────
      const res = await api.post('/api/v1/payments/process', {
        order_id: orderId,
        amount: total,
        currency: 'GBP',
        method: 'card',
        gateway: 'sumup',
        tip_amount: 0,
      })

      const { transaction_id: checkoutId, receipt_url: checkoutUrl } = res.data
      appLog.info(`SumUp: checkout created id=${checkoutId} url=${checkoutUrl}`)
      setSumupUrl(checkoutUrl)
      setSumupStatus('waiting')

      // Poll for payment every 3 seconds, max 100 attempts (5 minutes)
      let pollAttempts = 0
      const MAX_POLL_ATTEMPTS = 100
      pollRef.current = setInterval(async () => {
        pollAttempts++
        try {
          const poll = await api.get(`/api/v1/payments/sumup/checkout/${checkoutId}/status`)
          if (poll.data.paid || poll.data.status === 'PAID') {
            clearInterval(pollRef.current!)
            setSumupStatus('paid')
            await completeOrder(orderId!, 'card')
            kickDrawer()
            appLog.info(`SumUp: payment confirmed for order ${orderId}`)
            toast.success(`Card payment received — ${tableName}`)
            onComplete('card', orderId!)
          } else if (poll.data.status === 'FAILED') {
            clearInterval(pollRef.current!)
            appLog.warn(`SumUp: payment FAILED for order ${orderId}`)
            setSumupStatus('failed')
            toast.error('Payment declined by card network')
            setProcessing(false)
          } else if (pollAttempts >= MAX_POLL_ATTEMPTS) {
            clearInterval(pollRef.current!)
            appLog.warn(`SumUp: poll timeout after ${pollAttempts} attempts`)
            setSumupStatus('failed')
            toast.error('Payment link expired — ask customer if card was charged')
            setProcessing(false)
          }
        } catch (e) {
          appLog.warn(`SumUp poll error: ${e}`)
        }
      }, 3000)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } }; message?: string })
          ?.response?.data?.detail ||
        (err as { message?: string })?.message ||
        'SumUp error'
      appLog.error(`SumUp failed: ${msg}`)
      toast.error(msg)
      setSumupStatus('failed')
      setProcessing(false)
    }
  }

  const cancelSumup = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setSumupUrl(null)
    setSumupStatus('creating')
    setCardFlow(null)
    setMethod(null)
    setProcessing(false)
  }

  // ── triPOS flow ─────────────────────────────────────────────────────────────
  const handleCardTerminal = async () => {
    setProcessing(true)
    setTerminalStatus('waiting')
    appLog.info(`triPOS: table=${tableName} total=${total}`)
    try {
      let orderId = existingOrderId
      if (!orderId) {
        const order = await createOrder(cartItems!, restaurantId!, tableId ?? null, discountAmount, discountReason, delivery)
        orderId = order.id
      }
      const res = await api.post(
        '/api/v1/payments/card-terminal',
        { restaurant_id: restaurantId, order_id: orderId, amount: total, lane_id: 9999 },
        { timeout: 120000 }
      )
      if (res.data.approved) {
        setTerminalStatus('approved')
        await completeOrder(orderId, 'card')
        kickDrawer()
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
      appLog.error(`triPOS error: ${msg}`)
      toast.error(msg)
      setProcessing(false)
    }
  }

  // QR code via Google Charts (no extra dependency)
  const qrUrl = sumupUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(sumupUrl)}`
    : null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white">Payment</h2>
          <button
            onClick={sumupStatus === 'waiting' ? cancelSumup : onClose}
            disabled={processing && sumupStatus !== 'waiting' && terminalStatus === 'waiting'}
            className="text-gray-400 hover:text-white text-2xl disabled:opacity-50 leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <div className="text-center">
            <span className="text-xs bg-gray-700 text-gray-400 px-3 py-1 rounded-full">{tableName}</span>
          </div>

          <div className="text-center py-2">
            <p className="text-gray-400 text-sm">Amount Due</p>
            <p className="text-4xl font-bold text-orange-400">
              {currencySymbol}{total.toFixed(2)}
            </p>
          </div>

          {/* Step 1: Cash or Card */}
          {!method && (
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
          )}

          {/* Step 2 (Cash): amount entry via NumPad */}
          {method === 'cash' && (
            <div className="space-y-3">
              <NumPad
                value={cashReceived}
                onChange={setCashReceived}
                currencySymbol={currencySymbol}
                quickAmounts={[
                  Math.ceil(total),
                  Math.ceil(total / 5) * 5,
                  Math.ceil(total / 10) * 10,
                  Math.ceil(total / 20) * 20,
                ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4)}
              />
              {cashReceived && change >= 0 && (
                <div className="text-center bg-gray-700 rounded-lg p-3">
                  <p className="text-gray-400 text-sm">Change</p>
                  <p className="text-2xl font-bold text-green-400">{currencySymbol}{change.toFixed(2)}</p>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setMethod(null)}
                  disabled={processing}
                  className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                >Back</button>
                <button
                  onClick={handlePay}
                  disabled={processing || !cashReceived || parseFloat(cashReceived) < total}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500"
                >{processing ? 'Saving...' : 'Complete'}</button>
              </div>
            </div>
          )}

          {/* Step 2 (Card): pick gateway if multiple enabled */}
          {method === 'card' && multipleCardFlows && !cardFlow && (
            <div className="space-y-3">
              <p className="text-gray-400 text-sm text-center">Choose payment method</p>
              <div className={`grid gap-3 ${enabledCardFlows.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {sumupEnabled && (
                  <button
                    onClick={() => setCardFlow('sumup')}
                    className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-400 rounded-xl p-4 transition-all"
                  >
                    <span className="text-2xl">📱</span>
                    <span className="text-white font-medium text-sm">SumUp</span>
                    <span className="text-gray-400 text-xs">QR / tap</span>
                  </button>
                )}
                {triposEnabled && (
                  <button
                    onClick={() => setCardFlow('tripos')}
                    className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-purple-400 rounded-xl p-4 transition-all"
                  >
                    <span className="text-2xl">🖥️</span>
                    <span className="text-white font-medium text-sm">Terminal</span>
                    <span className="text-gray-400 text-xs">chip & tap</span>
                  </button>
                )}
                {manualCardEnabled && (
                  <button
                    onClick={() => setCardFlow('manual')}
                    className="flex flex-col items-center gap-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-green-400 rounded-xl p-4 transition-all"
                  >
                    <span className="text-2xl">💳</span>
                    <span className="text-white font-medium text-sm">Manual</span>
                    <span className="text-gray-400 text-xs">enter manually</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setMethod(null)}
                className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600"
              >Back</button>
            </div>
          )}

          {/* Step 3a: SumUp QR flow */}
          {method === 'card' && cardFlow === 'sumup' && (
            <div className="space-y-3">
              {sumupStatus === 'creating' && (
                <div className="text-center bg-gray-700 rounded-xl p-6">
                  <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white">Creating payment link...</p>
                </div>
              )}

              {sumupStatus === 'waiting' && (
                <div className="text-center space-y-3">
                  {isSumUpAvailable() ? (
                    // Native Tap to Pay — SumUp app handles it
                    <>
                      <div className="text-6xl">📱</div>
                      <p className="text-white font-bold text-lg">Ask customer to tap card</p>
                      <p className="text-gray-400 text-sm">Hold card near the back of this phone</p>
                      <div className="flex items-center justify-center gap-2 text-blue-400 text-sm pt-1">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Waiting for tap...
                      </div>
                    </>
                  ) : sumupUrl ? (
                    // Hosted checkout — show QR
                    <>
                      <div className="bg-white rounded-xl p-3 inline-block">
                        <img src={qrUrl!} alt="QR code" className="w-48 h-48" />
                      </div>
                      <p className="text-white font-medium">Scan to pay</p>
                      <p className="text-gray-400 text-sm">Customer scans QR or taps the link below</p>
                      <a href={sumupUrl} target="_blank" rel="noreferrer"
                        className="block text-blue-400 text-xs underline break-all"
                      >{sumupUrl}</a>
                      <div className="flex items-center justify-center gap-2 text-gray-400 text-sm pt-1">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        Waiting for payment...
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
              )}

              {sumupStatus === 'paid' && (
                <div className="text-center bg-green-800/40 rounded-xl p-6">
                  <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mx-auto mb-3">
                    <span className="text-white font-bold text-xl">✓</span>
                  </div>
                  <p className="text-green-400 font-bold text-lg">Payment Received</p>
                </div>
              )}

              {sumupStatus === 'failed' && (
                <div className="text-center bg-red-800/30 rounded-xl p-5">
                  <p className="text-red-400 font-bold">Payment failed</p>
                  <p className="text-gray-400 text-sm mt-1">Please try again or use cash</p>
                </div>
              )}

              {(sumupStatus === 'creating' || sumupStatus === 'waiting' || sumupStatus === 'failed') && (
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={cancelSumup}
                    className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600"
                  >Cancel</button>
                  {sumupStatus === 'creating' && (
                    <button
                      onClick={handleSumupStart}
                      disabled={processing}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
                    >Send Link</button>
                  )}
                  {sumupStatus === 'failed' && (
                    <button
                      onClick={() => { setSumupStatus('creating'); setProcessing(false) }}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
                    >Retry</button>
                  )}
                </div>
              )}

              {/* Auto-start on first render */}
              {sumupStatus === 'creating' && !processing && <AutoStart onStart={handleSumupStart} />}
            </div>
          )}

          {/* Step 3b: triPOS terminal flow */}
          {method === 'card' && cardFlow === 'tripos' && (
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
                  onClick={() => { setMethod(null); setCardFlow(null); setTerminalStatus('idle'); setProcessing(false) }}
                  disabled={terminalStatus === 'waiting'}
                  className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                >Back</button>
                {(terminalStatus === 'idle' || terminalStatus === 'declined') && (
                  <button
                    onClick={() => { setTerminalStatus('idle'); setProcessing(false); handleCardTerminal() }}
                    disabled={processing}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50"
                  >{terminalStatus === 'declined' ? 'Retry' : 'Charge Terminal'}</button>
                )}
              </div>
            </div>
          )}

          {/* Step 3c: Manual card flow */}
          {method === 'card' && cardFlow === 'manual' && (
            <div className="space-y-3">
              <div className="text-center bg-gray-700 rounded-xl p-6 space-y-2">
                <span className="text-4xl">💳</span>
                <p className="text-white font-bold text-lg">Manual Card Payment</p>
                <p className="text-gray-300 text-sm">
                  Charge <span className="text-orange-400 font-bold">{currencySymbol}{total.toFixed(2)}</span> on your card machine
                </p>
                <p className="text-gray-400 text-xs">Once the customer's card is approved, tap Paid below</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setMethod(null); setCardFlow(null); setProcessing(false) }}
                  disabled={processing}
                  className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 disabled:opacity-50"
                >Back</button>
                <button
                  onClick={handlePay}
                  disabled={processing}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50"
                >{processing ? 'Saving...' : 'Paid ✓'}</button>
              </div>
            </div>
          )}

          {/* No gateway configured */}
          {method === 'card' && enabledCardFlows.length === 0 && (
            <div className="space-y-3">
              <div className="text-center bg-gray-700 rounded-xl p-6">
                <p className="text-yellow-400 font-medium">No card gateway configured</p>
                <p className="text-gray-400 text-sm mt-1">Enable SumUp, Worldpay, or Manual Card in Payment Settings</p>
              </div>
              <button
                onClick={() => setMethod(null)}
                className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600"
              >Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Tiny helper: fires once on mount to auto-start the SumUp checkout */
function AutoStart({ onStart }: { onStart: () => void }) {
  const fired = useRef(false)
  useEffect(() => {
    if (!fired.current) { fired.current = true; onStart() }
  }, [onStart])
  return null
}
