interface CategoryBarProps {
  categories: string[]
  active: string
  onSelect: (category: string) => void
}

export default function CategoryBar({
  categories,
  active,
  onSelect,
}: CategoryBarProps) {
  return (
    <div className="flex gap-2 p-3 bg-gray-800 border-b border-gray-700 overflow-x-auto">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            active === cat
              ? 'bg-orange-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
