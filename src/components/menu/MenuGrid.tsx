import { useState } from 'react'
import { useCartStore } from '../../stores/cartStore'
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
  { id: '9', name: 'Onion Rings', price: 3.99, category: 'Sides', icon: '🧅', available: true },
  { id: '10', name: 'Cola', price: 2.50, category: 'Drinks', icon: '🥤', available: true },
  { id: '11', name: 'Lemonade', price: 2.50, category: 'Drinks', icon: '🍋', available: true },
  { id: '12', name: 'Beer', price: 4.99, category: 'Drinks', icon: '🍺', available: true },
  { id: '13', name: 'Water', price: 1.50, category: 'Drinks', icon: '💧', available: true },
  { id: '14', name: 'Ice Cream', price: 4.99, category: 'Desserts', icon: '🍦', available: true },
  { id: '15', name: 'Cake', price: 5.99, category: 'Desserts', icon: '🍰', available: true },
  { id: '16', name: 'Brownie', price: 4.99, category: 'Desserts', icon: '🍫', available: true },
  { id: '17', name: 'Steak', price: 18.99, category: 'Mains', icon: '🥩', available: true },
  { id: '18', name: 'Pasta', price: 9.99, category: 'Mains', icon: '🍝', available: true },
  { id: '19', name: 'Salad', price: 7.99, category: 'Mains', icon: '🥗', available: true },
  { id: '20', name: 'Tea', price: 2.00, category: 'Drinks', icon: '🍵', available: true },
]

interface MenuGridProps {
  category: string
}

export default function MenuGrid({ category }: MenuGridProps) {
  const addItem = useCartStore((s) => s.addItem)
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  const filteredMenu =
    category === 'All'
      ? DEMO_MENU
      : DEMO_MENU.filter((item) => item.category === category)

  const handleItemClick = (item: MenuItem) => {
    addItem(item)
    setAnimatingId(item.id)
    setTimeout(() => setAnimatingId(null), 300)
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
            <span className="text-5xl mb-3">{item.icon}</span>
            <span className="text-sm font-medium text-white text-center leading-tight">
              {item.name}
            </span>
            <span className="text-orange-400 font-bold text-sm mt-1">
              £{item.price.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
