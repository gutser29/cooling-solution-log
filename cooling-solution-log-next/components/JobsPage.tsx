'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { EmployeePayment } from '@/lib/db'
import type { Job, JobService, JobMaterial, JobEmployee, Client, Employee, ClientLocation, Invoice } from '@/lib/types'
import { generateInvoiceNumber } from '@/lib/pdfGenerator'

interface Props { onNavigate: (page: string) => void }

type ViewMode = 'list' | 'detail' | 'form'
type StatusFilter = 'all' | 'quote' | 'in_progress' | 'completed' | 'cancelled'

const JOB_TYPES = ['installation', 'repair', 'maintenance', 'emergency', 'warranty', 'quote'] as const
const TYPE_LABEL: Record<string, string> = {
  installation: 'Instalación', repair: 'Reparación', maintenance: 'Mantenimiento',
  emergency: 'Emergencia', warranty: 'Garantía', quote: 'Cotización'
}
const STATUS_LABEL: Record<string, string> = {
  quote: 'Cotización', in_progress: 'En Progreso', completed: 'Completado', cancelled: 'Cancelado'
}
const STATUS_COLOR: Record<string, string> = {
  quote: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-900/40 text-yellow-300 border-yellow-500/30',
  completed: 'bg-green-900/40 text-green-300 border-green-500/30',
  cancelled: 'bg-gray-700 text-gray-400 border-gray-600',
}
const VEHICLES = [
  { id: 'transit', label: 'Ford Transit' },
  { id: 'f150', label: 'F-150' },
  { id: 'bmw', label: 'BMW' },
  { id: 'other', label: 'Otro' },
]
const PAYMENT_METHODS = ['cash', 'check', 'ath_movil', 'transfer', 'capital_one', 'chase_visa']
const PM_LABEL: Record<string, string> = {
  cash: 'Efectivo', check: 'Cheque', ath_movil: 'ATH Móvil',
  transfer: 'Transferencia', capital_one: 'Capital One', chase_visa: 'Chase'
}

const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR')
const isoDate = (ts?: number) => ts ? new Date(ts).toISOString().split('T')[0] : ''

// ─── empty row helpers ────────────────────────────────────────────────────────
const emptyService = (): JobService => ({ description: '', quantity: 1, unit_price: 0, total: 0 })
const emptyMaterial = (): JobMaterial => ({ item: '', quantity: 1, unit_cost: 0, unit_price: 0 })

// ─── Component ────────────────────────────────────────────────────────────────
export default function JobsPage({ onNavigate }: Props) {
  const [view, setView] = useState<ViewMode>('list')
  const [jobs, setJobs] = useState<Job[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [loading, setLoading] = useState(true)

  // pay-employees panel (within detail view)
  const [showPayPanel, setShowPayPanel] = useState(false)
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payMethod, setPayMethod] = useState('cash')
  const [payBusy, setPayBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [j, c, e] = await Promise.all([
      db.jobs.orderBy('date').reverse().toArray(),
      db.clients.toArray(),
      db.employees.toArray(),
    ])
    setJobs(j)
    setClients(c.filter(c => c.active === true || (c.active as any) === 1))
    setEmployees(e.filter(e => e.active === true || (e.active as any) === 1))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Check sessionStorage for prefill from Quick Quote
    try {
      const raw = sessionStorage.getItem('jobs_prefill')
      if (raw) {
        sessionStorage.removeItem('jobs_prefill')
        const prefill = JSON.parse(raw)
        setEditingJob(null)
        setView('form')
        // prefillForm will be called via a separate effect
        setPrefillData(prefill)
      }
    } catch {}
  }, [load])

  const [prefillData, setPrefillData] = useState<any>(null)

  // ─── filtered list ───────────────────────────────────────────────────────────
  const filtered = jobs.filter(j => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false
    if (clientFilter && !(j.client_name || '').toLowerCase().includes(clientFilter.toLowerCase())) return false
    return true
  })

  // ─── stats ───────────────────────────────────────────────────────────────────
  const stats = {
    quote: jobs.filter(j => j.status === 'quote').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    revenue: jobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.total_charged, 0),
  }

  // ─── generate invoice from job ───────────────────────────────────────────────
  async function generateInvoice(job: Job) {
    const now = Date.now()
    const items = [
      ...job.services.map(s => ({ description: s.description, quantity: s.quantity, unit_price: s.unit_price, total: s.total })),
      ...job.materials.map(m => ({ description: m.item, quantity: m.quantity, unit_price: m.unit_price || m.unit_cost, total: m.quantity * (m.unit_price || m.unit_cost) })),
    ]
    if (items.length === 0) { alert('El trabajo no tiene servicios o materiales para facturar.'); return }
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const invNum = generateInvoiceNumber('invoice')
    const invId = await db.invoices.add({
      invoice_number: invNum,
      type: 'invoice',
      client_id: job.client_id || undefined,
      client_name: job.client_name || '',
      items,
      subtotal,
      tax_rate: job.tax ? (job.tax / subtotal) : 0,
      tax_amount: job.tax || 0,
      total: subtotal + (job.tax || 0),
      status: 'draft',
      issue_date: now,
      due_date: now + 30 * 86400000,
      location_id: job.location_id,
      notes: job.notes || '',
      created_at: now,
      updated_at: now,
    } as any)
    await db.jobs.update(job.id!, { invoice_id: invId as number })
    await load()
    alert(`✅ Factura ${invNum} creada. Abriendo Facturas...`)
    onNavigate('invoices')
  }

  // ─── pay employees from job ──────────────────────────────────────────────────
  async function payEmployeesFromJob(job: Job) {
    if (!job.employees?.length) { alert('No hay empleados asignados a este trabajo.'); return }
    setPayBusy(true)
    const now = Date.now()
    const dateTs = new Date(payDate + 'T12:00:00').getTime()
    const savedNames: string[] = []
    for (const je of job.employees) {
      const emp = employees.find(e => e.id === je.employee_id)
      if (!emp) continue
      const gross = je.total_gross
      const retPct = je.retention_percent || emp.retention_percent || 10
      const retention = parseFloat((gross * retPct / 100).toFixed(2))
      const net = parseFloat((gross - retention).toFixed(2))
      await db.employee_payments.add({
        employee_id: emp.id!,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        date: dateTs,
        description: `${TYPE_LABEL[job.type] || job.type} — ${job.client_name || ''}${job.description ? ' — ' + job.description : ''}`,
        days_worked: je.days_worked,
        daily_rate: je.daily_rate,
        amount_gross: gross,
        retention_percent: retPct,
        retention_amount: retention,
        amount_net: net,
        payment_method: payMethod,
        job_id: job.id,
        notes: `Job #${job.id}`,
        created_at: now,
      })
      // Also record as Nómina event
      await db.events.add({
        timestamp: dateTs,
        type: 'expense',
        status: 'completed',
        category: 'Nómina',
        amount: net,
        employee_id: emp.id,
        job_id: job.id,
        payment_method: payMethod,
        note: `${emp.first_name} ${emp.last_name} — ${je.days_worked}d × $${je.daily_rate} — Job #${job.id}`,
        expense_type: 'business',
        created_at: now,
      } as any)
      savedNames.push(`${emp.first_name} ${emp.last_name}: ${fmt(net)} neto`)
    }
    setPayBusy(false)
    setShowPayPanel(false)
    alert(`✅ Pagos registrados:\n${savedNames.join('\n')}`)
    await load()
  }

  // ─── delete job ──────────────────────────────────────────────────────────────
  async function deleteJob(job: Job) {
    if (!confirm(`¿Borrar trabajo de ${job.client_name}? Esta acción no se puede deshacer.`)) return
    await db.jobs.delete(job.id!)
    setView('list')
    setSelectedJob(null)
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0b1220] text-gray-400">Cargando trabajos...</div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* ─── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-teal-700 to-cyan-700 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (view === 'form' || view === 'detail') { setView('list'); setEditingJob(null); setSelectedJob(null) }
            else onNavigate('chat')
          }} className="text-white/80 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-lg font-bold">🔧 Trabajos</h1>
            <p className="text-xs text-white/60">
              {view === 'form' ? (editingJob?.id ? 'Editar Trabajo' : 'Nuevo Trabajo') :
               view === 'detail' && selectedJob ? `${selectedJob.client_name || 'Sin cliente'}` :
               `${filtered.length} trabajo${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === 'list' && (
            <button onClick={() => { setEditingJob(null); setPrefillData(null); setView('form') }}
              className="text-xs px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-medium text-white">
              + Nuevo
            </button>
          )}
          {view === 'detail' && selectedJob && (
            <>
              <button onClick={() => { setEditingJob(selectedJob); setView('form') }}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80">
                ✏️ Editar
              </button>
              {!selectedJob.invoice_id && selectedJob.status === 'completed' && (
                <button onClick={() => generateInvoice(selectedJob)}
                  className="text-xs px-2 py-1 bg-green-600/80 hover:bg-green-500 rounded-lg text-white font-medium">
                  🧾 Factura
                </button>
              )}
              {selectedJob.invoice_id && (
                <button onClick={() => onNavigate('invoices')}
                  className="text-xs px-2 py-1 bg-blue-600/60 hover:bg-blue-500 rounded-lg text-white">
                  🧾 Ver Factura
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Cotizaciones', val: stats.quote, color: 'text-blue-400' },
              { label: 'En Progreso', val: stats.in_progress, color: 'text-yellow-400' },
              { label: 'Completados', val: stats.completed, color: 'text-green-400' },
              { label: 'Revenue', val: fmt(stats.revenue), color: 'text-cyan-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#111a2e] border border-white/10 rounded-xl p-2 text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.val}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {(['all', 'quote', 'in_progress', 'completed', 'cancelled'] as StatusFilter[]).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 border transition-colors ${statusFilter === s ? 'bg-cyan-700 text-white border-cyan-500' : 'bg-[#111a2e] text-gray-400 border-white/10'}`}>
                  {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <input value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
              placeholder="🔍 Buscar por cliente..." />
          </div>

          {/* Job cards */}
          {filtered.length === 0 ? (
            <div className="bg-[#111a2e] border border-white/10 rounded-xl p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">🔧</p>
              <p className="text-lg font-medium mb-1">No hay trabajos</p>
              <p className="text-sm mb-4">Crea el primer trabajo para este filtro</p>
              <button onClick={() => { setEditingJob(null); setPrefillData(null); setView('form') }}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 rounded-lg text-sm font-medium text-white">
                + Nuevo Trabajo
              </button>
            </div>
          ) : (
            filtered.map(job => <JobCard key={job.id} job={job} employees={employees}
              onClick={() => { setSelectedJob(job); setView('detail') }} />)
          )}
        </div>
      )}

      {/* ─── DETAIL VIEW ────────────────────────────────────────────────────── */}
      {view === 'detail' && selectedJob && (
        <JobDetail
          job={selectedJob}
          employees={employees}
          showPayPanel={showPayPanel}
          payDate={payDate}
          payMethod={payMethod}
          payBusy={payBusy}
          onPayDateChange={setPayDate}
          onPayMethodChange={setPayMethod}
          onTogglePayPanel={() => setShowPayPanel(p => !p)}
          onPayEmployees={() => payEmployeesFromJob(selectedJob)}
          onDelete={() => deleteJob(selectedJob)}
        />
      )}

      {/* ─── FORM VIEW ──────────────────────────────────────────────────────── */}
      {view === 'form' && (
        <JobForm
          job={editingJob}
          prefill={prefillData}
          clients={clients}
          employees={employees}
          onSave={async (data) => {
            const now = Date.now()
            if (editingJob?.id) {
              await db.jobs.update(editingJob.id, { ...data, updated_at: now } as any)
            } else {
              await db.jobs.add({ ...data, created_at: now } as any)
            }
            await load()
            setView('list')
            setEditingJob(null)
          }}
          onCancel={() => { setView(selectedJob ? 'detail' : 'list'); setEditingJob(null) }}
        />
      )}
    </div>
  )
}

// ─── Job Card ─────────────────────────────────────────────────────────────────
function JobCard({ job, employees, onClick }: { job: Job; employees: Employee[]; onClick: () => void }) {
  const empNames = (job.employees || []).map(je => {
    const e = employees.find(e => e.id === je.employee_id)
    return e ? e.first_name : `#${je.employee_id}`
  }).join(', ')

  return (
    <div onClick={onClick} className="bg-[#111a2e] border border-white/10 rounded-xl p-4 cursor-pointer hover:border-cyan-500/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{job.client_name || `Cliente #${job.client_id}`}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLOR[job.status]}`}>
              {STATUS_LABEL[job.status]}
            </span>
            {job.invoice_id && <span className="text-[10px] text-blue-400">🧾 facturado</span>}
          </div>
          {job.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{job.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{TYPE_LABEL[job.type] || job.type}</span>
            <span>{fmtDate(job.date_started || job.date)}</span>
            {empNames && <span>👷 {empNames}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">{fmt(job.total_charged)}</p>
          {job.payment_status !== 'paid' && job.balance_due > 0 && (
            <p className="text-xs text-red-400">-{fmt(job.balance_due)} pendiente</p>
          )}
          {job.payment_status === 'paid' && <p className="text-xs text-green-400">Pagado</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Job Detail ───────────────────────────────────────────────────────────────
function JobDetail({ job, employees, showPayPanel, payDate, payMethod, payBusy,
  onPayDateChange, onPayMethodChange, onTogglePayPanel, onPayEmployees, onDelete
}: {
  job: Job; employees: Employee[]
  showPayPanel: boolean; payDate: string; payMethod: string; payBusy: boolean
  onPayDateChange: (d: string) => void; onPayMethodChange: (m: string) => void
  onTogglePayPanel: () => void; onPayEmployees: () => void; onDelete: () => void
}) {
  const laborTotal = (job.employees || []).reduce((s, je) => s + je.total_gross, 0)
  const taxAmt = job.tax || 0
  const grandTotal = job.subtotal_services + job.subtotal_materials + laborTotal + taxAmt

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
      {/* Header card */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{job.client_name || `Cliente #${job.client_id}`}</h2>
            {job.description && <p className="text-sm text-gray-300 mt-0.5">{job.description}</p>}
            <p className="text-xs text-gray-500 mt-1">{TYPE_LABEL[job.type]} · {fmtDate(job.date_started || job.date)}{job.date_completed ? ` → ${fmtDate(job.date_completed)}` : ''}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${STATUS_COLOR[job.status]}`}>{STATUS_LABEL[job.status]}</span>
        </div>
        {job.vehicle_used && (
          <p className="text-xs text-gray-500 mt-1">🚐 {VEHICLES.find(v => v.id === job.vehicle_used)?.label || job.vehicle_used}</p>
        )}
        {job.notes && <p className="text-xs text-gray-400 mt-2 italic">{job.notes}</p>}
      </div>

      {/* Totals */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
        {job.subtotal_services > 0 && <div className="flex justify-between"><span className="text-gray-400">Servicios</span><span className="text-white">{fmt(job.subtotal_services)}</span></div>}
        {job.subtotal_materials > 0 && <div className="flex justify-between"><span className="text-gray-400">Materiales</span><span className="text-white">{fmt(job.subtotal_materials)}</span></div>}
        {laborTotal > 0 && <div className="flex justify-between"><span className="text-gray-400">Labor</span><span className="text-white">{fmt(laborTotal)}</span></div>}
        {taxAmt > 0 && <div className="flex justify-between"><span className="text-gray-400">IVU</span><span className="text-white">{fmt(taxAmt)}</span></div>}
        <div className="col-span-2 flex justify-between font-bold border-t border-white/10 pt-2 mt-1">
          <span className="text-gray-200">Total</span><span className="text-cyan-400 text-base">{fmt(grandTotal)}</span>
        </div>
        {job.payment_status !== 'paid' && job.balance_due > 0 && (
          <div className="col-span-2 flex justify-between text-xs">
            <span className="text-gray-400">Balance pendiente</span><span className="text-red-400">{fmt(job.balance_due)}</span>
          </div>
        )}
      </div>

      {/* Services */}
      {job.services?.length > 0 && (
        <Section title="Servicios">
          {job.services.map((s, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0 text-sm">
              <span className="text-gray-300 flex-1">{s.description}</span>
              <span className="text-gray-400 mx-2">{s.quantity} × {fmt(s.unit_price)}</span>
              <span className="text-white font-medium">{fmt(s.total)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Materials */}
      {job.materials?.length > 0 && (
        <Section title="Materiales">
          {job.materials.map((m, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0 text-sm">
              <span className="text-gray-300 flex-1">{m.item}</span>
              <span className="text-gray-400 mx-2">{m.quantity} und</span>
              <span className="text-white font-medium">{fmt(m.quantity * (m.unit_price || m.unit_cost))}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Employees */}
      {job.employees?.length > 0 && (
        <Section title="Empleados">
          {job.employees.map((je, i) => {
            const emp = employees.find(e => e.id === je.employee_id)
            const net = je.total_gross - (je.total_gross * (je.retention_percent / 100))
            return (
              <div key={i} className="py-2 border-b border-white/5 last:border-0">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-200">{emp ? `${emp.first_name} ${emp.last_name}` : `Empleado #${je.employee_id}`}</span>
                  <span className="text-white font-medium">{fmt(je.total_gross)}</span>
                </div>
                <p className="text-xs text-gray-500">{je.days_worked}d × {fmt(je.daily_rate)} · Ret {je.retention_percent}% · Neto: {fmt(net)}</p>
              </div>
            )
          })}
        </Section>
      )}

      {/* Pay employees panel */}
      {job.employees?.length > 0 && (
        <div className="bg-[#111a2e] border border-white/10 rounded-xl overflow-hidden">
          <button onClick={onTogglePayPanel}
            className="w-full flex items-center justify-between p-4 text-left">
            <span className="text-sm font-medium text-gray-200">👷 Registrar pago a empleados</span>
            <span className="text-gray-400">{showPayPanel ? '▲' : '▼'}</span>
          </button>
          {showPayPanel && (
            <div className="px-4 pb-4 space-y-3 border-t border-white/10">
              <p className="text-xs text-gray-400 pt-3">Se registrarán pagos y eventos de Nómina para todos los empleados del trabajo.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Fecha de pago</label>
                  <input type="date" value={payDate} onChange={e => onPayDateChange(e.target.value)}
                    className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Método</label>
                  <select value={payMethod} onChange={e => onPayMethodChange(e.target.value)}
                    className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PM_LABEL[m]}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-[#0b1220] rounded-lg p-3 space-y-1 text-xs text-gray-400">
                {job.employees.map((je, i) => {
                  const emp = employees.find(e => e.id === je.employee_id)
                  const net = je.total_gross * (1 - je.retention_percent / 100)
                  return (
                    <div key={i} className="flex justify-between">
                      <span>{emp ? `${emp.first_name} ${emp.last_name}` : `#${je.employee_id}`}</span>
                      <span className="text-green-400">{fmt(net)} neto</span>
                    </div>
                  )
                })}
              </div>
              <button onClick={onPayEmployees} disabled={payBusy}
                className="w-full py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
                {payBusy ? 'Registrando...' : '✅ Confirmar Pagos'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <button onClick={onDelete} className="w-full py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors">
        🗑️ Eliminar trabajo
      </button>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111a2e] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-white/10 bg-white/5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  )
}

// ─── Job Form ─────────────────────────────────────────────────────────────────
function JobForm({
  job, prefill, clients, employees, onSave, onCancel
}: {
  job: Job | null
  prefill: any
  clients: Client[]
  employees: Employee[]
  onSave: (data: Omit<Job, 'id' | 'created_at'>) => Promise<void>
  onCancel: () => void
}) {
  const [clientId, setClientId] = useState(job?.client_id || 0)
  const [clientName, setClientName] = useState(job?.client_name || '')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [locationId, setLocationId] = useState<number | undefined>(job?.location_id)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [description, setDescription] = useState(job?.description || prefill?.description || '')
  const [type, setType] = useState<Job['type']>(job?.type || 'repair')
  const [status, setStatus] = useState<Job['status']>(job?.status || 'in_progress')
  const [dateStarted, setDateStarted] = useState(isoDate(job?.date_started) || new Date().toISOString().split('T')[0])
  const [dateCompleted, setDateCompleted] = useState(isoDate(job?.date_completed) || '')
  const [vehicle, setVehicle] = useState(job?.vehicle_used || '')
  const [notes, setNotes] = useState(job?.notes || '')
  const [services, setServices] = useState<JobService[]>(job?.services?.length ? job.services : [emptyService()])
  const [materials, setMaterials] = useState<JobMaterial[]>(job?.materials?.length ? job.materials : [emptyMaterial()])
  const [jobEmployees, setJobEmployees] = useState<JobEmployee[]>(job?.employees || [])
  const [saving, setSaving] = useState(false)

  // Load locations when client changes
  useEffect(() => {
    if (clientId) {
      db.client_locations.where('client_id').equals(clientId).toArray().then(setLocations)
    } else {
      setLocations([])
    }
  }, [clientId])

  // Pre-fill from Quick Quote
  useEffect(() => {
    if (prefill) {
      setDescription(prefill.description || '')
      if (prefill.client_name) setClientName(prefill.client_name)
      if (prefill.client_id) setClientId(prefill.client_id)
      if (prefill.quoted_price) {
        setServices([{ description: prefill.description || 'Servicio', quantity: 1, unit_price: prefill.quoted_price, total: prefill.quoted_price }])
      }
    }
  }, [prefill])

  const filteredClients = clients.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
  )

  function selectClient(c: Client) {
    setClientId(c.id!)
    setClientName(`${c.first_name} ${c.last_name}`)
    setShowClientPicker(false)
    setClientSearch('')
    setLocationId(undefined)
  }

  // ─── services ────────────────────────────────────────────────────────────────
  function updateService(i: number, field: keyof JobService, val: string | number) {
    setServices(prev => {
      const n = [...prev]
      n[i] = { ...n[i], [field]: typeof val === 'string' ? val : Number(val) }
      if (field === 'quantity' || field === 'unit_price') {
        n[i].total = parseFloat((Number(n[i].quantity) * Number(n[i].unit_price)).toFixed(2))
      }
      return n
    })
  }
  function addService() { setServices(prev => [...prev, emptyService()]) }
  function removeService(i: number) { setServices(prev => prev.filter((_, idx) => idx !== i)) }

  // ─── materials ───────────────────────────────────────────────────────────────
  function updateMaterial(i: number, field: keyof JobMaterial, val: string | number) {
    setMaterials(prev => {
      const n = [...prev]
      n[i] = { ...n[i], [field]: typeof val === 'string' ? val : Number(val) }
      return n
    })
  }
  function addMaterial() { setMaterials(prev => [...prev, emptyMaterial()]) }
  function removeMaterial(i: number) { setMaterials(prev => prev.filter((_, idx) => idx !== i)) }

  // ─── employees ───────────────────────────────────────────────────────────────
  function toggleEmployee(emp: Employee) {
    setJobEmployees(prev => {
      const exists = prev.find(je => je.employee_id === emp.id)
      if (exists) return prev.filter(je => je.employee_id !== emp.id)
      return [...prev, {
        employee_id: emp.id!,
        days_worked: 1,
        daily_rate: emp.default_daily_rate,
        retention_percent: emp.retention_percent ?? 10,
        total_gross: emp.default_daily_rate,
        total_net: emp.default_daily_rate * 0.9,
      }]
    })
  }
  function updateJobEmp(empId: number, field: 'days_worked' | 'daily_rate', val: number) {
    setJobEmployees(prev => prev.map(je => {
      if (je.employee_id !== empId) return je
      const days = field === 'days_worked' ? val : je.days_worked
      const rate = field === 'daily_rate' ? val : je.daily_rate
      const gross = days * rate
      const net = gross * (1 - je.retention_percent / 100)
      return { ...je, [field]: val, total_gross: gross, total_net: net }
    }))
  }

  // ─── totals ──────────────────────────────────────────────────────────────────
  const validServices = services.filter(s => s.description.trim() && s.total > 0)
  const validMaterials = materials.filter(m => m.item.trim())
  const subtotalServices = validServices.reduce((s, i) => s + i.total, 0)
  const subtotalMaterials = validMaterials.reduce((s, m) => s + m.quantity * (m.unit_price || m.unit_cost), 0)
  const subtotalLabor = jobEmployees.reduce((s, je) => s + je.total_gross, 0)
  const grandTotal = subtotalServices + subtotalMaterials + subtotalLabor

  async function handleSave() {
    if (!clientId) { alert('Selecciona un cliente'); return }
    setSaving(true)
    const dateStartTs = dateStarted ? new Date(dateStarted + 'T12:00:00').getTime() : Date.now()
    const dateComplTs = dateCompleted ? new Date(dateCompleted + 'T12:00:00').getTime() : undefined
    await onSave({
      client_id: clientId,
      client_name: clientName,
      description: description || undefined,
      date: dateStartTs,
      date_started: dateStartTs,
      date_completed: dateComplTs,
      type,
      status,
      services: validServices,
      materials: validMaterials,
      employees: jobEmployees,
      subtotal_services: subtotalServices,
      subtotal_materials: subtotalMaterials,
      subtotal_labor: subtotalLabor,
      total_charged: grandTotal,
      payment_status: job?.payment_status || 'pending',
      payments: job?.payments || [],
      balance_due: grandTotal - (job?.payments || []).reduce((s, p) => s + p.amount, 0),
      vehicle_used: vehicle as any || undefined,
      notes: notes || undefined,
      location_id: locationId,
      invoice_id: job?.invoice_id,
    })
    setSaving(false)
  }

  const inputCls = 'w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500'
  const labelCls = 'text-xs text-gray-400 block mb-1'

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full pb-8">
      {/* Client */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Cliente</h3>
        <div className="relative">
          <label className={labelCls}>Cliente *</label>
          <div className="flex gap-2">
            <input value={clientName} readOnly placeholder="Selecciona un cliente..."
              className={`${inputCls} flex-1 cursor-pointer bg-[#0b1220]`}
              onClick={() => setShowClientPicker(true)} />
            <button onClick={() => setShowClientPicker(true)}
              className="px-3 py-2 bg-cyan-700/50 hover:bg-cyan-700 rounded-lg text-sm text-cyan-300">
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
            <select value={locationId ?? ''} onChange={e => setLocationId(e.target.value ? Number(e.target.value) : undefined)}
              className={inputCls}>
              <option value="">Sin localidad específica</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} — {l.city || ''}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Basic info */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-200">Información General</h3>
        <div>
          <label className={labelCls}>Descripción del trabajo</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className={inputCls} placeholder="Instalación mini split, reparación compresor..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tipo</label>
            <select value={type} onChange={e => setType(e.target.value as any)} className={inputCls}>
              {JOB_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as any)} className={inputCls}>
              <option value="quote">Cotización</option>
              <option value="in_progress">En Progreso</option>
              <option value="completed">Completado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Fecha inicio</label>
            <input type="date" value={dateStarted} onChange={e => setDateStarted(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fecha completado</label>
            <input type="date" value={dateCompleted} onChange={e => setDateCompleted(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Vehículo</label>
          <select value={vehicle} onChange={e => setVehicle(e.target.value)} className={inputCls}>
            <option value="">Sin asignar</option>
            {VEHICLES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* Services */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-200">Servicios</h3>
          <span className="text-xs text-cyan-400">{fmt(subtotalServices)}</span>
        </div>
        {services.map((s, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center">
            <input value={s.description} onChange={e => updateService(i, 'description', e.target.value)}
              className="col-span-5 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
              placeholder="Descripción" />
            <input type="number" value={s.quantity} onChange={e => updateService(i, 'quantity', e.target.value)}
              className="col-span-2 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white text-center"
              min="1" step="0.5" placeholder="Qty" />
            <input type="number" value={s.unit_price} onChange={e => updateService(i, 'unit_price', e.target.value)}
              className="col-span-3 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white text-right"
              min="0" step="5" placeholder="Precio" />
            <span className="col-span-1 text-xs text-gray-400 text-right">{fmt(s.total)}</span>
            <button onClick={() => removeService(i)} className="col-span-1 text-red-400/60 hover:text-red-400 text-center text-sm">×</button>
          </div>
        ))}
        <button onClick={addService} className="text-xs text-cyan-400 hover:text-cyan-300">+ Agregar servicio</button>
      </div>

      {/* Materials */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-200">Materiales</h3>
          <span className="text-xs text-cyan-400">{fmt(subtotalMaterials)}</span>
        </div>
        {materials.map((m, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center">
            <input value={m.item} onChange={e => updateMaterial(i, 'item', e.target.value)}
              className="col-span-5 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-500"
              placeholder="Material / pieza" />
            <input type="number" value={m.quantity} onChange={e => updateMaterial(i, 'quantity', e.target.value)}
              className="col-span-2 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white text-center"
              min="1" step="1" placeholder="Qty" />
            <input type="number" value={m.unit_price || m.unit_cost} onChange={e => updateMaterial(i, 'unit_price', e.target.value)}
              className="col-span-3 bg-[#0b1220] border border-white/10 rounded px-2 py-1.5 text-xs text-white text-right"
              min="0" step="5" placeholder="Precio" />
            <span className="col-span-1 text-xs text-gray-400 text-right">{fmt(m.quantity * (m.unit_price || m.unit_cost))}</span>
            <button onClick={() => removeMaterial(i)} className="col-span-1 text-red-400/60 hover:text-red-400 text-center text-sm">×</button>
          </div>
        ))}
        <button onClick={addMaterial} className="text-xs text-cyan-400 hover:text-cyan-300">+ Agregar material</button>
      </div>

      {/* Employees */}
      <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-200">Empleados</h3>
          {subtotalLabor > 0 && <span className="text-xs text-cyan-400">Labor: {fmt(subtotalLabor)}</span>}
        </div>
        {employees.map(emp => {
          const je = jobEmployees.find(j => j.employee_id === emp.id)
          const selected = !!je
          return (
            <div key={emp.id} className={`rounded-xl border transition-colors ${selected ? 'border-cyan-500/40 bg-cyan-900/10' : 'border-white/10 bg-[#0b1220]'}`}>
              <div className="flex items-center gap-3 p-3">
                <input type="checkbox" checked={selected} onChange={() => toggleEmployee(emp)}
                  className="w-4 h-4 accent-cyan-500" />
                <div className="flex-1">
                  <p className="text-sm text-white">{emp.first_name} {emp.last_name}</p>
                  <p className="text-xs text-gray-500">{emp.specialties || ''} · ${emp.default_daily_rate}/día</p>
                </div>
                {selected && je && (
                  <div className="flex gap-2 items-center text-xs">
                    <div className="text-right">
                      <p className="text-gray-500">Días</p>
                      <input type="number" value={je.days_worked} onChange={e => updateJobEmp(emp.id!, 'days_worked', Number(e.target.value))}
                        className="w-12 bg-[#111a2e] border border-white/20 rounded px-1 py-0.5 text-center text-white"
                        min="0.5" step="0.5" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500">Tarifa</p>
                      <input type="number" value={je.daily_rate} onChange={e => updateJobEmp(emp.id!, 'daily_rate', Number(e.target.value))}
                        className="w-16 bg-[#111a2e] border border-white/20 rounded px-1 py-0.5 text-right text-white"
                        min="0" step="10" />
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500">Bruto</p>
                      <p className="text-green-400 font-medium">{fmt(je.total_gross)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {employees.length === 0 && (
          <p className="text-xs text-gray-500">No hay empleados activos. Agrega empleados en la sección 👷 Empleados.</p>
        )}
      </div>

      {/* Grand total */}
      <div className="bg-[#111a2e] border border-cyan-500/20 rounded-xl p-4">
        <div className="space-y-1 text-sm">
          {subtotalServices > 0 && <div className="flex justify-between text-gray-300"><span>Servicios</span><span>{fmt(subtotalServices)}</span></div>}
          {subtotalMaterials > 0 && <div className="flex justify-between text-gray-300"><span>Materiales</span><span>{fmt(subtotalMaterials)}</span></div>}
          {subtotalLabor > 0 && <div className="flex justify-between text-gray-300"><span>Labor (empleados)</span><span>{fmt(subtotalLabor)}</span></div>}
          <div className="flex justify-between font-bold text-base text-white border-t border-white/10 pt-2 mt-1">
            <span>Total</span><span className="text-cyan-400">{fmt(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>Notas internas</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          className={`${inputCls} resize-none`} rows={3} placeholder="Notas del trabajo..." />
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-3 pb-4">
        <button onClick={onCancel} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-3 bg-cyan-700 hover:bg-cyan-600 rounded-xl text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Guardando...' : (job?.id ? 'Guardar Cambios' : 'Crear Trabajo')}
        </button>
      </div>
    </div>
  )
}
