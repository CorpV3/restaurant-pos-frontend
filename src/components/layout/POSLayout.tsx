import { useState, useCallback } from 'react'
import MenuGrid from '../menu/MenuGrid'
import Cart from '../cart/Cart'
import CategoryBar from '../menu/CategoryBar'
import StatusBar from '../common/StatusBar'
import ReportsPage from '../../pages/ReportsPage'
import PendingReceipts from '../../pages/PendingReceipts'

interface POSLayoutProps {
  onLogout: () => void
}

const DEFAULT_CATEGORIES = ['All', 'Starters', 'Mains', 'Sides', 'Drinks', 'Desserts']

type Tab = 'pos' | 'receipts' | 'reports'

export default function POSLayout({ onLogout }: POSLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('pos')
  const [activeCategory, setActiveCategory] = useState('All')
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [pendingCount, setPendingCount] = useState(0)

  const handleCategoriesLoaded = useCallback((cats: string[]) => {
    setCategories(cats)
  }, [])

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-gray-900 overflow-hidden">
      <StatusBar onLogout={onLogout} />

      {/* Tab bar */}
      <div className="flex-shrink-0 flex bg-gray-800 border-b border-gray-700 px-3 gap-1">
        <button
          onClick={() => setActiveTab('pos')}
          className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'pos'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          🛒 Orders
        </button>
        <button
          onClick={() => setActiveTab('receipts')}
          className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors relative ${
            activeTab === 'receipts'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          🧾 Receipts
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          📊 Reports
        </button>
      </div>

      {activeTab === 'pos' ? (
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col overflow-hidden">
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
      ) : (
        <ReportsPage />
      )}
    </div>
  )
}
