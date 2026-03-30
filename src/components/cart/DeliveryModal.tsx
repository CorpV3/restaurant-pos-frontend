import { useState } from 'react'
import type { DeliveryDetails } from '../../services/orderService'

interface AddressSuggestion {
  line1: string
  line2: string
  city: string
  postcode: string
  display: string
}

interface DeliveryModalProps {
  onConfirm: (details: DeliveryDetails) => void
  onCancel: () => void
}

export default function DeliveryModal({ onConfirm, onCancel }: DeliveryModalProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [postcode, setPostcode] = useState('')
  const [postcodeError, setPostcodeError] = useState('')
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [selectedAddress, setSelectedAddress] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [step, setStep] = useState<'details' | 'address'>('details')

  const handlePostcodeSearch = async () => {
    const pc = postcode.trim().replace(/\s/g, '').toUpperCase()
    if (pc.length < 5) { setPostcodeError('Enter a valid UK postcode'); return }

    setSearching(true)
    setPostcodeError('')
    setSuggestions([])
    setSelectedAddress('')
    setShowManual(false)

    try {
      // postcodes.io — free, no key needed — validates postcode and gives district info
      const res = await fetch(`https://api.postcodes.io/postcodes/${pc}`)
      const data = await res.json()

      if (!res.ok || data.status !== 200) {
        setPostcodeError('Postcode not found — enter address manually')
        setShowManual(true)
        setManualAddress(`${postcode.trim().toUpperCase()}`)
        setSearching(false)
        return
      }

      const r = data.result
      // postcodes.io doesn't return street addresses — build common format suggestions
      // and always show manual option
      const area = r.admin_ward || r.parish || ''
      const district = r.admin_district || r.parliamentary_constituency || ''
      const formattedPc = r.postcode

      // Show a few placeholder suggestions based on area info + manual
      const built: AddressSuggestion[] = []
      if (area && district) {
        built.push({
          line1: '',
          line2: area,
          city: district,
          postcode: formattedPc,
          display: `${area}, ${district}, ${formattedPc}`,
        })
      }
      setSuggestions(built)
      setShowManual(true)
      setManualAddress(formattedPc)
    } catch {
      setPostcodeError('Could not search — enter address manually')
      setShowManual(true)
      setManualAddress(postcode.trim().toUpperCase())
    }
    setSearching(false)
  }

  const handleDetailsNext = () => {
    if (!name.trim()) return
    if (!phone.trim()) return
    setStep('address')
  }

  const handleConfirm = () => {
    const addr = selectedAddress || manualAddress
    if (!addr.trim()) return
    onConfirm({
      customerName: name.trim(),
      customerPhone: phone.trim(),
      deliveryAddress: addr.trim(),
    })
  }

  const finalAddress = selectedAddress || manualAddress

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold text-lg">Online / Delivery Order</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {step === 'details' ? 'Step 1: Customer details' : 'Step 2: Delivery address'}
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {step === 'details' ? (
            <>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g. 07700 900000"
                  inputMode="tel"
                />
              </div>
            </>
          ) : (
            <>
              {/* Postcode search */}
              <div>
                <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">Postcode</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setPostcodeError(''); setSuggestions([]); setShowManual(false) }}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostcodeSearch()}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white font-mono tracking-widest focus:outline-none focus:border-orange-500"
                    placeholder="RM7 0BT"
                  />
                  <button
                    onClick={handlePostcodeSearch}
                    disabled={searching}
                    className="px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 text-white rounded-xl font-medium text-sm whitespace-nowrap"
                  >
                    {searching ? '...' : 'Search'}
                  </button>
                </div>
                {postcodeError && <p className="text-red-400 text-xs mt-1">{postcodeError}</p>}
              </div>

              {/* Address suggestions */}
              {suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Select area</p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedAddress(s.display); setManualAddress(s.display) }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        selectedAddress === s.display
                          ? 'border-orange-500 bg-orange-500/10 text-white'
                          : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {s.display}
                    </button>
                  ))}
                </div>
              )}

              {/* Manual address entry */}
              {showManual && (
                <div>
                  <label className="text-gray-400 text-xs uppercase tracking-wide block mb-1">
                    Full Address *
                  </label>
                  <textarea
                    value={manualAddress}
                    onChange={(e) => { setManualAddress(e.target.value); setSelectedAddress('') }}
                    className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 text-sm resize-none"
                    rows={3}
                    placeholder="e.g. 24 Dagenham Road, Romford, RM7 0BT"
                  />
                </div>
              )}

              {!showManual && suggestions.length === 0 && (
                <button
                  onClick={() => setShowManual(true)}
                  className="text-orange-400 text-sm underline"
                >
                  Enter address manually
                </button>
              )}

              {/* Summary */}
              {finalAddress ? (
                <div className="bg-gray-700/50 rounded-xl p-3 border border-gray-600 text-sm">
                  <p className="text-gray-400 text-xs mb-1">Delivering to:</p>
                  <p className="text-white font-medium">{name}</p>
                  <p className="text-gray-300">{phone}</p>
                  <p className="text-gray-300 text-xs mt-1">{finalAddress}</p>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer buttons */}
        <div className="p-5 border-t border-gray-700 flex gap-3">
          {step === 'details' ? (
            <>
              <button onClick={onCancel} className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600">
                Cancel
              </button>
              <button
                onClick={handleDetailsNext}
                disabled={!name.trim() || !phone.trim()}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:text-gray-500 text-white rounded-xl font-bold"
              >
                Next →
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('details')} className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600">
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={!finalAddress.trim()}
                className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:text-gray-500 text-white rounded-xl font-bold"
              >
                Confirm
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
