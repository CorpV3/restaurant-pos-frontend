import { useState, useEffect } from 'react'
import { Bluetooth, BluetoothOff, Printer, Check, RefreshCw } from 'lucide-react'
import { thermalPrinter, type BluetoothDevice } from '../../services/thermalPrinter'
import { usePrinterStore, type PrinterType } from '../../stores/printerStore'

export default function PrinterSettings() {
  const {
    printerType, serialPath, savedAddress, savedName,
    autoPrint, paperWidth,
    setPrinterType, setSerialPath, setSavedPrinter, setAutoPrint, setPaperWidth,
  } = usePrinterStore()

  const [isAndroid, setIsAndroid] = useState(false)
  const [hasSerialPlugin, setHasSerialPlugin] = useState(false)
  const [detectedPaths, setDetectedPaths] = useState<string[]>([])
  const [serialPathInput, setSerialPathInput] = useState(serialPath)

  // Bluetooth state
  const [btSupported, setBtSupported] = useState(false)
  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const platform =
      typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor.getPlatform() === 'android'
    setIsAndroid(platform)

    const hasPlugin = thermalPrinter.hasSerialPlugin()
    setHasSerialPlugin(hasPlugin)

    if (hasPlugin) {
      // Auto-detect available serial paths and sync serial path to service
      thermalPrinter.listSerialPaths().then(setDetectedPaths)
      thermalPrinter.serialPath = serialPath
    }

    thermalPrinter.getAndroidSdk().then((sdk) => {
      setBtSupported(sdk >= 23 || !platform)
    })
  }, [serialPath])

  const applySerialPath = () => {
    setSerialPath(serialPathInput)
    thermalPrinter.serialPath = serialPathInput
  }

  const scan = async () => {
    setScanning(true)
    const list = await thermalPrinter.listDevices()
    setDevices(list)
    setScanning(false)
  }

  const connect = async (device: BluetoothDevice) => {
    setConnecting(device.address)
    const ok = await thermalPrinter.connect(device.address)
    if (ok) { setSavedPrinter(device); setConnected(true) }
    setConnecting(null)
  }

  const disconnect = async () => {
    await thermalPrinter.disconnect()
    setConnected(false)
  }

  const testPrint = async () => {
    try {
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
      }, paperWidth)
    } catch (e: any) {
      alert('Print failed: ' + (e?.message ?? e))
    }
  }

  return (
    <div className="p-4 space-y-5 max-w-lg overflow-y-auto">
      <div className="flex items-center gap-3">
        <Printer className="text-blue-400" size={22} />
        <h2 className="text-white text-lg font-bold">Thermal Printer</h2>
      </div>

      {!isAndroid && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
          On desktop, receipts open in a browser print dialog.
        </div>
      )}

      {/* ── Printer type selector (Android only) ── */}
      {isAndroid && (
        <div className="bg-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-gray-300 text-sm font-semibold">Connection Type</p>
          <div className="grid grid-cols-2 gap-2">
            {(['serial', 'bluetooth'] as PrinterType[]).map((t) => (
              <button
                key={t}
                onClick={() => setPrinterType(t)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  printerType === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                }`}
              >
                {t === 'serial' ? '🔌 Serial (Built-in)' : '📶 Bluetooth'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Serial printer config ── */}
      {isAndroid && printerType === 'serial' && (
        <div className="bg-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 text-sm font-semibold">Serial Port</p>
            {hasSerialPlugin
              ? <span className="text-green-400 text-xs">✓ Plugin ready</span>
              : <span className="text-yellow-400 text-xs">⚠ Plugin not detected</span>
            }
          </div>

          <div className="flex gap-2">
            <input
              value={serialPathInput}
              onChange={(e) => setSerialPathInput(e.target.value)}
              className="flex-1 bg-gray-600 border border-gray-500 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              placeholder="/dev/ttyS1"
            />
            <button
              onClick={applySerialPath}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-lg"
            >
              Apply
            </button>
          </div>

          {detectedPaths.length > 0 && (
            <div>
              <p className="text-gray-400 text-xs mb-1">Detected ports:</p>
              <div className="flex flex-wrap gap-1">
                {detectedPaths.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setSerialPathInput(p); setSerialPath(p); thermalPrinter.serialPath = p }}
                    className={`text-xs px-2 py-1 rounded-lg font-mono ${
                      serialPath === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-gray-500 text-xs">
            H10-3 default: /dev/ttyS1 — try /dev/ttyS2 if printing fails
          </p>
        </div>
      )}

      {/* ── Bluetooth config ── */}
      {isAndroid && printerType === 'bluetooth' && savedName && (
        <div className="bg-gray-700 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bluetooth size={18} className={connected ? 'text-blue-400' : 'text-gray-400'} />
            <div>
              <p className="text-white font-medium text-sm">{savedName}</p>
              <p className="text-gray-400 text-xs">{savedAddress}</p>
            </div>
          </div>
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
      )}

      {/* ── Settings ── */}
      <div className="bg-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-gray-300 text-sm font-semibold">Settings</p>
        <label className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Auto-print after payment</span>
          <button
            onClick={() => setAutoPrint(!autoPrint)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoPrint ? 'bg-blue-600' : 'bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoPrint ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </label>
        <label className="flex items-center justify-between">
          <span className="text-gray-300 text-sm">Paper width</span>
          <select
            value={paperWidth}
            onChange={(e) => setPaperWidth(Number(e.target.value) as 32 | 42 | 48)}
            className="bg-gray-600 text-white text-sm rounded-lg px-3 py-1 border border-gray-500"
          >
            <option value={32}>58mm (32 chars)</option>
            <option value={42}>75mm (42 chars)</option>
            <option value={48}>80mm (48 chars)</option>
          </select>
        </label>
      </div>

      {/* ── Test print ── */}
      <button
        onClick={testPrint}
        className="w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
      >
        <Printer size={16} />
        Test Print
      </button>

      {/* ── BT scan section ── */}
      {isAndroid && printerType === 'bluetooth' && btSupported && (
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
            <p className="text-gray-500 text-xs text-center py-4">
              Tap Scan to list paired devices.<br />
              Pair your printer in Android Bluetooth settings first.
            </p>
          )}
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.address} className="bg-gray-700 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {d.address === savedAddress
                    ? <Check size={16} className="text-green-400" />
                    : <BluetoothOff size={16} className="text-gray-500" />}
                  <div>
                    <p className="text-white text-sm">{d.name || 'Unknown'}</p>
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
