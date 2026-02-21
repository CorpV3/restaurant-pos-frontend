export interface MenuItem {
  id: string
  name: string
  price: number
  category: string
  icon: string
  available: boolean
}

export interface CartItem {
  menuItem: MenuItem
  quantity: number
  notes?: string
}

export interface Order {
  id: string
  items: CartItem[]
  subtotal: number
  vat: number
  total: number
  paymentMethod?: 'cash' | 'card' | 'gift_card' | 'voucher'
  status: 'pending' | 'paid' | 'cancelled'
  createdAt: string
  synced: boolean
}

export interface StaffMember {
  id: string
  name: string
  pin: string
  role: 'cashier' | 'manager' | 'admin'
}
