/**
 * Lightweight store that MenuGrid populates when it loads the menu.
 * Cart reads this to detect deal opportunities without prop-drilling.
 */
import { create } from 'zustand'
import type { MenuItem } from '../types'

interface MenuStore {
  allItems: MenuItem[]
  setItems: (items: MenuItem[]) => void
}

export const useMenuStore = create<MenuStore>((set) => ({
  allItems: [],
  setItems: (items) => set({ allItems: items }),
}))
