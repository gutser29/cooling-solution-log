'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { EmployeePayment } from '@/lib/db'
import type { Employee, EventRecord } from '@/lib/types'
import { generateEmployeeReport, generateEmployeesAllReport } from '@/lib/pdfGenerator'

interface Props { onNavigate: (page: string) => void }

const PAYMENT_METHODS = ['cash', 'check', 'ath_movil', 'transfer', 'capital_one', 'chase_visa']
const PM_LABEL: Record<string, string> = {
  cash: 'Efectivo', check: 'Cheque', ath_movil: 'ATH Móvil',
  transfer: 'Transferencia', capital_one: 'Capital One', chase_visa: 'Chase'
}

const fmt = (n: number) =>
  `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: '2-digit', day: '2-digit' })

// ─── year helper ──────────────────────────────────────────────────────────────
function yearRange(y: number) {
  return {
    start: new Date(y, 0, 1).getTime(),
    end: new Date(y, 11, 31, 23, 59, 59).getTime(),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EmployeesPage({ onNavigate }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payments, setPayments] = useState<EmployeePayment[]>([])
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  // modals
  const [showAddEmp, setShowAddEmp] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [showRegPay, setShowRegPay] = useState(false)
  const [importingEmp, setImportingEmp] = useState<Employee | null>(null)
  const [importCandidates, setImportCandidates] = useState<EventRecord[]>([])
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [emps, pmts] = await Promise.all([
      db.employees.toArray(),
      db.employee_payments.toArray(),
    ])
    setEmployees(emps.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)))
    setPayments(pmts)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── year payments ───────────────────────────────────────────────────────────
  const { start: yStart, end: yEnd } = yearRange(selectedYear)
  const yearPayments = payments.filter(p => p.date >= yStart && p.date <= yEnd)

  function empPayments(empId: number) {
    return yearPayments.filter(p => p.employee_id === empId)
  }

  function empStats(empId: number) {
    const pmts = empPayments(empId)
    return {
      count: pmts.length,
      days: pmts.reduce((s, p) => s + p.days_worked, 0),
      gross: pmts.reduce((s, p) => s + p.amount_gross, 0),
      retention: pmts.reduce((s, p) => s + p.retention_amount, 0),
      net: pmts.reduce((s, p) => s + p.amount_net, 0),
    }
  }

  // ─── Add / Edit employee ─────────────────────────────────────────────────────
  async function saveEmployee(data: Omit<Employee, 'id' | 'created_at'>, id?: number) {
    const now = Date.now()
    if (id) {
      await db.employees.update(id, { ...data })
    } else {
      await db.employees.add({ ...data, created_at: now })
    }
    await load()
    setShowAddEmp(false)
    setEditEmp(null)
  }

  // ─── Register payment ────────────────────────────────────────────────────────
  async function savePayment(emp: Employee, form: {
    date: string; description: string; days: number; rate: number; method: string; job_id: string; notes: string
  }) {
    const dateTs = new Date(form.date + 'T12:00:00').getTime()
    const gross = form.days * form.rate
    const retPct = emp.retention_percent ?? 10
    const retention = parseFloat((gross * retPct / 100).toFixed(2))
    const net = parseFloat((gross - retention).toFixed(2))
    await db.employee_payments.add({
      employee_id: emp.id!,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      date: dateTs,
      description: form.description,
      days_worked: form.days,
      daily_rate: form.rate,
      amount_gross: gross,
      retention_percent: retPct,
      retention_amount: retention,
      amount_net: net,
      payment_method: form.method,
      job_id: form.job_id ? parseInt(form.job_id) : undefined,
      notes: form.notes || undefined,
      created_at: Date.now(),
    })
    await load()
    setShowRegPay(false)
  }

  // ─── Import from events ──────────────────────────────────────────────────────
  async function openImport(emp: Employee) {
    setImportingEmp(emp)
    setImportSelected(new Set())
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase()
    const events = await db.events.toArray()
    const alreadyImported = new Set(payments.filter(p => p.event_id != null).map(p => p.event_id!))
    const candidates = events.filter(e => {
      if (alreadyImported.has(e.id!)) return false
      const isPayroll = e.category === 'Nómina' || e.category === 'Labor' || e.category === 'nomina' || e.category === 'labor'
      const matchesName = (e.note || '').toLowerCase().includes(fullName) ||
        (e.vendor || '').toLowerCase().includes(fullName)
      const matchesId = e.employee_id === emp.id
      return isPayroll && (matchesName || matchesId)
    })
    setImportCandidates(candidates)
  }

  async function confirmImport() {
    if (!importingEmp) return
    const emp = importingEmp
    const retPct = emp.retention_percent ?? 10
    const now = Date.now()
    for (const evId of importSelected) {
      const ev = importCandidates.find(e => e.id === evId)
      if (!ev) continue
      const gross = ev.amount
      const retention = parseFloat((gross * retPct / 100).toFixed(2))
      const net = parseFloat((gross - retention).toFixed(2))
      await db.employee_payments.add({
        employee_id: emp.id!,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        date: ev.timestamp,
        description: ev.note || ev.category || 'Pago importado',
        days_worked: 1,
        daily_rate: gross,
        amount_gross: gross,
        retention_percent: retPct,
        retention_amount: retention,
        amount_net: net,
        payment_method: ev.payment_method,
        event_id: ev.id,
        notes: `Importado de evento #${ev.id}`,
        created_at: now,
      })
    }
    await load()
    setImportingEmp(null)
  }

  async function deletePayment(id: number) {
    if (!confirm('¿Borrar este pago?')) return
    await db.employee_payments.delete(id)
    await load()
  }

  // ─── PDF ─────────────────────────────────────────────────────────────────────
  function pdfEmployee(emp: Employee) {
    const pmts = empPayments(emp.id!)
    generateEmployeeReport(emp, pmts, String(selectedYear))
  }

  function pdfAll() {
    const paymentsMap: Record<number, EmployeePayment[]> = {}
    employees.forEach(e => { paymentsMap[e.id!] = empPayments(e.id!) })
    generateEmployeesAllReport(employees, paymentsMap, String(selectedYear))
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0b1220] text-gray-400">
      Cargando empleados...
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-indigo-700 to-purple-700 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => selectedEmp ? setSelectedEmp(null) : onNavigate('chat')}
            className="text-white/80 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-lg font-bold">👷 Empleados</h1>
            <p className="text-xs text-white/60">Contratistas Independientes — 480.6B Puerto Rico</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
            className="text-xs bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white">
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {!selectedEmp && (
            <>
              <button onClick={pdfAll}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 border border-white/20">
                📄 PDF Todos
              </button>
              <button onClick={() => setShowAddEmp(true)}
                className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg font-medium text-white">
                + Empleado
              </button>
            </>
          )}
          {selectedEmp && (
            <>
              <button onClick={() => setEditEmp(selectedEmp)}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 border border-white/20">
                ✏️ Editar
              </button>
              <button onClick={() => pdfEmployee(selectedEmp)}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 border border-white/20">
                📄 480.6B PDF
              </button>
              <button onClick={() => setShowRegPay(true)}
                className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 rounded-lg font-medium text-white">
                + Registrar Pago
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ─── LIST VIEW ────────────────────────────────────────────────────── */}
        {!selectedEmp && (
          <>
            {/* Year summary */}
            {(() => {
              const totGross = employees.reduce((s, e) => s + empStats(e.id!).gross, 0)
              const totRetention = employees.reduce((s, e) => s + empStats(e.id!).retention, 0)
              const totNet = employees.reduce((s, e) => s + empStats(e.id!).net, 0)
              return (
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Total Bruto {selectedYear}</p>
                    <p className="text-lg font-bold text-white">{fmt(totGross)}</p>
                  </div>
                  <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Retención 480.6B</p>
                    <p className="text-lg font-bold text-red-400">{fmt(totRetention)}</p>
                  </div>
                  <div className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">Total Neto Pagado</p>
                    <p className="text-lg font-bold text-green-400">{fmt(totNet)}</p>
                  </div>
                </div>
              )
            })()}

            {employees.length === 0 ? (
              <div className="bg-[#111a2e] border border-white/10 rounded-xl p-8 text-center text-gray-400">
                <p className="text-4xl mb-3">👷</p>
                <p className="text-lg font-medium mb-1">No hay empleados registrados</p>
                <p className="text-sm">Agrega contratistas para rastrear pagos y retención 480.6B</p>
                <button onClick={() => setShowAddEmp(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white">
                  + Agregar Primer Empleado
                </button>
              </div>
            ) : (
              employees.map(emp => {
                const stats = empStats(emp.id!)
                return (
                  <div key={emp.id} onClick={() => setSelectedEmp(emp)}
                    className="bg-[#111a2e] border border-white/10 rounded-xl p-4 cursor-pointer hover:border-indigo-500/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-white">
                            {emp.first_name} {emp.last_name}
                          </span>
                          <span className="text-xs bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full">
                            480.6B
                          </span>
                          {!emp.active && (
                            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Inactivo</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {emp.specialties || 'Sin especialidad'} · {fmt(emp.default_daily_rate)}/día · Ret. {emp.retention_percent ?? 10}%
                        </p>
                        {emp.phone && <p className="text-xs text-gray-500 mt-0.5">{emp.phone}</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-bold text-green-400">{fmt(stats.net)}</p>
                        <p className="text-xs text-gray-500">neto {selectedYear}</p>
                        {stats.retention > 0 && (
                          <p className="text-xs text-red-400/80">-{fmt(stats.retention)} ret.</p>
                        )}
                      </div>
                    </div>
                    {stats.count > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/5 flex gap-4 text-xs text-gray-400">
                        <span>{stats.count} {stats.count === 1 ? 'pago' : 'pagos'}</span>
                        <span>{stats.days} {stats.days === 1 ? 'día' : 'días'}</span>
                        <span>Bruto: {fmt(stats.gross)}</span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ─── DETAIL VIEW ──────────────────────────────────────────────────── */}
        {selectedEmp && (() => {
          const emp = selectedEmp
          const pmts = empPayments(emp.id!).sort((a, b) => b.date - a.date)
          const stats = empStats(emp.id!)
          return (
            <>
              {/* Info card */}
              <div className="bg-[#111a2e] border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">{emp.first_name} {emp.last_name}</h2>
                    <p className="text-xs text-indigo-300 mt-0.5">Contratista Independiente · 480.6B Puerto Rico</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${emp.active ? 'bg-green-900/40 text-green-400 border border-green-500/30' : 'bg-gray-700 text-gray-400'}`}>
                    {emp.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {emp.phone && <div><span className="text-gray-400 text-xs">Teléfono</span><p className="text-white">{emp.phone}</p></div>}
                  {emp.email && <div><span className="text-gray-400 text-xs">Email</span><p className="text-white text-xs">{emp.email}</p></div>}
                  <div><span className="text-gray-400 text-xs">Especialidad</span><p className="text-white">{emp.specialties || '—'}</p></div>
                  <div><span className="text-gray-400 text-xs">Tarifa por Día</span><p className="text-white font-medium">{fmt(emp.default_daily_rate)}</p></div>
                  <div><span className="text-gray-400 text-xs">Retención</span><p className="text-red-400 font-medium">{emp.retention_percent ?? 10}%</p></div>
                </div>
                {/* Import button */}
                <button onClick={() => openImport(emp)}
                  className="mt-3 text-xs px-3 py-1.5 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-500/30 rounded-lg text-blue-300">
                  📥 Importar pagos de historial
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Pagos', val: String(stats.count), color: 'text-white' },
                  { label: 'Días Trab.', val: String(stats.days), color: 'text-cyan-400' },
                  { label: `Ret. ${emp.retention_percent ?? 10}%`, val: fmt(stats.retention), color: 'text-red-400' },
                  { label: 'Neto Pagado', val: fmt(stats.net), color: 'text-green-400' },
                ].map(item => (
                  <div key={item.label} className="bg-[#111a2e] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400">{item.label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${item.color}`}>{item.val}</p>
                  </div>
                ))}
              </div>

              {/* Payments history */}
              <div className="bg-[#111a2e] border border-white/10 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <h3 className="text-sm font-semibold text-gray-200">Historial de Pagos — {selectedYear}</h3>
                </div>
                {pmts.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    No hay pagos registrados para {selectedYear}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {pmts.map(pmt => (
                      <div key={pmt.id} className="px-4 py-3 flex items-start justify-between group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white">{pmt.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmtDate(pmt.date)} · {pmt.days_worked} {pmt.days_worked === 1 ? 'día' : 'días'} × {fmt(pmt.daily_rate)} · {PM_LABEL[pmt.payment_method || ''] || pmt.payment_method || 'Cash'}
                          </p>
                          {pmt.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{pmt.notes}</p>}
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-medium text-white">{fmt(pmt.amount_gross)}</p>
                          <p className="text-xs text-red-400/80">-{fmt(pmt.retention_amount)} ret.</p>
                          <p className="text-xs font-semibold text-green-400">{fmt(pmt.amount_net)} neto</p>
                        </div>
                        <button onClick={() => deletePayment(pmt.id!)}
                          className="ml-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

      {/* ─── MODAL: Add/Edit Employee ────────────────────────────────────────── */}
      {(showAddEmp || editEmp) && (
        <EmployeeModal
          employee={editEmp}
          onSave={(data) => saveEmployee(data, editEmp?.id)}
          onClose={() => { setShowAddEmp(false); setEditEmp(null) }}
        />
      )}

      {/* ─── MODAL: Register Payment ─────────────────────────────────────────── */}
      {showRegPay && selectedEmp && (
        <PaymentModal
          employee={selectedEmp}
          onSave={(form) => savePayment(selectedEmp, form)}
          onClose={() => setShowRegPay(false)}
        />
      )}

      {/* ─── MODAL: Import from Events ───────────────────────────────────────── */}
      {importingEmp && (
        <ImportModal
          employee={importingEmp}
          candidates={importCandidates}
          selected={importSelected}
          onToggle={(id) => setImportSelected(prev => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
          })}
          onConfirm={confirmImport}
          onClose={() => setImportingEmp(null)}
        />
      )}
    </div>
  )
}

// ─── Employee Add/Edit Modal ──────────────────────────────────────────────────
function EmployeeModal({
  employee, onSave, onClose
}: {
  employee: Employee | null
  onSave: (data: Omit<Employee, 'id' | 'created_at'>) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    first_name: employee?.first_name || '',
    last_name: employee?.last_name || '',
    phone: employee?.phone || '',
    email: employee?.email || '',
    default_daily_rate: employee?.default_daily_rate || 150,
    retention_percent: employee?.retention_percent ?? 10,
    specialties: employee?.specialties || '',
    contractor_type: employee?.contractor_type || '480.6B',
    active: employee?.active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.first_name.trim()) return alert('Nombre requerido')
    setSaving(true)
    await onSave({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      default_daily_rate: Number(form.default_daily_rate),
      retention_percent: Number(form.retention_percent),
      specialties: form.specialties || undefined,
      contractor_type: form.contractor_type || '480.6B',
      active: form.active,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#111a2e] border border-white/20 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-base font-bold text-white">{employee ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Nombre *</label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Luis" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Apellido</label>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Rivera" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Teléfono</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="787-555-0000" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Email</label>
            <input value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="luis@email.com" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Especialidad</label>
            <input value={form.specialties} onChange={e => set('specialties', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Instalación, Soldadura, Electricidad..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Tarifa por Día ($)</label>
              <input type="number" value={form.default_daily_rate} onChange={e => set('default_daily_rate', e.target.value)}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                min="0" step="10" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Retención %</label>
              <input type="number" value={form.retention_percent} onChange={e => set('retention_percent', e.target.value)}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                min="0" max="30" step="0.5" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-600 peer-checked:bg-indigo-600 rounded-full peer-checked:after:translate-x-full after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
            <span className="text-sm text-gray-300">Activo</span>
          </div>
          <p className="text-xs text-indigo-300/70 bg-indigo-900/20 border border-indigo-500/20 rounded-lg p-2">
            Tipo: Contratista Independiente — Formulario 480.6B Puerto Rico. La retención (10% por defecto) se remite a Hacienda.
          </p>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Register Payment Modal ───────────────────────────────────────────────────
function PaymentModal({
  employee, onSave, onClose
}: {
  employee: Employee
  onSave: (form: { date: string; description: string; days: number; rate: number; method: string; job_id: string; notes: string }) => Promise<void>
  onClose: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    date: today,
    description: '',
    days: 1,
    rate: employee.default_daily_rate,
    method: 'cash',
    job_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const retPct = employee.retention_percent ?? 10
  const gross = form.days * form.rate
  const retention = gross * retPct / 100
  const net = gross - retention

  async function handleSave() {
    if (!form.description.trim()) return alert('Descripción requerida')
    if (!form.days || form.days <= 0) return alert('Días inválidos')
    if (!form.rate || form.rate <= 0) return alert('Tarifa inválida')
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#111a2e] border border-white/20 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-white">Registrar Pago</h2>
            <p className="text-xs text-gray-400">{employee.first_name} {employee.last_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Fecha</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Descripción / Trabajo *</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Farmacia Caridad #40 – instalación split" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Días Trabajados</label>
              <input type="number" value={form.days} onChange={e => set('days', Number(e.target.value))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                min="0.5" step="0.5" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Tarifa por Día ($)</label>
              <input type="number" value={form.rate} onChange={e => set('rate', Number(e.target.value))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
                min="0" step="10" />
            </div>
          </div>
          {/* Auto-calc summary */}
          <div className="bg-[#0b1220] border border-indigo-500/20 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Bruto ({form.days} × ${form.rate})</span>
              <span className="font-medium text-white">{fmt(gross)}</span>
            </div>
            <div className="flex justify-between text-red-400/90">
              <span>Retención {retPct}% (480.6B)</span>
              <span>-{fmt(retention)}</span>
            </div>
            <div className="flex justify-between font-bold text-green-400 border-t border-white/10 pt-1 mt-1">
              <span>Neto a pagar</span>
              <span>{fmt(net)}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Método de Pago</label>
            <select value={form.method} onChange={e => set('method', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white">
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>{PM_LABEL[m] || m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Vinculado a Job ID (opcional)</label>
            <input value={form.job_id} onChange={e => set('job_id', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="ID del trabajo" type="number" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Notas</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full bg-[#0b1220] border border-white/20 rounded-lg px-3 py-2 text-sm text-white resize-none"
              rows={2} placeholder="Notas adicionales..." />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Guardando...' : `Registrar ${fmt(net)} neto`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import from Events Modal ─────────────────────────────────────────────────
function ImportModal({
  employee, candidates, selected, onToggle, onConfirm, onClose
}: {
  employee: Employee
  candidates: EventRecord[]
  selected: Set<number>
  onToggle: (id: number) => void
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-[#111a2e] border border-white/20 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Importar Pagos</h2>
            <p className="text-xs text-gray-400">{employee.first_name} {employee.last_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">No se encontraron gastos de Nómina/Labor</p>
              <p className="text-xs mt-1">asociados a este empleado en el historial</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">
                Se encontraron {candidates.length} gastos de Nómina/Labor. Selecciona los que corresponden a {employee.first_name}:
              </p>
              {candidates.map(ev => (
                <div key={ev.id} onClick={() => onToggle(ev.id!)}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selected.has(ev.id!) ? 'bg-indigo-900/30 border-indigo-500/40' : 'bg-[#0b1220] border-white/10 hover:border-white/20'}`}>
                  <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 ${selected.has(ev.id!) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500'}`}>
                    {selected.has(ev.id!) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{ev.note || ev.category || 'Pago'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(ev.timestamp).toLocaleDateString('es-PR')} · {ev.vendor || ''} · {PM_LABEL[ev.payment_method || ''] || ev.payment_method || ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-green-400 shrink-0">${ev.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {candidates.length > 0 && (
          <div className="px-5 pb-5 pt-3 border-t border-white/10 shrink-0 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-gray-300">
              Cancelar
            </button>
            <button onClick={handleConfirm} disabled={saving || selected.size === 0}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Importando...' : `Importar ${selected.size} pago${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
