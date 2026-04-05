'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { InventoryItem, InventoryMovement } from '@/lib/types'
import { generateInventoryReport, generateInventoryMovementsReport } from '@/lib/pdfGenerator'

interface Props { onNavigate: (page: string) => void }

type Tab = 'stock' | 'movements'

const CATEGORIES = ['Filtros', 'Refrigerantes', 'Capacitores', 'Contactores', 'Termostatos',
  'Válvulas', 'Materiales eléctricos', 'Drenaje', 'Correas', 'Herramientas', 'Otro']

const LOCATIONS: Record<string, string> = {
  truck: '🚛 Camión', warehouse: '🏠 Almacén', both: 'Camión + Almacén', other: 'Otro'
}

const UNITS = ['und', 'caja', 'par', 'lb', 'oz', 'kg', 'pie', 'metro', 'rollo', 'galón', 'litro']

const REASONS_IN = ['Compra', 'Devolución de cliente', 'Transferencia', 'Ajuste de inventario', 'Otro']
const REASONS_OUT = ['Uso en trabajo', 'Instalación', 'Mantenimiento', 'Ajuste de inventario', 'Pérdida/Daño', 'Otro']

function stockStatus(q: number, min: number): 'red' | 'yellow' | 'green' {
  if (min === 0) return q === 0 ? 'red' : 'green'
  if (q <= min) return 'red'
  if (q <= min * 2) return 'yellow'
  return 'green'
}

const STATUS_DOT: Record<string, string> = {
  red: 'bg-red-500', yellow: 'bg-yellow-400', green: 'bg-green-500'
}

const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })
const isoDate = (ts?: number) => ts ? new Date(ts).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

const blankItem = (): Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'> => ({
  name: '', sku: '', category: 'Otro', quantity: 0, min_quantity: 1,
  unit: 'und', location: 'truck', location_detail: '',
  unit_cost: 0, unit_price: undefined, supplier: '', notes: '', active: true,
})

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InventoryPage({ onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('stock')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // filters
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [locFilter, setLocFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all')

  // modals
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [itemForm, setItemForm] = useState(blankItem())
  const [itemSaving, setItemSaving] = useState(false)

  const [showMovement, setShowMovement] = useState(false)
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null)
  const [mvType, setMvType] = useState<'in' | 'out' | 'adjustment'>('out')
  const [mvQty, setMvQty] = useState(1)
  const [mvReason, setMvReason] = useState('Uso en trabajo')
  const [mvDate, setMvDate] = useState(isoDate())
  const [mvJobId, setMvJobId] = useState('')
  const [mvClientName, setMvClientName] = useState('')
  const [mvSupplier, setMvSupplier] = useState('')
  const [mvNotes, setMvNotes] = useState('')
  const [mvSaving, setMvSaving] = useState(false)

  // movement filters
  const [mvFilterItem, setMvFilterItem] = useState('all')
  const [mvFilterType, setMvFilterType] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [its, mvs, js] = await Promise.all([
      db.inventory_items.toArray(),
      db.inventory_movements.toArray(),
      db.jobs.toArray(),
    ])
    setItems(its.filter(i => i.active !== false).sort((a, b) => {
      const sa = stockStatus(a.quantity, a.min_quantity)
      const sb = stockStatus(b.quantity, b.min_quantity)
      const order = { red: 0, yellow: 1, green: 2 }
      return order[sa] - order[sb] || a.name.localeCompare(b.name)
    }))
    setMovements(mvs.sort((a, b) => b.date - a.date))
    setJobs(js.filter(j => j.status !== 'cancelled').sort((a, b) => b.date - a.date).slice(0, 50))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── filtered stock ───────────────────────────────────────────────────────
  const filtered = items.filter(it => {
    if (search && !it.name.toLowerCase().includes(search.toLowerCase()) &&
        !(it.sku || '').toLowerCase().includes(search.toLowerCase()) &&
        !(it.supplier || '').toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter !== 'all' && it.category !== catFilter) return false
    if (locFilter !== 'all' && it.location !== locFilter) return false
    if (statusFilter !== 'all' && stockStatus(it.quantity, it.min_quantity) !== statusFilter) return false
    return true
  })

  const usedCategories = [...new Set(items.map(i => i.category))].sort()
  const lowCount = items.filter(i => stockStatus(i.quantity, i.min_quantity) === 'red').length
  const totalValue = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)

  // ─── item form ────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingItem(null)
    setItemForm(blankItem())
    setShowItemForm(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setItemForm({
      name: item.name, sku: item.sku || '', category: item.category,
      quantity: item.quantity, min_quantity: item.min_quantity,
      unit: item.unit, location: item.location, location_detail: item.location_detail || '',
      unit_cost: item.unit_cost, unit_price: item.unit_price, supplier: item.supplier || '',
      notes: item.notes || '', active: item.active,
    })
    setSelectedItem(null)
    setShowItemForm(true)
  }

  const saveItem = async () => {
    if (!itemForm.name.trim()) return
    setItemSaving(true)
    try {
      const now = Date.now()
      if (editingItem?.id) {
        await db.inventory_items.update(editingItem.id, { ...itemForm, updated_at: now })
      } else {
        // Check product_prices for a matching entry
        const prices = await db.product_prices.toArray()
        const match = prices.find(p => p.product_name.toLowerCase().includes(itemForm.name.toLowerCase()) ||
          itemForm.name.toLowerCase().includes(p.product_name.toLowerCase()))
        const product_price_id = match?.id
        const unit_cost = itemForm.unit_cost > 0 ? itemForm.unit_cost : (match?.unit_price || 0)
        await db.inventory_items.add({
          ...itemForm, unit_cost, product_price_id, created_at: now, updated_at: now
        })
      }
      setShowItemForm(false)
      await load()
    } finally { setItemSaving(false) }
  }

  const deleteItem = async (item: InventoryItem) => {
    if (!confirm(`¿Desactivar "${item.name}"?`)) return
    await db.inventory_items.update(item.id!, { active: false, updated_at: Date.now() })
    setSelectedItem(null)
    await load()
  }

  // ─── movement form ────────────────────────────────────────────────────────
  const openMovement = (item: InventoryItem, type: 'in' | 'out' | 'adjustment' = 'out') => {
    setMovementItem(item)
    setMvType(type)
    setMvQty(1)
    setMvReason(type === 'in' ? 'Compra' : 'Uso en trabajo')
    setMvDate(isoDate())
    setMvJobId('')
    setMvClientName('')
    setMvSupplier('')
    setMvNotes('')
    setSelectedItem(null)
    setShowMovement(true)
  }

  const saveMovement = async () => {
    if (!movementItem || mvQty <= 0) return
    setMvSaving(true)
    try {
      const now = Date.now()
      const dateTs = new Date(mvDate).getTime()
      const jobId = mvJobId ? parseInt(mvJobId) : undefined
      const job = jobId ? jobs.find(j => j.id === jobId) : undefined

      const movement: InventoryMovement = {
        item_id: movementItem.id!,
        item_name: movementItem.name,
        type: mvType,
        quantity: mvQty,
        unit_cost: movementItem.unit_cost,
        total_cost: mvQty * movementItem.unit_cost,
        date: dateTs,
        reason: mvReason,
        job_id: jobId,
        client_name: mvClientName || job?.client_name || '',
        supplier: mvSupplier,
        notes: mvNotes,
        created_at: now,
      }
      await db.inventory_movements.add(movement)

      // Update item quantity
      let newQty = movementItem.quantity
      if (mvType === 'in') newQty += mvQty
      else if (mvType === 'out') newQty = Math.max(0, newQty - mvQty)
      else newQty = mvQty // adjustment = set to value
      await db.inventory_items.update(movementItem.id!, { quantity: newQty, updated_at: now })

      setShowMovement(false)
      await load()
    } finally { setMvSaving(false) }
  }

  // ─── PDF exports ──────────────────────────────────────────────────────────
  const pdfStock = () => generateInventoryReport(items)
  const pdfMovements = () => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000
    const recent = movements.filter(m => m.date >= thirtyDaysAgo)
    generateInventoryMovementsReport(recent, items, thirtyDaysAgo, Date.now(), 'Últimos 30 días')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0b1220]">
      <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
    </div>
  )

  const inputCls = 'w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm'
  const labelCls = 'text-xs text-gray-400 mb-1 block'

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-cyan-700 to-teal-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📦 Inventario</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={tab === 'stock' ? pdfStock : pdfMovements}
            className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm font-medium">📄</button>
          <button onClick={openNew}
            className="bg-green-500 hover:bg-green-600 rounded-lg px-3 py-1.5 text-sm font-bold">+ Pieza</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button onClick={() => setTab('stock')}
          className={`flex-1 py-3 text-sm font-medium ${tab === 'stock' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}>
          📦 Stock ({items.length})
        </button>
        <button onClick={() => setTab('movements')}
          className={`flex-1 py-3 text-sm font-medium ${tab === 'movements' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400'}`}>
          📋 Movimientos ({movements.length})
        </button>
      </div>

      {/* ───── STOCK TAB ───── */}
      {tab === 'stock' && (
        <div className="p-4 pb-20 space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xl font-bold text-cyan-400">{items.length}</p>
              <p className="text-[10px] text-gray-500">Piezas</p>
            </div>
            <div className={`rounded-xl p-3 border text-center cursor-pointer ${lowCount > 0 ? 'bg-red-900/20 border-red-700/30' : 'bg-[#111a2e] border-white/5'}`}
              onClick={() => setStatusFilter(statusFilter === 'red' ? 'all' : 'red')}>
              <p className={`text-xl font-bold ${lowCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>{lowCount}</p>
              <p className="text-[10px] text-gray-500">Bajo mínimo</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xl font-bold text-green-400">{fmt(totalValue)}</p>
              <p className="text-[10px] text-gray-500">Valor stock</p>
            </div>
          </div>

          {/* Search + filters */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar pieza, SKU, proveedor..."
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm" />

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {['all', ...usedCategories].map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${catFilter === cat ? 'bg-cyan-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                {cat === 'all' ? 'Todas' : cat}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-xs">
              <option value="all">📍 Todos</option>
              {Object.entries(LOCATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-xs">
              <option value="all">🔵 Todos</option>
              <option value="red">🔴 Bajo mínimo</option>
              <option value="yellow">🟡 Cerca del mínimo</option>
              <option value="green">🟢 OK</option>
            </select>
          </div>

          {/* Item list */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-2">📦</p>
              <p>{items.length === 0 ? 'Sin piezas en inventario' : 'Sin resultados'}</p>
              <p className="text-xs mt-1">{items.length === 0 ? 'Agrega tu primera pieza con "+ Pieza"' : 'Ajusta los filtros'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => {
                const status = stockStatus(item.quantity, item.min_quantity)
                return (
                  <div key={item.id} onClick={() => setSelectedItem(item)}
                    className="bg-[#111a2e] rounded-xl p-3.5 border border-white/5 cursor-pointer hover:border-white/20 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${STATUS_DOT[status]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-100 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.category} · {LOCATIONS[item.location]}
                            {item.supplier ? ` · ${item.supplier}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className={`text-lg font-bold ${status === 'red' ? 'text-red-400' : status === 'yellow' ? 'text-yellow-400' : 'text-green-400'}`}>
                          {item.quantity} <span className="text-xs font-normal text-gray-500">{item.unit}</span>
                        </p>
                        <p className="text-xs text-gray-600">mín {item.min_quantity}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                      <p className="text-xs text-gray-500">
                        Costo: <span className="text-gray-300">{fmt(item.unit_cost)}/{item.unit}</span>
                        {item.quantity > 0 && <span className="text-gray-600"> · Total: {fmt(item.quantity * item.unit_cost)}</span>}
                      </p>
                      <div className="flex gap-1.5">
                        <button onClick={e => { e.stopPropagation(); openMovement(item, 'in') }}
                          className="bg-green-900/30 text-green-400 text-xs px-2 py-1 rounded-lg border border-green-700/30 hover:bg-green-900/50">
                          +Entrada
                        </button>
                        <button onClick={e => { e.stopPropagation(); openMovement(item, 'out') }}
                          className="bg-red-900/30 text-red-400 text-xs px-2 py-1 rounded-lg border border-red-700/30 hover:bg-red-900/50">
                          +Salida
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ───── MOVEMENTS TAB ───── */}
      {tab === 'movements' && (
        <div className="p-4 pb-20 space-y-3">
          <div className="flex gap-2">
            <select value={mvFilterItem} onChange={e => setMvFilterItem(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-xs">
              <option value="all">Todas las piezas</option>
              {items.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
            </select>
            <select value={mvFilterType} onChange={e => setMvFilterType(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-xs">
              <option value="all">Todos</option>
              <option value="in">📥 Entradas</option>
              <option value="out">📤 Salidas</option>
              <option value="adjustment">⚖️ Ajustes</option>
            </select>
          </div>

          {(() => {
            const mvFiltered = movements.filter(m => {
              if (mvFilterItem !== 'all' && m.item_id !== parseInt(mvFilterItem)) return false
              if (mvFilterType !== 'all' && m.type !== mvFilterType) return false
              return true
            })
            if (mvFiltered.length === 0) return (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-2">📋</p>
                <p>Sin movimientos registrados</p>
              </div>
            )
            return (
              <div className="space-y-2">
                {mvFiltered.slice(0, 100).map(mv => (
                  <div key={mv.id} className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{mv.type === 'in' ? '📥' : mv.type === 'out' ? '📤' : '⚖️'}</span>
                          <p className="text-sm font-medium text-gray-200 truncate">{mv.item_name}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {mv.reason}
                          {mv.client_name ? ` · ${mv.client_name}` : ''}
                          {mv.supplier ? ` · ${mv.supplier}` : ''}
                        </p>
                        <p className="text-xs text-gray-600">{fmtDate(mv.date)}</p>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className={`text-sm font-bold ${mv.type === 'in' ? 'text-green-400' : mv.type === 'out' ? 'text-red-400' : 'text-yellow-400'}`}>
                          {mv.type === 'in' ? '+' : mv.type === 'out' ? '-' : '='}{mv.quantity}
                        </p>
                        {mv.total_cost ? <p className="text-xs text-gray-500">{fmt(mv.total_cost)}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ───── ITEM DETAIL BOTTOM SHEET ───── */}
      {selectedItem && !showItemForm && !showMovement && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setSelectedItem(null)} />
          <div className="fixed inset-x-2 bottom-4 top-24 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-start flex-shrink-0">
              <div className="flex items-start gap-2">
                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${STATUS_DOT[stockStatus(selectedItem.quantity, selectedItem.min_quantity)]}`} />
                <div>
                  <h2 className="text-base font-bold text-gray-100">{selectedItem.name}</h2>
                  <p className="text-xs text-gray-500">{selectedItem.category} · {LOCATIONS[selectedItem.location]}</p>
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {/* Quantity block */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${stockStatus(selectedItem.quantity, selectedItem.min_quantity) === 'red' ? 'text-red-400' : 'text-cyan-400'}`}>
                    {selectedItem.quantity}
                  </p>
                  <p className="text-[10px] text-gray-500">{selectedItem.unit} disponibles</p>
                </div>
                <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-300">{selectedItem.min_quantity}</p>
                  <p className="text-[10px] text-gray-500">mínimo</p>
                </div>
                <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">{fmt(selectedItem.quantity * selectedItem.unit_cost)}</p>
                  <p className="text-[10px] text-gray-500">valor total</p>
                </div>
              </div>

              {/* Details */}
              <div className="bg-[#0b1220] rounded-xl p-3 space-y-1.5 text-sm">
                {[
                  ['Costo unitario', fmt(selectedItem.unit_cost)],
                  ...(selectedItem.unit_price ? [['Precio venta', fmt(selectedItem.unit_price)]] : []),
                  ...(selectedItem.sku ? [['SKU/Ref', selectedItem.sku]] : []),
                  ...(selectedItem.supplier ? [['Proveedor', selectedItem.supplier]] : []),
                  ...(selectedItem.location_detail ? [['Ubicación', selectedItem.location_detail]] : []),
                  ...(selectedItem.notes ? [['Notas', selectedItem.notes]] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-200">{v}</span>
                  </div>
                ))}
              </div>

              {/* Recent movements */}
              {(() => {
                const itemMvs = movements.filter(m => m.item_id === selectedItem.id).slice(0, 5)
                if (itemMvs.length === 0) return null
                return (
                  <div>
                    <p className="text-xs text-gray-400 mb-2 font-medium">Últimos movimientos</p>
                    <div className="space-y-1.5">
                      {itemMvs.map(mv => (
                        <div key={mv.id} className="flex justify-between items-center bg-[#0b1220] rounded-lg px-3 py-2 text-xs">
                          <div>
                            <span className="mr-1">{mv.type === 'in' ? '📥' : mv.type === 'out' ? '📤' : '⚖️'}</span>
                            <span className="text-gray-300">{mv.reason}</span>
                            {mv.client_name && <span className="text-gray-500"> · {mv.client_name}</span>}
                          </div>
                          <div className="text-right">
                            <span className={`font-bold ${mv.type === 'in' ? 'text-green-400' : mv.type === 'out' ? 'text-red-400' : 'text-yellow-400'}`}>
                              {mv.type === 'in' ? '+' : mv.type === 'out' ? '-' : '='}{mv.quantity}
                            </span>
                            <p className="text-gray-600">{fmtDate(mv.date)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="p-4 border-t border-white/10 grid grid-cols-3 gap-2 flex-shrink-0">
              <button onClick={() => openMovement(selectedItem, 'in')}
                className="bg-green-900/30 text-green-400 border border-green-700/30 rounded-xl py-2.5 text-xs font-medium">
                📥 Entrada
              </button>
              <button onClick={() => openMovement(selectedItem, 'out')}
                className="bg-red-900/30 text-red-400 border border-red-700/30 rounded-xl py-2.5 text-xs font-medium">
                📤 Salida
              </button>
              <button onClick={() => openEdit(selectedItem)}
                className="bg-white/5 border border-white/10 rounded-xl py-2.5 text-xs font-medium text-gray-300">
                ✏️ Editar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ───── ITEM FORM MODAL ───── */}
      {showItemForm && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => !itemSaving && setShowItemForm(false)} />
          <div className="fixed inset-x-2 top-4 bottom-4 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <h2 className="text-base font-bold">{editingItem ? '✏️ Editar pieza' : '+ Nueva pieza'}</h2>
              {!itemSaving && <button onClick={() => setShowItemForm(false)} className="text-gray-400 text-2xl">✕</button>}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                  className={inputCls} placeholder="Capacitor 35/5 MFD, Filtro HEPA 16x25..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Categoría</label>
                  <select value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>SKU / Ref</label>
                  <input value={itemForm.sku} onChange={e => setItemForm(f => ({ ...f, sku: e.target.value }))} className={inputCls} placeholder="CAP-35-5" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Cantidad actual</label>
                  <input type="number" value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: +e.target.value }))} className={inputCls} min="0" />
                </div>
                <div>
                  <label className={labelCls}>Mínimo</label>
                  <input type="number" value={itemForm.min_quantity} onChange={e => setItemForm(f => ({ ...f, min_quantity: +e.target.value }))} className={inputCls} min="0" />
                </div>
                <div>
                  <label className={labelCls}>Unidad</label>
                  <select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Costo unitario ($)</label>
                  <input type="number" value={itemForm.unit_cost} onChange={e => setItemForm(f => ({ ...f, unit_cost: +e.target.value }))} className={inputCls} min="0" step="0.01" />
                </div>
                <div>
                  <label className={labelCls}>Precio venta ($)</label>
                  <input type="number" value={itemForm.unit_price || ''} onChange={e => setItemForm(f => ({ ...f, unit_price: e.target.value ? +e.target.value : undefined }))} className={inputCls} min="0" step="0.01" placeholder="Opcional" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Ubicación</label>
                <select value={itemForm.location} onChange={e => setItemForm(f => ({ ...f, location: e.target.value as any }))} className={inputCls}>
                  {Object.entries(LOCATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Proveedor</label>
                <input value={itemForm.supplier} onChange={e => setItemForm(f => ({ ...f, supplier: e.target.value }))} className={inputCls} placeholder="Johnstone Supply, Refricentro..." />
              </div>
              <div>
                <label className={labelCls}>Notas</label>
                <textarea value={itemForm.notes} onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} rows={2} />
              </div>
              {editingItem && (
                <button onClick={() => deleteItem(editingItem)}
                  className="w-full bg-red-900/20 border border-red-800/30 text-red-400 rounded-xl py-2 text-xs">
                  🗑️ Desactivar pieza
                </button>
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button onClick={() => setShowItemForm(false)} disabled={itemSaving} className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm">Cancelar</button>
              <button onClick={saveItem} disabled={itemSaving || !itemForm.name.trim()}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-900/40 disabled:text-cyan-700 rounded-xl py-3 text-sm font-bold">
                {itemSaving ? 'Guardando...' : '✓ Guardar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ───── MOVEMENT MODAL ───── */}
      {showMovement && movementItem && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => !mvSaving && setShowMovement(false)} />
          <div className="fixed inset-x-2 top-10 bottom-10 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-start flex-shrink-0">
              <div>
                <h2 className="text-base font-bold">{mvType === 'in' ? '📥 Entrada' : mvType === 'out' ? '📤 Salida' : '⚖️ Ajuste'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{movementItem.name} · {movementItem.quantity} {movementItem.unit} disponibles</p>
              </div>
              {!mvSaving && <button onClick={() => setShowMovement(false)} className="text-gray-400 text-2xl">✕</button>}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {/* Type selector */}
              <div className="grid grid-cols-3 gap-2">
                {(['in', 'out', 'adjustment'] as const).map(t => (
                  <button key={t} onClick={() => { setMvType(t); setMvReason(t === 'in' ? 'Compra' : t === 'out' ? 'Uso en trabajo' : 'Ajuste de inventario') }}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors
                      ${mvType === t ? (t === 'in' ? 'bg-green-700/40 border-green-500/50 text-green-300' : t === 'out' ? 'bg-red-700/40 border-red-500/50 text-red-300' : 'bg-yellow-700/40 border-yellow-500/50 text-yellow-300')
                        : 'bg-white/5 border-white/10 text-gray-400'}`}>
                    {t === 'in' ? '📥 Entrada' : t === 'out' ? '📤 Salida' : '⚖️ Ajuste'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{mvType === 'adjustment' ? 'Nueva cantidad' : 'Cantidad'} *</label>
                  <input type="number" value={mvQty} onChange={e => setMvQty(+e.target.value)} className={inputCls} min="1" />
                </div>
                <div>
                  <label className={labelCls}>Fecha</label>
                  <input type="date" value={mvDate} onChange={e => setMvDate(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Motivo</label>
                <select value={mvReason} onChange={e => setMvReason(e.target.value)} className={inputCls}>
                  {(mvType === 'in' ? REASONS_IN : REASONS_OUT).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {mvType === 'out' && (
                <>
                  <div>
                    <label className={labelCls}>Trabajo (opcional)</label>
                    <select value={mvJobId} onChange={e => {
                      setMvJobId(e.target.value)
                      const j = jobs.find(j => j.id === parseInt(e.target.value))
                      if (j) setMvClientName(j.client_name || '')
                    }} className={inputCls}>
                      <option value="">Sin trabajo asociado</option>
                      {jobs.map(j => <option key={j.id} value={j.id}>{j.client_name || `Trabajo #${j.id}`} — {new Date(j.date).toLocaleDateString('es-PR')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Cliente</label>
                    <input value={mvClientName} onChange={e => setMvClientName(e.target.value)} className={inputCls} placeholder="Nombre del cliente..." />
                  </div>
                </>
              )}

              {mvType === 'in' && (
                <div>
                  <label className={labelCls}>Proveedor</label>
                  <input value={mvSupplier} onChange={e => setMvSupplier(e.target.value)} className={inputCls} placeholder={movementItem.supplier || 'Johnstone Supply...'} />
                </div>
              )}

              <div>
                <label className={labelCls}>Notas</label>
                <input value={mvNotes} onChange={e => setMvNotes(e.target.value)} className={inputCls} placeholder="Opcional..." />
              </div>

              {/* Preview */}
              <div className="bg-[#0b1220] rounded-xl p-3 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Stock actual:</span><span className="text-gray-200">{movementItem.quantity} {movementItem.unit}</span>
                </div>
                <div className="flex justify-between text-gray-400 mt-1">
                  <span>Después de {mvType === 'in' ? 'entrada' : mvType === 'out' ? 'salida' : 'ajuste'}:</span>
                  <span className={`font-bold ${
                    (mvType === 'in' ? movementItem.quantity + mvQty : mvType === 'out' ? Math.max(0, movementItem.quantity - mvQty) : mvQty) <= movementItem.min_quantity
                      ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {mvType === 'in' ? movementItem.quantity + mvQty : mvType === 'out' ? Math.max(0, movementItem.quantity - mvQty) : mvQty} {movementItem.unit}
                  </span>
                </div>
                {mvQty > 0 && movementItem.unit_cost > 0 && (
                  <div className="flex justify-between text-gray-400 mt-1">
                    <span>Valor:</span><span className="text-gray-300">{fmt(mvQty * movementItem.unit_cost)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button onClick={() => setShowMovement(false)} disabled={mvSaving} className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm">Cancelar</button>
              <button onClick={saveMovement} disabled={mvSaving || mvQty <= 0}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-900/40 disabled:text-cyan-700 rounded-xl py-3 text-sm font-bold">
                {mvSaving ? 'Guardando...' : '✓ Registrar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
