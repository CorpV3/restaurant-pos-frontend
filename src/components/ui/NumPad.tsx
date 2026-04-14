/**
 * POS NumPad — replaces system keyboard for cash/amount inputs.
 * No <input> element → no system keyboard popup on Android/Electron.
 */
interface NumPadProps {
  value: string
  onChange: (v: string) => void
  /** Quick-amount buttons shown above the grid (e.g. [10, 20, 50]) */
  quickAmounts?: number[]
  currencySymbol?: string
}

const KEYS = ['7','8','9','4','5','6','1','2','3','.','0','⌫']

export default function NumPad({ value, onChange, quickAmounts, currencySymbol = '£' }: NumPadProps) {
  const press = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1))
      return
    }
    // Only one decimal point
    if (key === '.' && value.includes('.')) return
    // Max 2 decimal places
    const dotIdx = value.indexOf('.')
    if (dotIdx !== -1 && value.length - dotIdx > 2) return
    // Leading zero guard
    const next = value === '0' && key !== '.' ? key : value + key
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {/* Quick amounts */}
      {quickAmounts && quickAmounts.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onChange(amt.toFixed(2))}
              className="py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {currencySymbol}{amt}
            </button>
          ))}
        </div>
      )}

      {/* Display */}
      <div className="bg-gray-900 rounded-xl px-4 py-3 text-right border border-gray-600">
        <span className="text-gray-500 text-sm mr-1">{currencySymbol}</span>
        <span className="text-white text-2xl font-bold tracking-wide">
          {value || '0'}
        </span>
      </div>

      {/* Key grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className={`py-4 rounded-xl text-lg font-bold transition-all active:scale-95 ${
              key === '⌫'
                ? 'bg-red-700/60 hover:bg-red-600/70 text-red-300'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
