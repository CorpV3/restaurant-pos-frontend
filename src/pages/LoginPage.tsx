import { useState } from 'react'

interface LoginPageProps {
  onLogin: () => void
}

const DEMO_PIN = '1234'

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit
      setPin(newPin)
      setError('')
      if (newPin.length === 4) {
        if (newPin === DEMO_PIN) {
          onLogin()
        } else {
          setError('Invalid PIN')
          setTimeout(() => {
            setPin('')
            setError('')
          }, 1000)
        }
      }
    }
  }

  const handleClear = () => {
    setPin('')
    setError('')
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 rounded-2xl p-8 w-80 shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Restaurant POS
        </h1>
        <p className="text-gray-400 text-center text-sm mb-6">
          Enter PIN to start
        </p>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < pin.length
                  ? error
                    ? 'bg-red-500 border-red-500'
                    : 'bg-orange-500 border-orange-500'
                  : 'border-gray-500'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-center text-sm mb-4">{error}</p>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'C'].map(
            (key) => {
              if (key === '') return <div key="empty" />
              return (
                <button
                  key={key}
                  onClick={() =>
                    key === 'C' ? handleClear() : handleDigit(key)
                  }
                  className={`h-14 rounded-xl text-xl font-semibold transition-all active:scale-95 ${
                    key === 'C'
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                >
                  {key}
                </button>
              )
            }
          )}
        </div>

        <p className="text-gray-500 text-xs text-center mt-4">
          Demo PIN: 1234
        </p>
      </div>
    </div>
  )
}
