import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setApiUrl } from '../services/api'

interface ServerSettings {
  serverUrl: string
  restaurantCode: string
  restaurantId: string | null
  restaurantName: string | null
  currencySymbol: string
  isConfigured: boolean

  save: (serverUrl: string, restaurantCode: string, restaurantId: string, restaurantName: string, currency: string) => void
  reset: () => void
}

export const useServerSettings = create<ServerSettings>()(
  persist(
    (set) => ({
      serverUrl: '',
      restaurantCode: '',
      restaurantId: null,
      restaurantName: null,
      currencySymbol: '£',
      isConfigured: false,

      save: (serverUrl, restaurantCode, restaurantId, restaurantName, currency) => {
        setApiUrl(serverUrl)
        set({ serverUrl, restaurantCode, restaurantId, restaurantName, currencySymbol: currency, isConfigured: true })
      },

      reset: () => set({ serverUrl: '', restaurantCode: '', restaurantId: null, restaurantName: null, isConfigured: false }),
    }),
    { name: 'pos-server-settings' }
  )
)
