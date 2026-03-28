import { create } from 'zustand'
import type { CartItem, MenuItem } from '../types'

interface CartStore {
  items: CartItem[]
  discountAmount: number
  discountReason: string
  addItem: (menuItem: MenuItem) => void
  removeItem: (menuItemId: string) => void
  updateQuantity: (menuItemId: string, quantity: number) => void
  clearCart: () => void
  setDiscount: (amount: number, reason: string) => void
  clearDiscount: () => void
  subtotal: () => number
  vat: () => number
  discountedTotal: () => number
  total: () => number
}

const VAT_RATE = 0.2 // 20% UK VAT

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discountAmount: 0,
  discountReason: '',

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

  clearCart: () => set({ items: [], discountAmount: 0, discountReason: '' }),

  setDiscount: (amount: number, reason: string) => set({ discountAmount: amount, discountReason: reason }),

  clearDiscount: () => set({ discountAmount: 0, discountReason: '' }),

  subtotal: () => {
    return get().items.reduce(
      (sum, item) => sum + item.menuItem.price * item.quantity,
      0
    )
  },

  vat: () => {
    return get().subtotal() * VAT_RATE
  },

  discountedTotal: () => {
    return Math.max(0, get().subtotal() + get().vat() - get().discountAmount)
  },

  total: () => {
    return get().discountedTotal()
  },
}))
