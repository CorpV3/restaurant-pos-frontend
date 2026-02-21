import { useState } from 'react'
import MenuGrid from '../menu/MenuGrid'
import Cart from '../cart/Cart'
import CategoryBar from '../menu/CategoryBar'
import StatusBar from '../common/StatusBar'

interface POSLayoutProps {
  onLogout: () => void
}

const DEFAULT_CATEGORIES = ['All', 'Starters', 'Mains', 'Sides', 'Drinks', 'Desserts']

export default function POSLayout({ onLogout }: POSLayoutProps) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  const handleCategoriesLoaded = (cats: string[]) => {
    setCategories(cats)
    setActiveCategory('All')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 overflow-hidden">
      <StatusBar onLogout={onLogout} />
      <div className="flex flex-1 min-h-0">
        {/* Left: Menu Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
        {/* Right: Cart - fixed width, full height, scrollable internally */}
        <Cart />
      </div>
    </div>
  )
}
