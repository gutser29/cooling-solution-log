'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { generatePhotoReport } from '@/lib/pdfGenerator'
import type { Client, Job, EventRecord, ClientPhoto, ClientDocument } from '@/lib/types'

interface ClientsPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'detail' | 'edit' | 'new'

const compressImage = (base64: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = base64
  })
}

export default function ClientsPage({ onNavigate }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientJobs, setClientJobs] = useState<Job[]>([])
  const [clientEvents, setClientEvents] = useState<EventRecord[]>([])
  const [clientPhotos, setClientPhotos] = useState<ClientPhoto[]>([])
  const [clientDocs, setClientDocs] = useState<ClientDocument[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [filter, setFilter] = useState<'all' | 'residential' | 'commercial'>('all')
  
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [showDocUpload, setShowDocUpload] = useState(false)
  const [photoCategory, setPhotoCategory] = useState<'before' | 'after' | 'diagnostic' | 'other'>('other')
  const [photoDesc, setPhotoDesc] = useState('')
  const [docType, setDocType] = useState<'contract' | 'permit' | 'warranty' | 'manual' | 'receipt' | 'other'>('other')
  const [docDesc, setDocDesc] = useState('')
  const [docName, setDocName] = useState('')
  
  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // ========== ARREGLADO: Query de clientes con boolean ==========
  const loadClients = useCallback(async () => {
    try {
      const all = await db.clients.toArray()
      const active = all.filter(c => c.active === true)
      setClients(active.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name)))
    } catch (error) {
      console.error('Error loading clients:', error)
      setClients([])
    } finally {
      setLoading(false)
    }
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
    
    const photos = await db.client_photos.toArray()
    const clientPhotosFiltered = photos.filter(p => 
      p.client_id === client.id || 
      p.client_name?.toLowerCase().includes(clientName)
    )
    setClientPhotos(clientPhotosFiltered)
    
    const docs = await db.client_documents.toArray()
    const clientDocsFiltered = docs.filter(d => 
      d.client_id === client.id || 
      d.client_name?.toLowerCase().includes(clientName)
    )
    setClientDocs(clientDocsFiltered)
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
    try {
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
    } catch (error) {
      console.error('Error saving client:', error)
      alert('Error al guardar cliente')
    }
  }

  const saveNew = async () => {
    if (!editForm.first_name) {
      alert('El nombre es requerido')
      return
    }
    try {
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
      alert('✅ Cliente creado')
    } catch (error) {
      console.error('Error creating client:', error)
      alert('Error al crear cliente')
    }
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

  // ========== NUEVO: Generar PDF de lista de clientes ==========
  const handleGenerateClientListPDF = async () => {
    try {
      const { generateClientListPDF } = await import('@/lib/pdfGenerator')
      generateClientListPDF(clients)
    } catch (error) {
      console.error('Error generating client list PDF:', error)
      alert('Error al generar PDF')
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files?.length) return
    const file = e.target.files[0]
    const b64 = await new Promise<string>(res => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.readAsDataURL(file)
    })
    const compressed = await compressImage(b64)
    const now = Date.now()
    
    await db.client_photos.add({
      client_id: selectedClient.id,
      client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
      category: photoCategory,
      description: photoDesc,
      photo_data: compressed,
      timestamp: now,
      created_at: now
    })
    
    const photos = await db.client_photos.toArray()
    const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`.toLowerCase()
    setClientPhotos(photos.filter(p => p.client_id === selectedClient.id || p.client_name?.toLowerCase().includes(clientName)))
    
    setShowPhotoUpload(false)
    setPhotoDesc('')
    setPhotoCategory('other')
    if (photoInputRef.current) photoInputRef.current.value = ''
    alert('✅ Foto guardada')
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files?.length) return
    const file = e.target.files[0]
    const fileType = file.name.split('.').pop() || 'unknown'
    const b64 = await new Promise<string>(res => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.readAsDataURL(file)
    })
    const now = Date.now()
    
    await db.client_documents.add({
      client_id: selectedClient.id,
      client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
      doc_type: docType,
      file_name: docName || file.name,
      file_type: fileType,
      file_data: b64,
      description: docDesc,
      timestamp: now,
      created_at: now
    })
    
    const docs = await db.client_documents.toArray()
    const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`.toLowerCase()
    setClientDocs(docs.filter(d => d.client_id === selectedClient.id || d.client_name?.toLowerCase().includes(clientName)))
    
    setShowDocUpload(false)
    setDocDesc('')
    setDocName('')
    setDocType('other')
    if (docInputRef.current) docInputRef.current.value = ''
    alert('✅ Documento guardado')
  }

  const viewDocument = (doc: ClientDocument) => {
    const link = document.createElement('a')
    link.href = doc.file_data
    link.download = doc.file_name
    link.click()
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })

  const filtered = clients.filter(c => {
    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || (c.phone || '').includes(search)
    const matchFilter = filter === 'all' || c.type === filter
    return matchSearch && matchFilter
  })

  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">👥 Clientes</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleGenerateClientListPDF} className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm font-medium">📄 PDF</button>
            <button onClick={startNew} className="bg-green-500 hover:bg-green-600 rounded-lg px-3 py-1.5 text-sm font-medium">+ Nuevo</button>
            <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
          />

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

          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {search ? 'No se encontraron clientes' : 'No hay clientes. Presiona "+ Nuevo" para agregar uno.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => selectClient(c)}
                  className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 text-left hover:bg-[#1a2332] transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-200">{c.first_name} {c.last_name}</p>
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
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (viewMode === 'new' || viewMode === 'edit') {
    const isNew = viewMode === 'new'
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode(isNew ? 'list' : 'detail')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">{isNew ? '➕ Nuevo' : '✏️ Editar'} Cliente</h1>
          </div>
          <button onClick={isNew ? saveNew : saveEdit} className="bg-green-500 hover:bg-green-600 rounded-lg px-4 py-1.5 text-sm font-medium">Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
                <input value={editForm.first_name || ''} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="José" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Apellido</label>
                <input value={editForm.last_name || ''} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Rivera" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Teléfono</label>
              <input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="787-555-1234" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="jose@email.com" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dirección</label>
              <input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Bayamón, PR" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <div className="flex gap-2">
                <button onClick={() => setEditForm(f => ({ ...f, type: 'residential' }))} className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'residential' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}>🏠 Residencial</button>
                <button onClick={() => setEditForm(f => ({ ...f, type: 'commercial' }))} className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'commercial' ? 'bg-purple-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}>🏢 Comercial</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notas</label>
              <textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm h-20" placeholder="Notas adicionales..." />
            </div>
          </div>

          {!isNew && selectedClient && (
            <button onClick={toggleActive} className="w-full bg-red-900/30 text-red-400 rounded-xl py-3 text-sm border border-red-900/50">
              {selectedClient.active ? '🗑️ Desactivar Cliente' : '✅ Reactivar Cliente'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (viewMode === 'detail' && selectedClient) {
    const totalJobs = clientJobs.length
    const totalCharged = clientJobs.reduce((s, j) => s + j.total_charged, 0)
    const totalPaid = clientJobs.reduce((s, j) => s + (j.payments?.reduce((ps, p) => ps + p.amount, 0) || 0), 0)
    const totalPending = totalCharged - totalPaid

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100 pb-20">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setSelectedClient(null) }} className="text-lg">←</button>
            <h1 className="text-xl font-bold">👤 {selectedClient.first_name}</h1>
          </div>
          <button onClick={startEdit} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">✏️ Editar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
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

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowPhotoUpload(true)} className="bg-[#111a2e] hover:bg-[#1a2332] rounded-xl p-3 border border-white/5 text-center transition-colors">
              <span className="text-2xl">📷</span>
              <p className="text-xs text-gray-400 mt-1">Añadir Foto</p>
            </button>
            <button onClick={() => setShowDocUpload(true)} className="bg-[#111a2e] hover:bg-[#1a2332] rounded-xl p-3 border border-white/5 text-center transition-colors">
              <span className="text-2xl">📄</span>
              <p className="text-xs text-gray-400 mt-1">Añadir Documento</p>
            </button>
          </div>

          {clientPhotos.length > 0 && (
            <button onClick={handleGeneratePhotoReport} className="w-full bg-[#111a2e] hover:bg-[#1a2332] rounded-xl p-4 border border-white/5 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📸</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-200">Reporte de Fotos</p>
                  <p className="text-xs text-gray-500">{clientPhotos.length} foto(s)</p>
                </div>
              </div>
              <span className="text-blue-400 text-sm font-medium">PDF →</span>
            </button>
          )}

          {clientPhotos.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">📷 Fotos ({clientPhotos.length})</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {clientPhotos.slice(0, 6).map((photo, i) => (
                  <div key={i} className="flex-shrink-0">
                    <img src={photo.photo_data} alt={photo.description || 'Foto'} className="w-20 h-20 object-cover rounded-lg" />
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

          {clientDocs.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">📄 Documentos ({clientDocs.length})</h3>
              <div className="space-y-2">
                {clientDocs.map((doc, i) => (
                  <button key={i} onClick={() => viewDocument(doc)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#0b1220] transition-colors text-left">
                    <span className="text-xl">{doc.file_type === 'pdf' ? '📕' : '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{doc.file_name}</p>
                      <p className="text-xs text-gray-500 capitalize">{doc.doc_type} • {fmtDate(doc.timestamp)}</p>
                    </div>
                    <span className="text-blue-400 text-xs">Descargar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {clientJobs.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">🔧 Trabajos</h3>
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

          {clientEvents.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">📋 Eventos</h3>
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

        {showPhotoUpload && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowPhotoUpload(false)} />
            <div className="fixed bottom-0 left-0 right-0 bg-[#111a2e] rounded-t-2xl z-50 p-4 space-y-4">
              <h3 className="text-lg font-bold text-gray-200">📷 Añadir Foto</h3>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Categoría</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['before', 'after', 'diagnostic', 'other'] as const).map(cat => (
                    <button key={cat} onClick={() => setPhotoCategory(cat)} className={`py-2 rounded-lg text-xs ${photoCategory === cat ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}>
                      {cat === 'before' ? 'Antes' : cat === 'after' ? 'Después' : cat === 'diagnostic' ? 'Diagnóstico' : 'Otro'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Descripción</label>
                <input value={photoDesc} onChange={e => setPhotoDesc(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Compresor antes de reparación" />
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <div className="flex gap-2">
                <button onClick={() => setShowPhotoUpload(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-200">Cancelar</button>
                <button onClick={() => photoInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">📷 Seleccionar</button>
              </div>
            </div>
          </>
        )}

        {showDocUpload && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowDocUpload(false)} />
            <div className="fixed bottom-0 left-0 right-0 bg-[#111a2e] rounded-t-2xl z-50 p-4 space-y-4">
              <h3 className="text-lg font-bold text-gray-200">📄 Añadir Documento</h3>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['contract', 'permit', 'warranty', 'manual', 'receipt', 'other'] as const).map(t => (
                    <button key={t} onClick={() => setDocType(t)} className={`py-2 rounded-lg text-xs ${docType === t ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}>
                      {t === 'contract' ? 'Contrato' : t === 'permit' ? 'Permiso' : t === 'warranty' ? 'Garantía' : t === 'manual' ? 'Manual' : t === 'receipt' ? 'Recibo' : 'Otro'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nombre</label>
                <input value={docName} onChange={e => setDocName(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Contrato mantenimiento 2025" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Descripción</label>
                <input value={docDesc} onChange={e => setDocDesc(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Notas..." />
              </div>
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" onChange={handleDocUpload} className="hidden" />
              <div className="flex gap-2">
                <button onClick={() => setShowDocUpload(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-200">Cancelar</button>
                <button onClick={() => docInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">📄 Seleccionar</button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return null
}