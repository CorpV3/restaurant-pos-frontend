import { api } from './api'

export interface Table {
  id: string
  table_number: number
  capacity: number
  status: string
}

export async function fetchTables(restaurantId: string): Promise<Table[]> {
  const res = await api.get(`/api/v1/restaurants/${restaurantId}/tables`)
  return Array.isArray(res.data) ? res.data : []
}
