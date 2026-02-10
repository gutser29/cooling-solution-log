'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { generatePhotoReport, generateDocumentListPDF } from '@/lib/pdfGenerator'
import ConfirmDialog from './ConfirmDialog'
import type { Client, Job, EventRecord, ClientPhoto, ClientDocument } from '@/lib/types'

interface ClientsPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'detail' | 'edit' | 'new' | 'newQuote'
type DetailTab = 'resumen' | 'facturas' | 'garantias' | 'gastos' | 'cotizaciones' | 'fotos' | 'docs'

interface QuickQuote {
  id?: number
  client_name: string
  client_id?: number
  description: string
  my_cost: number
  quoted_price: number
  markup: number
  status: 'pending' | 'approved' | 'rejected' | 'invoiced'
  notes?: string
  created_at: number
  updated_at?: number
  responded_at?: number
}

const compressImage = (base64: string, maxWidth = 2000): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
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
  const [clientInvoices, setClientInvoices] = useState<any[]>([])
  const [clientWarranties, setClientWarranties] = useState<any[]>([])
  const [clientExpenses, setClientExpenses] = useState<EventRecord[]>([])
  const [clientQuotes, setClientQuotes] = useState<QuickQuote[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [detailTab, setDetailTab] = useState<DetailTab>('resumen')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [filter, setFilter] = useState<'all' | 'residential' | 'commercial'>('all')
  const [confirmAction, setConfirmAction] = useState<{ show: boolean; title: string; message: string; action: () => void }>({ show: false, title: '', message: '', action: () => {} })

  // Photo/Doc upload state
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [showDocUpload, setShowDocUpload] = useState(false)
  const [photoCategory, setPhotoCategory] = useState<'before' | 'after' | 'diagnostic' | 'equipment' | 'area' | 'other'>('other')
  const [photoDesc, setPhotoDesc] = useState('')
  const [photoEquipment, setPhotoEquipment] = useState('')
  const [photoLocation, setPhotoLocation] = useState('')
  const [docType, setDocType] = useState<'contract' | 'permit' | 'warranty' | 'manual' | 'receipt' | 'agreement' | 'other'>('other')
  const [docDesc, setDocDesc] = useState('')
  const [docName, setDocName] = useState('')
  const [docExpiration, setDocExpiration] = useState('')

  // Quick quote form
  const [qDesc, setQDesc] = useState('')
  const [qMyCost, setQMyCost] = useState('')
  const [qQuoted, setQQuoted] = useState('')
  const [qNotes, setQNotes] = useState('')

  const photoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  const loadClients = useCallback(async () => {
    try {
      const all = await db.clients.toArray()
      const active = all.filter(c => c.active === true)
      setClients(active.sort((a, b) => (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name)))
    } catch { setClients([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  const selectClient = async (client: Client) => {
    setSelectedClient(client)
    setViewMode('detail')
    setDetailTab('resumen')

    const clientName = `${client.first_name} ${client.last_name}`.trim().toLowerCase()
    
    // Flexible name matching - handles "Farmacia Caridad" vs "Farmacia Caridad #40"
    const nameMatches = (val: string | undefined) => {
      if (!val) return false
      const v = val.trim().toLowerCase()
      return v.includes(clientName) || clientName.includes(v) || 
        (clientName.split(/\s+/).filter(p => p.length > 2).filter(p => v.includes(p)).length >= 2)
    }

    // Jobs
    const jobs = await db.jobs.where('client_id').equals(client.id!).toArray()
    setClientJobs(jobs.sort((a, b) => b.date - a.date))

    // Events (all related)

    const events = await db.events.toArray()
 const related = events.filter(e =>
      e.client_id === client.id || nameMatches(e.client)
    ).sort((a, b) => b.timestamp - a.timestamp)

    setClientEvents(related)

    // Expenses FOR this client (materials, etc)
    const expenses = related.filter(e => e.type === 'expense')
    setClientExpenses(expenses)

    // Photos
    const photos = await db.client_photos.toArray()
    setClientPhotos(photos.filter(p =>
      p.client_id === client.id || nameMatches(p.client_name)
    ).sort((a, b) => b.timestamp - a.timestamp))

    // Documents
    const docs = await db.client_documents.toArray()
    setClientDocs(docs.filter(d =>
      d.client_id === client.id || nameMatches(d.client_name)
    ).sort((a, b) => b.timestamp - a.timestamp))

    // Invoices
    try {
      const invoices = await db.invoices.toArray()
      setClientInvoices(invoices.filter(i =>
        nameMatches(i.client_name)
      ).sort((a: any, b: any) => b.issue_date - a.issue_date))
    } catch { setClientInvoices([]) }

    // Warranties
    try {
      const warranties = await db.table('warranties').toArray()
    setClientWarranties(warranties.filter((w: any) =>
        w.client_id === client.id || nameMatches(w.client_name)
      ).sort((a: any, b: any) => b.purchase_date - a.purchase_date))
    } catch { setClientWarranties([]) }

    // Quick Quotes
    try {
      const quotes = await db.table('quick_quotes').toArray()
     setClientQuotes(quotes.filter((q: any) =>
        q.client_id === client.id || nameMatches(q.client_name)
      ).sort((a: any, b: any) => b.created_at - a.created_at))
    } catch { setClientQuotes([]) }
  }

  const startEdit = () => {
    if (!selectedClient) return
    setEditForm({ ...selectedClient })
    setViewMode('edit')
  }

  const startNew = () => {
    setEditForm({ first_name: '', last_name: '', phone: '', email: '', address: '', type: 'residential', notes: '' })
    setViewMode('new')
  }

  const saveEdit = async () => {
    if (!selectedClient?.id || !editForm) return
    try {
      await db.clients.update(selectedClient.id, {
        first_name: editForm.first_name || selectedClient.first_name,
        last_name: editForm.last_name || selectedClient.last_name,
        phone: editForm.phone || '', email: editForm.email || '',
        address: editForm.address || '', type: editForm.type || selectedClient.type,
        notes: editForm.notes || '', updated_at: Date.now()
      })
      const updated = await db.clients.get(selectedClient.id)
      if (updated) { setSelectedClient(updated); setViewMode('detail'); loadClients() }
    } catch { alert('Error al guardar cliente') }
  }

  const saveNew = async () => {
    if (!editForm.first_name) { alert('El nombre es requerido'); return }
    try {
      const now = Date.now()
      const id = await db.clients.add({
        first_name: editForm.first_name || '', last_name: editForm.last_name || '',
        phone: editForm.phone || '', email: editForm.email || '',
        address: editForm.address || '', type: editForm.type || 'residential',
        notes: editForm.notes || '', active: true, created_at: now, updated_at: now
      })
      setViewMode('list'); loadClients()
    } catch { alert('Error al crear cliente') }
  }

  const toggleActive = async () => {
    if (!selectedClient?.id) return
    await db.clients.update(selectedClient.id, { active: !selectedClient.active })
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
    setViewMode('list'); setSelectedClient(null); loadClients()
  }

  const openWhatsApp = (phone: string, message?: string) => {
    const clean = phone.replace(/\D/g, '')
    if (!clean) return
    const url = message ? `https://wa.me/1${clean}?text=${encodeURIComponent(message)}` : `https://wa.me/1${clean}`
    window.open(url, '_blank')
  }

  // Quick Quote
  const saveQuickQuote = async () => {
    if (!selectedClient || !qDesc || !qQuoted) { alert('Descripción y precio cotizado son requeridos'); return }
    const now = Date.now()
    const myCost = parseFloat(qMyCost) || 0
    const quoted = parseFloat(qQuoted) || 0
    try {
      await db.table('quick_quotes').add({
        client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
        client_id: selectedClient.id,
        description: qDesc,
        my_cost: myCost,
        quoted_price: quoted,
        markup: quoted - myCost,
        status: 'pending',
        notes: qNotes || undefined,
        created_at: now,
      })
      setQDesc(''); setQMyCost(''); setQQuoted(''); setQNotes('')
      setViewMode('detail')
      // Reload quotes
      const quotes = await db.table('quick_quotes').toArray()
      const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`.toLowerCase()
      setClientQuotes(quotes.filter((q: any) => q.client_name?.toLowerCase().includes(clientName) || q.client_id === selectedClient.id).sort((a: any, b: any) => b.created_at - a.created_at))
    } catch (e) { console.error(e); alert('Error guardando cotización') }
  }

  const updateQuoteStatus = async (quoteId: number, status: string) => {
    try {
      await db.table('quick_quotes').update(quoteId, { status, updated_at: Date.now(), responded_at: Date.now() })
      setClientQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: status as any, responded_at: Date.now() } : q))
    } catch {}
  }

  const deleteQuote = async (quoteId: number) => {
    await db.table('quick_quotes').delete(quoteId)
    setClientQuotes(prev => prev.filter(q => q.id !== quoteId))
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
  }

  // Photo/Doc handlers
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files?.length) return
    const file = e.target.files[0]
    const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file) })
    const compressed = await compressImage(b64)
    const now = Date.now()
    await db.client_photos.add({
      client_id: selectedClient.id, client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
      category: photoCategory, description: photoDesc, equipment_type: photoEquipment || undefined,
      location: photoLocation || undefined, photo_data: compressed, timestamp: now, visit_date: now, created_at: now
    })
    const photos = await db.client_photos.toArray()
    const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`.toLowerCase()
    setClientPhotos(photos.filter(p => p.client_id === selectedClient.id || p.client_name?.toLowerCase().includes(clientName)).sort((a, b) => b.timestamp - a.timestamp))
    setShowPhotoUpload(false); setPhotoDesc(''); setPhotoEquipment(''); setPhotoLocation(''); setPhotoCategory('other')
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files?.length) return
    const file = e.target.files[0]
    const fileType = file.name.split('.').pop() || 'unknown'
    const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file) })
    const now = Date.now()
    await db.client_documents.add({
      client_id: selectedClient.id, client_name: `${selectedClient.first_name} ${selectedClient.last_name}`,
      doc_type: docType, file_name: docName || file.name, file_type: fileType, file_data: b64,
      description: docDesc, expiration_date: docExpiration ? new Date(docExpiration).getTime() : undefined,
      timestamp: now, created_at: now
    })
    const docs = await db.client_documents.toArray()
    const clientName = `${selectedClient.first_name} ${selectedClient.last_name}`.toLowerCase()
    setClientDocs(docs.filter(d => d.client_id === selectedClient.id || d.client_name?.toLowerCase().includes(clientName)).sort((a, b) => b.timestamp - a.timestamp))
    setShowDocUpload(false); setDocDesc(''); setDocName(''); setDocExpiration(''); setDocType('other')
    if (docInputRef.current) docInputRef.current.value = ''
  }

  const deletePhoto = async (photoId: number) => {
    await db.client_photos.delete(photoId); setClientPhotos(prev => prev.filter(p => p.id !== photoId))
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
  }
  const deleteDoc = async (docId: number) => {
    await db.client_documents.delete(docId); setClientDocs(prev => prev.filter(d => d.id !== docId))
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
  }

  const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar cliente..."
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500" />

          <div className="flex gap-2">
            {(['all', 'residential', 'commercial'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                {f === 'all' ? 'Todos' : f === 'residential' ? '🏠 Residencial' : '🏢 Comercial'}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500 self-center">{filtered.length}</span>
          </div>

          {loading ? <div className="text-center py-8 text-gray-500">Cargando...</div> :
          filtered.length === 0 ? <div className="text-center py-8 text-gray-500">{search ? 'No encontrado' : 'No hay clientes'}</div> : (
            <div className="space-y-2">
              {filtered.map(c => (
                <button key={c.id} onClick={() => selectClient(c)}
                  className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 text-left hover:bg-[#1a2332] transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-200">{c.first_name} {c.last_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${c.type === 'commercial' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                          {c.type === 'commercial' ? '🏢' : '🏠'} {c.type === 'commercial' ? 'Comercial' : 'Residencial'}
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

  // ========== NEW/EDIT VIEW ==========
  if (viewMode === 'new' || viewMode === 'edit') {
    const isNew = viewMode === 'new'
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode(isNew ? 'list' : 'detail')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">{isNew ? '➕ Nuevo' : '✏️ Editar'} Cliente</h1>
          </div>
          <button onClick={isNew ? saveNew : saveEdit} className="bg-green-500 rounded-lg px-4 py-1.5 text-sm font-medium">Guardar</button>
        </div>
        <div className="p-4 max-w-2xl mx-auto">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1 block">Nombre *</label>
                <input value={editForm.first_name || ''} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="José" /></div>
              <div><label className="text-xs text-gray-400 mb-1 block">Apellido</label>
                <input value={editForm.last_name || ''} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Rivera" /></div>
            </div>
            <div><label className="text-xs text-gray-400 mb-1 block">Teléfono</label>
              <input value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="787-555-1234" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Email</label>
              <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="jose@email.com" /></div>
            <div><label className="text-xs text-gray-400 mb-1 block">Dirección</label>
              <input value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Bayamón, PR" /></div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
              <div className="flex gap-2">
                <button onClick={() => setEditForm(f => ({ ...f, type: 'residential' }))} className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'residential' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}>🏠 Residencial</button>
                <button onClick={() => setEditForm(f => ({ ...f, type: 'commercial' }))} className={`flex-1 py-2 rounded-lg text-sm ${editForm.type === 'commercial' ? 'bg-purple-600 text-white' : 'bg-[#0b1220] border border-white/10 text-gray-400'}`}>🏢 Comercial</button>
              </div>
            </div>
            <div><label className="text-xs text-gray-400 mb-1 block">Notas</label>
              <textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm h-20" placeholder="Notas..." /></div>
          </div>
          {!isNew && selectedClient && (
            <button onClick={() => setConfirmAction({ show: true, title: selectedClient.active ? 'Desactivar' : 'Reactivar', message: `¿${selectedClient.active ? 'Desactivar' : 'Reactivar'} a ${selectedClient.first_name}?`, action: toggleActive })}
              className="w-full mt-4 bg-red-900/30 text-red-400 rounded-xl py-3 text-sm border border-red-900/50">
              {selectedClient.active ? '🗑️ Desactivar Cliente' : '✅ Reactivar Cliente'}
            </button>
          )}
        </div>
        <ConfirmDialog show={confirmAction.show} title={confirmAction.title} message={confirmAction.message} confirmText="Confirmar" confirmColor="red" onConfirm={confirmAction.action} onCancel={() => setConfirmAction({ show: false, title: '', message: '', action: () => {} })} />
      </div>
    )
  }

  // ========== NEW QUOTE VIEW ==========
  if (viewMode === 'newQuote' && selectedClient) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('detail')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">💬 Cotización Rápida</h1>
          </div>
        </div>
        <div className="p-4 max-w-2xl mx-auto space-y-4">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm text-gray-400 mb-1">Cliente</p>
            <p className="text-gray-200 font-medium">{selectedClient.first_name} {selectedClient.last_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Descripción *</p>
            <textarea value={qDesc} onChange={e => setQDesc(e.target.value)} rows={3}
              placeholder="Ej: Compresor scroll 3 ton para unidad paquete techo"
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">💰 Mi costo</p>
              <input type="number" step="0.01" value={qMyCost} onChange={e => setQMyCost(e.target.value)} placeholder="0.00"
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">💵 Precio cotizado *</p>
              <input type="number" step="0.01" value={qQuoted} onChange={e => setQQuoted(e.target.value)} placeholder="0.00"
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
            </div>
          </div>
          {qMyCost && qQuoted && (
            <div className="bg-green-900/20 rounded-xl p-3 border border-green-700/30">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Ganancia:</span>
                <span className="text-green-400 font-bold">{fmt(parseFloat(qQuoted || '0') - parseFloat(qMyCost || '0'))}</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-500">Markup:</span>
                <span className="text-green-400">{parseFloat(qMyCost) > 0 ? ((parseFloat(qQuoted || '0') / parseFloat(qMyCost || '1') - 1) * 100).toFixed(0) : '—'}%</span>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">📝 Notas</p>
            <textarea value={qNotes} onChange={e => setQNotes(e.target.value)} rows={2}
              placeholder="Le envié por WhatsApp, esperando respuesta..."
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('detail')} className="flex-1 bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm">Cancelar</button>
            <button onClick={saveQuickQuote} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">💾 Guardar</button>
          </div>
          {selectedClient.phone && (
            <button onClick={() => {
              const msg = `Hola, le informo sobre ${qDesc}. El costo sería ${qQuoted ? `$${qQuoted}` : '(por definir)'}. Déjeme saber cómo desea proceder. Gracias.`
              openWhatsApp(selectedClient.phone!, msg)
            }} className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium">
              📱 Enviar por WhatsApp
            </button>
          )}
        </div>
      </div>
    )
  }

  // ========== DETAIL VIEW ==========
  if (viewMode === 'detail' && selectedClient) {
    // Financial calculations
    const totalInvoiced = clientInvoices.reduce((s: number, i: any) => s + (i.total || 0), 0)
    const totalPaid = clientInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + (i.total || 0), 0)
    const totalPending = clientInvoices.filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled').reduce((s: number, i: any) => s + (i.total || 0), 0)
    const totalExpenses = clientExpenses.reduce((s, e) => s + e.amount, 0)
    const profit = totalPaid - totalExpenses
    const activeWarranties = clientWarranties.filter((w: any) => w.status === 'active').length
    const pendingQuotes = clientQuotes.filter(q => q.status === 'pending').length

    const tabs: { key: DetailTab; label: string; count?: number }[] = [
      { key: 'resumen', label: '📊' },
      { key: 'facturas', label: '🧾', count: clientInvoices.length },
      { key: 'garantias', label: '🛡️', count: clientWarranties.length },
      { key: 'gastos', label: '📦', count: clientExpenses.length },
      { key: 'cotizaciones', label: '💬', count: clientQuotes.length },
      { key: 'fotos', label: '📷', count: clientPhotos.length },
      { key: 'docs', label: '📄', count: clientDocs.length },
    ]

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100 pb-20">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setSelectedClient(null) }} className="text-lg">←</button>
            <h1 className="text-xl font-bold truncate">👤 {selectedClient.first_name} {selectedClient.last_name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {selectedClient.phone && (
              <button onClick={() => openWhatsApp(selectedClient.phone!)} className="bg-green-500 rounded-lg px-2.5 py-1.5 text-sm">📱</button>
            )}
            <button onClick={startEdit} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm">✏️</button>
          </div>
        </div>

        {/* Client info bar */}
        <div className="px-4 pt-3 max-w-2xl mx-auto">
          <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded ${selectedClient.type === 'commercial' ? 'bg-purple-900/50 text-purple-400' : 'bg-blue-900/50 text-blue-400'}`}>
                {selectedClient.type === 'commercial' ? '🏢 Comercial' : '🏠 Residencial'}
              </span>
              {selectedClient.phone && <span className="text-xs text-gray-500">📞 {selectedClient.phone}</span>}
              {selectedClient.address && <span className="text-xs text-gray-500">📍 {selectedClient.address}</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 max-w-2xl mx-auto">
          <div className="flex gap-1 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setDetailTab(t.key)}
                className={`text-xs px-3 py-2 rounded-lg whitespace-nowrap flex-shrink-0 ${detailTab === t.key ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                {t.label}{t.count !== undefined && t.count > 0 ? ` ${t.count}` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">

          {/* ====== RESUMEN TAB ====== */}
          {detailTab === 'resumen' && (
            <>
              {/* Financial Summary */}
              <div className={`rounded-xl p-4 border ${profit >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                <p className="text-xs text-gray-400 mb-1">Ganancia Neta con este Cliente</p>
                <p className={`text-3xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(profit)}</p>
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-green-400">↑ Pagado: {fmt(totalPaid)}</span>
                  <span className="text-red-400">↓ Gastos: {fmt(totalExpenses)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-xl font-bold text-gray-200">{fmt(totalInvoiced)}</p>
                  <p className="text-xs text-gray-500">Facturado Total</p>
                </div>
                <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
                  <p className={`text-xl font-bold ${totalPending > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{fmt(totalPending)}</p>
                  <p className="text-xs text-gray-500">Pendiente Cobro</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-lg font-bold text-orange-400">{activeWarranties}</p>
                  <p className="text-[10px] text-gray-500">Garantías</p>
                </div>
                <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-lg font-bold text-purple-400">{pendingQuotes}</p>
                  <p className="text-[10px] text-gray-500">Cotiz. Pend.</p>
                </div>
                <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-lg font-bold text-blue-400">{clientInvoices.length}</p>
                  <p className="text-[10px] text-gray-500">Facturas</p>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <button onClick={() => { setViewMode('newQuote'); setQDesc(''); setQMyCost(''); setQQuoted(''); setQNotes('') }}
                  className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl py-3 text-sm text-gray-300">💬 Cotización</button>
                <button onClick={() => setShowPhotoUpload(true)}
                  className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl py-3 text-sm text-gray-300">📷 Foto</button>
                <button onClick={() => setShowDocUpload(true)}
                  className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl py-3 text-sm text-gray-300">📄 Doc</button>
              </div>
            </>
          )}

          {/* ====== FACTURAS TAB ====== */}
          {detailTab === 'facturas' && (
            <>
              {clientInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay facturas para este cliente</div>
              ) : clientInvoices.map((inv: any) => (
                <div key={inv.id} className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-200">#{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{inv.type === 'quote' ? 'Cotización' : 'Factura'} • {fmtDate(inv.issue_date)}</p>
                      {inv.items?.map((item: any, idx: number) => (
                        <p key={idx} className="text-xs text-gray-400 mt-1">• {item.description} — {fmt(item.total)}</p>
                      ))}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-200">{fmt(inv.total)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        inv.status === 'paid' ? 'bg-green-900/50 text-green-400' :
                        inv.status === 'sent' || inv.status === 'overdue' ? 'bg-yellow-900/50 text-yellow-400' :
                        inv.status === 'cancelled' ? 'bg-red-900/50 text-red-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {inv.status === 'paid' ? 'Pagada' : inv.status === 'sent' ? 'Enviada' : inv.status === 'overdue' ? 'Vencida' : inv.status === 'draft' ? 'Borrador' : inv.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ====== GARANTÍAS TAB ====== */}
          {detailTab === 'garantias' && (
            <>
              {clientWarranties.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay garantías para este cliente</div>
              ) : clientWarranties.map((w: any) => {
                const now = Date.now()
                const daysLeft = Math.ceil((w.expiration_date - now) / 86400000)
                const isActive = w.status === 'active' && daysLeft > 0
                const isExpiring = isActive && daysLeft <= 30
                return (
                  <div key={w.id} className="bg-[#111a2e] rounded-xl p-4 border border-white/5" onClick={() => onNavigate('warranties')}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-200">{w.equipment_type}</p>
                        <p className="text-xs text-gray-400">{w.brand}{w.model_number ? ` — ${w.model_number}` : ''}</p>
                        <p className="text-xs text-gray-500 mt-1">🏪 {w.vendor} • {fmtDate(w.purchase_date)}</p>
                        {w.cost && <p className="text-xs text-gray-500">Costo: {fmt(w.cost)}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        w.status === 'claimed' ? 'bg-blue-900/50 text-blue-400' :
                        !isActive ? 'bg-red-900/50 text-red-400' :
                        isExpiring ? 'bg-yellow-900/50 text-yellow-400' :
                        'bg-green-900/50 text-green-400'
                      }`}>
                        {w.status === 'claimed' ? '📋 Reclamada' :
                         !isActive ? '🔴 Vencida' :
                         isExpiring ? `⚠️ ${daysLeft}d` :
                         `✅ ${daysLeft}d`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ====== GASTOS/MATERIALES TAB ====== */}
          {detailTab === 'gastos' && (
            <>
              {clientExpenses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay gastos registrados para este cliente</div>
              ) : (
                <>
                  <div className="bg-red-900/20 rounded-xl p-3 border border-red-700/30">
                    <p className="text-xs text-gray-400">Total gastado para este cliente</p>
                    <p className="text-2xl font-bold text-red-400">{fmt(totalExpenses)}</p>
                  </div>
                  {clientExpenses.map((e, i) => (
                    <div key={i} className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-300">{e.category || e.subtype || 'Gasto'}</p>
                          <p className="text-xs text-gray-500">{fmtDate(e.timestamp)}{e.vendor ? ` • ${e.vendor}` : ''}</p>
                          {e.note && <p className="text-xs text-gray-600 mt-0.5">{e.note}</p>}
                        </div>
                        <p className="text-red-400 font-medium">{fmt(e.amount)}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ====== COTIZACIONES TAB ====== */}
          {detailTab === 'cotizaciones' && (
            <>
              <button onClick={() => { setViewMode('newQuote'); setQDesc(''); setQMyCost(''); setQQuoted(''); setQNotes('') }}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">+ Nueva Cotización Rápida</button>
              {clientQuotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay cotizaciones</div>
              ) : clientQuotes.map(q => (
                <div key={q.id} className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-sm text-gray-200">{q.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmtDate(q.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      q.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' :
                      q.status === 'approved' ? 'bg-green-900/50 text-green-400' :
                      q.status === 'rejected' ? 'bg-red-900/50 text-red-400' :
                      'bg-blue-900/50 text-blue-400'
                    }`}>
                      {q.status === 'pending' ? '⏳ Pendiente' : q.status === 'approved' ? '✅ Aprobada' : q.status === 'rejected' ? '❌ Rechazada' : '🧾 Facturada'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs bg-[#0b1220] rounded-lg p-2">
                    <div><p className="text-gray-500">Mi costo</p><p className="text-red-400 font-medium">{fmt(q.my_cost)}</p></div>
                    <div><p className="text-gray-500">Cotizado</p><p className="text-gray-200 font-medium">{fmt(q.quoted_price)}</p></div>
                    <div><p className="text-gray-500">Ganancia</p><p className="text-green-400 font-medium">{fmt(q.markup)}</p></div>
                  </div>
                  {q.notes && <p className="text-xs text-gray-500 mt-2">{q.notes}</p>}
                  {q.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => updateQuoteStatus(q.id!, 'approved')} className="flex-1 bg-green-600/20 text-green-400 py-1.5 rounded-lg text-xs border border-green-600/30">✅ Aprobada</button>
                      <button onClick={() => updateQuoteStatus(q.id!, 'rejected')} className="flex-1 bg-red-600/20 text-red-400 py-1.5 rounded-lg text-xs border border-red-600/30">❌ Rechazada</button>
                      <button onClick={() => setConfirmAction({ show: true, title: 'Eliminar', message: `¿Eliminar cotización de ${q.description}?`, action: () => deleteQuote(q.id!) })}
                        className="bg-gray-700 text-gray-400 py-1.5 px-3 rounded-lg text-xs">🗑️</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ====== FOTOS TAB ====== */}
          {detailTab === 'fotos' && (
            <>
              <button onClick={() => setShowPhotoUpload(true)} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">+ Añadir Foto</button>
              {clientPhotos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay fotos</div>
              ) : (
                <>
                  {clientPhotos.length > 0 && (
                    <button onClick={() => {
                      const name = `${selectedClient.first_name} ${selectedClient.last_name}`
                      generatePhotoReport(clientPhotos, name)
                    }} className="w-full bg-[#111a2e] border border-white/10 rounded-xl p-3 text-sm text-blue-400 text-center">
                      📸 Generar Reporte PDF ({clientPhotos.length} fotos)
                    </button>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {clientPhotos.map(photo => (
                      <div key={photo.id} className="relative group">
                        <img src={photo.photo_data} alt="" className="w-full h-24 object-cover rounded-lg" />
                        <p className="text-[10px] text-gray-500 mt-1 truncate">{fmtDate(photo.timestamp)}</p>
                        <button onClick={() => photo.id && setConfirmAction({ show: true, title: 'Eliminar', message: '¿Eliminar esta foto?', action: () => deletePhoto(photo.id!) })}
                          className="absolute top-1 right-1 bg-red-500/80 text-white text-xs w-5 h-5 rounded-full opacity-0 group-hover:opacity-100">×</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ====== DOCS TAB ====== */}
          {detailTab === 'docs' && (
            <>
              <button onClick={() => setShowDocUpload(true)} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">+ Añadir Documento</button>
              {clientDocs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay documentos</div>
              ) : (
                <>
                  {clientDocs.length > 0 && (
                    <button onClick={() => {
                      const name = `${selectedClient.first_name} ${selectedClient.last_name}`
                      generateDocumentListPDF(clientDocs, name)
                    }} className="w-full bg-[#111a2e] border border-white/10 rounded-xl p-3 text-sm text-blue-400 text-center">
                      📋 Generar Lista PDF ({clientDocs.length} docs)
                    </button>
                  )}
                  <div className="space-y-2">
                    {clientDocs.map(doc => (
                      <div key={doc.id} className="bg-[#111a2e] rounded-xl p-3 border border-white/5 flex items-center gap-3 group">
                        <span className="text-xl">{doc.file_type === 'pdf' ? '📕' : '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200 truncate">{doc.file_name}</p>
                          <p className="text-xs text-gray-500 capitalize">{doc.doc_type} • {fmtDate(doc.timestamp)}</p>
                        </div>
                        <button onClick={() => { const a = document.createElement('a'); a.href = doc.file_data; a.download = doc.file_name; a.click() }} className="text-blue-400 text-xs">⬇</button>
                        <button onClick={() => doc.id && setConfirmAction({ show: true, title: 'Eliminar', message: `¿Eliminar "${doc.file_name}"?`, action: () => deleteDoc(doc.id!) })}
                          className="text-red-400 text-xs opacity-0 group-hover:opacity-100">🗑️</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Photo Upload Modal */}
        {showPhotoUpload && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowPhotoUpload(false)} />
            <div className="fixed bottom-0 left-0 right-0 bg-[#111a2e] rounded-t-2xl z-50 p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-200">📷 Añadir Foto</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['before', 'after', 'diagnostic', 'equipment', 'area', 'other'] as const).map(cat => (
                  <button key={cat} onClick={() => setPhotoCategory(cat)} className={`py-2 rounded-lg text-xs ${photoCategory === cat ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}>
                    {cat === 'before' ? '📷 Antes' : cat === 'after' ? '✅ Después' : cat === 'diagnostic' ? '🔍 Diag.' : cat === 'equipment' ? '⚙️ Equipo' : cat === 'area' ? '📐 Área' : '📎 Otro'}
                  </button>
                ))}
              </div>
              <input value={photoDesc} onChange={e => setPhotoDesc(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Descripción" />
              <div className="grid grid-cols-2 gap-2">
                <input value={photoEquipment} onChange={e => setPhotoEquipment(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Equipo (opcional)" />
                <input value={photoLocation} onChange={e => setPhotoLocation(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Ubicación (opcional)" />
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <div className="flex gap-2">
                <button onClick={() => setShowPhotoUpload(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-200">Cancelar</button>
                <button onClick={() => photoInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">📷 Seleccionar</button>
              </div>
            </div>
          </>
        )}

        {/* Doc Upload Modal */}
        {showDocUpload && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowDocUpload(false)} />
            <div className="fixed bottom-0 left-0 right-0 bg-[#111a2e] rounded-t-2xl z-50 p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-gray-200">📄 Añadir Documento</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['contract', 'permit', 'warranty', 'manual', 'receipt', 'agreement', 'other'] as const).map(t => (
                  <button key={t} onClick={() => setDocType(t)} className={`py-2 rounded-lg text-xs ${docType === t ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}>
                    {t === 'contract' ? 'Contrato' : t === 'permit' ? 'Permiso' : t === 'warranty' ? 'Garantía' : t === 'manual' ? 'Manual' : t === 'receipt' ? 'Recibo' : t === 'agreement' ? 'Acuerdo' : 'Otro'}
                  </button>
                ))}
              </div>
              <input value={docName} onChange={e => setDocName(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Nombre del documento" />
              <input value={docDesc} onChange={e => setDocDesc(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Descripción (opcional)" />
              <input type="date" value={docExpiration} onChange={e => setDocExpiration(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300" />
              <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" onChange={handleDocUpload} className="hidden" />
              <div className="flex gap-2">
                <button onClick={() => setShowDocUpload(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-200">Cancelar</button>
                <button onClick={() => docInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">📄 Seleccionar</button>
              </div>
            </div>
          </>
        )}

        <ConfirmDialog show={confirmAction.show} title={confirmAction.title} message={confirmAction.message} confirmText="Confirmar" confirmColor="red" onConfirm={confirmAction.action} onCancel={() => setConfirmAction({ show: false, title: '', message: '', action: () => {} })} />
      </div>
    )
  }

  return null
}