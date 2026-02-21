import { useState, useCallback } from 'react'
import MenuGrid from '../menu/MenuGrid'
import Cart from '../cart/Cart'
import CategoryBar from '../menu/CategoryBar'
import StatusBar from '../common/StatusBar'

interface POSLayoutProps {
  onLogout: () => void
}

const DEFAULT_CATEGORIES = [
  'All',
  'Starters',
  'Mains',
  'Sides',
  'Drinks',
  'Desserts',
]

export default function POSLayout({ onLogout }: POSLayoutProps) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)

  const handleCategoriesLoaded = useCallback((cats: string[]) => {
    setCategories(cats)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <StatusBar onLogout={onLogout} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
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
    </div>
  )
}
