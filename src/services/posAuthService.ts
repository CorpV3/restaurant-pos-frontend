import { api } from './api'

export interface POSStaffMember {
  id: string
  full_name: string
  role: string
}

export async function fetchPOSStaff(restaurantId: string): Promise<POSStaffMember[]> {
  const res = await api.get(`/api/v1/auth/pos/staff?restaurant_id=${restaurantId}`)
  return res.data
}

export async function posPasscodeLogin(restaurantId: string, passcode: string) {
  const res = await api.post('/api/v1/auth/pos/login', { restaurant_id: restaurantId, passcode })
  return res.data // { access_token, refresh_token, user }
}

export async function resolveRestaurantByCode(code: string, token: string) {
  // Try by restaurant_id first if code looks like UUID prefix, else fetch all
  const res = await api.get('/api/v1/restaurants', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const restaurants: any[] = res.data
  const clean = code.replace(/-/g, '').toLowerCase()
  return restaurants.find((r: any) =>
    r.id.replace(/-/g, '').toLowerCase().startsWith(clean)
  ) ?? null
}
