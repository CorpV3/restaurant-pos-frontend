import { create } from 'zustand'
import { login as apiLogin, logout as apiLogout } from '../services/authService'
import { api } from '../services/api'

interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string
  restaurant_id: string | null
}

interface Restaurant {
  id: string
  name: string
  slug: string
  currency_symbol: string
  currency_code: string
  theme_color: string
}

interface AuthStore {
  user: User | null
  restaurant: Restaurant | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string, restaurantCode: string) => Promise<boolean>
  logout: () => Promise<void>
  restoreSession: () => void
}

async function resolveRestaurant(restaurantCode: string, token: string, userRestaurantId: string | null): Promise<Restaurant | null> {
  try {
    // Fetch all restaurants to find match by 5-char prefix
    const res = await api.get('/api/v1/restaurants', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const restaurants: Restaurant[] = res.data

    const match = restaurants.find((r) =>
      r.id.replace(/-/g, '').startsWith(restaurantCode.toLowerCase()) ||
      r.id.startsWith(restaurantCode.toLowerCase())
    )

    if (!match) return null

    // If user has a restaurant_id, verify it matches
    if (userRestaurantId && match.id !== userRestaurantId) {
      return null // Wrong restaurant for this staff member
    }

    return match
  } catch {
    // If restaurants endpoint fails, try to use user's restaurant_id directly
    if (userRestaurantId) {
      try {
        const res = await api.get(`/api/v1/restaurants/${userRestaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const r = res.data
        if (r.id.replace(/-/g, '').startsWith(restaurantCode.toLowerCase()) ||
            r.id.startsWith(restaurantCode.toLowerCase())) {
          return r
        }
      } catch {
        return null
      }
    }
    return null
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  restaurant: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username: string, password: string, restaurantCode: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await apiLogin(username, password)

      // Resolve restaurant from 5-char code
      const restaurant = await resolveRestaurant(
        restaurantCode,
        res.access_token,
        res.user.restaurant_id
      )

      if (!restaurant) {
        set({
          isLoading: false,
          error: `Restaurant code "${restaurantCode.toUpperCase()}" not found or you don't have access to it`,
        })
        return false
      }

      // Store tokens and data
      localStorage.setItem('pos_access_token', res.access_token)
      localStorage.setItem('pos_refresh_token', res.refresh_token)
      localStorage.setItem('pos_user', JSON.stringify(res.user))
      localStorage.setItem('pos_restaurant_id', restaurant.id)
      localStorage.setItem('pos_restaurant', JSON.stringify(restaurant))

      set({
        user: res.user,
        restaurant,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
      return true
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || 'Login failed'
      set({ isLoading: false, error: message })
      return false
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('pos_refresh_token')
    if (refreshToken) {
      try { await apiLogout(refreshToken) } catch { /* ignore */ }
    }
    localStorage.removeItem('pos_access_token')
    localStorage.removeItem('pos_refresh_token')
    localStorage.removeItem('pos_user')
    localStorage.removeItem('pos_restaurant_id')
    localStorage.removeItem('pos_restaurant')
    set({ user: null, restaurant: null, isAuthenticated: false, error: null })
  },

  restoreSession: () => {
    const token = localStorage.getItem('pos_access_token')
    const userStr = localStorage.getItem('pos_user')
    const restaurantStr = localStorage.getItem('pos_restaurant')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        const restaurant = restaurantStr ? JSON.parse(restaurantStr) : null
        set({ user, restaurant, isAuthenticated: true })
      } catch { /* ignore */ }
    }
  },
}))
