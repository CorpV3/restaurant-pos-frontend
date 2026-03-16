import { useState, useEffect } from 'react'
import { Bluetooth, BluetoothOff, Printer, Check, RefreshCw } from 'lucide-react'
import { thermalPrinter, type BluetoothDevice } from '../../services/thermalPrinter'
import { usePrinterStore } from '../../stores/printerStore'

export default function PrinterSettings() {
  const { savedAddress, savedName, autoPrint, paperWidth, setSavedPrinter, setAutoPrint, setPaperWidth } =
    usePrinterStore()
  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    setIsAndroid(
      typeof (window as any).Capacitor !== 'undefined' &&
        (window as any).Capacitor.getPlatform() === 'android'
    )
  }, [])

  const scan = async () => {
    setScanning(true)
    const list = await thermalPrinter.listDevices()
    setDevices(list)
    setScanning(false)
  }

  const connect = async (device: BluetoothDevice) => {
    setConnecting(device.address)
    const ok = await thermalPrinter.connect(device.address)
    if (ok) {
      setSavedPrinter(device)
      setConnected(true)
    }
    setConnecting(null)
  }

  const disconnect = async () => {
    await thermalPrinter.disconnect()
    setConnected(false)
  }

  const testPrint = async () => {
    await thermalPrinter.printReceipt({
      restaurantName: 'Test Restaurant',
      orderRef: 'TEST-001',
      tableName: 'Table 1',
      date: new Date().toLocaleString(),
      items: [
        { name: 'Biriyani', qty: 2, price: 8.5 },
        { name: 'Mango Lassi', qty: 1, price: 3.0 },
      ],
      subtotal: 20.0,
      total: 20.0,
      paymentMethod: 'cash',
      cashReceived: 25,
      change: 5,
      currencySymbol: '£',
      footer: 'Test print successful!',
    })
  }

  return (
    <div className="p-4 space-y-6 max-w-lg">
      <div className="flex items-center gap-3 mb-2">
        <Printer className="text-blue-400" size={22} />
        <h2 className="text-white text-lg font-bold">Thermal Printer</h2>
      </div>

      {!isAndroid && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
          Bluetooth printer pairing is only available on the Android app.
          On desktop, receipts will open in a print dialog.
        </div>
      )}

      {/* Current printer */}
      {savedName && (
        <div className="bg-gray-700 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bluetooth size={18} className={connected ? 'text-blue-400' : 'text-gray-400'} />
            <div>
              <p className="text-white font-medium text-sm">{savedName}</p>
              <p className="text-gray-400 text-xs">{savedAddress}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {connected ? (
              <button onClick={disconnect} className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-lg">
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connect({ name: savedName!, address: savedAddress! })}
                disabled={!!connecting}
                className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Reconnect'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-gray-300 text-sm font-semibold">Settings</p>
        <label className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Auto-print after payment</span>
          <button
            onClick={() => setAutoPrint(!autoPrint)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoPrint ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoPrint ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
        <label className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Paper width</span>
          <select
            value={paperWidth}
            onChange={(e) => setPaperWidth(Number(e.target.value) as 32 | 48)}
            className="bg-gray-600 text-white text-sm rounded-lg px-3 py-1 border border-gray-500"
          >
            <option value={32}>58mm (32 chars)</option>
            <option value={48}>80mm (48 chars)</option>
          </select>
        </label>
      </div>

      {/* Test print */}
      <button
        onClick={testPrint}
        className="w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
      >
        <Printer size={16} />
        Test Print
      </button>

      {/* Bluetooth device scan (Android only) */}
      {isAndroid && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm font-semibold">Paired Bluetooth Devices</p>
            <button
              onClick={scan}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
              {scanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>

          {devices.length === 0 && !scanning && (
            <div className="text-gray-500 text-xs text-center py-4">
              Tap Scan to list paired devices.
              <br />
              Pair your printer in Android Bluetooth settings first.
            </div>
          )}

          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.address} className="bg-gray-700 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {d.address === savedAddress ? (
                    <Check size={16} className="text-green-400" />
                  ) : (
                    <BluetoothOff size={16} className="text-gray-500" />
                  )}
                  <div>
                    <p className="text-white text-sm">{d.name || 'Unknown Device'}</p>
                    <p className="text-gray-400 text-xs">{d.address}</p>
                  </div>
                </div>
                <button
                  onClick={() => connect(d)}
                  disabled={connecting === d.address}
                  className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {connecting === d.address ? 'Connecting...' : 'Use'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
