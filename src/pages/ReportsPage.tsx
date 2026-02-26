import { useState, useCallback } from 'react'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'
import { useAuthStore } from '../stores/authStore'
import { getReports, type ReportResponse } from '../services/orderService'
import toast from 'react-hot-toast'

type Period = 'daily' | 'weekly' | 'monthly'

function getDateRange(period: Period, offset: number): { start: string; end: string; label: string } {
  const today = new Date()
  if (period === 'daily') {
    const d = subDays(today, -offset)
    const s = format(d, 'yyyy-MM-dd')
    return { start: s, end: s, label: format(d, 'dd MMM yyyy') }
  } else if (period === 'weekly') {
    const base = subDays(today, offset * 7)
    const s = startOfWeek(base, { weekStartsOn: 1 })
    const e = endOfWeek(base, { weekStartsOn: 1 })
    return {
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      label: `${format(s, 'dd MMM')} – ${format(e, 'dd MMM yyyy')}`,
    }
  } else {
    const base = new Date(today.getFullYear(), today.getMonth() - offset, 1)
    const s = startOfMonth(base)
    const e = endOfMonth(base)
    return {
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      label: format(s, 'MMMM yyyy'),
    }
  }
}

export default function ReportsPage() {
  const { restaurant } = useAuthStore()
  const [period, setPeriod] = useState<Period>('daily')
  const [offset, setOffset] = useState(0)
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const { start, end, label } = getDateRange(period, offset)
  const currencySymbol = restaurant?.currency_symbol || '£'

  const loadReport = useCallback(
    async (p: Period, o: number) => {
      if (!restaurant?.id) return
      const range = getDateRange(p, o)
      setLoading(true)
      try {
        const data = await getReports(restaurant.id, range.start, range.end)
        setReport(data)
      } catch {
        toast.error('Failed to load report')
        setReport(null)
      } finally {
        setLoading(false)
      }
    },
    [restaurant?.id]
  )

  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
    setOffset(0)
    loadReport(p, 0)
  }

  const handleNav = (dir: number) => {
    const newOffset = offset - dir
    setOffset(newOffset)
    loadReport(period, newOffset)
  }

  const exportExcel = () => {
    if (!report) return
    const rows = report.orders.map((o) => ({
      'Order ID': o.id.slice(0, 8),
      Date: format(new Date(o.created_at), 'dd/MM/yyyy HH:mm'),
      'Payment Method': o.payment_method || 'unknown',
      'Amount': parseFloat(o.total_amount.toString()).toFixed(2),
    }))
    const summary = [
      { Label: 'Total Orders', Value: report.summary.total_orders },
      { Label: 'Total Revenue', Value: report.summary.total_revenue.toFixed(2) },
      { Label: 'Cash Orders', Value: report.summary.cash_orders },
      { Label: 'Cash Total', Value: report.summary.cash_total.toFixed(2) },
      { Label: 'Card Orders', Value: report.summary.card_orders },
      { Label: 'Card Total', Value: report.summary.card_total.toFixed(2) },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Orders')
    XLSX.writeFile(wb, `report-${start}-to-${end}.xlsx`)
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
      {/* Controls */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700 flex items-center gap-3 flex-wrap">
        {/* Period tabs */}
        <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
          {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePeriodChange(p)}
              className={`px-4 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                period === p ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
          <button onClick={() => handleNav(-1)} className="text-gray-400 hover:text-white px-1 text-lg">‹</button>
          <span className="text-white text-sm font-medium min-w-[160px] text-center">{label}</span>
          <button
            onClick={() => handleNav(1)}
            disabled={offset >= 0}
            className="text-gray-400 hover:text-white px-1 text-lg disabled:opacity-30"
          >›</button>
        </div>

        <button
          onClick={() => loadReport(period, offset)}
          disabled={loading}
          className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load'}
        </button>

        {report && (
          <button
            onClick={exportExcel}
            className="ml-auto px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg flex items-center gap-1.5"
          >
            ⬇ Export Excel
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!report ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <span className="text-4xl mb-3">📊</span>
            <p className="text-lg">Select a period and click Load</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs uppercase tracking-wide">Total Orders</p>
                <p className="text-2xl font-bold text-white mt-1">{report.summary.total_orders}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <p className="text-gray-400 text-xs uppercase tracking-wide">Revenue</p>
                <p className="text-2xl font-bold text-orange-400 mt-1">
                  {currencySymbol}{report.summary.total_revenue.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-green-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide">Cash</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {currencySymbol}{report.summary.cash_total.toFixed(2)}
                </p>
                <p className="text-gray-500 text-xs">{report.summary.cash_orders} orders</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-blue-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide">Card</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">
                  {currencySymbol}{report.summary.card_total.toFixed(2)}
                </p>
                <p className="text-gray-500 text-xs">{report.summary.card_orders} orders</p>
              </div>
            </div>

            {/* Orders table */}
            {report.orders.length === 0 ? (
              <div className="text-center text-gray-500 py-12">No orders for this period</div>
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-gray-400 px-4 py-3 font-medium">Order ID</th>
                      <th className="text-left text-gray-400 px-4 py-3 font-medium">Time</th>
                      <th className="text-left text-gray-400 px-4 py-3 font-medium">Payment</th>
                      <th className="text-right text-gray-400 px-4 py-3 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o, i) => (
                      <tr key={o.id} className={i % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{o.id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-gray-300">
                          {format(new Date(o.created_at), 'HH:mm')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            o.payment_method === 'cash'
                              ? 'bg-green-900/50 text-green-400'
                              : o.payment_method === 'card'
                              ? 'bg-blue-900/50 text-blue-400'
                              : 'bg-gray-700 text-gray-400'
                          }`}>
                            {o.payment_method || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-orange-400 font-medium">
                          {currencySymbol}{parseFloat(o.total_amount.toString()).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
