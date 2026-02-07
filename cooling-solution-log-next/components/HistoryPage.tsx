'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import type { EventRecord } from '@/lib/types'

interface HistoryPageProps {
  onNavigate: (page: string) => void
}

export default function HistoryPage({ onNavigate }: HistoryPageProps) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [categories, setCategories] = useState<string[]>([])
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const allEvents = await db.events.orderBy('timestamp').reverse().toArray()
      setEvents(allEvents)
      
      // Get unique categories
      const uniqueCats = [...new Set(allEvents.map(e => e.category).filter(Boolean))]
      setCategories(uniqueCats as string[])
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    
    try {
      await db.events.delete(id)
      setEvents(prev => prev.filter(e => e.id !== id))
      setSelectedEvent(null)
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Error al eliminar')
    }
  }

  const filteredEvents = events.filter(e => {
    if (filter !== 'all' && e.type !== filter) return false
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
    return true
  })

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`

  // Group by date
  const groupedEvents: Record<string, EventRecord[]> = {}
  filteredEvents.forEach(e => {
    const dateKey = new Date(e.timestamp).toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (!groupedEvents[dateKey]) groupedEvents[dateKey] = []
    groupedEvents[dateKey].push(e)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400">Cargando historial...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📜 Historial</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      {/* Filters */}
      <div className="p-4 space-y-3">
        {/* Type Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('expense')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              filter === 'expense' ? 'bg-red-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'
            }`}
          >
            Gastos
          </button>
          <button
            onClick={() => setFilter('income')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              filter === 'income' ? 'bg-green-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'
            }`}
          >
            Ingresos
          </button>
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Todas las categorías</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Summary */}
        <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total registros:</span>
            <span className="font-medium">{filteredEvents.length}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Total monto:</span>
            <span className="font-medium">
              {formatCurrency(filteredEvents.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="px-4 pb-20">
        {Object.entries(groupedEvents).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">📋</p>
            <p>No hay registros</p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([date, dayEvents]) => (
            <div key={date} className="mb-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2 capitalize">{date}</h3>
              <div className="space-y-2">
                {dayEvents.map(e => (
                  <div 
                    key={e.id} 
                    className="bg-[#111a2e] rounded-xl p-3 border border-white/5 cursor-pointer hover:bg-[#1a2332] transition-colors"
                    onClick={() => setSelectedEvent(e)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            e.type === 'income' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                          }`}>
                            {e.type === 'income' ? '↑ Ingreso' : '↓ Gasto'}
                          </span>
                          {e.expense_type === 'personal' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-900/50 text-purple-400">
                              Personal
                            </span>
                          )}
                          {e.photo && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-400">
                              📷
                            </span>
                          )}
                        </div>
                        <p className="text-gray-200 font-medium mt-1">{e.category}</p>
                        {e.vendor && <p className="text-xs text-gray-500">📍 {e.vendor}</p>}
                        {e.payment_method && <p className="text-xs text-gray-500">💳 {e.payment_method}</p>}
                        {e.note && <p className="text-xs text-gray-500 mt-1">📝 {e.note}</p>}
                        <p className="text-xs text-gray-600 mt-1">
                          {new Date(e.timestamp).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                          {e.type === 'income' ? '+' : '-'}{formatCurrency(e.amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Detalle */}
      {selectedEvent && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setSelectedEvent(null)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#111a2e] rounded-2xl z-50 max-h-[85vh] overflow-y-auto border border-white/10">
            <div className="sticky top-0 bg-[#111a2e] p-4 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-bold">Detalle del Registro</h2>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 text-xl">✕</button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Info Principal */}
              <div className="flex justify-between items-start">
                <div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    selectedEvent.type === 'income' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {selectedEvent.type === 'income' ? '↑ Ingreso' : '↓ Gasto'}
                  </span>
                  <h3 className="text-xl font-bold mt-2">{selectedEvent.category}</h3>
                </div>
                <p className={`text-2xl font-bold ${selectedEvent.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedEvent.type === 'income' ? '+' : '-'}{formatCurrency(selectedEvent.amount)}
                </p>
              </div>

              {/* Detalles */}
              <div className="bg-[#0b1220] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fecha:</span>
                  <span>{new Date(selectedEvent.timestamp).toLocaleString('es-PR')}</span>
                </div>
                {selectedEvent.vendor && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Lugar:</span>
                    <span>{selectedEvent.vendor}</span>
                  </div>
                )}
                {selectedEvent.payment_method && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Método de pago:</span>
                    <span>{selectedEvent.payment_method}</span>
                  </div>
                )}
                {selectedEvent.vehicle_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Vehículo:</span>
                    <span>{selectedEvent.vehicle_id}</span>
                  </div>
                )}
                {selectedEvent.expense_type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tipo:</span>
                    <span>{selectedEvent.expense_type === 'personal' ? '🏠 Personal' : '💼 Negocio'}</span>
                  </div>
                )}
                {selectedEvent.note && (
                  <div className="text-sm">
                    <span className="text-gray-400 block mb-1">Nota:</span>
                    <span className="text-gray-200">{selectedEvent.note}</span>
                  </div>
                )}
              </div>

              {/* Foto del Recibo */}
              {selectedEvent.photo && (
                <div>
                  <p className="text-sm text-gray-400 mb-2">📷 Foto del Recibo:</p>
                  <img 
                    src={selectedEvent.photo} 
                    alt="Recibo" 
                    className="w-full rounded-xl border border-white/10"
                  />
                </div>
              )}

              {/* Botón Eliminar */}
              <button
                onClick={() => selectedEvent.id && handleDelete(selectedEvent.id)}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-medium"
              >
                🗑️ Eliminar Registro
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
