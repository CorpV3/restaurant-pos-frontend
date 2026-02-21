import { create } from 'zustand'
import { login as apiLogin, logout as apiLogout } from '../services/authService'

interface User {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string
  restaurant_id: string | null
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  restoreSession: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await apiLogin(username, password)

      // Store tokens
      localStorage.setItem('pos_access_token', res.access_token)
      localStorage.setItem('pos_refresh_token', res.refresh_token)
      localStorage.setItem('pos_user', JSON.stringify(res.user))

      // Store restaurant_id separately for easy access
      if (res.user.restaurant_id) {
        localStorage.setItem('pos_restaurant_id', res.user.restaurant_id)
      }

      set({
        user: res.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
      return true
    } catch (err: any) {
      const message =
        err.response?.data?.detail || err.message || 'Login failed'
      set({ isLoading: false, error: message })
      return false
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem('pos_refresh_token')
    if (refreshToken) {
      try {
        await apiLogout(refreshToken)
      } catch {
        // Ignore logout API errors
      }
    }
    localStorage.removeItem('pos_access_token')
    localStorage.removeItem('pos_refresh_token')
    localStorage.removeItem('pos_user')
    localStorage.removeItem('pos_restaurant_id')
    set({ user: null, isAuthenticated: false, error: null })
  },

  restoreSession: () => {
    const token = localStorage.getItem('pos_access_token')
    const userStr = localStorage.getItem('pos_user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, isAuthenticated: true })
      } catch {
        // Invalid stored data
      }
    }
  },
}))
