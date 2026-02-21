import axios from 'axios'

const DEFAULT_API_URL = 'http://localhost:8000'

function getApiUrl(): string {
  try {
    return localStorage.getItem('pos_api_url') || DEFAULT_API_URL
  } catch {
    return DEFAULT_API_URL
  }
}

export const api = axios.create({
  baseURL: getApiUrl(),
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  config.baseURL = getApiUrl()
  return config
})

// Handle 401 - try refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('pos_refresh_token')
      if (refreshToken) {
        try {
          const res = await axios.post(`${getApiUrl()}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          })
          const { access_token } = res.data
          localStorage.setItem('pos_access_token', access_token)
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        } catch {
          // Refresh failed - clear tokens
          localStorage.removeItem('pos_access_token')
          localStorage.removeItem('pos_refresh_token')
          window.location.reload()
        }
      }
    }
    return Promise.reject(error)
  }
)

export function setApiUrl(url: string) {
  localStorage.setItem('pos_api_url', url)
}

export function getStoredApiUrl(): string {
  return getApiUrl()
}
