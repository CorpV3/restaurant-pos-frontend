import { api } from './api'

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: {
    id: string
    username: string
    email: string
    full_name: string | null
    phone: string | null
    role: 'master_admin' | 'restaurant_admin' | 'chef' | 'customer'
    restaurant_id: string | null
    is_active: boolean
    is_verified: boolean
  }
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post('/api/v1/auth/login', { username, password })
  return res.data
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('/api/v1/auth/logout', { refresh_token: refreshToken })
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await api.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
  return res.data.access_token
}
