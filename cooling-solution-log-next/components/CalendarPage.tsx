'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { Appointment, RecurringContract, Job } from '@/lib/types'
import type { BitacoraEntry } from '@/lib/types'
import type { Invoice } from '@/lib/types'

interface CalendarPageProps {
  onNavigate: (page: string) => void
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

interface CalendarData {
  appointments: Appointment[]
  jobs: Job[]
  bitacora: Record<string, BitacoraEntry>
  contracts: RecurringContract[]
  overdueInvoices: Invoice[]
}

// Simple new-appointment form state
interface NewApptForm {
  title: string; date: string; time: string
  client_name: string; location: string; notes: string
}

function emptyForm(date: Date): NewApptForm {
  return { title: '', date: toISO(date), time: '09:00', client_name: '', location: '', notes: '' }
}

export default function CalendarPage({ onNavigate }: CalendarPageProps) {
  const [current, setCurrent] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [data, setData] = useState<CalendarData>({ appointments: [], jobs: [], bitacora: {}, contracts: [], overdueInvoices: [] })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewAppt, setShowNewAppt] = useState(false)
  const [apptForm, setApptForm] = useState<NewApptForm>(emptyForm(new Date()))
  const [saving, setSaving] = useState(false)
  const [reminders, setReminders] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const now = Date.now()
    const year = current.getFullYear()
    const month = current.getMonth()
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`

    // Fetch relevant data in parallel
    const [allAppts, allJobs, allBitacora, allContracts, allInvoices, allReminders] = await Promise.all([
      db.appointments.toArray(),
      db.jobs.toArray(),
      db.table('bitacora').toArray(),
      db.contracts.where('status').equals('active').toArray(),
      db.invoices.toArray(),
      db.reminders.toArray(),
    ])

    // Filter appointments to this month + recent
    const monthStart = new Date(year, month, 1).getTime()
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime()
    const appts = allAppts.filter(a => a.date >= monthStart && a.date <= monthEnd)
    const jobs = allJobs.filter(j => {
      const ts = j.date_started || j.date
      return ts >= monthStart && ts <= monthEnd
    })
    const bitacoraMap: Record<string, BitacoraEntry> = {}
    allBitacora.filter((e: any) => e.date.startsWith(monthStr)).forEach((e: any) => { bitacoraMap[e.date] = e })

    // Contracts with next_service_due in this month
    const contracts = allContracts.filter(c => c.next_service_due >= monthStart && c.next_service_due <= monthEnd)

    // Overdue invoices (not paid)
    const overdueInvoices = allInvoices.filter(i =>
      i.type === 'invoice' && i.status !== 'paid' && i.status !== 'cancelled' && i.due_date && i.due_date < now
    )

    // Pending reminders
    const pendingRems = allReminders.filter(r => !r.completed && r.due_date >= monthStart && r.due_date <= monthEnd)

    setData({ appointments: appts, jobs, bitacora: bitacoraMap, contracts, overdueInvoices })
    setReminders(pendingRems)
    setLoading(false)
  }, [current])

  useEffect(() => { load() }, [load])

  // ── Calendar grid logic ───────────────────────────────────────────────────
  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // 42 cells: start from Sunday before month starts
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(year, month, 1 - firstDow + i))
  }

  // ── Event lookup helpers ──────────────────────────────────────────────────
  function eventsForDay(d: Date) {
    const iso = toISO(d)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayEnd = dayStart + 86400000 - 1
    return {
      appointments: data.appointments.filter(a => a.date >= dayStart && a.date <= dayEnd),
      jobs: data.jobs.filter(j => { const ts = j.date_started || j.date; return ts >= dayStart && ts <= dayEnd }),
      bitacora: data.bitacora[iso] || null,
      contracts: data.contracts.filter(c => {
        const cd = new Date(c.next_service_due)
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth() && cd.getDate() === d.getDate()
      }),
      reminders: reminders.filter(r => { const rd = new Date(r.due_date); return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth() && rd.getDate() === d.getDate() }),
    }
  }

  // ── Save appointment ──────────────────────────────────────────────────────
  async function saveAppt() {
    if (!apptForm.title.trim()) return
    setSaving(true)
    const [h, m] = apptForm.time.split(':').map(Number)
    const dateTs = new Date(`${apptForm.date}T${apptForm.time}:00`).getTime()
    await db.appointments.add({
      title: apptForm.title,
      date: dateTs,
      client_name: apptForm.client_name || undefined,
      location: apptForm.location || undefined,
      notes: apptForm.notes || undefined,
      status: 'scheduled',
      reminder_minutes: 60,
      created_at: Date.now(),
    } as any)
    setSaving(false)
    setShowNewAppt(false)
    await load()
  }

  async function completeAppt(a: Appointment) {
    if (!a.id) return
    await db.appointments.update(a.id, { status: 'completed' })
    await load()
  }
  async function cancelAppt(a: Appointment) {
    if (!a.id) return
    await db.appointments.update(a.id, { status: 'cancelled' })
    await load()
  }

  const today = new Date()
  const todayISO = toISO(today)

  const isCurrentMonth = (d: Date) => d.getMonth() === month && d.getFullYear() === year
  const selectedISO = selectedDate ? toISO(selectedDate) : null
  const selectedEvents = selectedDate ? eventsForDay(selectedDate) : null

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
  const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-PR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 shadow-lg flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-lg font-bold">📅 Calendario</h1>
        </div>
        <button onClick={() => { setApptForm(emptyForm(selectedDate || new Date())); setShowNewAppt(true) }}
          className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">+ Cita</button>
      </div>

      {/* Month navigation */}
      <div className="shrink-0 bg-[#111a2e] border-b border-white/10 px-4 py-2 flex items-center justify-between">
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))} className="text-gray-400 hover:text-white px-3 py-1 text-lg">‹</button>
        <span className="text-sm font-semibold text-white">{MONTH_NAMES[month]} {year}</span>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))} className="text-gray-400 hover:text-white px-3 py-1 text-lg">›</button>
      </div>

      {/* Overdue invoices banner */}
      {data.overdueInvoices.length > 0 && (
        <div className="shrink-0 bg-red-900/30 border-b border-red-700/30 px-4 py-1.5 text-xs text-red-400 flex items-center gap-2">
          <span>🔴</span>
          <span>{data.overdueInvoices.length} factura{data.overdueInvoices.length > 1 ? 's' : ''} vencida{data.overdueInvoices.length > 1 ? 's' : ''} — {data.overdueInvoices.map(i => i.client_name).slice(0, 3).join(', ')}{data.overdueInvoices.length > 3 ? `... +${data.overdueInvoices.length - 3}` : ''}</span>
          <button onClick={() => onNavigate('invoices')} className="ml-auto underline">Ver</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Day-of-week labels */}
        <div className="shrink-0 grid grid-cols-7 border-b border-white/10 bg-[#111a2e]">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-[10px] text-gray-500 py-1.5 font-medium">{d}</div>
          ))}
        </div>

        {/* Calendar grid — scrollable on very small screens */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Cargando...</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(6, minmax(60px, 1fr))` }}>
              {cells.map((d, i) => {
                const iso = toISO(d)
                const inMonth = isCurrentMonth(d)
                const isToday = iso === todayISO
                const isSelected = iso === selectedISO
                const ev = eventsForDay(d)
                const hasAppts = ev.appointments.length > 0
                const hasJobs = ev.jobs.length > 0
                const hasBit = ev.bitacora !== null
                const hasContracts = ev.contracts.length > 0
                const hasRems = ev.reminders.length > 0
                const hasAny = hasAppts || hasJobs || hasBit || hasContracts || hasRems

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(d)}
                    className={`border-b border-r border-white/5 p-1 cursor-pointer transition-colors min-h-[60px] ${
                      !inMonth ? 'opacity-30' : ''
                    } ${isSelected ? 'bg-blue-900/40 border-blue-500/50' : 'hover:bg-white/5'}`}
                  >
                    {/* Day number */}
                    <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 ${
                      isToday ? 'bg-blue-500 text-white' : isSelected ? 'text-blue-400' : 'text-gray-300'
                    }`}>
                      {d.getDate()}
                    </div>
                    {/* Event dots */}
                    {hasAny && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {hasAppts && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Citas" />}
                        {hasJobs && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="Trabajos" />}
                        {hasBit && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" title="Bitácora" />}
                        {hasContracts && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Contratos" />}
                        {hasRems && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" title="Recordatorios" />}
                      </div>
                    )}
                    {/* First appointment title preview on desktop */}
                    {hasAppts && (
                      <div className="hidden sm:block text-[9px] text-blue-300 truncate leading-tight mt-0.5">
                        {ev.appointments[0].title}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="p-3 flex flex-wrap gap-3 text-[10px] text-gray-500 border-t border-white/5">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Citas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Trabajos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Bitácora</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Contratos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Recordatorios</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Day detail panel (bottom sheet) ──────────────────────────────── */}
      {selectedDate && selectedEvents && (
        <div className="shrink-0 bg-[#111a2e] border-t border-white/10 max-h-[45vh] overflow-y-auto">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#111a2e] z-10">
            <div>
              <p className="text-sm font-semibold text-white capitalize">{fmtDate(selectedISO!)}</p>
              <p className="text-[10px] text-gray-500">
                {[
                  selectedEvents.appointments.length && `${selectedEvents.appointments.length} cita(s)`,
                  selectedEvents.jobs.length && `${selectedEvents.jobs.length} trabajo(s)`,
                  selectedEvents.bitacora && 'bitácora',
                  selectedEvents.contracts.length && `${selectedEvents.contracts.length} contrato(s)`,
                ].filter(Boolean).join(' · ') || 'Sin eventos'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setApptForm(emptyForm(selectedDate)); setShowNewAppt(true) }}
                className="text-xs px-2 py-1 bg-blue-600/60 hover:bg-blue-600 rounded-lg text-white"
              >+ Cita</button>
              {!selectedEvents.bitacora && (
                <button onClick={() => onNavigate('bitacora')}
                  className="text-xs px-2 py-1 bg-purple-600/60 hover:bg-purple-600 rounded-lg text-white">
                  + Bitácora
                </button>
              )}
              <button onClick={() => setSelectedDate(null)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Appointments */}
            {selectedEvents.appointments.length > 0 && (
              <div>
                <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-1.5">📅 Citas</p>
                <div className="space-y-1.5">
                  {selectedEvents.appointments.map((a, i) => (
                    <div key={i} className={`bg-blue-900/20 border border-blue-500/20 rounded-xl px-3 py-2 flex items-start justify-between ${a.status !== 'scheduled' ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-200">{a.title}</p>
                        <div className="text-xs text-gray-400 flex flex-wrap gap-2 mt-0.5">
                          <span>🕐 {fmt(a.date)}</span>
                          {a.client_name && <span>👤 {a.client_name}</span>}
                          {a.location && <span>📍 {a.location}</span>}
                        </div>
                      </div>
                      {a.status === 'scheduled' && (
                        <div className="flex gap-1 ml-2 shrink-0">
                          <button onClick={() => completeAppt(a)} className="text-xs bg-green-900/40 text-green-400 px-2 py-1 rounded-lg">✅</button>
                          <button onClick={() => cancelAppt(a)} className="text-xs bg-red-900/40 text-red-400 px-2 py-1 rounded-lg">✕</button>
                        </div>
                      )}
                      {a.status !== 'scheduled' && (
                        <span className={`text-xs ml-2 px-1.5 py-0.5 rounded shrink-0 ${a.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
                          {a.status === 'completed' ? '✅' : '✕'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Jobs */}
            {selectedEvents.jobs.length > 0 && (
              <div>
                <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wide mb-1.5">🔧 Trabajos</p>
                <div className="space-y-1.5">
                  {selectedEvents.jobs.map((j, i) => (
                    <div key={i} className="bg-green-900/20 border border-green-500/20 rounded-xl px-3 py-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-200">{j.client_name || `Cliente #${j.client_id}`}</span>
                        <span className="text-sm font-bold text-green-400">${j.total_charged.toFixed(0)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{j.description || j.type} · {j.status}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bitácora */}
            {selectedEvents.bitacora && (
              <div>
                <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wide mb-1.5">📒 Bitácora</p>
                <button
                  onClick={() => onNavigate('bitacora')}
                  className="w-full text-left bg-purple-900/20 border border-purple-500/20 rounded-xl px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 line-clamp-2">{selectedEvents.bitacora.summary}</p>
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-500">
                        <span>👷 {selectedEvents.bitacora.jobs_count} trabajo(s)</span>
                        {selectedEvents.bitacora.hours_estimated > 0 && <span>⏱ ~{selectedEvents.bitacora.hours_estimated}h</span>}
                        {selectedEvents.bitacora.invoice_pending && <span className="text-yellow-400">⚠️ Sin factura</span>}
                      </div>
                    </div>
                    <span className="text-gray-500 ml-2">›</span>
                  </div>
                </button>
              </div>
            )}

            {/* Contracts due */}
            {selectedEvents.contracts.length > 0 && (
              <div>
                <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wide mb-1.5">📋 Contratos</p>
                <div className="space-y-1.5">
                  {selectedEvents.contracts.map((c, i) => (
                    <div key={i} className="bg-orange-900/20 border border-orange-500/20 rounded-xl px-3 py-2">
                      <p className="text-sm font-medium text-gray-200">{c.client_name || `Cliente #${c.client_id}`}</p>
                      <p className="text-xs text-gray-400">{c.service_type} · {c.frequency} · ${c.monthly_fee}/visita</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reminders */}
            {selectedEvents.reminders.length > 0 && (
              <div>
                <p className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wide mb-1.5">🔔 Recordatorios</p>
                <div className="space-y-1">
                  {selectedEvents.reminders.map((r: any, i: number) => (
                    <div key={i} className="bg-yellow-900/20 border border-yellow-500/20 rounded-xl px-3 py-2 text-sm text-gray-300">
                      {r.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!selectedEvents.appointments.length && !selectedEvents.jobs.length && !selectedEvents.bitacora && !selectedEvents.contracts.length && !selectedEvents.reminders.length && (
              <p className="text-center text-sm text-gray-600 py-4">Sin eventos este día</p>
            )}
          </div>
        </div>
      )}

      {/* ── New Appointment Modal ─────────────────────────────────────────── */}
      {showNewAppt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end">
          <div className="bg-[#111a2e] border-t border-white/10 rounded-t-2xl p-5 w-full max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">📅 Nueva Cita</h3>
              <button onClick={() => setShowNewAppt(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <input
                type="text" placeholder="Título de la cita *" value={apptForm.title}
                onChange={e => setApptForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Fecha</label>
                  <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Hora</label>
                  <input type="time" value={apptForm.time} onChange={e => setApptForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <input
                type="text" placeholder="Cliente (opcional)" value={apptForm.client_name}
                onChange={e => setApptForm(f => ({ ...f, client_name: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500"
              />
              <input
                type="text" placeholder="Ubicación (opcional)" value={apptForm.location}
                onChange={e => setApptForm(f => ({ ...f, location: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500"
              />
              <textarea
                placeholder="Notas (opcional)" value={apptForm.notes} rows={2}
                onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-[#0b1220] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 resize-none"
              />
              <button
                onClick={saveAppt} disabled={saving || !apptForm.title.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Guardando...' : '✅ Guardar Cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
