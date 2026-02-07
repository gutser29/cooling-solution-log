'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import type { EventRecord, ClientPhoto } from '@/lib/types'

interface ReceiptsPageProps {
  onNavigate: (page: string) => void
}

interface ReceiptItem {
  id: number
  photo: string
  category: string
  amount: number
  vendor?: string
  payment_method?: string
  date: number
  type: 'event' | 'client_photo'
  note?: string
}

export default function ReceiptsPage({ onNavigate }: ReceiptsPageProps) {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    loadReceipts()
  }, [])

  const loadReceipts = async () => {
    try {
      const allReceipts: ReceiptItem[] = []

      // 1. Obtener fotos de eventos (gastos con foto)
      const events = await db.events.toArray()
      events.forEach(e => {
        if (e.photo) {
          allReceipts.push({
            id: e.id!,
            photo: e.photo,
            category: e.category || 'Sin categoría',
            amount: e.amount,
            vendor: e.vendor,
            payment_method: e.payment_method,
            date: e.timestamp,
            type: 'event',
            note: e.note
          })
        }
      })

      // 2. Obtener fotos de client_photos con categoría 'receipt'
      const clientPhotos = await db.client_photos.toArray()
      clientPhotos.forEach(p => {
        if (p.category === 'receipt') {
          allReceipts.push({
            id: p.id!,
            photo: p.photo_data,
            category: 'Recibo',
            amount: 0,
            date: p.timestamp,
            type: 'client_photo',
            note: p.description
          })
        }
      })

      // Ordenar por fecha descendente
      allReceipts.sort((a, b) => b.date - a.date)
      setReceipts(allReceipts)

      // Obtener categorías únicas
      const uniqueCats = [...new Set(allReceipts.map(r => r.category).filter(Boolean))]
      setCategories(uniqueCats)

    } catch (error) {
      console.error('Error loading receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredReceipts = receipts.filter(r => {
    if (filter === 'all') return true
    return r.category === filter
  })

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('es-PR', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`

  // Agrupar por mes
  const groupedReceipts: Record<string, ReceiptItem[]> = {}
  filteredReceipts.forEach(r => {
    const monthKey = new Date(r.date).toLocaleDateString('es-PR', { year: 'numeric', month: 'long' })
    if (!groupedReceipts[monthKey]) groupedReceipts[monthKey] = []
    groupedReceipts[monthKey].push(r)
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400">Cargando recibos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-amber-600 to-orange-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🧾 Recibos</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      {/* Filtro por categoría */}
      <div className="p-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorías ({receipts.length})</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat} ({receipts.filter(r => r.category === cat).length})
            </option>
          ))}
        </select>

        {/* Stats */}
        <div className="mt-3 bg-[#111a2e] rounded-xl p-3 border border-white/5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total recibos:</span>
            <span className="font-medium">{filteredReceipts.length}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Total monto:</span>
            <span className="font-medium text-red-400">
              {formatCurrency(filteredReceipts.reduce((sum, r) => sum + r.amount, 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Recibos */}
      <div className="px-4 pb-20">
        {Object.entries(groupedReceipts).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🧾</p>
            <p>No hay recibos guardados</p>
            <p className="text-xs mt-2">Añade fotos de recibos en 💵 Gastos</p>
          </div>
        ) : (
          Object.entries(groupedReceipts).map(([month, monthReceipts]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3 capitalize sticky top-16 bg-[#0b1220] py-2">
                {month} ({monthReceipts.length} recibos)
              </h3>
              
              {/* Grid de recibos */}
              <div className="grid grid-cols-2 gap-3">
                {monthReceipts.map(r => (
                  <div 
                    key={`${r.type}-${r.id}`}
                    className="bg-[#111a2e] rounded-xl overflow-hidden border border-white/5 cursor-pointer hover:border-white/20 transition-colors"
                    onClick={() => setSelectedReceipt(r)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square relative">
                      <img 
                        src={r.photo} 
                        alt="Recibo" 
                        className="w-full h-full object-cover"
                      />
                      {r.amount > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <p className="text-white font-bold text-sm">{formatCurrency(r.amount)}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="p-2">
                      <p className="text-sm font-medium text-gray-200 truncate">{r.category}</p>
                      {r.vendor && <p className="text-xs text-gray-500 truncate">📍 {r.vendor}</p>}
                      <p className="text-xs text-gray-600 mt-1">{formatDate(r.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Detalle */}
      {selectedReceipt && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setSelectedReceipt(null)} />
          <div className="fixed inset-4 bg-[#111a2e] rounded-2xl z-50 overflow-hidden flex flex-col border border-white/10">
            {/* Header del modal */}
            <div className="bg-[#111a2e] p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold">{selectedReceipt.category}</h2>
                {selectedReceipt.amount > 0 && (
                  <p className="text-red-400 font-bold">{formatCurrency(selectedReceipt.amount)}</p>
                )}
              </div>
              <button onClick={() => setSelectedReceipt(null)} className="text-gray-400 text-2xl">✕</button>
            </div>
            
            {/* Imagen */}
            <div className="flex-1 overflow-auto p-4">
              <img 
                src={selectedReceipt.photo} 
                alt="Recibo" 
                className="w-full rounded-xl"
              />
              
              {/* Detalles */}
              <div className="mt-4 bg-[#0b1220] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fecha:</span>
                  <span>{new Date(selectedReceipt.date).toLocaleString('es-PR')}</span>
                </div>
                {selectedReceipt.vendor && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Lugar:</span>
                    <span>{selectedReceipt.vendor}</span>
                  </div>
                )}
                {selectedReceipt.payment_method && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Método de pago:</span>
                    <span>{selectedReceipt.payment_method}</span>
                  </div>
                )}
                {selectedReceipt.note && (
                  <div className="text-sm">
                    <span className="text-gray-400 block mb-1">Nota:</span>
                    <span className="text-gray-200">{selectedReceipt.note}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}