'use client'

import { useState } from 'react'
import { db } from '@/lib/db'

interface SearchPageProps {
  onNavigate: (page: string) => void
}

interface SearchResult {
  type: 'event' | 'client' | 'invoice' | 'note' | 'appointment'
  id: number
  title: string
  subtitle: string
  amount?: number
  date: number
}

export default function SearchPage({ onNavigate }: SearchPageProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    setSearched(true)
    const q = query.toLowerCase()
    const found: SearchResult[] = []

    try {
      // Search events
      const events = await db.events.toArray()
      events.forEach(e => {
        const match = 
          e.category?.toLowerCase().includes(q) ||
          e.vendor?.toLowerCase().includes(q) ||
          e.client?.toLowerCase().includes(q) ||
          e.note?.toLowerCase().includes(q) ||
          e.payment_method?.toLowerCase().includes(q)
        
        if (match) {
          found.push({
            type: 'event',
            id: e.id!,
            title: `${e.type === 'income' ? '💰' : '💸'} ${e.category}`,
            subtitle: e.vendor || e.client || e.note || '',
            amount: e.amount,
            date: e.timestamp
          })
        }
      })

      // Search clients
      const clients = await db.clients.toArray()
      clients.forEach(c => {
        const match = 
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q)
        
        if (match) {
          found.push({
            type: 'client',
            id: c.id!,
            title: `👤 ${c.first_name} ${c.last_name}`,
            subtitle: c.phone || c.email || c.type,
            date: c.created_at
          })
        }
      })

      // Search invoices
      const invoices = await db.invoices.toArray()
      invoices.forEach(i => {
        const match = 
          i.client_name?.toLowerCase().includes(q) ||
          i.invoice_number?.toLowerCase().includes(q) ||
          i.notes?.toLowerCase().includes(q)
        
        if (match) {
          found.push({
            type: 'invoice',
            id: i.id!,
            title: `🧾 ${i.invoice_number}`,
            subtitle: i.client_name,
            amount: i.total,
            date: i.issue_date
          })
        }
      })

      // Search notes
      const notes = await db.notes.toArray()
      notes.forEach(n => {
        const match = 
          n.title?.toLowerCase().includes(q) ||
          n.content?.toLowerCase().includes(q)
        
        if (match) {
          found.push({
            type: 'note',
            id: n.id!,
            title: `📝 ${n.title || 'Nota'}`,
            subtitle: n.content.substring(0, 50) + '...',
            date: n.timestamp
          })
        }
      })

      // Search appointments
      const appts = await db.appointments.toArray()
      appts.forEach(a => {
        const match = 
          a.title?.toLowerCase().includes(q) ||
          a.client_name?.toLowerCase().includes(q) ||
          a.location?.toLowerCase().includes(q) ||
          a.notes?.toLowerCase().includes(q)
        
        if (match) {
          found.push({
            type: 'appointment',
            id: a.id!,
            title: `📅 ${a.title}`,
            subtitle: a.client_name || a.location || '',
            date: a.date
          })
        }
      })

      // Sort by date descending
      found.sort((a, b) => b.date - a.date)
      setResults(found)

    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('es-PR', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'event': return 'bg-blue-900/50 text-blue-400'
      case 'client': return 'bg-green-900/50 text-green-400'
      case 'invoice': return 'bg-yellow-900/50 text-yellow-400'
      case 'note': return 'bg-purple-900/50 text-purple-400'
      case 'appointment': return 'bg-orange-900/50 text-orange-400'
      default: return 'bg-gray-900/50 text-gray-400'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'event': return 'Evento'
      case 'client': return 'Cliente'
      case 'invoice': return 'Factura'
      case 'note': return 'Nota'
      case 'appointment': return 'Cita'
      default: return type
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🔍 Buscar</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      {/* Search Input */}
      <div className="p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Buscar clientes, gastos, facturas, notas..."
            className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? '⏳' : '🔍'}
          </button>
        </div>

        {/* Quick Searches */}
        <div className="flex flex-wrap gap-2 mt-3">
          {['gasolina', 'materiales', 'comida', 'pendiente'].map(term => (
            <button
              key={term}
              onClick={() => { setQuery(term); }}
              className="bg-[#111a2e] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-[#1a2332]"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="px-4 pb-20">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-gray-400">Buscando...</p>
          </div>
        ) : searched && results.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🔍</p>
            <p>No se encontraron resultados para "{query}"</p>
          </div>
        ) : results.length > 0 ? (
          <>
            <p className="text-sm text-gray-400 mb-3">{results.length} resultado{results.length !== 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {results.map((r, idx) => (
                <div 
                  key={`${r.type}-${r.id}-${idx}`}
                  className="bg-[#111a2e] rounded-xl p-3 border border-white/5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(r.type)}`}>
                          {getTypeLabel(r.type)}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(r.date)}</span>
                      </div>
                      <p className="text-gray-200 font-medium">{r.title}</p>
                      {r.subtitle && <p className="text-xs text-gray-500 mt-0.5">{r.subtitle}</p>}
                    </div>
                    {r.amount !== undefined && (
                      <p className="text-lg font-bold text-gray-300">{formatCurrency(r.amount)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🔍</p>
            <p>Escribe algo para buscar</p>
          </div>
        )}
      </div>
    </div>
  )
}