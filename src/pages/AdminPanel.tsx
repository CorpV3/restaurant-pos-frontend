import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { api } from '../services/api'
import StatusBar from '../components/common/StatusBar'
import PrinterSettings from '../components/settings/PrinterSettings'
import ReportsPage from './ReportsPage'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string
  name: string
  category: string
  price: number
  description: string | null
  is_available: boolean
  image_url?: string | null
}

interface StaffMember {
  id: string
  username: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
}

type AdminTab = 'menu' | 'staff' | 'reports' | 'settings'

const CATEGORY_OPTIONS = [
  { value: 'appetizer', label: 'Appetizer' },
  { value: 'main_course', label: 'Main Course' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'beverage', label: 'Beverage' },
  { value: 'side_dish', label: 'Side Dish' },
  { value: 'special', label: 'Special' },
]

const ROLE_OPTIONS = [
  { value: 'chef', label: 'Chef' },
  { value: 'staff', label: 'Staff' },
]

// ── Small shared UI ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function InputField({
  label, value, onChange, type = 'text', placeholder, disabled, required, min, minLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  min?: string
  minLength?: number
}) {
  return (
    <div>
      <label className="text-gray-400 text-sm block mb-1">
        {label}{required && <span className="text-orange-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        min={min}
        minLength={minLength}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
      />
    </div>
  )
}

// ── Menu Tab ──────────────────────────────────────────────────────────────────

function MenuTab({ restaurantId, currencySymbol }: { restaurantId: string; currencySymbol: string }) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)

  // Add form state
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('main_course')
  const [addPrice, setAddPrice] = useState('')
  const [addDescription, setAddDescription] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  const fetchItems = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/restaurants/${restaurantId}/menu-items`, {
        params: { limit: 100 },
      })
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.items ?? res.data?.menu_items ?? [])
      setItems(raw)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const toggleAvailability = async (item: MenuItem) => {
    setToggling((prev) => new Set(prev).add(item.id))
    try {
      await api.patch(`/api/v1/restaurants/${restaurantId}/menu-items/${item.id}`, {
        is_available: !item.is_available,
      })
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: !i.is_available } : i))
      )
    } catch (e: any) {
      alert('Failed to update: ' + (e?.response?.data?.detail || e?.message))
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(item.id); return s })
    }
  }

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addName.trim()) { setAddError('Name is required'); return }
    const price = parseFloat(addPrice)
    if (isNaN(price) || price < 0) { setAddError('Enter a valid price'); return }
    setAddLoading(true)
    setAddError('')
    try {
      const res = await api.post(`/api/v1/restaurants/${restaurantId}/menu-items`, {
        name: addName.trim(),
        category: addCategory,
        price,
        description: addDescription.trim() || undefined,
      })
      setItems((prev) => [...prev, res.data])
      setShowAdd(false)
      setAddName(''); setAddCategory('main_course'); setAddPrice(''); setAddDescription('')
    } catch (e: any) {
      setAddError(e?.response?.data?.detail || e?.message || 'Failed to add item')
    }
    setAddLoading(false)
  }

  const grouped = CATEGORY_OPTIONS.reduce<Record<string, MenuItem[]>>((acc, cat) => {
    acc[cat.value] = items.filter((i) => i.category === cat.value)
    return acc
  }, {})

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Menu Items</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg"
        >
          + Add Item
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading menu...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-500 text-center py-12">No menu items yet. Add your first item!</div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_OPTIONS.map(({ value, label }) => {
            const catItems = grouped[value]
            if (catItems.length === 0) return null
            return (
              <div key={value}>
                <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2">{label}</h3>
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  {catItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        idx < catItems.length - 1 ? 'border-b border-gray-700' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${item.is_available ? 'text-white' : 'text-gray-500 line-through'}`}>
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="text-gray-500 text-xs truncate mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 ml-3">
                        <span className="text-orange-400 font-semibold text-sm whitespace-nowrap">
                          {currencySymbol}{Number(item.price).toFixed(2)}
                        </span>
                        <button
                          onClick={() => toggleAvailability(item)}
                          disabled={toggling.has(item.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                            item.is_available ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                          title={item.is_available ? 'Available — click to disable' : 'Unavailable — click to enable'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              item.is_available ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Menu Item" onClose={() => { setShowAdd(false); setAddError('') }}>
          <form onSubmit={handleAddItem} className="space-y-4">
            <InputField label="Name" value={addName} onChange={setAddName} placeholder="e.g. Chicken Tikka" required />
            <div>
              <label className="text-gray-400 text-sm block mb-1">
                Category<span className="text-orange-400 ml-0.5">*</span>
              </label>
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <InputField label="Price" value={addPrice} onChange={setAddPrice} type="number" placeholder="0.00" min="0" required />
            <InputField label="Description" value={addDescription} onChange={setAddDescription} placeholder="Optional description" />
            {addError && <p className="text-red-400 text-sm">{addError}</p>}
            <button
              type="submit"
              disabled={addLoading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold"
            >
              {addLoading ? 'Adding...' : 'Add Item'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── Staff Tab ─────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  chef: 'bg-orange-900/50 text-orange-400',
  staff: 'bg-blue-900/50 text-blue-400',
  restaurant_admin: 'bg-purple-900/50 text-purple-400',
  RESTAURANT_ADMIN: 'bg-purple-900/50 text-purple-400',
  CHEF: 'bg-orange-900/50 text-orange-400',
  STAFF: 'bg-blue-900/50 text-blue-400',
}

function StaffTab({ restaurantId }: { restaurantId: string }) {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editPinStaff, setEditPinStaff] = useState<StaffMember | null>(null)

  // Add form
  const [addFullName, setAddFullName] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState<'chef' | 'staff'>('staff')
  const [addPasscode, setAddPasscode] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit PIN form
  const [newPin, setNewPin] = useState('')
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')

  const fetchStaff = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/auth/staff', {
        params: { restaurant_id: restaurantId },
      })
      const raw: any[] = Array.isArray(res.data) ? res.data : (res.data?.staff ?? res.data?.users ?? [])
      setStaffList(raw)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addFullName.trim()) { setAddError('Full name is required'); return }
    if (!addUsername.trim()) { setAddError('Username is required'); return }
    if (!addEmail.trim()) { setAddError('Email is required'); return }
    if (addPassword.length < 8) { setAddError('Password must be at least 8 characters'); return }
    if (addPasscode && (addPasscode.length !== 4 || !/^\d{4}$/.test(addPasscode))) {
      setAddError('POS passcode must be exactly 4 digits')
      return
    }
    setAddLoading(true)
    setAddError('')
    try {
      const endpoint = addRole === 'chef' ? '/api/v1/auth/staff/chef' : '/api/v1/auth/staff/staff'
      const res = await api.post(endpoint, {
        username: addUsername.trim(),
        email: addEmail.trim(),
        password: addPassword,
        full_name: addFullName.trim(),
        restaurant_id: restaurantId,
        pos_passcode: addPasscode || undefined,
      })
      setStaffList((prev) => [...prev, res.data])
      setShowAdd(false)
      setAddFullName(''); setAddUsername(''); setAddEmail(''); setAddPassword('')
      setAddRole('staff'); setAddPasscode('')
    } catch (e: any) {
      setAddError(e?.response?.data?.detail || e?.message || 'Failed to add staff')
    }
    setAddLoading(false)
  }

  const handleEditPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPinStaff) return
    if (!/^\d{4}$/.test(newPin)) { setPinError('Must be exactly 4 digits'); return }
    setPinLoading(true)
    setPinError('')
    try {
      await api.patch(`/api/v1/auth/users/${editPinStaff.id}`, { pos_passcode: newPin })
      setEditPinStaff(null)
      setNewPin('')
    } catch (e: any) {
      setPinError(e?.response?.data?.detail || e?.message || 'Failed to update PIN')
    }
    setPinLoading(false)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-lg">Staff Members</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg"
        >
          + Add Staff
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading staff...</div>
      ) : staffList.length === 0 ? (
        <div className="text-gray-500 text-center py-12">No staff members yet.</div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {staffList.map((member, idx) => (
            <div
              key={member.id}
              className={`flex items-center justify-between px-4 py-3 ${
                idx < staffList.length - 1 ? 'border-b border-gray-700' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-medium text-sm">{member.full_name || member.username}</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${ROLE_BADGE[member.role] || 'bg-gray-700 text-gray-400'}`}>
                    {member.role.toLowerCase().replace('_', ' ')}
                  </span>
                  {!member.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400">Inactive</span>
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-0.5">{member.username}</p>
              </div>
              <button
                onClick={() => { setEditPinStaff(member); setNewPin(''); setPinError('') }}
                className="ml-3 text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg flex-shrink-0"
              >
                Edit PIN
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAdd && (
        <Modal title="Add Staff Member" onClose={() => { setShowAdd(false); setAddError('') }}>
          <form onSubmit={handleAddStaff} className="space-y-4">
            <InputField label="Full Name" value={addFullName} onChange={setAddFullName} placeholder="Jane Doe" required />
            <InputField label="Username" value={addUsername} onChange={setAddUsername} placeholder="janedoe" required />
            <InputField label="Email" value={addEmail} onChange={setAddEmail} type="email" placeholder="jane@example.com" required />
            <InputField label="Password" value={addPassword} onChange={setAddPassword} type="password" placeholder="Min 8 characters" required minLength={8} />
            <div>
              <label className="text-gray-400 text-sm block mb-1">
                Role<span className="text-orange-400 ml-0.5">*</span>
              </label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as 'chef' | 'staff')}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <InputField
              label="POS Passcode (4 digits, optional)"
              value={addPasscode}
              onChange={(v) => setAddPasscode(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 1234"
            />
            {addError && <p className="text-red-400 text-sm">{addError}</p>}
            <button
              type="submit"
              disabled={addLoading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold"
            >
              {addLoading ? 'Adding...' : 'Add Staff'}
            </button>
          </form>
        </Modal>
      )}

      {/* Edit PIN Modal */}
      {editPinStaff && (
        <Modal
          title={`Edit PIN — ${editPinStaff.full_name || editPinStaff.username}`}
          onClose={() => { setEditPinStaff(null); setNewPin(''); setPinError('') }}
        >
          <form onSubmit={handleEditPin} className="space-y-4">
            <InputField
              label="New 4-digit PIN"
              value={newPin}
              onChange={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 5678"
              required
            />
            {pinError && <p className="text-red-400 text-sm">{pinError}</p>}
            <button
              type="submit"
              disabled={pinLoading || newPin.length !== 4}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-bold"
            >
              {pinLoading ? 'Saving...' : 'Save PIN'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

interface AdminPanelProps {
  onLogout: () => void
}

export default function AdminPanel({ onLogout }: AdminPanelProps) {
  const { restaurant } = useAuthStore()
  const [tab, setTab] = useState<AdminTab>('menu')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'menu', label: 'Menu' },
    { key: 'staff', label: 'Staff' },
    { key: 'reports', label: 'Reports' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-gray-900">
      <StatusBar onLogout={onLogout} />

      {/* Tab bar */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 flex overflow-x-auto">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 whitespace-nowrap ${
              tab === key
                ? 'border-orange-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'menu' && restaurant?.id && (
          <MenuTab restaurantId={restaurant.id} currencySymbol={restaurant.currency_symbol || '£'} />
        )}
        {tab === 'staff' && restaurant?.id && (
          <StaffTab restaurantId={restaurant.id} />
        )}
        {tab === 'reports' && (
          <ReportsPage />
        )}
        {tab === 'settings' && (
          <PrinterSettings />
        )}
        {!restaurant?.id && (
          <div className="flex items-center justify-center h-full text-gray-500">
            No restaurant data available
          </div>
        )}
      </div>
    </div>
  )
}
