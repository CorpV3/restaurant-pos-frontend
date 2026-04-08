import { useState, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { fetchMenuItems, mapBackendCategory, getCategoryIcon } from '../../services/menuService'
import type { MenuItem, DealComponent, DealSelectionStep } from '../../types'
import type { BackendMenuItem } from '../../services/menuService'

function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (path.startsWith('http')) return path
  const base = localStorage.getItem('pos_api_url') || 'http://localhost:8000'
  return `${base}${path}`
}

const DEMO_MENU: MenuItem[] = [
  { id: '1', name: 'Fish & Chips', price: 12.99, category: 'Mains', icon: '', available: true },
  { id: '2', name: 'Burger', price: 10.99, category: 'Mains', icon: '', available: true },
  { id: '3', name: 'Pizza', price: 11.99, category: 'Mains', icon: '', available: true },
  { id: '4', name: 'Chicken Wings', price: 7.99, category: 'Starters', icon: '', available: true },
  { id: '5', name: 'Garlic Bread', price: 4.99, category: 'Starters', icon: '', available: true },
  { id: '6', name: 'Chips', price: 3.99, category: 'Sides', icon: '', available: true },
  { id: '7', name: 'Cola', price: 2.50, category: 'Drinks', icon: '', available: true },
  { id: '8', name: 'Beer', price: 4.99, category: 'Drinks', icon: '', available: true },
  { id: '9', name: 'Ice Cream', price: 4.99, category: 'Desserts', icon: '', available: true },
  { id: '10', name: 'Cake', price: 5.99, category: 'Desserts', icon: '', available: true },
]

function mapBackendToMenuItem(item: BackendMenuItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    category: mapBackendCategory(item.category),
    icon: getCategoryIcon(item.category),
    available: item.is_available,
    imageUrl: resolveImageUrl(item.image_url),
    is_deal: item.is_deal ?? false,
    deal_components: item.deal_components as DealComponent[] | undefined,
  }
}

interface MenuGridProps {
  category: string
  onCategoriesLoaded?: (categories: string[]) => void
}

export default function MenuGrid({ category, onCategoriesLoaded }: MenuGridProps) {
  const addItem = useCartStore((s) => s.addItem)
  const addDealItem = useCartStore((s) => s.addDealItem)
  const user = useAuthStore((s) => s.user)
  const [animatingId, setAnimatingId] = useState<string | null>(null)
  const [menuItems, setMenuItems] = useState<MenuItem[]>(DEMO_MENU)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Deal picker state
  const [dealPickerItem, setDealPickerItem] = useState<MenuItem | null>(null)
  const [dealStepIndex, setDealStepIndex] = useState(0)
  const [dealSelections, setDealSelections] = useState<DealSelectionStep[]>([])
  const [stepSelected, setStepSelected] = useState<string[]>([])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const loadMenu = async () => {
      const restaurantId = user?.restaurant_id || localStorage.getItem('pos_restaurant_id')
      if (!restaurantId || !isOnline) return

      setIsLoading(true)
      try {
        const items = await fetchMenuItems(restaurantId)
        const mapped = items.map(mapBackendToMenuItem)
        if (mapped.length > 0) {
          setMenuItems(mapped)
          localStorage.setItem('pos_cached_menu', JSON.stringify(mapped))
          const cats = new Set(mapped.map((m) => m.category))
          onCategoriesLoaded?.(['All', ...Array.from(cats)])
        }
      } catch (err) {
        console.error('Failed to fetch menu, using cached/demo:', err)
        const cached = localStorage.getItem('pos_cached_menu')
        if (cached) {
          try { setMenuItems(JSON.parse(cached)) } catch { /* use demo */ }
        }
      } finally {
        setIsLoading(false)
      }
    }
    loadMenu()
  }, [user?.restaurant_id, isOnline, onCategoriesLoaded])

  const filteredMenu = category === 'All'
    ? menuItems
    : menuItems.filter((item) => item.category === category)

  // ── Deal picker helpers ──────────────────────────────────────────────────

  function getItemsForStep(step: DealComponent): MenuItem[] {
    if (step.type === 'category') {
      const displayCat = mapBackendCategory(step.value as string)
      return menuItems.filter((i) => !i.is_deal && i.category === displayCat && i.available)
    } else {
      const ids = step.value as string[]
      return menuItems.filter((i) => ids.includes(i.id) && i.available)
    }
  }

  function openDealPicker(item: MenuItem) {
    setDealPickerItem(item)
    setDealStepIndex(0)
    setDealSelections([])
    setStepSelected([])
  }

  function closeDealPicker() {
    setDealPickerItem(null)
    setDealSelections([])
    setStepSelected([])
  }

  function toggleStepItem(itemId: string, maxQty: number) {
    setStepSelected((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId)
      if (maxQty === 1) return [itemId]        // radio
      if (prev.length >= maxQty) return prev   // at limit
      return [...prev, itemId]
    })
  }

  function handleDealStepNext() {
    if (!dealPickerItem?.deal_components) return
    const step = dealPickerItem.deal_components[dealStepIndex]
    const selectedItems = menuItems.filter((i) => stepSelected.includes(i.id))

    let sel: DealSelectionStep
    if (step.qty === 1) {
      sel = {
        step: step.step,
        label: step.label,
        item_id: stepSelected[0],
        item_name: selectedItems[0]?.name,
      }
    } else {
      sel = {
        step: step.step,
        label: step.label,
        item_ids: stepSelected,
        item_names: selectedItems.map((i) => i.name),
      }
    }

    const newSelections = [...dealSelections, sel]

    if (dealStepIndex + 1 >= dealPickerItem.deal_components.length) {
      // All steps done — add deal to cart
      addDealItem(dealPickerItem, newSelections)
      setAnimatingId(dealPickerItem.id)
      setTimeout(() => setAnimatingId(null), 300)
      closeDealPicker()
    } else {
      setDealSelections(newSelections)
      setDealStepIndex(dealStepIndex + 1)
      setStepSelected([])
    }
  }

  function handleDealStepBack() {
    if (dealStepIndex === 0) {
      closeDealPicker()
      return
    }
    setDealSelections((prev) => prev.slice(0, -1))
    setDealStepIndex(dealStepIndex - 1)
    setStepSelected([])
  }

  // ────────────────────────────────────────────────────────────────────────

  const handleItemClick = (item: MenuItem) => {
    if (item.is_deal && item.deal_components && item.deal_components.length > 0) {
      openDealPicker(item)
    } else {
      addItem(item)
      setAnimatingId(item.id)
      setTimeout(() => setAnimatingId(null), 300)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-400">Loading menu...</p>
        </div>
      </div>
    )
  }

  const currentStep = dealPickerItem?.deal_components?.[dealStepIndex]
  const stepItems = currentStep ? getItemsForStep(currentStep) : []
  const canProceed = currentStep ? stepSelected.length >= currentStep.qty : false

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filteredMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`flex flex-col items-center justify-center bg-gray-800 hover:bg-gray-700 border rounded-xl p-3 h-[150px] transition-all active:scale-95 relative ${
                item.is_deal
                  ? 'border-orange-600/70 hover:border-orange-400'
                  : 'border-gray-700 hover:border-orange-500'
              } ${animatingId === item.id ? 'menu-item-pop menu-item-glow' : ''}`}
            >
              {item.is_deal && (
                <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                  DEAL
                </span>
              )}
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="w-14 h-14 object-cover rounded-lg mb-2"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fb = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fb) fb.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-14 h-14 rounded-lg mb-2 bg-orange-500/20 border border-orange-500/30 items-center justify-center text-orange-400 text-lg font-bold"
                style={{ display: item.imageUrl ? 'none' : 'flex' }}
              >
                {item.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-white text-center leading-tight line-clamp-2">
                {item.name}
              </span>
              <span className="text-orange-400 font-bold text-xs mt-1">
                {'\u00a3'}{item.price.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Deal Picker Wizard Modal */}
      {dealPickerItem && currentStep && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-white font-bold text-lg">{dealPickerItem.name}</h2>
                <button onClick={closeDealPicker} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
              </div>
              <p className="text-orange-400 text-sm font-medium">
                {'\u00a3'}{dealPickerItem.price.toFixed(2)} deal
              </p>
              {/* Step progress */}
              <div className="flex gap-1.5 mt-3">
                {dealPickerItem.deal_components!.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i < dealStepIndex ? 'bg-orange-500' : i === dealStepIndex ? 'bg-orange-400' : 'bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Step label */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-white font-semibold">{currentStep.label}</p>
              <p className="text-gray-400 text-sm">
                Choose {currentStep.qty} item{currentStep.qty > 1 ? 's' : ''}
                {' '}({stepSelected.length}/{currentStep.qty} selected)
              </p>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
              {stepItems.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">No items available for this step</p>
              ) : (
                stepItems.map((item) => {
                  const selected = stepSelected.includes(item.id)
                  const atMax = !selected && stepSelected.length >= currentStep.qty
                  return (
                    <button
                      key={item.id}
                      onClick={() => !atMax && toggleStepItem(item.id, currentStep.qty)}
                      className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-all text-left ${
                        selected
                          ? 'bg-orange-500/20 border-orange-500 text-white'
                          : atMax
                            ? 'bg-gray-700/50 border-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
                      }`}
                    >
                      <span className="font-medium text-sm">{item.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {selected && (
                          <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">✓</span>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Navigation */}
            <div className="p-4 border-t border-gray-700 flex gap-3">
              <button
                onClick={handleDealStepBack}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl font-medium"
              >
                {dealStepIndex === 0 ? 'Cancel' : '← Back'}
              </button>
              <button
                onClick={handleDealStepNext}
                disabled={!canProceed}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${
                  canProceed
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {dealStepIndex + 1 >= (dealPickerItem.deal_components?.length ?? 1)
                  ? 'Add to Order'
                  : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
