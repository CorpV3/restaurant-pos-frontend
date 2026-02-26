import { api } from './api'
import type { CartItem } from '../types'

export interface CreateOrderPayload {
  restaurant_id: string
  table_id?: string | null
  items: {
    menu_item_id: string
    quantity: number
    unit_price: number
  }[]
  customer_notes?: string
}

export interface OrderResponse {
  id: string
  status: string
  total_amount: number
  restaurant_id: string
  table_id?: string | null
  items: unknown[]
  created_at: string
}

export async function createOrder(
  cartItems: CartItem[],
  restaurantId: string,
  tableId: string | null
): Promise<OrderResponse> {
  const payload: CreateOrderPayload = {
    restaurant_id: restaurantId,
    table_id: tableId || null,
    items: cartItems.map((ci) => ({
      menu_item_id: ci.menuItem.id,
      quantity: ci.quantity,
      unit_price: ci.menuItem.price,
    })),
  }
  const res = await api.post('/api/v1/orders', payload)
  return res.data
}

export async function completeOrder(
  orderId: string,
  paymentMethod: 'cash' | 'card'
): Promise<void> {
  await api.patch(`/api/v1/orders/${orderId}/status`, {
    status: 'completed',
    payment_method: paymentMethod,
  })
}

export interface ReportSummary {
  total_orders: number
  total_revenue: number
  cash_orders: number
  cash_total: number
  card_orders: number
  card_total: number
}

export interface ReportOrder {
  id: string
  created_at: string
  total_amount: number
  payment_method: string | null
  status: string
}

export interface ReportResponse {
  summary: ReportSummary
  orders: ReportOrder[]
}

export async function getReports(
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<ReportResponse> {
  const res = await api.get(
    `/api/v1/restaurants/${restaurantId}/analytics/reports`,
    { params: { start_date: startDate, end_date: endDate } }
  )
  return res.data
}
