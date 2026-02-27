import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { fetchMenuItems, mapBackendCategory, getCategoryIcon } from '../../services/menuService'
import type { MenuItem } from '../../types'
import type { BackendMenuItem } from '../../services/menuService'

function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  const base = localStorage.getItem('pos_api_url') || 'http://localhost:8000'
  return `${base}${path}`
}

const DEMO_MENU: MenuItem[] = [
  { id: '1', name: 'Fish & Chips', price: 12.99, category: 'Mains', icon: '\U0001f41f', available: true },
  { id: '2', name: 'Burger', price: 10.99, category: 'Mains', icon: '\U0001f354', available: true },
  { id: '3', name: 'Pizza', price: 11.99, category: 'Mains', icon: '\U0001f355', available: true },
  { id: '4', name: 'Chicken Wings', price: 7.99, category: 'Starters', icon: '\U0001f357', available: true },
  { id: '5', name: 'Garlic Bread', price: 4.99, category: 'Starters', icon: '\U0001f35e', available: true },
  { id: '6', name: 'Chips', price: 3.99, category: 'Sides', icon: '\U0001f35f', available: true },
  { id: '7', name: 'Cola', price: 2.50, category: 'Drinks', icon: '\U0001f964', available: true },
  { id: '8', name: 'Beer', price: 4.99, category: 'Drinks', icon: '\U0001f37a', available: true },
  { id: '9', name: 'Ice Cream', price: 4.99, category: 'Desserts', icon: '\U0001f366', available: true },
  { id: '10', name: 'Cake', price: 5.99, category: 'Desserts', icon: '\U0001f370', available: true },
]

function mapBackendToMenuItem(item: BackendMenuItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    category: mapBackendCategory(item.category),
    icon: getCategoryIcon(item.category),
    available: item.is_available,
    imageUrl: resolveImageUrl(item.image_url),
  }
}

interface MenuGridProps {
  category: string
  onCategoriesLoaded?: (categories: string[]) => void
}

export default function MenuGrid({ category, onCategoriesLoaded }: MenuGridProps) {
  const addItem = useCartStore((s) => s.addItem)
  const user = useAuthStore((s) => s.user)
  const [animatingId, setAnimatingId] = useState<string | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(DEMO_MENU)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const loadMenu = async () => {
      const restaurantId = user?.restaurant_id || localStorage.getItem('pos_restaurant_id')
      if (!restaurantId || !isOnline) return

      setIsLoading(true)
      try {
        const items = await fetchMenuItems(restaurantId)
        const mapped = items.map(mapBackendToMenuItem)
        if (mapped.length > 0) {
          setMenuItems(mapped)
          localStorage.setItem('pos_cached_menu', JSON.stringify(mapped))
          const cats = new Set(mapped.map((m) => m.category))
          onCategoriesLoaded?.(['All', ...Array.from(cats)])
        }
      } catch (err) {
        console.error('Failed to fetch menu, using cached/demo:', err)
        const cached = localStorage.getItem('pos_cached_menu')
        if (cached) {
          try { setMenuItems(JSON.parse(cached)) } catch { /* use demo */ }
        }
      } finally {
        setIsLoading(false)
      }
    }
    loadMenu()
  }, [user?.restaurant_id, isOnline, onCategoriesLoaded])

  const filteredMenu = category === 'All'
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
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-400">Loading menu...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
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
                className="w-16 h-16 object-cover rounded-lg mb-3"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  (e.currentTarget.nextSibling as HTMLElement).style.display = 'block';
                }}
              />
            ) : null}
            <span
              className="text-5xl mb-3"
              style={{ display: item.imageUrl ? 'none' : 'block' }}
            >
              {item.icon}
            </span>
            <span className="text-sm font-medium text-white text-center leading-tight">
              {item.name}
            </span>
            <span className="text-orange-400 font-bold text-sm mt-1">
              {'\u00a3'}{item.price.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
