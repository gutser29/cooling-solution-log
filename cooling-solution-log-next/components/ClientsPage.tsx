'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { Client, Job, EventRecord } from '@/lib/types'

interface ClientsPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'detail' | 'edit'

export default function ClientsPage({ onNavigate }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientJobs, setClientJobs] = useState<Job[]>([])
  const [clientEvents, setClientEvents] = useState<EventRecord[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [filter, setFilter] = useState<'all' | 'residential' | 'commercial'>('all')

  const loadClients = useCallback(async () => {
    const all = await db.clients.where('active').equals(1).toArray()
    setClients(all.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name)))
    setLoading(false)
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  const selectClient = async (client: Client) => {
    setSelectedClient(client)
    setViewMode('detail')
    const jobs = await db.jobs.where('client_id').equals(client.id!).toArray()
    setClientJobs(jobs.sort((a, b) => b.date - a.date))
    const events = await db.events.toArray()
    const clientName = `${client.first_name} ${client.last_name}`.toLowerCase()
    const related = events.filter(e =>
      e.client_id === client.id ||
      (e.client && e.client.toLowerCase().includes(clientName))
    ).sort((a, b) => b.timestamp - a.timestamp)
    setClientEvents(related)
  }

  const startEdit = () => {
    if (!selectedClient) return
    setEditForm({ ...selectedClient })
    setViewMode('edit')
  }

  const saveEdit = async () => {
    if (!selectedClient?.id || !editForm) return
    await db.clients.update(selectedClient.id, {
      first_name: editForm.first_name || selectedClient.first_name,
      last_name: editForm.last_name || selectedClient.last_name,
      phone: editForm.phone || '',
      email: editForm.email || '',
      address: editForm.address || '',
      type: editForm.type || selectedClient.type,
      notes: editForm.notes || ''
    })
    const updated = await db.clients.get(selectedClient.id)
    if (updated) {
      setSelectedClient(updated)
      setViewMode('detail')
      loadClients()
    }
  }

  const toggleActive = async () => {
    if (!selectedClient?.id) return
    await db.clients.update(selectedClient.id, { active: !selectedClient.active })
    setViewMode('list')
    setSelectedClient(null)
    loadClients()
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })

  const filtered = clients.filter(c => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || (c.phone || '').includes(search)
    const matchFilter = filter === 'all' || c.type === filter
    return matchSearch && matchFilter
  })

  // ========== LIST VIEW ==========
  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">👥 Clientes</h1>
          </div>
          <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬 Chat</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-3">
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
          />

          {/* Filter */}
          <div className="flex gap-2">
            {(['all', 'residential', 'commercial'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
              >
                {f === 'all' ? 'Todos' : f === 'residential' ? 'Residencial' : 'Comercial'}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500 self-center">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Client List */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {search ? 'No se encontraron clientes' : 'No hay clientes registrados. Registra trabajos por chat para crear clientes.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
                const name = `${c.first_name} ${c.last_name}`
                return (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c)}
                    className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 text-left hover:bg-[#1a2332] transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-200">{name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${c.type === 'commercial' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                            {c.type === 'commercial' ? '🏢 Comercial' : '🏠 Residencial'}
                          </span>
                          {c.phone && <span className="text-xs text-gray-500">📞 {c.phone}</span>}
                        </div>
                      </div>
                      <span className="text-gray-500 text-lg">›</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== EDIT VIEW ==========
  if (viewMode === 'edit' && selectedClient) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('detail')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">✏️ Editar Cliente</h1>
          </div>
          <button onClick={saveEdit} className="bg-green-500 rounded-lg px-4 py-1.5 text-sm font-medium">💾 Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {[
            { label: 'Nombre', key: 'first_name' },
            { label: 'Apellido', key: 'last_name' },
            { label: 'Teléfono', key: 'phone' },
            { label: 'Email', key: 'email' },
            { label: 'Dirección', key: 'address' }
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
              <input
                value={(editForm as any)[field.key] || ''}
                onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
            <div className="flex gap-2">
              {(['residential', 'commercial'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setEditForm(prev => ({ ...prev, type: t }))}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${editForm.type === t ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
                >
                  {t === 'residential' ? '🏠 Residencial' : '🏢 Comercial'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea
              value={editForm.notes || ''}
              onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </div>
    )
  }

  // ========== DETAIL VIEW ==========
  if (viewMode === 'detail' && selectedClient) {
    const name = `${selectedClient.first_name} ${selectedClient.last_name}`
    const totalCharged = clientJobs.reduce((s, j) => s + j.total_charged, 0)
    const totalPaid = clientJobs.reduce((s, j) => s + (j.payments?.reduce((ps, p) => ps + p.amount, 0) || 0), 0)
    const totalOwed = totalCharged - totalPaid

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setSelectedClient(null) }} className="text-lg">←</button>
            <h1 className="text-xl font-bold">{name}</h1>
          </div>
          <button onClick={startEdit} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">✏️ Editar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {/* Info Card */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-2">
            <div className="flex justify-between items-center">
              <span className={`text-xs px-2 py-0.5 rounded ${selectedClient.type === 'commercial' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                {selectedClient.type === 'commercial' ? '🏢 Comercial' : '🏠 Residencial'}
              </span>
              <span className="text-xs text-gray-500">Desde {fmtDate(selectedClient.created_at)}</span>
            </div>
            {selectedClient.phone && <p className="text-sm text-gray-300">📞 {selectedClient.phone}</p>}
            {selectedClient.email && <p className="text-sm text-gray-300">📧 {selectedClient.email}</p>}
            {selectedClient.address && <p className="text-sm text-gray-300">📍 {selectedClient.address}</p>}
            {selectedClient.notes && <p className="text-sm text-gray-400 italic mt-2">📝 {selectedClient.notes}</p>}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xs text-gray-400">Total Cobrado</p>
              <p className="text-lg font-bold text-green-400">{fmt(totalCharged)}</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xs text-gray-400">Pagado</p>
              <p className="text-lg font-bold text-blue-400">{fmt(totalPaid)}</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xs text-gray-400">Debe</p>
              <p className={`text-lg font-bold ${totalOwed > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{fmt(totalOwed)}</p>
            </div>
          </div>

          {/* Jobs */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-3">🔧 Trabajos ({clientJobs.length})</p>
            {clientJobs.length === 0 ? (
              <p className="text-sm text-gray-500">Sin trabajos registrados</p>
            ) : (
              <div className="space-y-2">
                {clientJobs.map((j, i) => {
                  const paid = j.payments?.reduce((s, p) => s + p.amount, 0) || 0
                  return (
                    <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-sm text-gray-300">{j.type} — {j.services?.[0]?.description || 'Trabajo'}</p>
                        <p className="text-xs text-gray-500">{fmtDate(j.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-200">{fmt(j.total_charged)}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          j.payment_status === 'paid' ? 'bg-green-900/50 text-green-400' :
                          j.payment_status === 'partial' ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-red-900/50 text-red-400'
                        }`}>
                          {j.payment_status === 'paid' ? '✅ Pagado' : j.payment_status === 'partial' ? `⏳ Debe ${fmt(j.total_charged - paid)}` : '⏳ Pendiente'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Events */}
          {clientEvents.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <p className="text-sm font-semibold text-gray-300 mb-3">🕐 Eventos Recientes</p>
              <div className="space-y-2">
                {clientEvents.slice(0, 10).map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${e.type === 'income' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                        {e.type === 'income' ? '↑' : '↓'}
                      </span>
                      <span className="text-gray-300">{e.category}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-medium ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>{fmt(e.amount)}</span>
                      <span className="text-gray-500 text-xs ml-2">{fmtDate(e.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deactivate */}
          <button onClick={toggleActive} className="w-full py-3 rounded-xl text-sm font-medium bg-red-900/30 text-red-400 border border-red-800/30 hover:bg-red-900/50 transition-colors">
            {selectedClient.active ? '🚫 Desactivar Cliente' : '✅ Reactivar Cliente'}
          </button>
        </div>
      </div>
    )
  }

  return null
}