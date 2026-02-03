'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { generatePhotoReport } from '@/lib/pdfGenerator'
import type { Client, Job, EventRecord, ClientPhoto } from '@/lib/types'

interface ClientsPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'detail' | 'edit' | 'new'

export default function ClientsPage({ onNavigate }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientJobs, setClientJobs] = useState<Job[]>([])
  const [clientEvents, setClientEvents] = useState<EventRecord[]>([])
  const [clientPhotos, setClientPhotos] = useState<ClientPhoto[]>([])
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
    
    // Load photos
    const photos = await db.client_photos.toArray()
    const clientPhotosFiltered = photos.filter(p => 
      p.client_id === client.id || 
      p.client_name?.toLowerCase().includes(clientName)
    )
    setClientPhotos(clientPhotosFiltered)
  }

  const startEdit = () => {
    if (!selectedClient) return
    setEditForm({ ...selectedClient })
    setViewMode('edit')
  }

  const startNew = () => {
    setEditForm({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      address: '',
      type: 'residential',
      notes: ''
    })
    setViewMode('new')
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
      notes: editForm.notes || '',
      updated_at: Date.now()
    })
    const updated = await db.clients.get(selectedClient.id)
    if (updated) {
      setSelectedClient(updated)
      setViewMode('detail')
      loadClients()
    }
  }

  const saveNew = async () => {
    if (!editForm.first_name) {
      alert('El nombre es requerido')
      return
    }
    const now = Date.now()
    await db.clients.add({
      first_name: editForm.first_name || '',
      last_name: editForm.last_name || '',
      phone: editForm.phone || '',
      email: editForm.email || '',
      address: editForm.address || '',
      type: editForm.type || 'residential',
      notes: editForm.notes || '',
      active: true,
      created_at: now,
      updated_at: now
    })
    setViewMode('list')
    loadClients()
  }

  const toggleActive = async () => {
    if (!selectedClient?.id) return
    await db.clients.update(selectedClient.id, { active: !selectedClient.active })
    setViewMode('list')
    setSelectedClient(null)
    loadClients()
  }

  const handleGeneratePhotoReport = () => {
    if (!selectedClient || clientPhotos.length === 0) {
      alert('No hay fotos para este cliente')
      return
    }
    const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`
    generatePhotoReport(clientPhotos, clientName)
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
          <div className="flex items-center gap-2">
            <button onClick={startNew} className="bg-green-500 hover:bg-green-600 rounded-lg px-3 py-1.5 text-sm font-medium">+ Nuevo</button>
            <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
          </div>
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
              {search ? 'No se encontraron clientes' : 'No hay clientes. Presiona "+ Nuevo" para agregar uno.'}
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

  // ========== NEW CLIENT VIEW ==========
  if (viewMode === 'new') {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">➕ Nuevo Cliente</h1>
          </div>
          <button onClick={saveNew} className="bg-green-500 hover:bg-green-600 rounded-lg px-4 py-1.5 text-sm font-medium">Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
                <input
                  value={editForm.first_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                  placeholder="José"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Apellido</label>
                <input
                  value={editForm.last_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                  placeholder="Rivera"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Teléfono</label>
              <input
                value={editForm.phone || ''}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="787-555-1234"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input
                value={editForm.email || ''}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="jose@email.com"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dirección</label>
              <input
                value={editForm.address || ''}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="Bayamón, PR"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditForm(f => ({ ...f, type: 'residential' }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'residential' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}
                >
                  🏠 Residencial
                </button>
                <button
                  onClick={() => setEditForm(f => ({ ...f, type: 'commercial' }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'commercial' ? 'bg-purple-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}
                >
                  🏢 Comercial
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notas</label>
              <textarea
                value={editForm.notes || ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm h-20"
                placeholder="Notas adicionales..."
              />
            </div>
          </div>
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
          <button onClick={saveEdit} className="bg-green-500 hover:bg-green-600 rounded-lg px-4 py-1.5 text-sm font-medium">Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre</label>
                <input
                  value={editForm.first_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Apellido</label>
                <input
                  value={editForm.last_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Teléfono</label>
              <input
                value={editForm.phone || ''}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input
                value={editForm.email || ''}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dirección</label>
              <input
                value={editForm.address || ''}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditForm(f => ({ ...f, type: 'residential' }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'residential' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}
                >
                  🏠 Residencial
                </button>
                <button
                  onClick={() => setEditForm(f => ({ ...f, type: 'commercial' }))}
                  className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'commercial' ? 'bg-purple-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}
                >
                  🏢 Comercial
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notas</label>
              <textarea
                value={editForm.notes || ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm h-20"
              />
            </div>
          </div>

          <button onClick={toggleActive} className="w-full bg-red-900/30 text-red-400 rounded-xl py-3 text-sm border border-red-900/50">
            {selectedClient.active ? '🗑️ Desactivar Cliente' : '✅ Reactivar Cliente'}
          </button>
        </div>
      </div>
    )
  }

  // ========== DETAIL VIEW ==========
  if (viewMode === 'detail' && selectedClient) {
    const totalJobs = clientJobs.length
    const totalCharged = clientJobs.reduce((s, j) => s + j.total_charged, 0)
    const totalPaid = clientJobs.reduce((s, j) => s + (j.payments?.reduce((ps, p) => ps + p.amount, 0) || 0), 0)
    const totalPending = totalCharged - totalPaid

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setSelectedClient(null) }} className="text-lg">←</button>
            <h1 className="text-xl font-bold">👤 {selectedClient.first_name}</h1>
          </div>
          <button onClick={startEdit} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">✏️ Editar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {/* Client Info */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <h2 className="text-xl font-bold text-gray-100 mb-2">{selectedClient.first_name} {selectedClient.last_name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded ${selectedClient.type === 'commercial' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
              {selectedClient.type === 'commercial' ? '🏢 Comercial' : '🏠 Residencial'}
            </span>
            {selectedClient.phone && <p className="text-sm text-gray-400 mt-3">📞 {selectedClient.phone}</p>}
            {selectedClient.email && <p className="text-sm text-gray-400">✉️ {selectedClient.email}</p>}
            {selectedClient.address && <p className="text-sm text-gray-400">📍 {selectedClient.address}</p>}
            {selectedClient.notes && <p className="text-sm text-gray-500 mt-2 italic">"{selectedClient.notes}"</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-2xl font-bold text-gray-200">{totalJobs}</p>
              <p className="text-xs text-gray-500">Trabajos</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-2xl font-bold text-green-400">{fmt(totalCharged)}</p>
              <p className="text-xs text-gray-500">Facturado</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className={`text-2xl font-bold ${totalPending > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{fmt(totalPending)}</p>
              <p className="text-xs text-gray-500">Pendiente</p>
            </div>
          </div>

          {/* Photo Report Button */}
          {clientPhotos.length > 0 && (
            <button 
              onClick={handleGeneratePhotoReport}
              className="w-full bg-[#111a2e] hover:bg-[#1a2332] rounded-xl p-4 border border-white/5 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📸</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-200">Reporte de Fotos</p>
                  <p className="text-xs text-gray-500">{clientPhotos.length} foto(s) guardadas</p>
                </div>
              </div>
              <span className="text-blue-400 text-sm font-medium">Generar PDF →</span>
            </button>
          )}

          {/* Photos Preview */}
          {clientPhotos.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">📷 Fotos ({clientPhotos.length})</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {clientPhotos.slice(0, 6).map((photo, i) => (
                  <div key={i} className="flex-shrink-0">
                    <img 
                      src={photo.photo_data} 
                      alt={photo.description || 'Foto'} 
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 text-center capitalize">{photo.category}</p>
                  </div>
                ))}
                {clientPhotos.length > 6 && (
                  <div className="flex-shrink-0 w-20 h-20 bg-[#0b1220] rounded-lg flex items-center justify-center">
                    <span className="text-gray-400 text-sm">+{clientPhotos.length - 6}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Jobs */}
          {clientJobs.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">🔧 Historial de Trabajos</h3>
              <div className="space-y-2">
                {clientJobs.map((j, i) => {
                  const paid = j.payments?.reduce((s, p) => s + p.amount, 0) || 0
                  const pending = j.total_charged - paid
                  return (
                    <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-white/5 last:border-0">
                      <div>
                        <p className="text-gray-300">{j.type}</p>
                        <p className="text-xs text-gray-500">{fmtDate(j.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-200">{fmt(j.total_charged)}</p>
                        {pending > 0 && <p className="text-xs text-yellow-400">Debe: {fmt(pending)}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Events */}
          {clientEvents.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">📋 Eventos Relacionados</h3>
              <div className="space-y-2">
                {clientEvents.slice(0, 10).map((e, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-gray-300">{e.category}</p>
                      <p className="text-xs text-gray-500">{fmtDate(e.timestamp)}</p>
                    </div>
                    <span className={`font-medium ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                      {e.type === 'income' ? '+' : '-'}{fmt(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}