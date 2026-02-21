import { create } from 'zustand'
import type { CartItem, MenuItem } from '../types'

interface CartStore {
  items: CartItem[]
  addItem: (menuItem: MenuItem) => void
  removeItem: (menuItemId: string) => void
  updateQuantity: (menuItemId: string, quantity: number) => void
  clearCart: () => void
  subtotal: () => number
  vat: () => number
  total: () => number
}

const VAT_RATE = 0.2 // 20% UK VAT

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (menuItem: MenuItem) => {
    set((state) => {
      const existing = state.items.find((i) => i.menuItem.id === menuItem.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.menuItem.id === menuItem.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { items: [...state.items, { menuItem, quantity: 1 }] }
    })
  },

  removeItem: (menuItemId: string) => {
    set((state) => ({
      items: state.items.filter((i) => i.menuItem.id !== menuItemId),
    }))
  },

  updateQuantity: (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId)
      return
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.menuItem.id === menuItemId ? { ...i, quantity } : i
      ),
    }))
  },

  clearCart: () => set({ items: [] }),

  subtotal: () => {
    return get().items.reduce(
      (sum, item) => sum + item.menuItem.price * item.quantity,
      0
    )
  },

  vat: () => {
    return get().subtotal() * VAT_RATE
  },

  total: () => {
    return get().subtotal() + get().vat()
  },
}))
