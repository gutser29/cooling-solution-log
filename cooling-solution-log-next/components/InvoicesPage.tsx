'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { downloadInvoicePDF, generateInvoiceNumber } from '@/lib/pdfGenerator'
import ConfirmDialog from './ConfirmDialog'
import type { Invoice, InvoiceItem, Client, JobTemplate, ClientLocation } from '@/lib/types'

interface InvoicesPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'create' | 'edit' | 'detail' | 'groupPay'
type Tab = 'invoices' | 'quotes'

const emptyItem = (): InvoiceItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 })

export default function InvoicesPage({ onNavigate }: InvoicesPageProps) {
  const [tab, setTab] = useState<Tab>('invoices')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; item: Invoice | null }>({ show: false, item: null })

  // Form state
  const [formType, setFormType] = useState<'invoice' | 'quote'>('invoice')
  const [formClientName, setFormClientName] = useState('')
  const [formClientPhone, setFormClientPhone] = useState('')
  const [formClientEmail, setFormClientEmail] = useState('')
  const [formClientAddress, setFormClientAddress] = useState('')
  const [formItems, setFormItems] = useState<InvoiceItem[]>([emptyItem()])
  const [formTaxRate, setFormTaxRate] = useState(0)
  const [formNotes, setFormNotes] = useState('')
  const [formDueDays, setFormDueDays] = useState(30)
  const [formServiceDate, setFormServiceDate] = useState('')
  const [formDepositEnabled, setFormDepositEnabled] = useState(false)
  const [formDepositType, setFormDepositType] = useState<'percentage' | 'fixed'>('percentage')
  const [formDepositValue, setFormDepositValue] = useState(50)
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [formClientId, setFormClientId] = useState<number | undefined>(undefined)
  const [formLocationId, setFormLocationId] = useState<number | undefined>(undefined)
  const [formLocationName, setFormLocationName] = useState('')
  const [formLocationAddress, setFormLocationAddress] = useState('')
  const [clientLocations, setClientLocations] = useState<ClientLocation[]>([])
  const [formRetentionPercent, setFormRetentionPercent] = useState(0)
  // Feature 1: pending payment with custom date
  const [pendingPayMethod, setPendingPayMethod] = useState<string | null>(null)
  const [pendingPayDate, setPendingPayDate] = useState('')
  // Feature 2: group pay
  const [groupPayClientId, setGroupPayClientId] = useState<number | undefined>()
  const [groupPayClientName, setGroupPayClientName] = useState('')
  const [groupPayRetentionPct, setGroupPayRetentionPct] = useState(0)
  const [groupPaySelected, setGroupPaySelected] = useState<Set<number>>(new Set())
  const [groupPayDate, setGroupPayDate] = useState(new Date().toISOString().split('T')[0])
  const [groupPayMethod, setGroupPayMethod] = useState('check')
  const [groupPayBusy, setGroupPayBusy] = useState(false)

  const loadAll = useCallback(async () => {
    const all = await db.invoices.orderBy('created_at').reverse().toArray()
    setInvoices(all)
    try {
      const cls = await db.clients.toArray()
      setClients(cls.filter(c => c.active))
    } catch { setClients([]) }
    try {
      const tpls = await db.job_templates.toArray()
      setTemplates(tpls.filter(t => t.active))
    } catch { setTemplates([]) }
    setLoading(false)
    
    try {
      const templateData = localStorage.getItem('invoiceFromTemplate')
      if (templateData) {
        localStorage.removeItem('invoiceFromTemplate')
        const t = JSON.parse(templateData)
        setFormType('invoice')
        setFormClientName(t.client_name || '')
        setFormItems(t.items.map((i: any) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, total: i.quantity * i.unit_price })))
        setFormTaxRate(t.default_tax_rate || 0)
        setFormNotes(t.notes || '')
        setFormDueDays(30)
        setViewMode('create')
      }
    } catch {}
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filtered = invoices.filter(inv => tab === 'invoices' ? inv.type === 'invoice' : inv.type === 'quote')

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })

  const calcSubtotal = (items: InvoiceItem[]) => items.reduce((s, i) => s + i.total, 0)

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    setFormItems(prev => {
      const updated = [...prev]
      const item = { ...updated[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        item.total = Number(item.quantity) * Number(item.unit_price)
      }
      updated[idx] = item
      return updated
    })
  }

  const addItem = () => setFormItems(prev => [...prev, emptyItem()])

  const removeItem = (idx: number) => {
    if (formItems.length <= 1) return
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  const pickClient = async (c: Client) => {
    setFormClientName(`${c.first_name} ${c.last_name}`.trim())
    setFormClientPhone(c.phone || '')
    setFormClientEmail(c.email || '')
    setFormClientAddress(c.address || '')
    setFormClientId(c.id)
    setFormLocationId(undefined)
    setFormLocationName('')
    setFormRetentionPercent(c.retention_percent || 0)
    setShowClientPicker(false)
    setClientSearch('')
    try {
      const locs = await db.client_locations.where('client_id').equals(c.id!).filter(l => l.active).toArray()
      setClientLocations(locs.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)))
    } catch { setClientLocations([]) }
  }

  const pickTemplate = (t: JobTemplate) => {
    const newItems = t.items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.quantity * i.unit_price
    }))
    setFormItems(prev => {
      const existing = prev.filter(i => i.description.trim())
      return [...existing, ...newItems]
    })
    if (t.default_tax_rate) setFormTaxRate(t.default_tax_rate)
    if (t.notes) setFormNotes(t.notes)
    if (t.client_name && !formClientName) {
      setFormClientName(t.client_name)
      // Try to fill rest of client info from clients list
      const match = clients.find(c => `${c.first_name} ${c.last_name}` === t.client_name)
      if (match) {
        setFormClientPhone(match.phone || '')
        setFormClientEmail(match.email || '')
        setFormClientAddress(match.address || '')
      }
    }
    setShowTemplatePicker(false)
  }

  const resetForm = (type: 'invoice' | 'quote' = 'invoice') => {
    setFormType(type)
    setFormClientName('')
    setFormClientPhone('')
    setFormClientEmail('')
    setFormClientAddress('')
    setFormItems([emptyItem()])
    setFormTaxRate(0)
    setFormNotes('')
    setFormDueDays(type === 'quote' ? 15 : 30)
    setFormServiceDate('')
    setFormDepositEnabled(false)
    setFormDepositType('percentage')
    setFormDepositValue(50)
    setFormClientId(undefined)
    setFormLocationId(undefined)
    setFormLocationName('')
    setFormLocationAddress('')
    setFormRetentionPercent(0)
    setClientLocations([])
    setSelected(null)
  }

  const startCreate = (type: 'invoice' | 'quote') => {
    resetForm(type)
    setViewMode('create')
  }

  const startEdit = (inv: Invoice) => {
    setSelected(inv)
    setFormType(inv.type)
    setFormClientName(inv.client_name)
    setFormClientPhone(inv.client_phone || '')
    setFormClientEmail(inv.client_email || '')
    setFormClientAddress(inv.client_address || '')
    setFormItems(inv.items.length > 0 ? [...inv.items] : [emptyItem()])
    setFormTaxRate(inv.tax_rate)
    setFormNotes(inv.notes || '')
    setFormDueDays(inv.due_date ? Math.round((inv.due_date - inv.issue_date) / 86400000) : 30)
    setFormServiceDate(inv.service_date ? new Date(inv.service_date).toISOString().split('T')[0] : '')
    setFormDepositEnabled(inv.deposit_enabled || false)
    setFormDepositType(inv.deposit_type || 'percentage')
    setFormDepositValue(inv.deposit_value || 50)
    setFormClientId(inv.client_id)
    setFormLocationId(inv.location_id)
    setFormLocationName(inv.location_name || '')
    setFormLocationAddress(inv.location_address || '')
    setFormRetentionPercent(inv.retention_percent || 0)
    if (inv.client_id) {
      db.client_locations.where('client_id').equals(inv.client_id).filter(l => l.active).toArray()
        .then(locs => setClientLocations(locs.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))))
        .catch(() => setClientLocations([]))
    } else {
      setClientLocations([])
    }
    setViewMode('edit')
  }

  const saveInvoice = async () => {
    const validItems = formItems.filter(i => i.description.trim() && i.total > 0)
    if (!formClientName.trim() || validItems.length === 0) {
      alert('Falta cliente o items válidos')
      return
    }

    const now = Date.now()
    const subtotal = calcSubtotal(validItems)
    const taxAmount = subtotal * (formTaxRate / 100)
    const total = subtotal + taxAmount
    const dueDate = now + formDueDays * 86400000
    const depositAmount = formDepositEnabled ? (formDepositType === 'percentage' ? total * (formDepositValue / 100) : formDepositValue) : 0
    const balanceDue = total - depositAmount

    const locationData = formLocationId
      ? { location_id: formLocationId, location_name: formLocationName || undefined, location_address: formLocationAddress || undefined }
      : { location_id: undefined, location_name: undefined, location_address: undefined }
    const retentionData = formRetentionPercent > 0 ? { retention_percent: formRetentionPercent } : { retention_percent: undefined }

    if (selected?.id && viewMode === 'edit') {
      await db.invoices.update(selected.id, {
        client_id: formClientId,
        client_name: formClientName.trim(),
        client_phone: formClientPhone.trim() || undefined,
        client_email: formClientEmail.trim() || undefined,
        client_address: formClientAddress.trim() || undefined,
        ...locationData,
        ...retentionData,
        items: validItems,
        subtotal,
        tax_rate: formTaxRate,
        tax_amount: taxAmount,
        total,
        notes: formNotes.trim() || undefined,
        service_date: formServiceDate ? new Date(formServiceDate + 'T12:00:00').getTime() : undefined,
        deposit_enabled: formDepositEnabled || undefined,
        deposit_type: formDepositEnabled ? formDepositType : undefined,
        deposit_value: formDepositEnabled ? formDepositValue : undefined,
        deposit_amount: depositAmount,
        balance_due: balanceDue,
        due_date: formType === 'invoice' ? dueDate : undefined,
        expiration_date: formType === 'quote' ? dueDate : undefined,
        updated_at: now
      })
    } else {
      await db.invoices.add({
        invoice_number: generateInvoiceNumber(formType),
        type: formType,
        client_id: formClientId,
        client_name: formClientName.trim(),
        client_phone: formClientPhone.trim() || undefined,
        client_email: formClientEmail.trim() || undefined,
        client_address: formClientAddress.trim() || undefined,
        ...locationData,
        ...retentionData,
        items: validItems,
        subtotal,
        tax_rate: formTaxRate,
        tax_amount: taxAmount,
        total,
        notes: formNotes.trim() || undefined,
        service_date: formServiceDate ? new Date(formServiceDate + 'T12:00:00').getTime() : undefined,
        deposit_enabled: formDepositEnabled || undefined,
        deposit_type: formDepositEnabled ? formDepositType : undefined,
        deposit_value: formDepositEnabled ? formDepositValue : undefined,
        deposit_amount: depositAmount,
        balance_due: balanceDue,
        status: 'draft',
        issue_date: now,
        due_date: formType === 'invoice' ? dueDate : undefined,
        expiration_date: formType === 'quote' ? dueDate : undefined,
        created_at: now,
        updated_at: now
      })
    }

    setViewMode('list')
    loadAll()
  }

  const updateStatus = async (inv: Invoice, status: Invoice['status'], paidMethod?: string, paymentDateMs?: number, retentionAmount?: number) => {
    if (!inv.id) return
    const now = Date.now()
    const paymentTs = paymentDateMs || now
    const update: Partial<Invoice> = { status, updated_at: now }

    if (status === 'paid') {
      const retention = retentionAmount ?? (inv.retention_percent ? Math.round(inv.total * inv.retention_percent) / 100 : 0)
      const netAmount = inv.total - retention
      update.paid_date = paymentTs
      update.payment_date = paymentTs
      update.paid_method = paidMethod || 'cash'
      update.retention_amount = retention || undefined

      await db.events.add({
        timestamp: paymentTs,
        type: 'income',
        status: 'completed',
        category: 'factura',
        amount: netAmount,
        payment_method: paidMethod || 'cash',
        client: inv.client_name,
        client_id: inv.client_id,
        location_id: inv.location_id,
        retention_amount: retention || undefined,
        note: retention > 0
          ? `Factura ${inv.invoice_number} — Retención ${retention.toFixed(2)} = $${netAmount.toFixed(2)} recibido`
          : `Factura ${inv.invoice_number} pagada`,
        expense_type: 'business'
      })
    }

    await db.invoices.update(inv.id, update)
    loadAll()
    if (selected?.id === inv.id) {
      setSelected({ ...inv, ...update } as Invoice)
    }
  }

  const deleteInvoice = async (inv: Invoice) => {
    if (!inv.id) return
    await db.invoices.delete(inv.id)
    setConfirmDelete({ show: false, item: null })
    setViewMode('list')
    setSelected(null)
    loadAll()
  }

  const convertQuoteToInvoice = async (inv: Invoice) => {
    if (!inv.id) return
    const now = Date.now()
    await db.invoices.add({
      ...inv,
      id: undefined,
      invoice_number: generateInvoiceNumber('invoice'),
      type: 'invoice',
      status: 'draft',
      issue_date: now,
      due_date: now + 30 * 86400000,
      expiration_date: undefined,
      created_at: now,
      updated_at: now
    })
    loadAll()
    setTab('invoices')
    setViewMode('list')
    setSelected(null)
    alert('✅ Cotización convertida a factura — revisa en Facturas')
  }

  const sendWhatsApp = (inv: Invoice) => {
    const phone = inv.client_phone?.replace(/\D/g, '') || ''
    if (!phone) {
      alert('Este cliente no tiene teléfono registrado')
      return
    }
    const typeLabel = inv.type === 'quote' ? 'cotización' : 'factura'
    const itemsList = inv.items.map(i => `• ${i.description}: ${fmt(i.total)}`).join('\n')
    const text = `Hola ${inv.client_name},\n\nLe envío ${typeLabel} #${inv.invoice_number}:\n\n${itemsList}\n\n*Total: ${fmt(inv.total)}*\n\nCooling Solution\n939-425-6081\n"Donde tu confort es nuestra prioridad"`
    window.open(`https://wa.me/1${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada' }
    return map[s] || s
  }

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      draft: 'bg-gray-700 text-gray-300',
      sent: 'bg-blue-900/50 text-blue-400',
      paid: 'bg-green-900/50 text-green-400',
      overdue: 'bg-red-900/50 text-red-400',
      cancelled: 'bg-gray-800 text-gray-500'
    }
    return map[s] || 'bg-gray-700 text-gray-300'
  }

  // ========== FORM VIEW (create/edit) ==========
  if (viewMode === 'create' || viewMode === 'edit') {
    const subtotal = calcSubtotal(formItems)
    const taxAmount = subtotal * (formTaxRate / 100)
    const total = subtotal + taxAmount
    const depositAmount = formDepositEnabled ? (formDepositType === 'percentage' ? total * (formDepositValue / 100) : formDepositValue) : 0
    const balanceDue = total - depositAmount

    const filteredClients = clients.filter(c => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
      return !clientSearch || name.includes(clientSearch.toLowerCase()) || (c.phone && c.phone.includes(clientSearch))
    })

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">
              {viewMode === 'edit' ? '✏️ Editar' : '➕ Nueva'} {formType === 'quote' ? 'Cotización' : 'Factura'}
            </h1>
          </div>
          <button onClick={saveInvoice} className="bg-green-500 rounded-lg px-4 py-1.5 text-sm font-medium">💾 Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">

          {/* ====== TEMPLATE PICKER ====== */}
          {templates.length > 0 && viewMode === 'create' && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-300">📋 Usar Template</p>
                <button onClick={() => setShowTemplatePicker(!showTemplatePicker)} className="text-xs text-purple-400">
                  {showTemplatePicker ? 'Cerrar' : `Ver templates (${templates.length})`}
                </button>
              </div>
              {showTemplatePicker && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => pickTemplate(t)}
                      className="w-full text-left bg-[#0b1220] rounded-lg p-3 border border-white/10 hover:border-purple-500/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-gray-200">{t.name}</p>
                          {t.client_name && <p className="text-xs text-gray-500 mt-0.5">👤 {t.client_name}</p>}
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t.items.length} item{t.items.length !== 1 ? 's' : ''} • {t.default_tax_rate > 0 ? `IVU ${t.default_tax_rate}%` : 'Sin IVU'}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-green-400">
                          {fmt(t.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0))}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====== CLIENT SECTION - MEJORADO ====== */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">👤 Cliente</p>
              <button onClick={() => { setShowClientPicker(!showClientPicker); setClientSearch('') }} className="text-xs text-blue-400">
                {showClientPicker ? '✕ Cerrar' : '📋 Elegir existente'}
              </button>
            </div>

            {showClientPicker && (
              <div className="mb-3 bg-[#0b1220] rounded-lg p-3 border border-white/10">
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="🔍 Buscar por nombre o teléfono..."
                  className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
                  autoFocus
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredClients.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-3">No se encontraron clientes</p>
                  ) : (
                    filteredClients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => pickClient(c)}
                        className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-blue-900/30 border border-transparent hover:border-blue-500/30 text-gray-300 transition-colors"
                      >
                        <p className="font-medium">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.phone && `📞 ${c.phone}`}
                          {c.phone && c.address && ' • '}
                          {c.address && `📍 ${c.address}`}
                          {!c.phone && !c.address && (c.type === 'commercial' ? '🏢 Comercial' : '🏠 Residencial')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <input value={formClientName} onChange={e => setFormClientName(e.target.value)} placeholder="Nombre del cliente *" className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              <div className="grid grid-cols-2 gap-3">
                <input value={formClientPhone} onChange={e => setFormClientPhone(e.target.value)} placeholder="Teléfono" className="bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
                <input value={formClientEmail} onChange={e => setFormClientEmail(e.target.value)} placeholder="Email" className="bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              </div>
              <input value={formClientAddress} onChange={e => setFormClientAddress(e.target.value)} placeholder="Dirección" className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              {clientLocations.length > 0 && (
                <select
                  value={formLocationId ?? ''}
                  onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : undefined
                    setFormLocationId(id)
                    const loc = clientLocations.find(l => l.id === id)
                    setFormLocationName(loc?.name || '')
                    const addrParts = loc ? [loc.address, loc.city, loc.zip].filter(Boolean) : []
                    setFormLocationAddress(addrParts.join(', '))
                  }}
                  className="w-full bg-[#0b1220] border border-teal-700/50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">📍 Sin localidad específica</option>
                  {clientLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">📦 Items</p>
              <button onClick={addItem} className="text-xs bg-blue-600 px-3 py-1 rounded-lg">+ Agregar</button>
            </div>

            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div key={idx} className="bg-[#0b1220] rounded-lg p-3 border border-white/5">
                  <div className="flex gap-2 mb-2">
                    <textarea
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="Descripción del servicio/material"
                      rows={3}
                      className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600 resize-y min-h-[60px]"
                    />
                    {formItems.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 px-2 self-start mt-1">✕</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Cant.</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', Number(e.target.value) || 0)}
                        className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Precio</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unit_price || ''}
                        onChange={e => updateItem(idx, 'unit_price', Number(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Total</label>
                      <div className="bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-right text-green-400 font-medium">
                        {fmt(item.quantity * item.unit_price)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
{/* Tax & Totals & Deposit */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm text-gray-400">Subtotal</p>
              <p className="text-sm font-medium text-gray-200">{fmt(subtotal)}</p>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-sm text-gray-400">IVU %</p>
              <input
                type="number"
                step="0.5"
                value={formTaxRate || ''}
                onChange={e => setFormTaxRate(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-20 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
              />
              {formTaxRate > 0 && <p className="text-sm text-gray-400 ml-auto">{fmt(taxAmount)}</p>}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-white/10">
              <p className="text-lg font-bold text-gray-200">TOTAL</p>
              <p className="text-lg font-bold text-green-400">{fmt(total)}</p>
            </div>

            {/* Depósito */}
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-400">💰 Requiere depósito</p>
                <button
                  onClick={() => setFormDepositEnabled(!formDepositEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors ${formDepositEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${formDepositEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {formDepositEnabled && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormDepositType('percentage')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium ${formDepositType === 'percentage' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}
                    >
                      % Porcentaje
                    </button>
                    <button
                      onClick={() => setFormDepositType('fixed')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium ${formDepositType === 'fixed' ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}
                    >
                      $ Cantidad Fija
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      value={formDepositValue || ''}
                      onChange={e => setFormDepositValue(Number(e.target.value) || 0)}
                      placeholder={formDepositType === 'percentage' ? '50' : '0.00'}
                      className="w-24 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                    />
                    <span className="text-sm text-gray-500">{formDepositType === 'percentage' ? '%' : 'USD'}</span>
                  </div>
                  <div className="bg-[#0b1220] rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Depósito ({formDepositType === 'percentage' ? `${formDepositValue}%` : 'fijo'})</span>
                      <span className="text-yellow-400 font-medium">-{fmt(depositAmount)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-1 border-t border-white/10">
                      <span className="text-gray-200">BALANCE PENDIENTE</span>
                      <span className="text-orange-400">{fmt(balanceDue > 0 ? balanceDue : 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes & Due */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-400">📅 Fecha de servicio</p>
              <input
                type="date"
                value={formServiceDate}
                onChange={e => setFormServiceDate(e.target.value)}
                className="flex-1 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300"
              />
              {formServiceDate && (
                <button onClick={() => setFormServiceDate('')} className="text-xs text-red-400">✕</button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-400">{formType === 'quote' ? 'Válida por' : 'Vence en'}</p>
              <input
                type="number"
                value={formDueDays}
                onChange={e => setFormDueDays(Number(e.target.value) || 30)}
                className="w-16 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">días</span>
            </div>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="Notas adicionales (opcional)"
              rows={2}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none placeholder-gray-600"
            />
          </div>
        </div>
      </div>
    )
  }

  // ========== DETAIL VIEW ==========
  if (viewMode === 'detail' && selected) {
    const isQuote = selected.type === 'quote'
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setSelected(null) }} className="text-lg">←</button>
            <h1 className="text-lg font-bold">{isQuote ? 'Cotización' : 'Factura'} #{selected.invoice_number}</h1>
          </div>
          <div className="flex gap-2">
            {selected.status === 'draft' && (
              <button onClick={() => startEdit(selected)} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm">✏️</button>
            )}
            <button onClick={() => downloadInvoicePDF(selected)} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm">📄 PDF</button>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4">
          {/* Status + Info */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${statusColor(selected.status)}`}>
                {statusLabel(selected.status)}
              </span>
              <span className="text-xs text-gray-500">{fmtDate(selected.issue_date)}</span>
            </div>
            <p className="text-lg font-medium text-gray-200">{selected.client_name}</p>
            {selected.client_phone && <p className="text-sm text-gray-400">📞 {selected.client_phone}</p>}
            {selected.client_address && <p className="text-sm text-gray-400">📍 {selected.client_address}</p>}
            {selected.service_date && <p className="text-sm text-gray-400 mt-2">📅 Servicio: {fmtDate(selected.service_date)}</p>}
          </div>

          {/* Items */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-3">Items</p>
            <div className="space-y-2">
              {selected.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-gray-200">{item.description}</p>
                    <p className="text-xs text-gray-500">{item.quantity} × {fmt(item.unit_price)}</p>
                  </div>
                  <p className="font-medium text-gray-200">{fmt(item.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-300">{fmt(selected.subtotal)}</span>
              </div>
              {selected.tax_rate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">IVU ({selected.tax_rate}%)</span>
                  <span className="text-gray-300">{fmt(selected.tax_amount)}</span>
                </div>
              )}
             <div className="flex justify-between text-lg font-bold pt-2">
                <span className="text-gray-200">Total</span>
                <span className="text-green-400">{fmt(selected.total)}</span>
              </div>
              {selected.deposit_enabled && selected.deposit_amount && (
                <div className="mt-3 pt-3 border-t border-yellow-800/30 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-400">Depósito ({selected.deposit_type === 'percentage' ? `${selected.deposit_value}%` : 'fijo'})</span>
                    <span className="text-yellow-400 font-medium">-{fmt(selected.deposit_amount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span className="text-orange-400">BALANCE PENDIENTE</span>
                    <span className="text-orange-400">{fmt(selected.balance_due || 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selected.notes && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <p className="text-sm text-gray-400 mb-1">Notas</p>
              <p className="text-sm text-gray-300">{selected.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {selected.client_phone && (
              <button onClick={() => sendWhatsApp(selected)} className="w-full py-3 rounded-xl text-sm font-medium bg-green-600 text-white flex items-center justify-center gap-2">
                📱 Enviar por WhatsApp
              </button>
            )}

            {isQuote && selected.status !== 'cancelled' && (
              <button onClick={() => convertQuoteToInvoice(selected)} className="w-full py-3 rounded-xl text-sm font-medium bg-purple-600 text-white flex items-center justify-center gap-2">
                🔄 Convertir a Factura
              </button>
            )}

            {selected.status === 'draft' && (
              <button onClick={() => updateStatus(selected, 'sent')} className="w-full py-3 rounded-xl text-sm font-medium bg-blue-600 text-white">
                📤 Marcar como Enviada
              </button>
            )}
            {(selected.status === 'sent' || selected.status === 'overdue') && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center">Marcar como pagada con:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash', label: '💵 Efectivo' },
                    { key: 'ath_movil', label: '📱 ATH Móvil' },
                    { key: 'check', label: '📝 Cheque' },
                    { key: 'ach', label: '🏦 ACH' },
                    { key: 'credit_card', label: '💳 Tarjeta Crédito' },
                    { key: 'paypal', label: '🅿️ PayPal' },
                    { key: 'zelle', label: '⚡ Zelle' },
                    { key: 'transfer', label: '🔄 Transferencia' },
                  ].map(method => (
                    <button key={method.key}
                      onClick={() => { setPendingPayMethod(method.key); setPendingPayDate(new Date().toISOString().split('T')[0]) }}
                      className={`py-2.5 rounded-xl text-xs font-medium border ${pendingPayMethod === method.key ? 'bg-green-600 text-white border-green-500' : 'bg-green-900/30 text-green-400 border-green-800/30'}`}>
                      {method.label}
                    </button>
                  ))}
                </div>
                {pendingPayMethod && (
                  <div className="bg-[#0b1220] rounded-xl p-3 border border-green-700/40 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-400 whitespace-nowrap">📅 Fecha de pago</label>
                      <input
                        type="date"
                        value={pendingPayDate}
                        onChange={e => setPendingPayDate(e.target.value)}
                        className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    {selected.retention_percent ? (
                      <div className="text-xs text-yellow-400 bg-yellow-900/20 rounded-lg p-2">
                        ⚠️ Retención {selected.retention_percent}%: se registrará ${(selected.total * selected.retention_percent / 100).toFixed(2)} retenido, ${(selected.total * (1 - selected.retention_percent / 100)).toFixed(2)} recibido
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button onClick={() => setPendingPayMethod(null)} className="flex-1 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">Cancelar</button>
                      <button onClick={() => {
                        const dateMs = pendingPayDate ? new Date(pendingPayDate + 'T12:00:00').getTime() : Date.now()
                        updateStatus(selected, 'paid', pendingPayMethod, dateMs)
                        setPendingPayMethod(null)
                      }} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-medium">✅ Confirmar pago</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {selected.status !== 'paid' && selected.status !== 'cancelled' && (
              <button onClick={() => updateStatus(selected, 'cancelled')} className="w-full py-3 rounded-xl text-sm font-medium bg-gray-800 text-gray-400 border border-white/10">
                ✕ Cancelar
              </button>
            )}
            <button onClick={() => setConfirmDelete({ show: true, item: selected })} className="w-full py-3 rounded-xl text-sm font-medium bg-red-900/30 text-red-400 border border-red-800/30">
              🗑️ Eliminar
            </button>
          </div>
        </div>

        <ConfirmDialog
          show={confirmDelete.show}
          title={`Eliminar ${selected.type === 'quote' ? 'Cotización' : 'Factura'}`}
          message={`¿Eliminar ${selected.type === 'quote' ? 'cotización' : 'factura'} ${selected.invoice_number}?`}
          confirmText="Eliminar"
          confirmColor="red"
          onConfirm={() => confirmDelete.item && deleteInvoice(confirmDelete.item)}
          onCancel={() => setConfirmDelete({ show: false, item: null })}
        />
      </div>
    )
  }

  // ========== GROUP PAY VIEW ==========
  if (viewMode === 'groupPay') {
    const unpaidInvoices = invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue' || i.status === 'draft'))
    const clientsWithUnpaid = clients.filter(c => unpaidInvoices.some(i => i.client_id === c.id))
    const clientUnpaid = groupPayClientId ? unpaidInvoices.filter(i => i.client_id === groupPayClientId) : []
    const selectedInvoices = clientUnpaid.filter(i => groupPaySelected.has(i.id!))
    const totalFacturado = selectedInvoices.reduce((s, i) => s + i.total, 0)
    const totalRetencion = groupPayRetentionPct > 0 ? totalFacturado * groupPayRetentionPct / 100 : 0
    const totalNeto = totalFacturado - totalRetencion

    const executeGroupPay = async () => {
      if (selectedInvoices.length === 0 || !groupPayDate) return
      setGroupPayBusy(true)
      try {
        const dateMs = new Date(groupPayDate + 'T12:00:00').getTime()
        for (const inv of selectedInvoices) {
          const retention = groupPayRetentionPct > 0 ? inv.total * groupPayRetentionPct / 100 : 0
          await updateStatus(inv, 'paid', groupPayMethod, dateMs, retention)
        }
        setViewMode('list')
      } catch (e) { alert('Error: ' + String(e)) }
      finally { setGroupPayBusy(false) }
    }

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">💰 Pago Grupal</h1>
          </div>
        </div>
        <div className="p-4 max-w-2xl mx-auto space-y-4">

          {/* Step 1: pick client */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-3">👤 Cliente</p>
            <select value={groupPayClientId ?? ''} onChange={e => {
              const id = Number(e.target.value) || undefined
              setGroupPayClientId(id)
              setGroupPaySelected(new Set())
              const client = clients.find(c => c.id === id)
              setGroupPayClientName(client ? `${client.first_name} ${client.last_name}`.trim() : '')
              setGroupPayRetentionPct(client?.retention_percent || 0)
            }} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm">
              <option value="">Seleccionar cliente...</option>
              {clientsWithUnpaid.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.retention_percent ? ` ⚠️ ${c.retention_percent}%` : ''}</option>
              ))}
            </select>
            {groupPayRetentionPct > 0 && (
              <p className="text-xs text-yellow-400 mt-2">⚠️ Este cliente tiene retención de Hacienda del {groupPayRetentionPct}%</p>
            )}
          </div>

          {/* Step 2: select invoices */}
          {groupPayClientId && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold text-gray-300">🧾 Facturas pendientes</p>
                <button onClick={() => {
                  if (groupPaySelected.size === clientUnpaid.length) setGroupPaySelected(new Set())
                  else setGroupPaySelected(new Set(clientUnpaid.map(i => i.id!)))
                }} className="text-xs text-blue-400">
                  {groupPaySelected.size === clientUnpaid.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              </div>
              {clientUnpaid.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No hay facturas pendientes</p>
              ) : clientUnpaid.map(inv => (
                <label key={inv.id} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 cursor-pointer">
                  <input type="checkbox" checked={groupPaySelected.has(inv.id!)}
                    onChange={e => setGroupPaySelected(prev => { const s = new Set(prev); e.target.checked ? s.add(inv.id!) : s.delete(inv.id!); return s })}
                    className="w-4 h-4 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">#{inv.invoice_number}</p>
                    <p className="text-xs text-gray-500">{fmtDate(inv.issue_date)}{inv.service_date ? ` • Svc: ${fmtDate(inv.service_date)}` : ''}</p>
                  </div>
                  <p className="text-sm font-medium text-green-400">{fmt(inv.total)}</p>
                </label>
              ))}
            </div>
          )}

          {/* Step 3: payment details + summary */}
          {selectedInvoices.length > 0 && (
            <>
              <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-3">
                <p className="text-sm font-semibold text-gray-300">💳 Método y fecha</p>
                <div className="grid grid-cols-2 gap-3">
                  <select value={groupPayMethod} onChange={e => setGroupPayMethod(e.target.value)} className="bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {[['cash','💵 Efectivo'],['check','📝 Cheque'],['ach','🏦 ACH'],['ath_movil','📱 ATH Móvil'],['transfer','🔄 Transferencia'],['zelle','⚡ Zelle'],['credit_card','💳 Tarjeta']].map(([k,l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </select>
                  <input type="date" value={groupPayDate} onChange={e => setGroupPayDate(e.target.value)}
                    className="bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200" />
                </div>
              </div>

              <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-2">
                <p className="text-sm font-semibold text-gray-300 mb-1">📊 Resumen</p>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Facturas seleccionadas</span><span className="text-gray-200">{selectedInvoices.length}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Total facturado</span><span className="text-gray-200">{fmt(totalFacturado)}</span></div>
                {totalRetencion > 0 && (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-yellow-400">Retención Hacienda ({groupPayRetentionPct}%)</span><span className="text-yellow-400">-{fmt(totalRetencion)}</span></div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10"><span className="text-green-400">Neto a recibir</span><span className="text-green-400">{fmt(totalNeto)}</span></div>
                  </>
                )}
                {totalRetencion === 0 && (
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-white/10"><span className="text-green-400">Total a recibir</span><span className="text-green-400">{fmt(totalFacturado)}</span></div>
                )}
              </div>

              <button onClick={executeGroupPay} disabled={groupPayBusy || !groupPayDate}
                className="w-full py-4 rounded-xl text-base font-bold bg-green-600 text-white disabled:opacity-50">
                {groupPayBusy ? 'Procesando...' : `✅ Confirmar pago de ${selectedInvoices.length} factura${selectedInvoices.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ========== LIST VIEW ==========
  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🧾 Facturación</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setGroupPayClientId(undefined); setGroupPayClientName(''); setGroupPayRetentionPct(0); setGroupPaySelected(new Set()); setGroupPayDate(new Date().toISOString().split('T')[0]); setGroupPayMethod('check'); setViewMode('groupPay') }}
            className="bg-yellow-600 rounded-lg px-3 py-1.5 text-sm font-medium">💰 Grupal</button>
          <button onClick={() => startCreate(tab === 'quotes' ? 'quote' : 'invoice')}
            className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">
            + {tab === 'quotes' ? 'Cotización' : 'Factura'}
          </button>
        </div>
      </div>

      <div className="flex border-b border-white/10">
        {([
          { key: 'invoices' as Tab, label: '🧾 Facturas', count: invoices.filter(i => i.type === 'invoice' && i.status !== 'paid' && i.status !== 'cancelled').length },
          { key: 'quotes' as Tab, label: '📋 Cotizaciones', count: invoices.filter(i => i.type === 'quote' && i.status !== 'cancelled').length }
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t.key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">{tab === 'quotes' ? '📋' : '🧾'}</p>
            <p className="text-gray-500">Sin {tab === 'quotes' ? 'cotizaciones' : 'facturas'}</p>
            <p className="text-gray-600 text-sm mt-1">Crea una desde aquí o por chat</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => (
              <button
                key={inv.id}
                onClick={() => { setSelected(inv); setViewMode('detail') }}
                className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 text-left hover:bg-[#1a2332] transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-200">{inv.client_name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(inv.status)}`}>
                        {statusLabel(inv.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">#{inv.invoice_number} • {fmtDate(inv.issue_date)}</p>
                  </div>
                  <p className="text-lg font-bold text-green-400">{fmt(inv.total)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}