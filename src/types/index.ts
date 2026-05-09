export interface DealComponent {
  step: number
  label: string
  qty: number
  type: 'category' | 'items'
  value: string | string[]
}

export interface DealSelectionStep {
  step: number
  label: string
  item_id?: string
  item_name?: string
  item_ids?: string[]
  item_names?: string[]
}

export interface MenuItem {
  id: string
  name: string
  price: number
  category: string
  icon: string
  imageUrl?: string
  available: boolean
  is_deal?: boolean
  deal_components?: DealComponent[]
  // raw backend list for deal picker (items belonging to a category/specific list)
  _rawDealItems?: BackendMenuItemRef[]
}

export interface BackendMenuItemRef {
  id: string
  name: string
  price: number
  category: string
  is_available: boolean
}

export interface CartItem {
  menuItem: MenuItem
  quantity: number
  notes?: string
  is_deal_item?: boolean
  deal_selections?: DealSelectionStep[]
  cartKey?: string  // unique key so two of same deal can both be in cart
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
