import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { useMenuStore } from '../../stores/menuStore'
import { fetchMenuItems, mapBackendCategory, getCategoryIcon } from '../../services/menuService'
import type { MenuItem, DealComponent, DealSelectionStep } from '../../types'
import type { BackendMenuItem } from '../../services/menuService'

function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  const base = localStorage.getItem('pos_api_url') || 'http://localhost:8000'
  return `${base}${path}`
}

const DEMO_MENU: MenuItem[] = [
  { id: '1', name: 'Fish & Chips', price: 12.99, category: 'Mains', icon: '', available: true },
  { id: '2', name: 'Burger', price: 10.99, category: 'Mains', icon: '', available: true },
  { id: '3', name: 'Pizza', price: 11.99, category: 'Mains', icon: '', available: true },
  { id: '4', name: 'Chicken Wings', price: 7.99, category: 'Starters', icon: '', available: true },
  { id: '5', name: 'Garlic Bread', price: 4.99, category: 'Starters', icon: '', available: true },
  { id: '6', name: 'Chips', price: 3.99, category: 'Sides', icon: '', available: true },
  { id: '7', name: 'Cola', price: 2.50, category: 'Drinks', icon: '', available: true },
  { id: '8', name: 'Beer', price: 4.99, category: 'Drinks', icon: '', available: true },
  { id: '9', name: 'Ice Cream', price: 4.99, category: 'Desserts', icon: '', available: true },
  { id: '10', name: 'Cake', price: 5.99, category: 'Desserts', icon: '', available: true },
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
    is_deal: item.is_deal ?? false,
    deal_components: item.deal_components as DealComponent[] | undefined,
  }
}

interface MenuGridProps {
  category: string
  onCategoriesLoaded?: (categories: string[]) => void
}

export default function MenuGrid({ category, onCategoriesLoaded }: MenuGridProps) {
  const addItem = useCartStore((s) => s.addItem)
  const user = useAuthStore((s) => s.user)
  const setMenuItems_store = useMenuStore((s) => s.setItems)
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
          setMenuItems_store(mapped)   // share with Cart for deal detection
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

  // All items (including deals) are added directly at their listed price.
  // Cart detects if current items match a deal and suggests applying it.
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
    <div className="flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            className={`flex flex-col items-center justify-center bg-gray-800 hover:bg-gray-700 border rounded-xl p-3 h-[150px] transition-all active:scale-95 relative ${
              item.is_deal
                ? 'border-orange-600/70 hover:border-orange-400'
                : 'border-gray-700 hover:border-orange-500'
            } ${animatingId === item.id ? 'menu-item-pop menu-item-glow' : ''}`}
          >
            {item.is_deal && (
              <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                DEAL
              </span>
            )}
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                className="w-14 h-14 object-cover rounded-lg mb-2"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fb) fb.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-14 h-14 rounded-lg mb-2 bg-orange-500/20 border border-orange-500/30 items-center justify-center text-orange-400 text-lg font-bold"
              style={{ display: item.imageUrl ? 'none' : 'flex' }}
            >
              {item.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-white text-center leading-tight line-clamp-2">
              {item.name}
            </span>
            <span className="text-orange-400 font-bold text-xs mt-1">
              {'\u00a3'}{item.price.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
