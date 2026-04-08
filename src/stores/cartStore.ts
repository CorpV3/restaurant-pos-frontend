import { create } from 'zustand'
import type { CartItem, MenuItem, DealSelectionStep } from '../types'

interface CartStore {
  items: CartItem[]
  discountAmount: number
  discountReason: string
  vatRate: number   // e.g. 0.20 for 20%; 0 if VAT disabled
  vatEnabled: boolean
  setVat: (enabled: boolean, rate: number) => void
  addItem: (menuItem: MenuItem) => void
  addDealItem: (menuItem: MenuItem, selections: DealSelectionStep[]) => void
  removeItem: (cartKey: string) => void
  updateQuantity: (cartKey: string, quantity: number) => void
  clearCart: () => void
  setDiscount: (amount: number, reason: string) => void
  clearDiscount: () => void
  subtotal: () => number
  vat: () => number
  discountedTotal: () => number
  total: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  discountAmount: 0,
  discountReason: '',
  vatRate: 0.20,
  vatEnabled: true,

  setVat: (enabled: boolean, rate: number) => {
    set({ vatEnabled: enabled, vatRate: enabled ? rate / 100 : 0 })
  },

  addItem: (menuItem: MenuItem) => {
    // Regular (non-deal) items — group by id
    const cartKey = menuItem.id
    set((state) => {
      const existing = state.items.find((i) => i.cartKey === cartKey)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { items: [...state.items, { menuItem, quantity: 1, cartKey }] }
    })
  },

  addDealItem: (menuItem: MenuItem, selections: DealSelectionStep[]) => {
    // Deal items always create a new cart row (each deal = unique instance)
    const cartKey = `deal-${menuItem.id}-${Date.now()}`
    set((state) => ({
      items: [...state.items, {
        menuItem,
        quantity: 1,
        cartKey,
        is_deal_item: true,
        deal_selections: selections,
      }]
    }))
  },

  removeItem: (cartKey: string) => {
    set((state) => ({
      items: state.items.filter((i) => i.cartKey !== cartKey),
    }))
  },

  updateQuantity: (cartKey: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(cartKey)
      return
    }
    set((state) => ({
      items: state.items.map((i) =>
        i.cartKey === cartKey ? { ...i, quantity } : i
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
    return get().subtotal() * get().vatRate
  },

  discountedTotal: () => {
    return Math.max(0, get().subtotal() + get().vat() - get().discountAmount)
  },

  total: () => {
    return get().discountedTotal()
  },
}))
