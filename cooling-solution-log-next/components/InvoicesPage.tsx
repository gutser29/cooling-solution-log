'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { downloadInvoicePDF, generateInvoiceNumber } from '@/lib/pdfGenerator'
import ConfirmDialog from './ConfirmDialog'
import type { Invoice, InvoiceItem, Client, JobTemplate, ClientLocation, InvoiceBatch } from '@/lib/types'

interface InvoicesPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'create' | 'edit' | 'detail' | 'groupPay' | 'newBatch' | 'batchDetail'
type Tab = 'invoices' | 'quotes' | 'batches'

const emptyItem = (): InvoiceItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 })

const PAYMENT_METHODS = [
  { key: 'cash',        label: '💵 Efectivo' },
  { key: 'ath_movil',   label: '📱 ATH Móvil' },
  { key: 'check',       label: '📝 Cheque' },
  { key: 'ach',         label: '🏦 ACH' },
  { key: 'credit_card', label: '💳 Tarjeta' },
  { key: 'zelle',       label: '⚡ Zelle' },
  { key: 'transfer',    label: '🔄 Transferencia' },
  { key: 'paypal',      label: '🅿️ PayPal' },
]

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
  // Quick pay from list
  const [quickPayInvoiceId, setQuickPayInvoiceId] = useState<number | undefined>(undefined)
  const [quickPayDate, setQuickPayDate] = useState(new Date().toISOString().split('T')[0])
  // Revert confirmation
  const [confirmRevert, setConfirmRevert] = useState<{ show: boolean; inv: Invoice | null; action: 'toDraft' | 'toSent' }>({ show: false, inv: null, action: 'toDraft' })
  // Feature 2: group pay
  const [groupPaySelected, setGroupPaySelected] = useState<Set<number>>(new Set())
  const [groupPayDate, setGroupPayDate] = useState('')
  const [groupPayMethod, setGroupPayMethod] = useState('check')
  const [groupPayBusy, setGroupPayBusy] = useState(false)
  const [gpMonth, setGpMonth] = useState('')
  // Cleanup tool
  const [showCleanup, setShowCleanup] = useState(false)
  const [cleanupSelected, setCleanupSelected] = useState<Set<number>>(new Set())
  const [cleanupBusy, setCleanupBusy] = useState(false)
  // Lotes de facturación
  const [batches, setBatches] = useState<InvoiceBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<InvoiceBatch | null>(null)
  const [batchTitle, setBatchTitle] = useState('')
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchPayDate, setBatchPayDate] = useState('')
  const [batchPayMethod, setBatchPayMethod] = useState('check')
  const [batchRetentionPct, setBatchRetentionPct] = useState(0)
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState<InvoiceBatch | null>(null)

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
    try {
      const bts = await db.invoice_batches.orderBy('created_at').reverse().toArray()
      setBatches(bts)
    } catch { setBatches([]) }
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

  const revertToDraft = async (inv: Invoice) => {
    if (!inv.id) return
    const now = Date.now()
    await db.invoices.update(inv.id, { status: 'draft', updated_at: now })
    loadAll()
    setSelected(prev => prev?.id === inv.id ? ({ ...prev, status: 'draft', updated_at: now } as Invoice) : prev)
  }

  const revertToSent = async (inv: Invoice) => {
    if (!inv.id) return
    // Delete the associated income event (matched by invoice_number in note + category)
    try {
      const events = await db.events
        .filter(e => e.category === 'factura' && e.type === 'income' && !!(e.note?.includes(inv.invoice_number)))
        .toArray()
      for (const e of events) { if (e.id) await db.events.delete(e.id) }
    } catch {}
    const now = Date.now()
    const cleared: Partial<Invoice> = {
      status: 'sent',
      paid_date: undefined,
      payment_date: undefined,
      paid_method: undefined,
      retention_amount: undefined,
      updated_at: now,
    }
    await db.invoices.update(inv.id, cleared)
    loadAll()
    setSelected(prev => prev?.id === inv.id ? { ...prev, ...cleared } as Invoice : prev)
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
          {templates.length > 0 && (
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
                  {PAYMENT_METHODS.map(method => (
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
            {selected.status === 'sent' && (
              <button
                onClick={() => setConfirmRevert({ show: true, inv: selected, action: 'toDraft' })}
                className="w-full py-3 rounded-xl text-sm font-medium bg-gray-800/60 text-gray-400 border border-white/10"
              >
                ↩ Reversar a Pendiente
              </button>
            )}
            {selected.status === 'paid' && (
              <button
                onClick={() => setConfirmRevert({ show: true, inv: selected, action: 'toSent' })}
                className="w-full py-3 rounded-xl text-sm font-medium bg-orange-900/30 text-orange-400 border border-orange-800/30"
              >
                ↩ Reversar a Enviada
              </button>
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
        <ConfirmDialog
          show={confirmRevert.show}
          title={confirmRevert.action === 'toSent' ? '¿Reversar pago?' : '¿Reversar a pendiente?'}
          message={confirmRevert.action === 'toSent'
            ? '¿Estás seguro? Esto eliminará el registro de ingreso asociado a esta factura.'
            : '¿Reversar la factura de "Enviada" a "Borrador/Pendiente"?'}
          confirmText="Sí, reversar"
          confirmColor="bg-orange-600"
          onConfirm={() => {
            if (!confirmRevert.inv) return
            if (confirmRevert.action === 'toSent') revertToSent(confirmRevert.inv)
            else revertToDraft(confirmRevert.inv)
            setConfirmRevert({ show: false, inv: null, action: 'toDraft' })
          }}
          onCancel={() => setConfirmRevert({ show: false, inv: null, action: 'toDraft' })}
        />
      </div>
    )
  }

  // ========== NEW BATCH VIEW ==========
  if (viewMode === 'newBatch') {
    const allUnpaid = invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue' || i.status === 'draft'))

    const batchInvoices = allUnpaid.filter(i => batchSelected.has(i.id!))
    const batchTotal = batchInvoices.reduce((s, i) => s + i.total, 0)
    const batchRetention = batchRetentionPct > 0 ? batchTotal * batchRetentionPct / 100 : 0
    const batchNet = batchTotal - batchRetention

    const saveBatch = async () => {
      if (!batchTitle.trim() || batchInvoices.length === 0) return
      setBatchBusy(true)
      try {
        const clientNames = [...new Set(batchInvoices.map(i => i.client_name))]
        const clientName = clientNames.length === 1 ? clientNames[0] : clientNames[0] + ' (+más)'
        const clientId = batchInvoices[0].client_id
        await db.invoice_batches.add({
          title: batchTitle.trim(),
          client_name: clientName,
          client_id: clientId,
          status: 'draft',
          invoice_ids: batchInvoices.map(i => i.id!),
          total: batchTotal,
          retention_percent: batchRetentionPct,
          net_amount: batchNet,
          created_at: Date.now()
        })
        await loadAll()
        setTab('batches')
        setViewMode('list')
      } catch (e) { alert('Error: ' + String(e)) }
      finally { setBatchBusy(false) }
    }

    const itemsSummary = (inv: Invoice) => {
      const descs = inv.items.map(i => i.description.trim()).filter(Boolean)
      if (descs.length === 0) return ''
      if (descs.length === 1) return descs[0].length > 45 ? descs[0].slice(0, 42) + '…' : descs[0]
      return `${descs[0].slice(0, 28)}… +${descs.length - 1}`
    }

    return (
      <div className="bg-[#0b1220] text-gray-100" style={{ minHeight: '100%' }}>
        <div className="sticky top-0 z-30 bg-gradient-to-r from-orange-600 to-yellow-600 text-white px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <h1 className="text-base font-bold">📦 Nuevo Lote</h1>
          </div>
          <button onClick={saveBatch} disabled={batchBusy || !batchTitle.trim() || batchInvoices.length === 0}
            className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            {batchBusy ? '⏳' : '💾 Guardar'}
          </button>
        </div>

        <div className="p-3 max-w-2xl mx-auto space-y-3 pb-6">
          {/* Title */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <label className="text-xs text-gray-500 block mb-1.5">Título del lote</label>
            <input value={batchTitle} onChange={e => setBatchTitle(e.target.value)}
              placeholder="ej: Farmacia Caridad Marzo 2026"
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>

          {/* Retention toggle */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">Retención Hacienda</p>
              <p className="text-xs text-gray-500">Aplica si el cliente retiene 10%</p>
            </div>
            <div className="flex items-center gap-2">
              {[0, 10].map(pct => (
                <button key={pct} onClick={() => setBatchRetentionPct(pct)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${batchRetentionPct === pct ? 'bg-yellow-600 text-white border-yellow-500' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                  {pct === 0 ? 'Sin ret.' : '10%'}
                </button>
              ))}
            </div>
          </div>

          {/* Invoice selector */}
          <div className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-white/5">
              <p className="text-sm font-semibold text-gray-300">
                🧾 Seleccionar facturas
                {allUnpaid.length > 0 && <span className="text-gray-500 font-normal"> ({allUnpaid.length} disponibles)</span>}
              </p>
              <button onClick={() => {
                if (batchSelected.size === allUnpaid.length) setBatchSelected(new Set())
                else setBatchSelected(new Set(allUnpaid.map(i => i.id!)))
              }} className="text-xs text-blue-400 font-medium">
                {batchSelected.size === allUnpaid.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>
            {allUnpaid.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No hay facturas disponibles</p>
            ) : allUnpaid.map(inv => {
              const checked = batchSelected.has(inv.id!)
              const summary = itemsSummary(inv)
              return (
                <label key={inv.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer transition-colors ${checked ? 'bg-orange-900/15' : 'hover:bg-white/5'}`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => setBatchSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(inv.id!) : s.delete(inv.id!); return s })}
                    className="w-4 h-4 rounded mt-1 flex-shrink-0 accent-orange-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-gray-200">{inv.client_name}</span>
                      {inv.location_name && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/40 text-teal-400 border border-teal-800/30">{inv.location_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">#{inv.invoice_number}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className={`text-xs px-1 py-0.5 rounded ${statusColor(inv.status)}`}>{statusLabel(inv.status)}</span>
                      <span className="text-xs text-gray-600">·</span>
                      <span className="text-xs text-gray-500">{fmtDate(inv.service_date ?? inv.issue_date)}</span>
                    </div>
                    {summary && <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>}
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${checked ? 'text-orange-400' : 'text-gray-300'}`}>{fmt(inv.total)}</p>
                </label>
              )
            })}
          </div>

          {/* Real-time summary */}
          {batchInvoices.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl p-4 border border-orange-900/30 space-y-2">
              <p className="text-sm font-semibold text-gray-300 mb-2">📊 Resumen del lote</p>
              {batchInvoices.map(inv => (
                <div key={inv.id} className="flex justify-between text-xs">
                  <span className="text-gray-400 truncate">{inv.client_name}{inv.location_name ? ` · ${inv.location_name}` : ''} #{inv.invoice_number}</span>
                  <span className="text-gray-300 ml-2 flex-shrink-0">{fmt(inv.total)}</span>
                </div>
              ))}
              <div className="border-t border-white/10 pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total ({batchInvoices.length} facturas)</span>
                  <span className="text-gray-200 font-medium">{fmt(batchTotal)}</span>
                </div>
                {batchRetention > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-400">Retención ({batchRetentionPct}%)</span>
                    <span className="text-yellow-400">−{fmt(batchRetention)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-1">
                  <span className="text-orange-400">Neto esperado</span>
                  <span className="text-orange-400">{fmt(batchNet)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== BATCH DETAIL VIEW ==========
  if (viewMode === 'batchDetail' && selectedBatch) {
    const batch = selectedBatch
    const batchInvoicesList = invoices.filter(i => batch.invoice_ids.includes(i.id!))
    const batchStatusColor = batch.status === 'paid' ? 'text-green-400' : batch.status === 'sent' ? 'text-blue-400' : 'text-gray-400'
    const batchStatusLabel = batch.status === 'paid' ? 'Pagado' : batch.status === 'sent' ? 'Enviado' : 'Borrador'

    const markAllSent = async () => {
      setBatchBusy(true)
      try {
        const now = Date.now()
        for (const inv of batchInvoicesList) {
          if (inv.id && inv.status === 'draft') await db.invoices.update(inv.id, { status: 'sent', updated_at: now })
        }
        await db.invoice_batches.update(batch.id!, { status: 'sent', sent_date: now })
        await loadAll()
        setSelectedBatch({ ...batch, status: 'sent', sent_date: now })
      } finally { setBatchBusy(false) }
    }

    const registerPayment = async () => {
      if (!batchPayDate) return
      setBatchBusy(true)
      try {
        const dateMs = new Date(batchPayDate + 'T12:00:00').getTime()
        for (const inv of batchInvoicesList) {
          if (inv.id && inv.status !== 'paid') {
            const retention = batch.retention_percent > 0 ? inv.total * batch.retention_percent / 100 : 0
            await updateStatus(inv, 'paid', batchPayMethod, dateMs, retention)
          }
        }
        // One income event for the batch net total (individual events created by updateStatus)
        await db.invoice_batches.update(batch.id!, { status: 'paid', paid_date: dateMs, paid_method: batchPayMethod })
        await loadAll()
        setViewMode('list')
        setTab('batches')
      } finally { setBatchBusy(false) }
    }

    return (
      <div className="bg-[#0b1220] text-gray-100" style={{ minHeight: '100%' }}>
        <div className="sticky top-0 z-30 bg-gradient-to-r from-orange-600 to-yellow-600 text-white px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('list'); setTab('batches') }} className="text-lg">←</button>
            <div>
              <h1 className="text-base font-bold truncate max-w-[200px]">{batch.title}</h1>
              <p className={`text-xs ${batchStatusColor} font-medium`}>{batchStatusLabel}</p>
            </div>
          </div>
          <button onClick={() => setConfirmDeleteBatch(batch)}
            className="text-xs px-2.5 py-1.5 bg-black/20 rounded-lg text-red-300">🗑️</button>
        </div>

        <div className="p-3 max-w-2xl mx-auto space-y-3 pb-6">
          {/* Summary card */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Cliente</span>
              <span className="text-gray-200 font-medium">{batch.client_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Facturas</span>
              <span className="text-gray-200">{batch.invoice_ids.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total facturado</span>
              <span className="text-gray-200 font-medium">{fmt(batch.total)}</span>
            </div>
            {batch.retention_percent > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-yellow-400">Retención ({batch.retention_percent}%)</span>
                <span className="text-yellow-400">−{fmt(batch.total * batch.retention_percent / 100)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-white/10 pt-2">
              <span className="text-green-400">Neto a recibir</span>
              <span className="text-green-400">{fmt(batch.net_amount)}</span>
            </div>
            {batch.paid_date && (
              <p className="text-xs text-gray-500">
                Pagado {fmtDate(batch.paid_date)} · {PAYMENT_METHODS.find(m => m.key === batch.paid_method)?.label || batch.paid_method}
              </p>
            )}
          </div>

          {/* Invoices list */}
          <div className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
            <p className="text-sm font-semibold text-gray-300 px-4 pt-3 pb-2">🧾 Facturas del lote</p>
            {batchInvoicesList.map(inv => (
              <button key={inv.id} onClick={() => { setSelected(inv); setViewMode('detail') }}
                className="w-full flex items-center gap-3 px-4 py-3 border-t border-white/5 text-left hover:bg-white/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-200">#{inv.invoice_number}</span>
                    {inv.location_name && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/40 text-teal-400 border border-teal-800/30">{inv.location_name}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(inv.status)}`}>{statusLabel(inv.status)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtDate(inv.service_date ?? inv.issue_date)}</p>
                </div>
                <p className="text-sm font-bold text-green-400 flex-shrink-0">{fmt(inv.total)}</p>
              </button>
            ))}
          </div>

          {/* Actions */}
          {batch.status !== 'paid' && (
            <div className="space-y-2">
              {batch.status === 'draft' && (
                <button onClick={markAllSent} disabled={batchBusy}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors">
                  {batchBusy ? '⏳ Procesando...' : '📤 Marcar todas Enviadas'}
                </button>
              )}

              <div className="bg-[#111a2e] rounded-xl border border-green-900/30 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-300">💰 Registrar Pago</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.key} onClick={() => setBatchPayMethod(m.key)}
                      className={`py-2 rounded-lg text-xs font-medium border ${batchPayMethod === m.key ? 'bg-green-600 text-white border-green-500' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 whitespace-nowrap">📅 Fecha del cheque</label>
                  <input type="date" value={batchPayDate} onChange={e => setBatchPayDate(e.target.value)}
                    className="flex-1 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500" />
                </div>
                <button onClick={registerPayment} disabled={batchBusy || !batchPayDate}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors">
                  {batchBusy ? '⏳ Procesando...' : `✅ Confirmar pago — ${fmt(batch.net_amount)}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== GROUP PAY VIEW ==========
  if (viewMode === 'groupPay') {
    const allUnpaid = invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'))

    const invoiceMonth = (inv: Invoice) => {
      const ts = inv.service_date ?? inv.issue_date
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const monthLabel = (m: string) => {
      const [y, mo] = m.split('-')
      return new Date(+y, +mo - 1, 1).toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
    }
    const availableMonths = [...new Set(allUnpaid.map(invoiceMonth))].sort().reverse()

    const visibleInvoices = gpMonth
      ? allUnpaid.filter(i => invoiceMonth(i) === gpMonth)
      : allUnpaid

    const selectedInvoices = visibleInvoices.filter(i => groupPaySelected.has(i.id!))
    const totalFacturado = selectedInvoices.reduce((s, i) => s + i.total, 0)

    // Retention: if ANY selected invoice belongs to a client with retention_percent > 0, apply it.
    // Use the highest retention_percent found among selected invoices' clients.
    const maxRetention = selectedInvoices.reduce((max, inv) => {
      const linked = inv.client_id ? clients.find(c => c.id === inv.client_id) : undefined
      return Math.max(max, linked?.retention_percent || 0)
    }, 0)
    const totalRetencion = maxRetention > 0 ? totalFacturado * maxRetention / 100 : 0
    const totalNeto = totalFacturado - totalRetencion

    const executeGroupPay = async () => {
      if (selectedInvoices.length === 0 || !groupPayDate) return
      setGroupPayBusy(true)
      try {
        const dateMs = new Date(groupPayDate + 'T12:00:00').getTime()
        for (const inv of selectedInvoices) {
          const linked = inv.client_id ? clients.find(c => c.id === inv.client_id) : undefined
          const retPct = linked?.retention_percent || 0
          const retention = retPct > 0 ? inv.total * retPct / 100 : 0
          await updateStatus(inv, 'paid', groupPayMethod, dateMs, retention)
        }
        setViewMode('list')
      } catch (e) { alert('Error: ' + String(e)) }
      finally { setGroupPayBusy(false) }
    }

    const itemsSummary = (inv: Invoice) => {
      const descs = inv.items.map(i => i.description.trim()).filter(Boolean)
      if (descs.length === 0) return ''
      if (descs.length === 1) return descs[0].length > 50 ? descs[0].slice(0, 47) + '…' : descs[0]
      return `${descs[0].length > 30 ? descs[0].slice(0, 27) + '…' : descs[0]} +${descs.length - 1} más`
    }

    return (
      <div className="bg-[#0b1220] text-gray-100" style={{ minHeight: '100%' }}>
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-4 py-3 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <div>
              <h1 className="text-base font-bold">💰 Pago Grupal</h1>
              <p className="text-xs opacity-75">{allUnpaid.length} pendiente{allUnpaid.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {groupPaySelected.size > 0 && (
            <div className="text-right">
              <p className="text-sm font-bold">{fmt(totalNeto)}</p>
              <p className="text-xs opacity-75">{groupPaySelected.size} seleccionada{groupPaySelected.size !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        <div className="p-3 max-w-2xl mx-auto space-y-3 pb-6">

          {/* Month filter */}
          {availableMonths.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { setGpMonth(''); setGroupPaySelected(new Set()) }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${!gpMonth ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                Todos
              </button>
              {availableMonths.map(m => (
                <button key={m} onClick={() => { setGpMonth(m); setGroupPaySelected(new Set()) }}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium capitalize ${gpMonth === m ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          )}

          {/* Invoice list */}
          <div className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-white/5">
              <p className="text-sm font-semibold text-gray-300">
                🧾 {visibleInvoices.length} factura{visibleInvoices.length !== 1 ? 's' : ''} pendiente{visibleInvoices.length !== 1 ? 's' : ''}
                {gpMonth && <span className="text-blue-400 font-normal"> · {monthLabel(gpMonth)}</span>}
              </p>
              <button onClick={() => {
                if (groupPaySelected.size === visibleInvoices.length) setGroupPaySelected(new Set())
                else setGroupPaySelected(new Set(visibleInvoices.map(i => i.id!)))
              }} className="text-xs text-blue-400 font-medium">
                {groupPaySelected.size === visibleInvoices.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            </div>

            {visibleInvoices.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {gpMonth ? `Sin facturas en ${monthLabel(gpMonth)}` : 'No hay facturas pendientes'}
              </p>
            ) : visibleInvoices.map(inv => {
              const checked = groupPaySelected.has(inv.id!)
              const summary = itemsSummary(inv)
              const linked = inv.client_id ? clients.find(c => c.id === inv.client_id) : undefined
              const hasRetention = (linked?.retention_percent || 0) > 0
              return (
                <label key={inv.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0 cursor-pointer transition-colors ${checked ? 'bg-green-900/15' : 'hover:bg-white/5'}`}>
                  <input type="checkbox" checked={checked}
                    onChange={e => setGroupPaySelected(prev => { const s = new Set(prev); e.target.checked ? s.add(inv.id!) : s.delete(inv.id!); return s })}
                    className="w-4 h-4 rounded mt-1 flex-shrink-0 accent-green-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-100">{inv.client_name}</span>
                      {inv.location_name && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-teal-900/40 text-teal-400 border border-teal-800/30">{inv.location_name}</span>
                      )}
                      {hasRetention && <span className="text-xs text-yellow-500">⚠️ ret.</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">#{inv.invoice_number}</span>
                      <span className="text-xs text-gray-500">·</span>
                      <span className="text-xs text-gray-500">
                        {inv.service_date ? fmtDate(inv.service_date) : fmtDate(inv.issue_date)}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(inv.status)}`}>{statusLabel(inv.status)}</span>
                    </div>
                    {summary && <p className="text-xs text-gray-400 mt-0.5 truncate">{summary}</p>}
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${checked ? 'text-green-400' : 'text-gray-300'}`}>{fmt(inv.total)}</p>
                </label>
              )
            })}
          </div>

          {/* Payment panel — always visible once something is selected */}
          {selectedInvoices.length > 0 && (
            <div className="bg-[#111a2e] rounded-xl border border-green-900/30 overflow-hidden">
              {/* Summary lines */}
              <div className="px-4 pt-4 pb-3 border-b border-white/5 space-y-1">
                {selectedInvoices.map(inv => (
                  <div key={inv.id} className="flex justify-between text-xs">
                    <span className="text-gray-400 truncate">{inv.client_name}{inv.location_name ? ` · ${inv.location_name}` : ''} #{inv.invoice_number}</span>
                    <span className="text-gray-300 font-medium ml-2 flex-shrink-0">{fmt(inv.total)}</span>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 space-y-1.5 border-b border-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal ({selectedInvoices.length} factura{selectedInvoices.length !== 1 ? 's' : ''})</span>
                  <span className="text-gray-200 font-medium">{fmt(totalFacturado)}</span>
                </div>
                {totalRetencion > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-yellow-400">Retención Hacienda ({maxRetention}%)</span>
                    <span className="text-yellow-400 font-medium">−{fmt(totalRetencion)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-1">
                  <span className="text-green-400">Neto a recibir</span>
                  <span className="text-green-400">{fmt(totalNeto)}</span>
                </div>
              </div>

              {/* Method */}
              <div className="px-4 pt-3 pb-2">
                <p className="text-xs text-gray-500 mb-2">Método de pago</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.key} onClick={() => setGroupPayMethod(m.key)}
                      className={`py-2 rounded-lg text-xs font-medium border ${groupPayMethod === m.key ? 'bg-green-600 text-white border-green-500' : 'bg-white/5 text-gray-400 border-white/10'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="px-4 pb-4 flex items-center gap-3">
                <label className="text-xs text-gray-400 whitespace-nowrap">📅 Fecha</label>
                <input type="date" value={groupPayDate} onChange={e => setGroupPayDate(e.target.value)}
                  className="flex-1 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500" />
              </div>

              <div className="px-4 pb-4">
                <button onClick={executeGroupPay} disabled={groupPayBusy || !groupPayDate}
                  className="w-full py-3.5 rounded-xl text-base font-bold bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors">
                  {groupPayBusy ? '⏳ Procesando...' : `✅ Confirmar pago — ${fmt(totalNeto)}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========== LIST VIEW ==========

  // Set of invoice IDs that belong to any active (non-paid) batch
  const batchedInvoiceIds = new Set(
    batches.filter(b => b.status !== 'paid').flatMap(b => b.invoice_ids)
  )
  const batchByInvoiceId = new Map<number, InvoiceBatch>()
  batches.forEach(b => b.invoice_ids.forEach(id => batchByInvoiceId.set(id, b)))

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🧾 Facturación</h1>
        </div>
        <div className="flex gap-2">
          {tab === 'batches' ? (
            <button onClick={() => { setBatchTitle(''); setBatchSelected(new Set()); setBatchRetentionPct(0); setViewMode('newBatch') }}
              className="bg-orange-600 rounded-lg px-3 py-1.5 text-sm font-medium">+ Lote</button>
          ) : (
            <button onClick={() => startCreate(tab === 'quotes' ? 'quote' : 'invoice')}
              className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">
              + {tab === 'quotes' ? 'Cotización' : 'Factura'}
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-white/10">
        {([
          { key: 'invoices' as Tab, label: '🧾 Facturas', count: invoices.filter(i => i.type === 'invoice' && i.status !== 'paid' && i.status !== 'cancelled').length },
          { key: 'quotes' as Tab, label: '📋 Cotizaciones', count: invoices.filter(i => i.type === 'quote' && i.status !== 'cancelled').length },
          { key: 'batches' as Tab, label: '📦 Lotes', count: batches.filter(b => b.status !== 'paid').length }
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

      {/* Cleanup tool */}
      {(() => {
        const suspects = invoices.filter(i => i.status === 'draft' && (i.total === 0 || i.items.length === 0 || i.items.every(it => !it.description.trim())))
        if (suspects.length === 0) return null
        return (
          <div className="mx-4 mt-3 bg-orange-900/20 border border-orange-700/30 rounded-xl overflow-hidden">
            <button onClick={() => { setShowCleanup(s => !s); setCleanupSelected(new Set()) }}
              className="w-full flex items-center justify-between px-4 py-3 text-left">
              <span className="text-xs text-orange-400 font-medium">🧹 {suspects.length} borrador{suspects.length > 1 ? 'es' : ''} vacío{suspects.length > 1 ? 's' : ''} detectado{suspects.length > 1 ? 's' : ''}</span>
              <span className="text-xs text-orange-400">{showCleanup ? '▲ Ocultar' : '▼ Ver'}</span>
            </button>
            {showCleanup && (
              <div className="border-t border-orange-700/20 px-4 pb-3 space-y-2">
                <p className="text-xs text-gray-500 pt-2">Facturas borrador sin items válidos o con total $0 — posibles duplicadas de prueba:</p>
                {suspects.map(inv => (
                  <label key={inv.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={cleanupSelected.has(inv.id!)}
                      onChange={e => setCleanupSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(inv.id!) : s.delete(inv.id!); return s })}
                      className="w-4 h-4 rounded accent-red-500" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-300">#{inv.invoice_number} · {inv.client_name}</span>
                      <span className="text-xs text-gray-500 ml-2">{fmtDate(inv.created_at)} · {fmt(inv.total)}</span>
                    </div>
                  </label>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setCleanupSelected(new Set(suspects.map(i => i.id!)))} className="text-xs text-gray-400 underline">Seleccionar todas</button>
                  {cleanupSelected.size > 0 && (
                    <button disabled={cleanupBusy} onClick={async () => {
                      setCleanupBusy(true)
                      try {
                        for (const id of cleanupSelected) { await db.invoices.delete(id) }
                        setCleanupSelected(new Set())
                        setShowCleanup(false)
                        loadAll()
                      } finally { setCleanupBusy(false) }
                    }} className="ml-auto text-xs px-3 py-1.5 bg-red-700 text-white rounded-lg disabled:opacity-50">
                      {cleanupBusy ? 'Eliminando...' : `🗑️ Eliminar ${cleanupSelected.size} seleccionada${cleanupSelected.size > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <div className="p-4 max-w-2xl mx-auto">
        {/* ========== BATCHES TAB ========== */}
        {tab === 'batches' && (
          loading ? <div className="text-center py-8 text-gray-500">Cargando...</div>
          : batches.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-gray-500">Sin lotes de facturación</p>
              <p className="text-gray-600 text-sm mt-1">Agrupa facturas de un mismo cliente en un lote</p>
              <button onClick={() => { setBatchTitle(''); setBatchSelected(new Set()); setBatchRetentionPct(0); setViewMode('newBatch') }}
                className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium">
                + Crear primer lote
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map(batch => {
                const batchStatusColor = batch.status === 'paid' ? 'bg-green-900/50 text-green-400' : batch.status === 'sent' ? 'bg-blue-900/50 text-blue-400' : 'bg-gray-700 text-gray-300'
                const batchStatusLabel = batch.status === 'paid' ? 'Pagado' : batch.status === 'sent' ? 'Enviado' : 'Borrador'
                return (
                  <button key={batch.id} onClick={() => { setSelectedBatch(batch); setBatchPayDate(''); setBatchPayMethod('check'); setViewMode('batchDetail') }}
                    className="w-full bg-[#111a2e] rounded-xl border border-white/5 p-4 text-left hover:bg-[#1a2332] transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-200 truncate">{batch.title}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${batchStatusColor}`}>{batchStatusLabel}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{batch.client_name}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {batch.invoice_ids.length} factura{batch.invoice_ids.length !== 1 ? 's' : ''}
                          {batch.retention_percent > 0 && <span className="text-yellow-500 ml-2">⚠️ ret. {batch.retention_percent}%</span>}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-base font-bold text-green-400">{fmt(batch.net_amount)}</p>
                        {batch.retention_percent > 0 && <p className="text-xs text-gray-500">de {fmt(batch.total)}</p>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        )}

        {/* ========== INVOICES / QUOTES TAB ========== */}
        {tab !== 'batches' && (loading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">{tab === 'quotes' ? '📋' : '🧾'}</p>
            <p className="text-gray-500">Sin {tab === 'quotes' ? 'cotizaciones' : 'facturas'}</p>
            <p className="text-gray-600 text-sm mt-1">Crea una desde aquí o por chat</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => {
              const invBatch = inv.id ? batchByInvoiceId.get(inv.id) : undefined
              return (
              <div key={inv.id} className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
                {/* Main tap area */}
                <button
                  onClick={() => { setSelected(inv); setViewMode('detail'); setQuickPayInvoiceId(undefined) }}
                  className="w-full p-4 text-left hover:bg-[#1a2332] transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-200">{inv.client_name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${statusColor(inv.status)}`}>
                          {statusLabel(inv.status)}
                        </span>
                        {invBatch && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-800/30">
                            📦 {invBatch.title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">#{inv.invoice_number} • {fmtDate(inv.issue_date)}</p>
                    </div>
                    <p className="text-lg font-bold text-green-400">{fmt(inv.total)}</p>
                  </div>
                </button>

                {/* Quick actions */}
                {(inv.status === 'draft' || inv.status === 'sent' || inv.status === 'overdue') && (
                  <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-2">
                    {(inv.status === 'draft') && (
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(inv, 'sent') }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-900/40 text-blue-400 border border-blue-800/30 font-medium"
                      >
                        📤 Enviado
                      </button>
                    )}
                    {(inv.status === 'sent' || inv.status === 'overdue') && (
                      <button
                        onClick={e => { e.stopPropagation(); if (quickPayInvoiceId !== inv.id) setQuickPayDate(new Date().toISOString().split('T')[0]); setQuickPayInvoiceId(quickPayInvoiceId === inv.id ? undefined : inv.id) }}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${quickPayInvoiceId === inv.id ? 'bg-green-700 text-white border-green-600' : 'bg-green-900/40 text-green-400 border-green-800/30'}`}
                      >
                        💰 Pagado
                      </button>
                    )}
                    <span className="text-xs text-gray-600 ml-1">toca para abrir</span>
                  </div>
                )}

                {/* Inline quick-pay method picker */}
                {quickPayInvoiceId === inv.id && (
                  <div className="px-4 pb-3 border-t border-green-900/30 space-y-2">
                    <div className="flex items-center gap-2 pt-2">
                      <label className="text-xs text-gray-500 whitespace-nowrap">📅 Fecha de pago</label>
                      <input
                        type="date"
                        value={quickPayDate}
                        onChange={e => setQuickPayDate(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 bg-[#0b1220] border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PAYMENT_METHODS.map(m => (
                        <button
                          key={m.key}
                          onClick={async e => {
                            e.stopPropagation()
                            const dateMs = quickPayDate ? new Date(quickPayDate + 'T12:00:00').getTime() : Date.now()
                            await updateStatus(inv, 'paid', m.key, dateMs)
                            setQuickPayInvoiceId(undefined)
                          }}
                          className="text-xs px-2.5 py-1.5 bg-green-900/30 text-green-400 border border-green-800/30 rounded-lg"
                        >
                          {m.label}
                        </button>
                      ))}
                      <button onClick={e => { e.stopPropagation(); setQuickPayInvoiceId(undefined) }} className="text-xs px-2.5 py-1.5 bg-gray-800 text-gray-400 rounded-lg">✕</button>
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        ))}
      </div>

      {/* Confirm delete batch */}
      <ConfirmDialog
        show={!!confirmDeleteBatch}
        title="Eliminar lote"
        message={`¿Eliminar el lote "${confirmDeleteBatch?.title}"? Las facturas NO se eliminarán.`}
        confirmText="Eliminar lote"
        confirmColor="bg-red-600"
        onConfirm={() => {
          if (!confirmDeleteBatch?.id) return
          db.invoice_batches.delete(confirmDeleteBatch.id).then(() => {
            setConfirmDeleteBatch(null)
            setViewMode('list')
            loadAll()
          })
        }}
        onCancel={() => setConfirmDeleteBatch(null)}
      />
    </div>
  )
}