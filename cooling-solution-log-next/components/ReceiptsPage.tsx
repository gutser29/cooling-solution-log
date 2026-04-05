import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { Client } from '@/lib/types'

interface ReceiptsPageProps {
  onNavigate: (page: string) => void
}

interface ReceiptItem {
  id: number
  event_id: number
  photo: string
  category: string
  amount: number
  vendor?: string
  client?: string
  client_id?: number
  payment_method?: string
  date: number
  type: 'event' | 'client_photo'
  note?: string
  split_receipt_id?: string
  is_split: boolean
  all_photos?: string[]  // all photos on the original event
}

interface SplitRow {
  client: string
  client_id?: number
  amount: string
  note: string
}

export default function ReceiptsPage({ onNavigate }: ReceiptsPageProps) {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null)
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [clients, setClients] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  // Split modal state
  const [splitReceipt, setSplitReceipt] = useState<ReceiptItem | null>(null)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([{ client: '', amount: '', note: '' }, { client: '', amount: '', note: '' }])
  const [allClients, setAllClients] = useState<Client[]>([])
  const [splitBusy, setSplitBusy] = useState(false)

  useEffect(() => { loadReceipts() }, [])

  const loadReceipts = async () => {
    try {
      const allReceipts: ReceiptItem[] = []

      // 1. Fotos de eventos (gastos con receipt_photos o photo)
      const events = await db.events.toArray()
      events.forEach(e => {
        if (e.receipt_photos && e.receipt_photos.length > 0) {
          e.receipt_photos.forEach((photo: string, idx: number) => {
            allReceipts.push({
              id: e.id! * 1000 + idx,
              event_id: e.id!,
              photo,
              category: e.category || 'Sin categoría',
              amount: e.amount,
              vendor: e.vendor,
              client: e.client || 'General',
              client_id: e.client_id,
              payment_method: e.payment_method,
              date: e.timestamp,
              type: 'event',
              note: e.note,
              split_receipt_id: e.split_receipt_id,
              is_split: !!e.split_receipt_id,
              all_photos: e.receipt_photos
            })
          })
        } else if ((e as any).photo) {
          allReceipts.push({
            id: e.id!,
            event_id: e.id!,
            photo: (e as any).photo,
            category: e.category || 'Sin categoría',
            amount: e.amount,
            vendor: e.vendor,
            client: e.client || 'General',
            client_id: e.client_id,
            payment_method: e.payment_method,
            date: e.timestamp,
            type: 'event',
            note: e.note,
            split_receipt_id: e.split_receipt_id,
            is_split: !!e.split_receipt_id,
            all_photos: [(e as any).photo]
          })
        }
      })

      // 2. Fotos de client_photos con categoría 'receipt' (sin duplicar con eventos)
      const clientPhotos = await db.client_photos.toArray()
      clientPhotos.forEach(p => {
        if (p.category === 'receipt') {
          const isDuplicate = allReceipts.some(r =>
            Math.abs(r.date - p.timestamp) < 60000 && r.note === p.description
          )
          if (!isDuplicate) {
            allReceipts.push({
              id: p.id! + 100000,
              event_id: -1,
              photo: p.photo_data,
              category: 'Recibo',
              amount: 0,
              client: p.client_name || 'General',
              date: p.timestamp,
              type: 'client_photo',
              note: p.description,
              is_split: false
            })
          }
        }
      })

      // Ordenar por fecha descendente
      allReceipts.sort((a, b) => b.date - a.date)
      setReceipts(allReceipts)

      // Clientes únicos
      const uniqueClients = [...new Set(allReceipts.map(r => r.client || 'General'))].sort()
      setClients(uniqueClients)

      // Categorías únicas
      const uniqueCats = [...new Set(allReceipts.map(r => r.category).filter(Boolean))].sort()
      setCategories(uniqueCats)

      // Load all clients for split modal
      const dbClients = await db.clients.filter(c => c.active).toArray()
      setAllClients(dbClients.sort((a, b) => a.first_name.localeCompare(b.first_name)))
    } catch (error) {
      console.error('Error loading receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredReceipts = receipts.filter(r => {
    if (filterClient !== 'all' && (r.client || 'General') !== filterClient) return false
    if (filterCategory !== 'all' && r.category !== filterCategory) return false
    return true
  })

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('es-PR', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`

  const getPaymentLabel = (method?: string): string => {
    if (!method) return ''
    const labels: Record<string, string> = {
      cash: 'Efectivo', ath_movil: 'ATH Móvil', capital_one: 'Capital One',
      chase_visa: 'Chase Visa', paypal: 'PayPal', check: 'Cheque',
      sams_mastercard: "Sam's MC", transfer: 'Transferencia',
      ach: 'ACH', credit_card: 'Tarjeta', zelle: 'Zelle'
    }
    return labels[method] || method
  }

  // ======= SPLIT LOGIC =======

  const openSplitModal = (r: ReceiptItem) => {
    setSelectedReceipt(null)
    setSplitReceipt(r)
    setSplitRows([
      { client: r.client && r.client !== 'General' ? r.client : '', amount: '', note: '' },
      { client: '', amount: '', note: '' }
    ])
  }

  const splitTotal = splitRows.reduce((s, row) => s + (parseFloat(row.amount) || 0), 0)
  const splitRemaining = splitReceipt ? splitReceipt.amount - splitTotal : 0

  const updateSplitRow = (idx: number, field: keyof SplitRow, value: string) => {
    setSplitRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }

  const pickClientForRow = (idx: number, c: Client) => {
    setSplitRows(prev => prev.map((row, i) => i === idx ? {
      ...row,
      client: `${c.first_name} ${c.last_name}`.trim(),
      client_id: c.id
    } : row))
  }

  const addSplitRow = () => setSplitRows(prev => [...prev, { client: '', amount: '', note: '' }])
  const removeSplitRow = (idx: number) => setSplitRows(prev => prev.filter((_, i) => i !== idx))

  const executeSplit = async () => {
    if (!splitReceipt || splitReceipt.event_id < 0) return
    const validRows = splitRows.filter(r => r.client.trim() && parseFloat(r.amount) > 0)
    if (validRows.length < 2) return

    setSplitBusy(true)
    try {
      const originalEvent = await db.events.get(splitReceipt.event_id)
      if (!originalEvent) return

      const splitId = `split_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const photos = originalEvent.receipt_photos || ((originalEvent as any).photo ? [(originalEvent as any).photo] : [])

      for (const row of validRows) {
        await db.events.add({
          timestamp: originalEvent.timestamp,
          type: originalEvent.type,
          status: originalEvent.status,
          subtype: originalEvent.subtype,
          category: originalEvent.category,
          amount: parseFloat(row.amount),
          payment_method: originalEvent.payment_method,
          vendor: originalEvent.vendor,
          client: row.client,
          client_id: row.client_id,
          vehicle_id: originalEvent.vehicle_id,
          note: row.note || originalEvent.note,
          expense_type: originalEvent.expense_type || 'business',
          receipt_photos: photos.length > 0 ? photos : undefined,
          split_receipt_id: splitId
        })
      }

      await db.events.delete(splitReceipt.event_id)
      setSplitReceipt(null)
      await loadReceipts()
    } catch (e) {
      console.error('Split error:', e)
    } finally {
      setSplitBusy(false)
    }
  }

  // Agrupar por mes
  const groupedReceipts: Record<string, ReceiptItem[]> = {}
  filteredReceipts.forEach(r => {
    const monthKey = new Date(r.date).toLocaleDateString('es-PR', { year: 'numeric', month: 'long' })
    if (!groupedReceipts[monthKey]) groupedReceipts[monthKey] = []
    groupedReceipts[monthKey].push(r)
  })

  const totalAmount = filteredReceipts.reduce((sum, r) => sum + r.amount, 0)

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

      {/* Filtros */}
      <div className="p-4 space-y-2">
        <select
          value={filterClient}
          onChange={e => setFilterClient(e.target.value)}
          className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">👤 Todos los clientes ({receipts.filter(r => filterCategory === 'all' || r.category === filterCategory).length})</option>
          {clients.map(c => (
            <option key={c} value={c}>
              {c} ({receipts.filter(r => (r.client || 'General') === c && (filterCategory === 'all' || r.category === filterCategory)).length})
            </option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">📂 Todas las categorías</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat} ({receipts.filter(r => r.category === cat).length})
            </option>
          ))}
        </select>

        <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Recibos:</span>
            <span className="font-medium">{filteredReceipts.length}</span>
          </div>
          {totalAmount > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-400">Total:</span>
              <span className="font-medium text-red-400">{formatCurrency(totalAmount)}</span>
            </div>
          )}
          {filterClient !== 'all' && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-400">Cliente:</span>
              <span className="font-medium text-blue-400">{filterClient}</span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de Recibos */}
      <div className="px-4 pb-20">
        {Object.entries(groupedReceipts).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🧾</p>
            <p>No hay recibos guardados</p>
            <p className="text-xs mt-2">Sube fotos de recibos en el chat 💬</p>
          </div>
        ) : (
          Object.entries(groupedReceipts).map(([month, monthReceipts]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-3 capitalize sticky top-16 bg-[#0b1220] py-2 z-10">
                📅 {month} — {monthReceipts.length} recibo{monthReceipts.length > 1 ? 's' : ''}
                {monthReceipts.some(r => r.amount > 0) && (
                  <span className="text-red-400 ml-2">
                    {formatCurrency(monthReceipts.reduce((s, r) => s + r.amount, 0))}
                  </span>
                )}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {monthReceipts.map(r => (
                  <div
                    key={`${r.type}-${r.id}`}
                    className="bg-[#111a2e] rounded-xl overflow-hidden border border-white/5 cursor-pointer hover:border-white/20 transition-colors"
                    onClick={() => setSelectedReceipt(r)}
                  >
                    <div className="aspect-square relative">
                      <img src={r.photo} alt="Recibo" className="w-full h-full object-cover" />
                      {r.is_split && (
                        <div className="absolute top-1.5 right-1.5 bg-purple-600/90 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                          ✂️ div
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        {r.amount > 0 && <p className="text-white font-bold text-sm">{formatCurrency(r.amount)}</p>}
                        {r.client && r.client !== 'General' && (
                          <p className="text-blue-300 text-xs truncate">{r.client}</p>
                        )}
                      </div>
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium text-gray-200 truncate">{r.vendor || r.category}</p>
                      {r.payment_method && (
                        <p className="text-xs text-gray-500">{getPaymentLabel(r.payment_method)}</p>
                      )}
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
            <div className="bg-[#111a2e] p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{selectedReceipt.vendor || selectedReceipt.category}</h2>
                  {selectedReceipt.is_split && (
                    <span className="text-xs bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-full px-2 py-0.5">✂️ dividido</span>
                  )}
                </div>
                {selectedReceipt.amount > 0 && (
                  <p className="text-red-400 font-bold">{formatCurrency(selectedReceipt.amount)}</p>
                )}
                {selectedReceipt.client && selectedReceipt.client !== 'General' && (
                  <p className="text-blue-400 text-sm">👤 {selectedReceipt.client}</p>
                )}
              </div>
              <button onClick={() => setSelectedReceipt(null)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <img src={selectedReceipt.photo} alt="Recibo" className="w-full rounded-xl" />

              <div className="mt-4 bg-[#0b1220] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fecha:</span>
                  <span>{new Date(selectedReceipt.date).toLocaleString('es-PR')}</span>
                </div>
                {selectedReceipt.client && selectedReceipt.client !== 'General' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Cliente:</span>
                    <span className="text-blue-400">{selectedReceipt.client}</span>
                  </div>
                )}
                {selectedReceipt.vendor && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tienda:</span>
                    <span>{selectedReceipt.vendor}</span>
                  </div>
                )}
                {selectedReceipt.category && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Categoría:</span>
                    <span>{selectedReceipt.category}</span>
                  </div>
                )}
                {selectedReceipt.payment_method && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pago:</span>
                    <span>{getPaymentLabel(selectedReceipt.payment_method)}</span>
                  </div>
                )}
                {selectedReceipt.note && (
                  <div className="text-sm">
                    <span className="text-gray-400 block mb-1">Detalle:</span>
                    <span className="text-gray-200">{selectedReceipt.note}</span>
                  </div>
                )}
              </div>

              {/* Botón Dividir — solo para eventos con amount > 0 y no ya divididos individualmente */}
              {selectedReceipt.type === 'event' && selectedReceipt.amount > 0 && (
                <button
                  onClick={() => openSplitModal(selectedReceipt)}
                  className="mt-4 w-full bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 rounded-xl py-3 text-sm font-medium transition-colors"
                >
                  ✂️ Dividir entre clientes
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal de División */}
      {splitReceipt && (
        <>
          <div className="fixed inset-0 bg-black/90 z-50" onClick={() => !splitBusy && setSplitReceipt(null)} />
          <div className="fixed inset-x-2 top-4 bottom-4 bg-[#111a2e] rounded-2xl z-50 overflow-hidden flex flex-col border border-purple-500/30">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0 bg-purple-900/20">
              <div>
                <h2 className="text-lg font-bold text-purple-300">✂️ Dividir recibo</h2>
                <p className="text-sm text-gray-400">Total: <span className="text-white font-bold">{formatCurrency(splitReceipt.amount)}</span></p>
              </div>
              {!splitBusy && (
                <button onClick={() => setSplitReceipt(null)} className="text-gray-400 text-2xl">✕</button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {/* Thumbnail */}
              <img src={splitReceipt.photo} alt="Recibo" className="w-full max-h-32 object-contain rounded-xl bg-black/30" />

              {/* Balance tracker */}
              <div className={`rounded-xl p-3 border text-center ${Math.abs(splitRemaining) < 0.01 ? 'bg-green-900/20 border-green-500/30' : 'bg-yellow-900/20 border-yellow-500/30'}`}>
                <p className="text-xs text-gray-400 mb-1">Restante por asignar</p>
                <p className={`text-2xl font-bold ${Math.abs(splitRemaining) < 0.01 ? 'text-green-400' : splitRemaining < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {formatCurrency(Math.abs(splitRemaining))}
                  {splitRemaining < -0.01 && ' (excede)'}
                </p>
              </div>

              {/* Filas de división */}
              {splitRows.map((row, idx) => (
                <div key={idx} className="bg-[#0b1220] rounded-xl p-3 space-y-2 border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 font-medium">División {idx + 1}</span>
                    {splitRows.length > 2 && (
                      <button onClick={() => removeSplitRow(idx)} className="text-red-400 text-xs">✕ quitar</button>
                    )}
                  </div>

                  {/* Cliente — selector */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Cliente</label>
                    <select
                      value={row.client_id ? String(row.client_id) : ''}
                      onChange={e => {
                        const c = allClients.find(cl => cl.id === parseInt(e.target.value))
                        if (c) pickClientForRow(idx, c)
                        else updateSplitRow(idx, 'client', e.target.value)
                      }}
                      className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Seleccionar cliente --</option>
                      {allClients.map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {`${c.first_name} ${c.last_name}`.trim()}
                        </option>
                      ))}
                    </select>
                    {/* Fallback texto manual si no seleccionó de lista */}
                    {!row.client_id && (
                      <input
                        type="text"
                        placeholder="o escribe nombre..."
                        value={row.client}
                        onChange={e => updateSplitRow(idx, 'client', e.target.value)}
                        className="mt-1 w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
                      />
                    )}
                    {row.client_id && (
                      <p className="text-xs text-cyan-400 mt-1">👤 {row.client}</p>
                    )}
                  </div>

                  {/* Monto */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Monto ($)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={e => updateSplitRow(idx, 'amount', e.target.value)}
                      className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
                      inputMode="decimal"
                    />
                  </div>

                  {/* Nota opcional */}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Artículos / nota (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej: Filtros, cobre..."
                      value={row.note}
                      onChange={e => updateSplitRow(idx, 'note', e.target.value)}
                      className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addSplitRow}
                className="w-full border border-dashed border-white/20 rounded-xl py-2.5 text-sm text-gray-400 hover:border-white/40 hover:text-gray-300 transition-colors"
              >
                + Agregar cliente
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setSplitReceipt(null)}
                disabled={splitBusy}
                className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={executeSplit}
                disabled={splitBusy || splitRows.filter(r => r.client.trim() && parseFloat(r.amount) > 0).length < 2 || Math.abs(splitRemaining) > 0.01}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900/40 disabled:text-purple-700 rounded-xl py-3 text-sm font-bold transition-colors"
              >
                {splitBusy ? 'Guardando...' : '✂️ Dividir'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
