import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { fetchMenuItems, mapBackendCategory, getCategoryIcon } from '../../services/menuService'
import type { MenuItem } from '../../types'

const DEMO_MENU: MenuItem[] = [
  { id: '1', name: 'Fish & Chips', price: 12.99, category: 'Mains', icon: '🐟', available: true },
  { id: '2', name: 'Burger', price: 10.99, category: 'Mains', icon: '🍔', available: true },
  { id: '3', name: 'Pizza', price: 11.99, category: 'Mains', icon: '🍕', available: true },
  { id: '4', name: 'Chicken Wings', price: 7.99, category: 'Starters', icon: '🍗', available: true },
  { id: '5', name: 'Garlic Bread', price: 4.99, category: 'Starters', icon: '🍞', available: true },
  { id: '6', name: 'Soup', price: 5.99, category: 'Starters', icon: '🍜', available: true },
  { id: '7', name: 'Chips', price: 3.99, category: 'Sides', icon: '🍟', available: true },
  { id: '8', name: 'Coleslaw', price: 2.99, category: 'Sides', icon: '🥗', available: true },
  { id: '9', name: 'Cola', price: 2.50, category: 'Drinks', icon: '🥤', available: true },
  { id: '10', name: 'Beer', price: 4.99, category: 'Drinks', icon: '🍺', available: true },
  { id: '11', name: 'Ice Cream', price: 4.99, category: 'Desserts', icon: '🍦', available: true },
  { id: '12', name: 'Cake', price: 5.99, category: 'Desserts', icon: '🍰', available: true },
]

interface MenuGridProps {
  category: string
  onCategoriesLoaded?: (categories: string[]) => void
}

export default function MenuGrid({ category, onCategoriesLoaded }: MenuGridProps) {
  const addItem = useCartStore((s) => s.addItem)
  const { user } = useAuthStore()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  useEffect(() => {
    loadMenu()
  }, [user?.restaurant_id])

  const loadMenu = async () => {
    const restaurantId = user?.restaurant_id
    if (!restaurantId) {
      // No restaurant linked - use demo data
      setMenuItems(DEMO_MENU)
      setIsOffline(false)
      setIsLoading(false)
      const cats = ['All', ...Array.from(new Set(DEMO_MENU.map((i) => i.category)))]
      onCategoriesLoaded?.(cats)
      return
    }

    setIsLoading(true)
    try {
      const items = await fetchMenuItems(restaurantId)
      const mapped: MenuItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: mapBackendCategory(item.category),
        icon: item.image_url ? '' : getCategoryIcon(item.category),
        imageUrl: item.image_url || undefined,
        available: item.is_available,
      }))
      setMenuItems(mapped)
      setIsOffline(false)

      // Extract unique categories and notify parent
      const cats = ['All', ...Array.from(new Set(mapped.map((i) => i.category)))]
      onCategoriesLoaded?.(cats)

      // Cache to localStorage for offline use
      localStorage.setItem(`menu_${restaurantId}`, JSON.stringify(mapped))
      localStorage.setItem(`menu_${restaurantId}_cats`, JSON.stringify(cats))
    } catch {
      // Try offline cache
      const cached = localStorage.getItem(`menu_${user.restaurant_id}`)
      if (cached) {
        const items = JSON.parse(cached) as MenuItem[]
        setMenuItems(items)
        setIsOffline(true)
        const cachedCats = localStorage.getItem(`menu_${user.restaurant_id}_cats`)
        if (cachedCats) onCategoriesLoaded?.(JSON.parse(cachedCats))
      } else {
        // No cache - fall back to demo
        setMenuItems(DEMO_MENU)
        setIsOffline(true)
        const cats = ['All', ...Array.from(new Set(DEMO_MENU.map((i) => i.category)))]
        onCategoriesLoaded?.(cats)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMenu =
    category === 'All'
      ? menuItems
      : menuItems.filter((item) => item.category === category)

  const handleItemClick = (item: MenuItem) => {
    addItem(item)
    setAnimatingId(item.id)
    setTimeout(() => setAnimatingId(null), 300)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3 animate-spin">⟳</div>
          <p>Loading menu...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {isOffline && (
        <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 text-yellow-400 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>Offline – showing cached menu</span>
          <button onClick={loadMenu} className="ml-auto text-yellow-300 hover:text-yellow-100 underline text-xs">
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={`flex flex-col items-center justify-center bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl p-4 h-[180px] transition-all active:scale-95 ${
              animatingId === item.id ? 'menu-item-pop menu-item-glow' : ''
            }`}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-16 h-16 object-cover rounded-lg mb-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <span className="text-5xl mb-3">{item.icon}</span>
            )}
            <span className="text-sm font-medium text-white text-center leading-tight line-clamp-2">
              {item.name}
            </span>
            <span className="text-orange-400 font-bold text-sm mt-1">
              £{item.price.toFixed(2)}
            </span>
          </button>
        ))}
        {filteredMenu.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500">
            <span className="text-4xl mb-2">🍽️</span>
            <p>No items in this category</p>
          </div>
        )}
      </div>
    </div>
  )
}
