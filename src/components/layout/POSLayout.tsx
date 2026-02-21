import { useState } from 'react'
import MenuGrid from '../menu/MenuGrid'
import Cart from '../cart/Cart'
import CategoryBar from '../menu/CategoryBar'
import StatusBar from '../common/StatusBar'

interface POSLayoutProps {
  onLogout: () => void
}

const CATEGORIES = [
  'All',
  'Starters',
  'Mains',
  'Sides',
  'Drinks',
  'Desserts',
]

export default function POSLayout({ onLogout }: POSLayoutProps) {
  const [activeCategory, setActiveCategory] = useState('All')

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Status Bar */}
      <StatusBar onLogout={onLogout} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Menu Area */}
        <div className="flex-1 flex flex-col">
          <CategoryBar
            categories={CATEGORIES}
            active={activeCategory}
            onSelect={setActiveCategory}
          />
          <MenuGrid category={activeCategory} />
        </div>

        {/* Right: Cart */}
        <Cart />
      </div>
    </div>
  )
}
