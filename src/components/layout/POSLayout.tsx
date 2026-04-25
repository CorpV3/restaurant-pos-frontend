import { useState, useCallback, useEffect, useRef } from 'react'
import MenuGrid from '../menu/MenuGrid'
import Cart from '../cart/Cart'
import CategoryBar from '../menu/CategoryBar'
import StatusBar from '../common/StatusBar'
import AnnouncementTicker from '../common/AnnouncementTicker'
import UpdateBanner from '../common/UpdateBanner'
import ReportsPage from '../../pages/ReportsPage'
import PendingReceipts from '../../pages/PendingReceipts'
import LogsPage from '../../pages/LogsPage'
import InventoryPage from '../../pages/InventoryPage'
import { useAuthStore } from '../../stores/authStore'
import { usePrinterStore } from '../../stores/printerStore'
import { thermalPrinter } from '../../services/thermalPrinter'
import { ledService } from '../../services/ledService'
import { appLog } from '../../services/appLogger'
import { api } from '../../services/api'

interface POSLayoutProps {
  onLogout: () => void
}

const DEFAULT_CATEGORIES = ['All', 'Starters', 'Mains', 'Sides', 'Drinks', 'Desserts']

type Tab = 'pos' | 'receipts' | 'inventory' | 'reports' | 'logs'

export default function POSLayout({ onLogout }: POSLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pos')
  const [activeCategory, setActiveCategory] = useState('All')
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [pendingCount, setPendingCount] = useState(0)
  const [newOrderAlert, setNewOrderAlert] = useState(false)
  const { restaurant, refreshRestaurant } = useAuthStore()
  const { paperWidth, printerType, savedAddress, printDensity } = usePrinterStore()
  const printedIds = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  const handleCategoriesLoaded = useCallback((cats: string[]) => {
    setCategories(cats)
  }, [])

  // Refresh restaurant settings on mount (picks up auto_print_enabled)
  useEffect(() => {
    refreshRestaurant()
  }, [])

  // Auto-print kitchen tickets for new orders when chef_display is off
  useEffect(() => {
    if (!restaurant?.id) return

    const poll = async () => {
      try {
        const res = await api.get(`/api/v1/restaurants/${restaurant.id}/orders`, {
          params: { limit: 100 },
        })
        const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.orders ?? [])
        const active = raw.filter((o) =>
          ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
        )

        if (isFirstLoad.current) {
          active.forEach((o) => printedIds.current.add(o.id))
          isFirstLoad.current = false
          appLog.info(`POSLayout autoprint: seeded ${active.length} existing orders`)
          return
        }

        const newOrders = active.filter((o) => !printedIds.current.has(o.id))
        if (newOrders.length > 0) {
          appLog.info(`POSLayout autoprint: ${newOrders.length} new order(s), auto_print_enabled=${restaurant.auto_print_enabled}`)
          ledService.newOrderAlert()
          setNewOrderAlert(true)
        }

        for (const order of newOrders) {
          printedIds.current.add(order.id)
          if (!restaurant.auto_print_enabled) {
            appLog.info(`POSLayout autoprint: skipped order ${order.order_number} — auto_print_enabled=false`)
            continue
          }
          const orderType = (order.order_type ?? 'table').toLowerCase()
          const tblName = order.table
            ? `Table ${order.table.table_number}`
            : orderType === 'online' ? 'Online Order' : 'Takeaway'
          appLog.info(`POSLayout autoprint: printing ${order.order_number} type=${orderType}`)
          try {
            await thermalPrinter.printKitchenTicket(
              {
                orderNumber: order.order_number ?? order.id.slice(0, 8),
                orderType,
                tableName: tblName,
                customerName: order.customer_name ?? undefined,
                time: new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                items: (order.items ?? []).map((i: any) => ({
                  name: i.menu_item_name ?? i.item_name ?? 'Unknown',
                  qty: i.quantity,
                  note: i.special_instructions ?? undefined,
                })),
                note: order.special_instructions ?? undefined,
              },
              restaurant.auto_print_copies ?? 1,
              paperWidth,
              printerType,
              savedAddress,
              printDensity,
            )
            appLog.info(`POSLayout autoprint: SUCCESS ${order.order_number}`)
          } catch (e: any) {
            appLog.warn(`POSLayout autoprint: FAILED ${order.order_number} — ${e?.message ?? e}`)
          }
        }
      } catch {
        // silently ignore poll errors
      }
    }

    poll()
    const interval = setInterval(poll, 8000)
    return () => clearInterval(interval)
  }, [restaurant?.id, restaurant?.auto_print_enabled, paperWidth, printerType, savedAddress, printDensity])

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-gray-900 overflow-hidden">
      <UpdateBanner />
      <AnnouncementTicker />
      <StatusBar onLogout={onLogout} />

      {/* New order alert banner */}
      {newOrderAlert && (
        <div className="flex-shrink-0 bg-red-600 flex items-center justify-between px-4 py-2 animate-pulse">
          <span className="text-white font-bold text-sm">New Order Received!</span>
          <button
            onClick={() => {
              ledService.acknowledgeAlert()
              setNewOrderAlert(false)
            }}
            className="px-4 py-1 bg-white text-red-600 font-bold text-sm rounded-lg hover:bg-red-50 animate-none"
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700 px-4 gap-1">
        <button
          onClick={() => setActiveTab('pos')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pos'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Orders
        </button>
        <button
          onClick={() => setActiveTab('receipts')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
            activeTab === 'receipts'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Receipts
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'inventory'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Inventory
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Reports
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          Logs
        </button>
      </div>

      {activeTab === 'pos' ? (
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <CategoryBar
              categories={categories}
              active={activeCategory}
              onSelect={setActiveCategory}
            />
            <MenuGrid
              category={activeCategory}
              onCategoriesLoaded={handleCategoriesLoaded}
            />
          </div>
          <Cart />
        </div>
      ) : activeTab === 'receipts' ? (
        <PendingReceipts onCountChange={setPendingCount} />
      ) : activeTab === 'inventory' ? (
        <InventoryPage />
      ) : activeTab === 'reports' ? (
        <ReportsPage />
      ) : (
        <LogsPage />
      )}
    </div>
  )
}
