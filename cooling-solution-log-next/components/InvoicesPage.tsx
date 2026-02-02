'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { downloadInvoicePDF, generateInvoiceNumber } from '@/lib/pdfGenerator'
import type { Invoice, InvoiceItem, Client } from '@/lib/types'

interface InvoicesPageProps {
  onNavigate: (page: string) => void
}

type ViewMode = 'list' | 'create' | 'edit' | 'detail'
type Tab = 'invoices' | 'quotes'

const emptyItem = (): InvoiceItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 })

export default function InvoicesPage({ onNavigate }: InvoicesPageProps) {
  const [tab, setTab] = useState<Tab>('invoices')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

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
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')

  const loadAll = useCallback(async () => {
    const all = await db.invoices.orderBy('created_at').reverse().toArray()
    setInvoices(all)
    const cls = await db.clients.where('active').equals(1).toArray()
    setClients(cls)
    setLoading(false)
    
    // Check for template data
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

  const pickClient = (c: Client) => {
    setFormClientName(`${c.first_name} ${c.last_name}`)
    setFormClientPhone(c.phone || '')
    setFormClientEmail(c.email || '')
    setFormClientAddress(c.address || '')
    setShowClientPicker(false)
    setClientSearch('')
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

    if (selected?.id && viewMode === 'edit') {
      await db.invoices.update(selected.id, {
        client_name: formClientName.trim(),
        client_phone: formClientPhone.trim() || undefined,
        client_email: formClientEmail.trim() || undefined,
        client_address: formClientAddress.trim() || undefined,
        items: validItems,
        subtotal,
        tax_rate: formTaxRate,
        tax_amount: taxAmount,
        total,
        notes: formNotes.trim() || undefined,
        due_date: formType === 'invoice' ? dueDate : undefined,
        expiration_date: formType === 'quote' ? dueDate : undefined,
        updated_at: now
      })
    } else {
      await db.invoices.add({
        invoice_number: generateInvoiceNumber(formType),
        type: formType,
        client_name: formClientName.trim(),
        client_phone: formClientPhone.trim() || undefined,
        client_email: formClientEmail.trim() || undefined,
        client_address: formClientAddress.trim() || undefined,
        items: validItems,
        subtotal,
        tax_rate: formTaxRate,
        tax_amount: taxAmount,
        total,
        notes: formNotes.trim() || undefined,
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

  const updateStatus = async (inv: Invoice, status: Invoice['status'], paidMethod?: string) => {
    if (!inv.id) return
    const update: Partial<Invoice> = { status, updated_at: Date.now() }
    if (status === 'paid') {
      update.paid_date = Date.now()
      update.paid_method = paidMethod || 'cash'
    }
    await db.invoices.update(inv.id, update)
    loadAll()
    if (selected?.id === inv.id) {
      setSelected({ ...inv, ...update } as Invoice)
    }
  }

  const deleteInvoice = async (inv: Invoice) => {
    if (!inv.id) return
    if (!confirm(`¿Borrar ${inv.type === 'quote' ? 'cotización' : 'factura'} ${inv.invoice_number}?`)) return
    await db.invoices.delete(inv.id)
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
    alert('✅ Cotización convertida a factura')
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
          {/* Client Section */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">👤 Cliente</p>
              <button onClick={() => setShowClientPicker(!showClientPicker)} className="text-xs text-blue-400">
                {showClientPicker ? 'Cerrar' : '📋 Elegir existente'}
              </button>
            </div>

            {showClientPicker && (
              <div className="mb-3 bg-[#0b1220] rounded-lg p-3 border border-white/10">
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {clients.filter(c => {
                    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
                    return !clientSearch || name.includes(clientSearch.toLowerCase())
                  }).map(c => (
                    <button key={c.id} onClick={() => pickClient(c)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 text-gray-300">
                      {c.first_name} {c.last_name} {c.phone ? `• ${c.phone}` : ''}
                    </button>
                  ))}
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
                    <input
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="Descripción del servicio/material"
                      className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600"
                    />
                    {formItems.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 px-2">✕</button>
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

          {/* Tax & Totals */}
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
          </div>

          {/* Notes & Due */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-3">
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
            {selected.status === 'draft' && (
              <button onClick={() => updateStatus(selected, 'sent')} className="w-full py-3 rounded-xl text-sm font-medium bg-blue-600 text-white">
                📤 Marcar como Enviada
              </button>
            )}
            {(selected.status === 'sent' || selected.status === 'overdue') && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center">Marcar como pagada con:</p>
                <div className="grid grid-cols-3 gap-2">
                  {['cash', 'ath_movil', 'paypal'].map(method => (
                    <button key={method} onClick={() => updateStatus(selected, 'paid', method)} className="py-2.5 rounded-xl text-xs font-medium bg-green-900/30 text-green-400 border border-green-800/30">
                      {method === 'cash' ? '💵 Efectivo' : method === 'ath_movil' ? '📱 ATH' : '💳 PayPal'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isQuote && selected.status !== 'cancelled' && (
              <button onClick={() => convertQuoteToInvoice(selected)} className="w-full py-3 rounded-xl text-sm font-medium bg-purple-600 text-white">
                🔄 Convertir a Factura
              </button>
            )}
            {selected.status !== 'paid' && selected.status !== 'cancelled' && (
              <button onClick={() => updateStatus(selected, 'cancelled')} className="w-full py-3 rounded-xl text-sm font-medium bg-gray-800 text-gray-400 border border-white/10">
                ✕ Cancelar
              </button>
            )}
            <button onClick={() => deleteInvoice(selected)} className="w-full py-3 rounded-xl text-sm font-medium bg-red-900/30 text-red-400 border border-red-800/30">
              🗑️ Eliminar
            </button>
          </div>
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
        <button
          onClick={() => startCreate(tab === 'quotes' ? 'quote' : 'invoice')}
          className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          + {tab === 'quotes' ? 'Cotización' : 'Factura'}
        </button>
      </div>

      {/* Tabs */}
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