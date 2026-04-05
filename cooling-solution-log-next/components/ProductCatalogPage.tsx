'use client'

import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/db'
import { ProductPrice } from '@/lib/db'

interface ProductCatalogPageProps {
  onNavigate: (page: string) => void
}

interface VendorSummary {
  vendor: string
  prices: number[]
  latest: number
  latestDate: number
  avgPrice: number
  minPrice: number
  buyCount: number
}

interface CatalogEntry {
  product_name: string
  aliases: string[]
  records: ProductPrice[]
  vendors: VendorSummary[]
  latest_price: number
  latest_vendor: string
  latest_date: number
  category: string
}

type ViewMode = 'list' | 'detail'

const emptyForm = {
  product_name: '',
  aliases: '',
  vendor: '',
  unit_price: '',
  quantity: '1',
  unit: 'und',
  category: 'Materiales',
  client_for: '',
  notes: '',
}

function buildEntries(records: ProductPrice[]): CatalogEntry[] {
  const groups = new Map<string, ProductPrice[]>()
  for (const r of records) {
    const key = r.product_name.toLowerCase().trim()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  const result: CatalogEntry[] = []
  for (const [, recs] of groups) {
    recs.sort((a, b) => b.timestamp - a.timestamp)

    // Union of all aliases across all records
    const aliasSet = new Set<string>()
    recs.forEach(r => (r.aliases || []).forEach(a => {
      const trimmed = a.toLowerCase().trim()
      if (trimmed) aliasSet.add(trimmed)
    }))

    // Group by vendor
    const vendorMap = new Map<string, { prices: number[]; dates: number[] }>()
    recs.forEach(r => {
      if (!vendorMap.has(r.vendor)) vendorMap.set(r.vendor, { prices: [], dates: [] })
      vendorMap.get(r.vendor)!.prices.push(r.unit_price)
      vendorMap.get(r.vendor)!.dates.push(r.timestamp)
    })

    const vendors: VendorSummary[] = []
    for (const [vendor, { prices, dates }] of vendorMap) {
      const maxDateIdx = dates.indexOf(Math.max(...dates))
      vendors.push({
        vendor,
        prices,
        latest: prices[maxDateIdx],
        latestDate: dates[maxDateIdx],
        avgPrice: prices.reduce((s, p) => s + p, 0) / prices.length,
        minPrice: Math.min(...prices),
        buyCount: prices.length,
      })
    }
    vendors.sort((a, b) => b.latestDate - a.latestDate)

    result.push({
      product_name: recs[0].product_name,
      aliases: [...aliasSet],
      records: recs,
      vendors,
      latest_price: recs[0].unit_price,
      latest_vendor: recs[0].vendor,
      latest_date: recs[0].timestamp,
      category: recs[0].category || 'Materiales',
    })
  }

  return result.sort((a, b) => a.product_name.localeCompare(b.product_name))
}

export default function ProductCatalogPage({ onNavigate }: ProductCatalogPageProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterVendor, setFilterVendor] = useState('all')
  const [view, setView] = useState<ViewMode>('list')
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAliasModal, setShowAliasModal] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [addForm, setAddForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProducts() }, [])

  // When entries refresh, keep selectedEntry in sync
  useEffect(() => {
    if (!selectedEntry || view !== 'detail') return
    const updated = entries.find(
      e => e.product_name.toLowerCase() === selectedEntry.product_name.toLowerCase()
    )
    if (updated) setSelectedEntry(updated)
    else { setView('list'); setSelectedEntry(null) }
  }, [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadProducts = async () => {
    setLoading(true)
    try {
      const records = await db.table('product_prices').toArray() as ProductPrice[]
      setEntries(buildEntries(records))
    } catch (e) {
      console.error('Error loading products:', e)
    } finally {
      setLoading(false)
    }
  }

  const allCategories = useMemo(() => [...new Set(entries.map(e => e.category))].sort(), [entries])
  const allVendors = useMemo(
    () => [...new Set(entries.flatMap(e => e.vendors.map(v => v.vendor)))].sort(),
    [entries]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return entries.filter(e => {
      if (filterCategory !== 'all' && e.category !== filterCategory) return false
      if (filterVendor !== 'all' && !e.vendors.some(v => v.vendor === filterVendor)) return false
      if (q) {
        const matchName = e.product_name.toLowerCase().includes(q)
        const matchAlias = e.aliases.some(a => a.includes(q))
        if (!matchName && !matchAlias) return false
      }
      return true
    })
  }, [entries, search, filterCategory, filterVendor])

  const openDetail = (entry: CatalogEntry) => {
    setSelectedEntry(entry)
    setView('detail')
  }

  const openAliasEdit = () => {
    setAliasInput(selectedEntry!.aliases.join(', '))
    setShowAliasModal(true)
  }

  const saveAliases = async () => {
    if (!selectedEntry) return
    setSaving(true)
    try {
      const newAliases = aliasInput
        .split(',')
        .map(a => a.trim().toLowerCase())
        .filter(Boolean)
      for (const r of selectedEntry.records) {
        await db.table('product_prices').update(r.id!, { aliases: newAliases })
      }
      setShowAliasModal(false)
      await loadProducts()
    } finally {
      setSaving(false)
    }
  }

  const deleteRecord = async (id: number) => {
    if (!confirm('¿Borrar este registro?')) return
    await db.table('product_prices').delete(id)
    await loadProducts()
  }

  const deleteAllByName = async () => {
    if (!selectedEntry) return
    if (!confirm(`¿Borrar TODOS los registros de "${selectedEntry.product_name}"?`)) return
    for (const r of selectedEntry.records) {
      await db.table('product_prices').delete(r.id!)
    }
    setView('list')
    setSelectedEntry(null)
    await loadProducts()
  }

  const saveNewProduct = async () => {
    if (!addForm.product_name || !addForm.vendor || !addForm.unit_price) return
    setSaving(true)
    try {
      const now = Date.now()
      const aliases = addForm.aliases
        .split(',')
        .map(a => a.trim().toLowerCase())
        .filter(Boolean)
      const unitPrice = parseFloat(addForm.unit_price)
      const qty = parseFloat(addForm.quantity) || 1
      await db.table('product_prices').add({
        product_name: addForm.product_name.trim(),
        aliases,
        vendor: addForm.vendor.trim(),
        unit_price: unitPrice,
        quantity: qty,
        unit: addForm.unit || 'und',
        total_price: unitPrice * qty,
        client_for: addForm.client_for.trim(),
        category: addForm.category,
        notes: addForm.notes.trim(),
        timestamp: now,
        created_at: now,
      })
      setAddForm({ ...emptyForm })
      setShowAddModal(false)
      await loadProducts()
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })
  const formatCurrency = (n: number) => `$${n.toFixed(2)}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-400">Cargando catálogo...</p>
        </div>
      </div>
    )
  }

  // ===== DETAIL VIEW =====
  if (view === 'detail' && selectedEntry) {
    const vendorsSortedByPrice = [...selectedEntry.vendors].sort((a, b) => a.latest - b.latest)
    const cheapest = vendorsSortedByPrice[0]
    const maxVendorPrice = Math.max(...selectedEntry.vendors.map(v => v.latest), 0.01)

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gradient-to-r from-green-700 to-emerald-600 text-white p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); setSelectedEntry(null) }} className="text-lg">←</button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{selectedEntry.product_name}</h1>
              <p className="text-xs text-green-200">
                {selectedEntry.category} · {selectedEntry.records.length} compra{selectedEntry.records.length !== 1 ? 's' : ''} · {selectedEntry.vendors.length} vendor{selectedEntry.vendors.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-24">

          {/* Aliases */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-gray-300">Aliases</h3>
                <p className="text-xs text-gray-500">La IA usa estos nombres para identificar el producto</p>
              </div>
              <button
                onClick={openAliasEdit}
                className="text-xs text-cyan-400 border border-cyan-400/30 rounded-lg px-2.5 py-1.5 hover:bg-cyan-400/10"
              >
                ✏️ Editar
              </button>
            </div>
            {selectedEntry.aliases.length === 0 ? (
              <p className="text-xs text-gray-600 italic">Sin aliases — toca Editar para agregar</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedEntry.aliases.map(a => (
                  <span key={a} className="bg-[#0b1220] text-gray-300 text-xs px-2.5 py-1 rounded-full border border-white/10">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Price comparison by vendor */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Comparación por vendor</h3>
            <div className="space-y-4">
              {vendorsSortedByPrice.map(v => {
                const barWidth = Math.round((v.latest / maxVendorPrice) * 100)
                const isCheapest = selectedEntry.vendors.length > 1 && v.vendor === cheapest.vendor

                return (
                  <div key={v.vendor}>
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {isCheapest && <span className="text-green-400 text-xs font-bold">✓</span>}
                        <span className={`text-sm ${isCheapest ? 'text-green-300 font-medium' : 'text-gray-300'}`}>
                          {v.vendor}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${isCheapest ? 'text-green-400' : 'text-white'}`}>
                          {formatCurrency(v.latest)}
                        </span>
                        {v.buyCount > 1 && (
                          <span className="text-xs text-gray-500 ml-2">
                            avg {formatCurrency(v.avgPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-[#0b1220] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isCheapest ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs text-gray-600">
                      <span>{v.buyCount} compra{v.buyCount !== 1 ? 's' : ''}</span>
                      <span>Última: {formatDate(v.latestDate)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {selectedEntry.vendors.length > 1 && (
              <div className="mt-3 pt-3 border-t border-white/5 text-xs text-green-400">
                💰 Más barato: {cheapest.vendor} a {formatCurrency(cheapest.latest)}
                {vendorsSortedByPrice.length > 1 && (
                  <span className="text-gray-500 ml-2">
                    (ahorras {formatCurrency(vendorsSortedByPrice[vendorsSortedByPrice.length - 1].latest - cheapest.latest)} vs {vendorsSortedByPrice[vendorsSortedByPrice.length - 1].vendor})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Price history */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">Historial de compras</h3>
              <button
                onClick={deleteAllByName}
                className="text-xs text-red-400 border border-red-400/30 rounded-lg px-2.5 py-1.5 hover:bg-red-400/10"
              >
                🗑 Borrar todo
              </button>
            </div>
            <div className="space-y-2">
              {selectedEntry.records.map(r => (
                <div key={r.id} className="flex items-start gap-3 bg-[#0b1220] rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-200">{r.vendor}</span>
                      {r.category && (
                        <span className="text-xs text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{r.category}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDate(r.timestamp)}</p>
                    {r.client_for && (
                      <p className="text-xs text-blue-400 mt-0.5">👤 {r.client_for}</p>
                    )}
                    {r.notes && (
                      <p className="text-xs text-gray-600 mt-0.5">{r.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatCurrency(r.unit_price)}</p>
                      <p className="text-xs text-gray-600">x{r.quantity} {r.unit || 'und'}</p>
                    </div>
                    <button
                      onClick={() => deleteRecord(r.id!)}
                      className="text-gray-600 hover:text-red-400 transition-colors p-1 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alias edit modal */}
        {showAliasModal && (
          <>
            <div className="fixed inset-0 bg-black/80 z-40" onClick={() => !saving && setShowAliasModal(false)} />
            <div className="fixed inset-x-4 top-1/4 bg-[#111a2e] rounded-2xl z-50 p-5 border border-white/10">
              <h3 className="text-base font-bold mb-1">✏️ Editar aliases</h3>
              <p className="text-xs text-gray-400 mb-3">
                Nombres alternativos separados por coma. La IA los usará para identificar "{selectedEntry.product_name}" sin crear duplicados.
              </p>
              <textarea
                value={aliasInput}
                onChange={e => setAliasInput(e.target.value)}
                rows={3}
                placeholder="poly, rollo de filtro, filter media, filtro poly, Poly 1 pulgada..."
                className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => setShowAliasModal(false)}
                  disabled={saving}
                  className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-2.5 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveAliases}
                  disabled={saving}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-xl py-2.5 text-sm font-bold transition-colors"
                >
                  {saving ? 'Guardando...' : '✓ Guardar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ===== LIST VIEW =====
  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-green-700 to-emerald-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <div>
            <h1 className="text-xl font-bold">🔧 Catálogo HVAC</h1>
            <p className="text-xs text-green-200">{entries.length} producto{entries.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => { setAddForm({ ...emptyForm }); setShowAddModal(true) }}
          className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          + Agregar
        </button>
      </div>

      {/* Search + Filters */}
      <div className="p-4 space-y-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre o alias..."
          className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2.5 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm"
          >
            <option value="all">📂 Categorías</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterVendor}
            onChange={e => setFilterVendor(e.target.value)}
            className="bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm"
          >
            <option value="all">🏪 Vendors</option>
            {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Stats bar */}
        <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 flex gap-4 text-xs text-gray-400">
          <span>{filtered.length} producto{filtered.length !== 1 ? 's' : ''}</span>
          {search && <span className="text-cyan-400">🔍 "{search}"</span>}
          {filterCategory !== 'all' && <span className="text-amber-400">📂 {filterCategory}</span>}
          {filterVendor !== 'all' && <span className="text-blue-400">🏪 {filterVendor}</span>}
        </div>
      </div>

      {/* Product list */}
      <div className="px-4 pb-20 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🔧</p>
            <p className="font-medium">
              {search || filterCategory !== 'all' || filterVendor !== 'all'
                ? 'Sin resultados para esa búsqueda'
                : 'Catálogo vacío'}
            </p>
            <p className="text-xs mt-2">
              {entries.length === 0
                ? 'Los productos se agregan al registrar gastos de materiales en el chat'
                : 'Prueba con otro término de búsqueda'}
            </p>
          </div>
        ) : (
          filtered.map(entry => {
            const vendorsSorted = [...entry.vendors].sort((a, b) => a.latest - b.latest)
            const cheapest = vendorsSorted[0]
            const mostExpensive = vendorsSorted[vendorsSorted.length - 1]
            const hasPriceSpread = entry.vendors.length > 1 && cheapest.latest !== mostExpensive.latest

            return (
              <div
                key={entry.product_name}
                className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer hover:border-white/20 active:bg-[#1a2540] transition-colors"
                onClick={() => openDetail(entry)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-gray-100">{entry.product_name}</h3>
                      <span className="text-xs bg-[#0b1220] text-gray-500 px-1.5 py-0.5 rounded">
                        {entry.category}
                      </span>
                    </div>
                    {entry.aliases.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        aka: {entry.aliases.slice(0, 4).join(', ')}
                        {entry.aliases.length > 4 && ` +${entry.aliases.length - 4}`}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      {entry.latest_vendor} · {formatDate(entry.latest_date)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-white">{formatCurrency(entry.latest_price)}</p>
                    <p className="text-xs text-gray-500">
                      {entry.vendors.length} vendor{entry.vendors.length !== 1 ? 's' : ''}
                      {' · '}{entry.records.length} reg.
                    </p>
                  </div>
                </div>

                {hasPriceSpread && (
                  <div className="mt-2 pt-2 border-t border-white/5 flex gap-4 text-xs">
                    <span className="text-green-400">↓ {formatCurrency(cheapest.latest)} {cheapest.vendor}</span>
                    <span className="text-red-400">↑ {formatCurrency(mostExpensive.latest)} {mostExpensive.vendor}</span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add product modal */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => !saving && setShowAddModal(false)} />
          <div className="fixed inset-x-2 top-4 bottom-4 bg-[#111a2e] rounded-2xl z-50 overflow-hidden flex flex-col border border-white/10">
            <div className="p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-bold">+ Agregar producto</h2>
              {!saving && (
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 text-2xl">✕</button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre canónico *</label>
                <input
                  type="text"
                  value={addForm.product_name}
                  onChange={e => setAddForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="Ej: Filtro Poly AC"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-600 mt-1">Nombre estándar normalizado que siempre usará la IA</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Aliases (separados por coma)</label>
                <input
                  type="text"
                  value={addForm.aliases}
                  onChange={e => setAddForm(f => ({ ...f, aliases: e.target.value }))}
                  placeholder="poly, rollo de filtro, filter media, filtro rollo..."
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Vendor / Suplidor *</label>
                <input
                  type="text"
                  value={addForm.vendor}
                  onChange={e => setAddForm(f => ({ ...f, vendor: e.target.value }))}
                  placeholder="Ej: Refricentro"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Precio unitario *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={addForm.unit_price}
                    onChange={e => setAddForm(f => ({ ...f, unit_price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Unidad</label>
                  <input
                    type="text"
                    value={addForm.unit}
                    onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="und, rollo, caja..."
                    className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Categoría</label>
                <select
                  value={addForm.category}
                  onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option>Materiales</option>
                  <option>Herramientas</option>
                  <option>Piezas</option>
                  <option>Refrigerante</option>
                  <option>Otro</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Cliente (opcional)</label>
                <input
                  type="text"
                  value={addForm.client_for}
                  onChange={e => setAddForm(f => ({ ...f, client_for: e.target.value }))}
                  placeholder="Para qué cliente se compró"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas</label>
                <input
                  type="text"
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Notas adicionales"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowAddModal(false)}
                disabled={saving}
                className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveNewProduct}
                disabled={saving || !addForm.product_name || !addForm.vendor || !addForm.unit_price}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-900/40 disabled:text-green-700 rounded-xl py-3 text-sm font-bold transition-colors"
              >
                {saving ? 'Guardando...' : '✓ Guardar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
