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

export interface PendingOrderItem {
  id: string
  menu_item_id: string
  menu_item_name: string
  quantity: number
  unit_price: number
}

export interface PendingOrder {
  id: string
  status: string
  total_amount: number
  table_id: string | null
  table?: { id: string; table_number: string | number; status: string } | null
  created_at: string
  items: PendingOrderItem[]
}

export async function fetchPendingOrders(restaurantId: string): Promise<PendingOrder[]> {
  // Fetch orders and tables in parallel
  const [ordersRes, tablesRes] = await Promise.all([
    api.get(`/api/v1/restaurants/${restaurantId}/orders`, {
      params: { status: 'served', limit: 50 },
    }),
    api.get(`/api/v1/restaurants/${restaurantId}/tables`).catch(() => ({ data: [] })),
  ])

  const raw: any[] = Array.isArray(ordersRes.data) ? ordersRes.data : (ordersRes.data?.orders ?? [])
  const tables: any[] = Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.tables ?? [])
  const tableMap = Object.fromEntries(tables.map((t) => [t.id, t]))

  return raw.map((o) => {
    const tableData = o.table_id ? tableMap[o.table_id] : null
    return {
      id: o.id,
      status: o.status,
      total_amount: o.total_amount ?? o.total ?? 0,
      table_id: o.table_id ?? null,
      table: tableData
        ? { id: tableData.id, table_number: tableData.table_number, status: tableData.status }
        : null,
      created_at: o.created_at,
      items: (o.items ?? []).map((item: any) => ({
        id: item.id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_item_name ?? item.item_name ?? 'Unknown',
        quantity: item.quantity,
        unit_price: item.unit_price ?? item.item_price ?? 0,
      })),
    }
  })
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
