'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import type { EventRecord } from '@/lib/types'

interface SearchPageProps {
  onNavigate: (page: string) => void
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all'

export default function SearchPage({ onNavigate }: SearchPageProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventRecord[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)


  const getDateRange = useCallback((p: Period): { start: number; end: number } => {
    const now = Date.now()
    const d = new Date()
    switch (p) {
      case 'today': return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), end: now }
      case 'week': return { start: now - 7 * 86400000, end: now }
      case 'month': return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: now }
      case 'year': return { start: new Date(d.getFullYear(), 0, 1).getTime(), end: now }
      case 'all': return { start: 0, end: now }
    }
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(period)
      let events = await db.events
        .where('timestamp')
        .between(start, end)
        .reverse()
        .toArray()

      // Type filter
      if (typeFilter !== 'all') {
        events = events.filter(e => e.type === typeFilter)
      }

      // Text search
      if (query.trim()) {
        const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        events = events.filter(e => {
          const searchable = [
            e.category, e.subtype, e.vendor, e.client,
            e.note, e.payment_method, e.vehicle_id
          ].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          return searchable.includes(q)
        })
      }

      setResults(events.slice(0, 100))
      setTotal(events.reduce((s, e) => s + e.amount, 0))
    } catch (e) {
      console.error('Search error:', e)
    } finally {
      setLoading(false)
    }
  }, [query, period, typeFilter, getDateRange])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(search, 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getPaymentLabel = (m: string | undefined) => {
    if (!m || m.trim() === '') return ''
    const labels: Record<string, string> = { cash: 'Efectivo', ath_movil: 'ATH Móvil', paypal: 'PayPal' }
    const key = m.trim().toLowerCase()
    return labels[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">🔍 Buscar</h1>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬 Chat</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Search Input */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar: subway, caridad, f150, sams..."
          className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
          autoFocus
        />

        {/* Period Filters */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {([
            ['today', 'Hoy'],
            ['week', 'Semana'],
            ['month', 'Mes'],
            ['year', 'Año'],
            ['all', 'Todo']
          ] as [Period, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                period === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#111a2e] text-gray-400 border border-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex gap-2 mt-2">
          {([
            ['all', 'Todos'],
            ['expense', '↓ Gastos'],
            ['income', '↑ Ingresos']
          ] as ['all' | 'expense' | 'income', string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === key
                  ? key === 'expense' ? 'bg-red-600/30 text-red-400 border border-red-500/30'
                    : key === 'income' ? 'bg-green-600/30 text-green-400 border border-green-500/30'
                    : 'bg-blue-600 text-white'
                  : 'bg-[#111a2e] text-gray-400 border border-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results Summary */}
        <div className="flex justify-between items-center mt-4 mb-2 text-sm">
          <span className="text-gray-400">{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
          <span className="font-medium text-gray-300">Total: {fmt(total)}</span>
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Buscando...</div>
        ) : results.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No se encontraron resultados</div>
        ) : (
          <div className="space-y-1">
            {results.map((e, i) => (
              <div key={e.id || i} className="bg-[#111a2e] rounded-lg p-3 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      e.type === 'income' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                      {e.type === 'income' ? '↑' : '↓'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-200 truncate">{e.category || e.subtype || 'Sin categoría'}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[e.vendor, e.client, e.note].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={`font-medium text-sm ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>{fmt(e.amount)}</p>
                    <p className="text-xs text-gray-500">{fmtDate(e.timestamp)}</p>
                  </div>
                </div>
                {e.payment_method && (
                  <p className="text-xs text-gray-500 mt-1">💳 {getPaymentLabel(e.payment_method)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}