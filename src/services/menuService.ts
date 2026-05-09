import { api } from './api'

export interface BackendMenuItem {
  id: string
  restaurant_id: string
  name: string
  description: string | null
  category: 'appetizer' | 'main_course' | 'dessert' | 'beverage' | 'side_dish' | 'special'
  price: number
  image_url: string | null
  is_available: boolean
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  preparation_time: number | null
  calories: number | null
  ingredients: string[]
  allergens: string[]
  display_order: number
  is_deal?: boolean
  deal_components?: {
    step: number
    label: string
    qty: number
    type: 'category' | 'items'
    value: string | string[]
  }[]
}

// Map backend categories to POS display categories
const CATEGORY_MAP: Record<string, string> = {
  appetizer: 'Starters',
  main_course: 'Mains',
  dessert: 'Desserts',
  beverage: 'Drinks',
  side_dish: 'Sides',
  special: 'Specials',
}

// Category icons fallback
const CATEGORY_ICONS: Record<string, string> = {
  appetizer: '🥗',
  main_course: '🍽️',
  dessert: '🍰',
  beverage: '🥤',
  side_dish: '🍟',
  special: '⭐',
}

export async function fetchMenuItems(restaurantId: string): Promise<BackendMenuItem[]> {
  const res = await api.get(`/api/v1/restaurants/${restaurantId}/menu-items`, {
    params: { is_available: true, limit: 100 },
  })
  return res.data
}

export async function fetchMenuByCategory(
  restaurantId: string,
  category: string
): Promise<BackendMenuItem[]> {
  const res = await api.get(
    `/api/v1/restaurants/${restaurantId}/menu-items/category/${category}`
  )
  return res.data
}

export function mapBackendCategory(category: string): string {
  return CATEGORY_MAP[category] || category
}

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || '🍽️'
}

export function getUniqueCategories(items: BackendMenuItem[]): string[] {
  const cats = new Set(items.map((i) => mapBackendCategory(i.category)))
  return ['All', ...Array.from(cats)]
}
