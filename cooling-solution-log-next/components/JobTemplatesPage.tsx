'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import ConfirmDialog from './ConfirmDialog'
import type { JobTemplate, JobTemplateItem, Client } from '@/lib/types'

interface JobTemplatesPageProps {
  onNavigate: (page: string) => void
  onUseTemplate?: (template: JobTemplate) => void
}

const emptyItem = (): JobTemplateItem => ({ description: '', quantity: 1, unit_price: 0 })

export default function JobTemplatesPage({ onNavigate, onUseTemplate }: JobTemplatesPageProps) {
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list')
  const [selected, setSelected] = useState<JobTemplate | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; item: JobTemplate | null }>({ show: false, item: null })

  // Form
  const [formName, setFormName] = useState('')
  const [formClientId, setFormClientId] = useState<number | undefined>()
  const [formClientName, setFormClientName] = useState('')
  const [formItems, setFormItems] = useState<JobTemplateItem[]>([emptyItem()])
  const [formNotes, setFormNotes] = useState('')
  const [formTaxRate, setFormTaxRate] = useState(0)
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')

  const loadAll = useCallback(async () => {
    const all = await db.job_templates.orderBy('name').toArray()
    setTemplates(all.filter(t => t.active))
    const cls = await db.clients.where('active').equals(1).toArray()
    setClients(cls)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const fmt = (n: number) => `$${n.toFixed(2)}`

  const calcTotal = (items: JobTemplateItem[]) => items.reduce((s, i) => s + (i.quantity * i.unit_price), 0)

  const updateItem = (idx: number, field: keyof JobTemplateItem, value: string | number) => {
    setFormItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  const addItem = () => setFormItems(prev => [...prev, emptyItem()])

  const removeItem = (idx: number) => {
    if (formItems.length <= 1) return
    setFormItems(prev => prev.filter((_, i) => i !== idx))
  }

  const pickClient = (c: Client) => {
    setFormClientId(c.id)
    setFormClientName(`${c.first_name} ${c.last_name}`)
    setShowClientPicker(false)
    setClientSearch('')
  }

  const clearClient = () => {
    setFormClientId(undefined)
    setFormClientName('')
  }

  const resetForm = () => {
    setFormName('')
    setFormClientId(undefined)
    setFormClientName('')
    setFormItems([emptyItem()])
    setFormNotes('')
    setFormTaxRate(0)
    setSelected(null)
  }

  const startCreate = () => {
    resetForm()
    setViewMode('create')
  }

  const startEdit = (t: JobTemplate) => {
    setSelected(t)
    setFormName(t.name)
    setFormClientId(t.client_id)
    setFormClientName(t.client_name || '')
    setFormItems(t.items.length > 0 ? [...t.items] : [emptyItem()])
    setFormNotes(t.notes || '')
    setFormTaxRate(t.default_tax_rate)
    setViewMode('edit')
  }

  const saveTemplate = async () => {
    const validItems = formItems.filter(i => i.description.trim() && i.unit_price > 0)
    if (!formName.trim() || validItems.length === 0) {
      alert('Falta nombre o items válidos')
      return
    }

    const now = Date.now()

    if (selected?.id && viewMode === 'edit') {
      await db.job_templates.update(selected.id, {
        name: formName.trim(),
        client_id: formClientId,
        client_name: formClientName.trim() || undefined,
        items: validItems,
        notes: formNotes.trim() || undefined,
        default_tax_rate: formTaxRate,
        updated_at: now
      })
    } else {
      await db.job_templates.add({
        name: formName.trim(),
        client_id: formClientId,
        client_name: formClientName.trim() || undefined,
        items: validItems,
        notes: formNotes.trim() || undefined,
        default_tax_rate: formTaxRate,
        active: true,
        created_at: now,
        updated_at: now
      })
    }

    setViewMode('list')
    loadAll()
  }

  const deleteTemplate = async (t: JobTemplate) => {
    if (!t.id) return
    await db.job_templates.update(t.id, { active: false, updated_at: Date.now() })
    setConfirmDelete({ show: false, item: null })
    loadAll()
  }

  const useTemplate = (t: JobTemplate) => {
    if (onUseTemplate) {
      onUseTemplate(t)
    } else {
      localStorage.setItem('invoiceFromTemplate', JSON.stringify(t))
      onNavigate('invoices')
    }
  }

  // ========== FORM VIEW ==========
  if (viewMode === 'create' || viewMode === 'edit') {
    const subtotal = calcTotal(formItems)
    const taxAmount = subtotal * (formTaxRate / 100)
    const total = subtotal + taxAmount

    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-orange-600 to-amber-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMode('list')} className="text-lg">←</button>
            <h1 className="text-xl font-bold">
              {viewMode === 'edit' ? '✏️ Editar' : '➕ Nuevo'} Template
            </h1>
          </div>
          <button onClick={saveTemplate} className="bg-green-500 rounded-lg px-4 py-1.5 text-sm font-medium">💾 Guardar</button>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
          {/* Name */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-2">📋 Nombre del Template</p>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Ej: Farmacia Caridad - Mantenimiento mensual"
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-600"
            />
          </div>

          {/* Client (optional) */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">👤 Cliente (opcional)</p>
              {formClientName ? (
                <button onClick={clearClient} className="text-xs text-red-400">✕ Quitar</button>
              ) : (
                <button onClick={() => setShowClientPicker(!showClientPicker)} className="text-xs text-orange-400">
                  {showClientPicker ? 'Cerrar' : '📋 Elegir'}
                </button>
              )}
            </div>

            {formClientName && (
              <div className="bg-[#0b1220] rounded-lg px-3 py-2 text-sm text-gray-300">
                {formClientName}
              </div>
            )}

            {showClientPicker && !formClientName && (
              <div className="bg-[#0b1220] rounded-lg p-3 border border-white/10">
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {clients.filter(c => {
                    const name = `${c.first_name} ${c.last_name}`.toLowerCase()
                    return !clientSearch || name.includes(clientSearch.toLowerCase())
                  }).map(c => (
                    <button key={c.id} onClick={() => pickClient(c)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 text-gray-300">
                      {c.first_name} {c.last_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">📦 Items</p>
              <button onClick={addItem} className="text-xs bg-orange-600 px-3 py-1 rounded-lg">+ Agregar</button>
            </div>

            <div className="space-y-3">
              {formItems.map((item, idx) => (
                <div key={idx} className="bg-[#0b1220] rounded-lg p-3 border border-white/5">
                  <div className="flex gap-2 mb-2">
                    <input
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="Descripción del servicio"
                      className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-600"
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
                        onChange={e => updateItem(idx, 'quantity', Number(e.target.value) || 1)}
                        className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
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
                        className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-600"
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

          {/* Tax & Total Preview */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-sm text-gray-400">IVU por defecto %</p>
              <input
                type="number"
                step="0.5"
                value={formTaxRate || ''}
                onChange={e => setFormTaxRate(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-20 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-600"
              />
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-white/10">
              <p className="text-sm text-gray-400">Total estimado</p>
              <p className="text-lg font-bold text-green-400">{fmt(total)}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="Notas por defecto (opcional)"
              rows={2}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none placeholder-gray-600"
            />
          </div>
        </div>
      </div>
    )
  }

  // ========== LIST VIEW ==========
  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-orange-600 to-amber-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📋 Templates</h1>
        </div>
        <button onClick={startCreate} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">+ Nuevo</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500">Sin templates</p>
            <p className="text-gray-600 text-sm mt-1">Crea uno para trabajos repetitivos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-200">{t.name}</p>
                    {t.client_name && <p className="text-xs text-gray-500">👤 {t.client_name}</p>}
                  </div>
                  <p className="text-lg font-bold text-green-400">{fmt(calcTotal(t.items))}</p>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  {t.items.length} item{t.items.length !== 1 ? 's' : ''}
                  {t.default_tax_rate > 0 && ` • IVU ${t.default_tax_rate}%`}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => useTemplate(t)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-600 text-white"
                  >
                    📄 Crear Factura
                  </button>
                  <button
                    onClick={() => startEdit(t)}
                    className="px-3 py-2 rounded-lg text-sm bg-white/10 text-gray-300"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ show: true, item: t })}
                    className="px-3 py-2 rounded-lg text-sm bg-red-900/30 text-red-400"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        show={confirmDelete.show}
        title="Eliminar Template"
        message={`¿Eliminar template "${confirmDelete.item?.name}"?`}
        confirmText="Eliminar"
        confirmColor="red"
        onConfirm={() => confirmDelete.item && deleteTemplate(confirmDelete.item)}
        onCancel={() => setConfirmDelete({ show: false, item: null })}
      />
    </div>
  )
}