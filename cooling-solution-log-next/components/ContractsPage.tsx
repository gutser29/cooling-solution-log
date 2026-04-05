'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { RecurringContract, ContractServiceRecord, Client, ClientLocation, Invoice } from '@/lib/types'
import { generateContractsReport, generateContractServiceHistoryPDF, generateInvoiceNumber } from '@/lib/pdfGenerator'

interface Props { onNavigate: (page: string) => void }

type StatusFilter = 'all' | 'active' | 'paused' | 'expired' | 'cancelled'
type ViewMode = 'list' | 'detail' | 'form'

const FREQ_LABELS: Record<string, string> = {
  monthly: 'Mensual', bimonthly: 'Bimestral', quarterly: 'Trimestral',
  semiannual: 'Semestral', annual: 'Anual'
}
const FREQ_MONTHS: Record<string, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12
}
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-900/40 text-green-300 border-green-500/30',
  paused: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
  expired: 'bg-orange-900/40 text-orange-300 border-orange-500/30',
  cancelled: 'bg-gray-700 text-gray-400 border-gray-600',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', paused: 'Pausado', expired: 'Vencido', cancelled: 'Cancelado'
}

const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: '2-digit', day: '2-digit', year: 'numeric' })
const isoDate = (ts?: number) => ts ? new Date(ts).toISOString().split('T')[0] : ''

function calcNextDue(from: number, frequency: string): number {
  const d = new Date(from)
  d.setMonth(d.getMonth() + (FREQ_MONTHS[frequency] || 1))
  return d.getTime()
}

function semaphore(nextDue: number, status: string): { color: string; label: string; days: number } {
  if (status !== 'active') return { color: 'text-gray-500', label: STATUS_LABEL[status] || status, days: 0 }
  const now = Date.now()
  const days = Math.ceil((nextDue - now) / 86400000)
  if (days < 0) return { color: 'text-red-400', label: `${Math.abs(days)}d vencido`, days }
  if (days <= 7) return { color: 'text-yellow-400', label: `${days}d`, days }
  return { color: 'text-green-400', label: `${days}d`, days }
}

function monthlyEquivalent(contract: RecurringContract): number {
  const months = FREQ_MONTHS[contract.frequency] || 1
  return contract.monthly_fee / months
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ContractsPage({ onNavigate }: Props) {
  const [contracts, setContracts] = useState<RecurringContract[]>([])
  const [serviceRecords, setServiceRecords] = useState<ContractServiceRecord[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [selected, setSelected] = useState<RecurringContract | null>(null)
  const [editing, setEditing] = useState<RecurringContract | null>(null)
  const [loading, setLoading] = useState(true)

  // service completion modal
  const [showMarkDone, setShowMarkDone] = useState(false)
  const [markDate, setMarkDate] = useState(new Date().toISOString().split('T')[0])
  const [markTech, setMarkTech] = useState('')
  const [markNotes, setMarkNotes] = useState('')
  const [markBusy, setMarkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [c, sr, cl] = await Promise.all([
      db.contracts.toArray(),
      db.contract_service_records.toArray(),
      db.clients.toArray(),
    ])
    setContracts(c.sort((a, b) => a.next_service_due - b.next_service_due))
    setServiceRecords(sr)
    setClients(cl)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── filtered list ────────────────────────────────────────────────────────────
  const filtered = contracts.filter(c => statusFilter === 'all' || c.status === statusFilter)

  // ─── stats ───────────────────────────────────────────────────────────────────
  const activeContracts = contracts.filter(c => c.status === 'active')
  const monthlyRevenue = activeContracts.reduce((s, c) => s + monthlyEquivalent(c), 0)
  const now = Date.now()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const servicesThisMonth = serviceRecords.filter(r => r.date >= monthStart).length

  // ─── complete service ─────────────────────────────────────────────────────────
  async function completeService(contract: RecurringContract) {
    if (!markDate) { alert('Selecciona la fecha del servicio'); return }
    setMarkBusy(true)
    try {
      const now = Date.now()
      const dateTs = new Date(markDate + 'T12:00:00').getTime()
      const amount = contract.monthly_fee

      // Create income event
      const eventId = await db.events.add({
        timestamp: dateTs,
        type: 'income',
        status: 'completed',
        category: 'Contrato',
        amount,
        client: contract.client_name || '',
        note: `${contract.service_type} — ${FREQ_LABELS[contract.frequency] || contract.frequency}`,
        expense_type: 'business',
      } as any)

      // Create service record
      await db.contract_service_records.add({
        contract_id: contract.id!,
        client_name: contract.client_name,
        date: dateTs,
        completed_by: markTech || undefined,
        notes: markNotes || undefined,
        event_id: eventId as number,
        amount,
        created_at: now,
      })

      // Advance next_service_due
      const newNextDue = calcNextDue(dateTs, contract.frequency)
      await db.contracts.update(contract.id!, { next_service_due: newNextDue, updated_at: now })

      // Reload and update selected
      await load()
      const updated = await db.contracts.get(contract.id!)
      if (updated) setSelected(updated)
      setShowMarkDone(false)
      setMarkDate(new Date().toISOString().split('T')[0])
      setMarkTech('')
      setMarkNotes('')
    } catch (e) {
      alert('Error al registrar servicio: ' + String(e))
    } finally {
      setMarkBusy(false)
    }
  }

  // ─── generate invoice ─────────────────────────────────────────────────────────
  async function generateInvoice(contract: RecurringContract) {
    const now = Date.now()
    const invNum = generateInvoiceNumber('invoice')
    await db.invoices.add({
      invoice_number: invNum,
      type: 'invoice',
      client_id: contract.client_id || undefined,
      client_name: contract.client_name || '',
      items: [{ description: `${contract.service_type}${contract.description ? ' — ' + contract.description : ''}`, quantity: 1, unit_price: contract.monthly_fee, total: contract.monthly_fee }],
      subtotal: contract.monthly_fee,
      tax_rate: 0,
      tax_amount: 0,
      total: contract.monthly_fee,
      status: 'draft',
      issue_date: now,
      due_date: now + 30 * 86400000,
      notes: `Contrato ${FREQ_LABELS[contract.frequency]} — ${contract.service_type}`,
      created_at: now,
      updated_at: now,
    } as any)
    alert(`✅ Factura ${invNum} creada. Abriendo Facturas...`)
    onNavigate('invoices')
  }

  // ─── delete contract ──────────────────────────────────────────────────────────
  async function deleteContract(c: RecurringContract) {
    if (!confirm(`¿Cancelar contrato de ${c.client_name}?`)) return
    await db.contracts.update(c.id!, { status: 'cancelled', updated_at: Date.now() })
    await load()
    setView('list')
    setSelected(null)
  }

  // ─── PDF handlers ─────────────────────────────────────────────────────────────
  async function pdfAll() {
    generateContractsReport(contracts.filter(c => c.status === 'active'), clients)
  }

  function pdfHistory(contract: RecurringContract) {
    const records = serviceRecords.filter(r => r.contract_id === contract.id)
    generateContractServiceHistoryPDF(contract, records)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0b1220] text-gray-400">Cargando contratos...</div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-emerald-700 to-teal-700 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (view !== 'list') { setView('list'); setSelected(null); setEditing(null) }
            else onNavigate('chat')
          }} className="text-white/80 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-lg font-bold">📋 Contratos</h1>
            <p className="text-xs text-white/60">
              {view === 'form' ? (editing?.id ? 'Editar contrato' : 'Nuevo contrato') :
               view === 'detail' && selected ? selected.client_name || 'Contrato' :
               `${filtered.length} contrato${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === 'list' && (
            <>
              <button onClick={pdfAll} className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80">
                📄 PDF
              </button>
              <button onClick={() => { setEditing(null); setView('form') }}
                className="text-xs px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-medium text-white">
                + Nuevo
              </button>
            </>
          )}
          {view === 'detail' && selected && (
            <>
              <button onClick={() => { setEditing(selected); setView('form') }}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80">
                ✏️ Editar
              </button>
              <button onClick={() => pdfHistory(selected)}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80">
                📄 Historial
              </button>
              {selected.status === 'active' && (
                <button onClick={() => setShowMarkDone(true)}
                  className="text-xs px-2 py-1 bg-green-600/80 hover:bg-green-500 rounded-lg text-white font-medium">
                  ✅ Completar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── LIST VIEW ────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{activeContracts.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Contratos Activos</p>
            </div>
            <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-cyan-400">{fmt(monthlyRevenue)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Revenue/Mes</p>
            </div>
            <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{servicesThisMonth}</p>
              <p className="text-xs text-gray-500 mt-0.5">Servicios este mes</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {(['all', 'active', 'paused', 'expired', 'cancelled'] as StatusFilter[]).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 border transition-colors ${statusFilter === s ? 'bg-emerald-700 text-white border-emerald-500' : 'bg-[#111a2e] text-gray-400 border-white/10'}`}>
                {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {/* Cards */}
          {filtered.length === 0 ? (
            <div className="bg-[#111a2e] border border-white/10 rounded-xl p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-lg font-medium mb-1">No hay contratos</p>
              <p className="text-sm mb-4">Agrega contratos de mantenimiento recurrente</p>
              <button onClick={() => { setEditing(null); setView('form') }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white">
                + Nuevo Contrato
              </button>
            </div>
          ) : (
            filtered.map(c => <ContractCard key={c.id} contract={c}
              serviceCount={serviceRecords.filter(r => r.contract_id === c.id).length}
              onClick={() => { setSelected(c); setView('detail') }} />)
          )}
        </div>
      )}

      {/* ─── DETAIL VIEW ──────────────────────────────────────────────────── */}
      {view === 'detail' && selected && (
        <ContractDetail
          contract={selected}
          serviceRecords={serviceRecords.filter(r => r.contract_id === selected.id)}
          onGenerateInvoice={() => generateInvoice(selected)}
          onDelete={() => deleteContract(selected)}
          onStatusChange={async (status) => {
            await db.contracts.update(selected.id!, { status, updated_at: Date.now() })
            await load()
            const updated = await db.contracts.get(selected.id!)
            if (updated) setSelected(updated)
          }}
        />
      )}

      {/* ─── FORM VIEW ────────────────────────────────────────────────────── */}
      {view === 'form' && (
        <ContractForm
          contract={editing}
          clients={clients}
          onSave={async (data) => {
            const now = Date.now()
            if (editing?.id) {
              await db.contracts.update(editing.id, { ...data, updated_at: now })
            } else {
              await db.contracts.add({ ...data, created_at: now })
            }
            await load()
            setView(selected ? 'detail' : 'list')
            setEditing(null)
          }}
          onCancel={() => { setView(selected ? 'detail' : 'list'); setEditing(null) }}
        />
      )}

      {/* ─── MODAL: Mark Service Done ─────────────────────────────────────── */}
      {showMarkDone && selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#111a2e] border border-white/20 rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-white/10 flex justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Marcar Servicio Completado</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.client_name} · {selected.service_type}</p>
              </div>
              <button onClick={() => setShowMarkDone(false)} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Fecha del servicio</label>
                <input type="date" value={markDate} onChange={e => setMarkDate(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Técnico</label>
                <input value={markTech} onChange={e => setMarkTech(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                  placeholder="Nombre del técnico (opcional)" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Notas</label>
                <textarea value={markNotes} onChange={e => setMarkNotes(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white resize-none"
                  rows={2} placeholder="Observaciones del servicio..." />
              </div>
              <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-3 text-sm">
                <div className="flex justify-between text-gray-300">
                  <span>Monto del servicio</span>
                  <span className="font-bold text-emerald-400">{fmt(selected.monthly_fee)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Se registrará un ingreso de {fmt(selected.monthly_fee)} y se calculará la próxima fecha: {new Date(calcNextDue(new Date(markDate + 'T12:00:00').getTime(), selected.frequency)).toLocaleDateString('es-PR')}
                </p>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowMarkDone(false)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
                Cancelar
              </button>
              <button onClick={() => completeService(selected)} disabled={markBusy}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white disabled:opacity-50">
                {markBusy ? 'Registrando...' : '✅ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Contract Card ─────────────────────────────────────────────────────────────
function ContractCard({ contract, serviceCount, onClick }: {
  contract: RecurringContract; serviceCount: number; onClick: () => void
}) {
  const sem = semaphore(contract.next_service_due, contract.status)
  const dotColor = sem.days < 0 ? 'bg-red-400' : sem.days <= 7 ? 'bg-yellow-400' : 'bg-green-400'

  return (
    <div onClick={onClick} className="bg-[#111a2e] border border-white/10 rounded-xl p-4 cursor-pointer hover:border-emerald-500/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{contract.client_name || `Contrato #${contract.id}`}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[contract.status]}`}>
              {STATUS_LABEL[contract.status]}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{contract.service_type}</p>
          {contract.description && <p className="text-xs text-gray-500 truncate">{contract.description}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>{FREQ_LABELS[contract.frequency]}</span>
            {contract.location_name && <span>📍 {contract.location_name}</span>}
            {serviceCount > 0 && <span>✅ {serviceCount} servicio{serviceCount !== 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">{fmt(contract.monthly_fee)}</p>
          <p className="text-xs text-gray-500">por visita</p>
          {contract.status === 'active' && (
            <div className="flex items-center gap-1 justify-end mt-1">
              <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
              <span className={`text-xs font-medium ${sem.color}`}>{sem.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Contract Detail ──────────────────────────────────────────────────────────
function ContractDetail({ contract, serviceRecords, onGenerateInvoice, onDelete, onStatusChange }: {
  contract: RecurringContract
  serviceRecords: ContractServiceRecord[]
  onGenerateInvoice: () => void
  onDelete: () => void
  onStatusChange: (s: RecurringContract['status']) => Promise<void>
}) {
  const sem = semaphore(contract.next_service_due, contract.status)
  const sortedRecords = [...serviceRecords].sort((a, b) => b.date - a.date)
  const totalRevenue = serviceRecords.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
      {/* Contract info */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{contract.client_name}</h2>
            <p className="text-sm text-gray-300 mt-0.5">{contract.service_type}</p>
            {contract.description && <p className="text-xs text-gray-400 mt-0.5">{contract.description}</p>}
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${STATUS_COLOR[contract.status]}`}>
            {STATUS_LABEL[contract.status]}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-xs text-gray-400 block">Frecuencia</span><p className="text-white">{FREQ_LABELS[contract.frequency]}</p></div>
          <div><span className="text-xs text-gray-400 block">Monto / visita</span><p className="text-white font-medium">{fmt(contract.monthly_fee)}</p></div>
          <div><span className="text-xs text-gray-400 block">Inicio</span><p className="text-white">{fmtDate(contract.start_date)}</p></div>
          {contract.end_date && <div><span className="text-xs text-gray-400 block">Vence</span><p className="text-orange-400">{fmtDate(contract.end_date)}</p></div>}
          {contract.location_name && <div className="col-span-2"><span className="text-xs text-gray-400 block">Localidad</span><p className="text-white">📍 {contract.location_name}</p></div>}
          {contract.notes && <div className="col-span-2"><span className="text-xs text-gray-400 block">Notas</span><p className="text-gray-300 text-xs">{contract.notes}</p></div>}
        </div>
      </div>

      {/* Next due + stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
          <p className={`text-base font-bold ${sem.color}`}>{sem.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">Próximo servicio</p>
          <p className="text-xs text-gray-400">{fmtDate(contract.next_service_due)}</p>
        </div>
        <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-base font-bold text-white">{serviceRecords.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Servicios</p>
        </div>
        <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
          <p className="text-sm font-bold text-green-400">{fmt(totalRevenue)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total cobrado</p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onGenerateInvoice}
          className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 rounded-xl text-sm text-blue-300">
          🧾 Generar Factura
        </button>
        {contract.status === 'active' && (
          <button onClick={() => onStatusChange('paused')}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-500/20 rounded-xl text-sm text-blue-400">
            ⏸️ Pausar
          </button>
        )}
        {contract.status === 'paused' && (
          <button onClick={() => onStatusChange('active')}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 rounded-xl text-sm text-green-400">
            ▶️ Reactivar
          </button>
        )}
      </div>

      {/* Service history */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-200">Historial de Servicios</h3>
        </div>
        {sortedRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No hay servicios completados aún</div>
        ) : (
          <div className="divide-y divide-white/5">
            {sortedRecords.map((r, i) => (
              <div key={r.id || i} className="px-4 py-3 flex items-start justify-between">
                <div>
                  <p className="text-sm text-white">{fmtDate(r.date)}</p>
                  {r.completed_by && <p className="text-xs text-gray-400 mt-0.5">👷 {r.completed_by}</p>}
                  {r.notes && <p className="text-xs text-gray-500 italic mt-0.5">{r.notes}</p>}
                </div>
                <span className="text-sm font-medium text-green-400">{fmt(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger */}
      <button onClick={onDelete} className="w-full py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors">
        🗑️ Cancelar contrato
      </button>
    </div>
  )
}

// ─── Contract Form ────────────────────────────────────────────────────────────
function ContractForm({ contract, clients, onSave, onCancel }: {
  contract: RecurringContract | null
  clients: Client[]
  onSave: (data: Omit<RecurringContract, 'id' | 'created_at'>) => Promise<void>
  onCancel: () => void
}) {
  const [clientId, setClientId] = useState(contract?.client_id || 0)
  const [clientName, setClientName] = useState(contract?.client_name || '')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [locationId, setLocationId] = useState<number | undefined>(contract?.location_id)
  const [locationName, setLocationName] = useState(contract?.location_name || '')
  const [serviceType, setServiceType] = useState(contract?.service_type || 'Mantenimiento Preventivo')
  const [description, setDescription] = useState(contract?.description || '')
  const [frequency, setFrequency] = useState(contract?.frequency || 'monthly')
  const [fee, setFee] = useState(contract?.monthly_fee || 0)
  const [startDate, setStartDate] = useState(isoDate(contract?.start_date) || new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(isoDate(contract?.end_date) || '')
  const [nextDue, setNextDue] = useState(isoDate(contract?.next_service_due) || new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState(contract?.notes || '')
  const [status, setStatus] = useState<RecurringContract['status']>(contract?.status || 'active')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (clientId) {
      db.client_locations.where('client_id').equals(clientId).toArray().then(setLocations)
    } else setLocations([])
  }, [clientId])

  const filteredClients = clients.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
  )

  function selectClient(c: Client) {
    setClientId(c.id!)
    setClientName(`${c.first_name} ${c.last_name}`)
    setShowClientPicker(false)
    setClientSearch('')
    setLocationId(undefined)
    setLocationName('')
  }

  function selectLocation(loc: ClientLocation) {
    setLocationId(loc.id)
    setLocationName(`${loc.name}${loc.city ? ' — ' + loc.city : ''}`)
  }

  // Auto-calc next due when start date or frequency changes (only for new contracts)
  useEffect(() => {
    if (!contract?.id && startDate) {
      const ts = new Date(startDate + 'T12:00:00').getTime()
      setNextDue(isoDate(calcNextDue(ts, frequency)))
    }
  }, [startDate, frequency, contract?.id])

  async function handleSave() {
    if (!clientId) { alert('Selecciona un cliente'); return }
    if (!serviceType.trim()) { alert('Descripción del servicio requerida'); return }
    if (!fee || fee <= 0) { alert('Monto requerido'); return }
    setSaving(true)
    await onSave({
      client_id: clientId,
      client_name: clientName,
      service_type: serviceType.trim(),
      description: description.trim() || undefined,
      frequency: frequency as RecurringContract['frequency'],
      monthly_fee: Number(fee),
      start_date: new Date(startDate + 'T12:00:00').getTime(),
      end_date: endDate ? new Date(endDate + 'T12:00:00').getTime() : undefined,
      next_service_due: new Date(nextDue + 'T12:00:00').getTime(),
      auto_reminder_days: 3,
      status,
      location_id: locationId,
      location_name: locationName || undefined,
      notes: notes || undefined,
    })
    setSaving(false)
  }

  const inputCls = 'w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500'
  const labelCls = 'text-xs text-gray-400 block mb-1'

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">
      {/* Client picker */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Cliente</h3>
        <div className="relative">
          <label className={labelCls}>Cliente *</label>
          <div className="flex gap-2">
            <input value={clientName} readOnly placeholder="Selecciona un cliente..."
              className={`${inputCls} flex-1 cursor-pointer`}
              onClick={() => setShowClientPicker(true)} />
            <button onClick={() => setShowClientPicker(true)}
              className="px-3 py-2 bg-emerald-700/50 hover:bg-emerald-700 rounded-lg text-sm text-emerald-300">
              Buscar
            </button>
          </div>
          {showClientPicker && (
            <div className="absolute top-full left-0 right-0 z-30 bg-[#111a2e] border border-white/20 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto">
              <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                className="w-full px-3 py-2 bg-transparent border-b border-white/10 text-sm text-white placeholder-gray-500"
                placeholder="Buscar cliente..." />
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => selectClient(c)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10">
                  {c.first_name} {c.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
        {locations.length > 0 && (
          <div>
            <label className={labelCls}>Localidad</label>
            <select value={locationId ?? ''} onChange={e => {
              const loc = locations.find(l => l.id === Number(e.target.value))
              if (loc) selectLocation(loc)
              else { setLocationId(undefined); setLocationName('') }
            }} className={inputCls}>
              <option value="">Sin localidad específica</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Service info */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Servicio</h3>
        <div>
          <label className={labelCls}>Tipo de servicio *</label>
          <input value={serviceType} onChange={e => setServiceType(e.target.value)}
            className={inputCls} placeholder="Mantenimiento Preventivo, Limpieza, Servicio AC..." />
        </div>
        <div>
          <label className={labelCls}>Descripción detallada</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            className={`${inputCls} resize-none`} rows={2}
            placeholder="Ej: 6 paquetes, limpieza filtros, revisión refrigerante..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Frecuencia</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as any)} className={inputCls}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Monto por visita ($)</label>
            <input type="number" value={fee} onChange={e => setFee(Number(e.target.value))}
              className={inputCls} min="0" step="50" />
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Fechas</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fecha vencimiento</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Próximo servicio</label>
          <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Status + Notes */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <div>
          <label className={labelCls}>Estado</label>
          <select value={status} onChange={e => setStatus(e.target.value as any)} className={inputCls}>
            <option value="active">Activo</option>
            <option value="paused">Pausado</option>
            <option value="expired">Vencido</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Notas internas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className={`${inputCls} resize-none`} rows={2} placeholder="Notas del contrato..." />
        </div>
      </div>

      {/* Projection */}
      <div className="bg-emerald-900/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-gray-300">
        <p className="font-medium text-emerald-400 mb-1">Proyección anual</p>
        <p>Visitas/año: <span className="text-white">{Math.round(12 / (FREQ_MONTHS[frequency] || 1))}</span></p>
        <p>Revenue anual: <span className="text-white font-bold">{fmt((fee || 0) * Math.round(12 / (FREQ_MONTHS[frequency] || 1)))}</span></p>
        <p>Equivalente mensual: <span className="text-cyan-400">{fmt((fee || 0) / (FREQ_MONTHS[frequency] || 1))}</span></p>
      </div>

      <div className="flex gap-3 pb-4">
        <button onClick={onCancel} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 rounded-xl text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando...' : (contract?.id ? 'Guardar Cambios' : 'Crear Contrato')}
        </button>
      </div>
    </div>
  )
}
