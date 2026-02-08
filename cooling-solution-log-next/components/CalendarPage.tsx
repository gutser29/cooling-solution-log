'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import ConfirmDialog from './ConfirmDialog'
import type { Appointment, Reminder, RecurringContract, Client } from '@/lib/types'

interface CalendarPageProps {
  onNavigate: (page: string) => void
}

type Tab = 'agenda' | 'reminders'

export default function CalendarPage({ onNavigate }: CalendarPageProps) {
  const [tab, setTab] = useState<Tab>('agenda')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [contractAlerts, setContractAlerts] = useState<{ contract: RecurringContract; clientName: string; daysUntil: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState<{ show: boolean; title: string; message: string; action: () => void }>({ show: false, title: '', message: '', action: () => {} })

  const load = useCallback(async () => {
    const now = Date.now()
    const threeDays = 3 * 24 * 60 * 60 * 1000

    const allAppts = await db.appointments.orderBy('date').toArray()
    const upcoming = allAppts.filter(a => a.status === 'scheduled' && a.date >= now - 86400000)
    const pastWeek = allAppts.filter(a => a.status !== 'scheduled' && a.date >= now - 7 * 86400000)
    setAppointments([...upcoming, ...pastWeek].sort((a, b) => a.date - b.date))

    const allReminders = await db.reminders.orderBy('due_date').toArray()
    const active = allReminders.filter(r => !r.completed).sort((a, b) => a.due_date - b.due_date)
    const completed = allReminders.filter(r => r.completed).sort((a, b) => b.due_date - a.due_date).slice(0, 10)
    setReminders([...active, ...completed])

    const contracts = await db.contracts.where('status').equals('active').toArray()
    const clients = await db.clients.toArray()
    const clientMap = new Map(clients.map(c => [c.id, `${c.first_name} ${c.last_name}`]))
    const alerts = contracts
      .filter(c => c.next_service_due - now <= threeDays && c.next_service_due >= now - 86400000)
      .map(c => ({
        contract: c,
        clientName: clientMap.get(c.client_id) || `Cliente #${c.client_id}`,
        daysUntil: Math.ceil((c.next_service_due - now) / 86400000)
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil)
    setContractAlerts(alerts)

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleReminder = async (r: Reminder) => {
    if (!r.id) return
    await db.reminders.update(r.id, { completed: !r.completed })
    load()
  }

  const deleteReminder = async (r: Reminder) => {
    if (!r.id) return
    await db.reminders.delete(r.id)
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
    load()
  }

  const cancelAppointment = async (a: Appointment) => {
    if (!a.id) return
    await db.appointments.update(a.id, { status: 'cancelled' })
    setConfirmAction({ show: false, title: '', message: '', action: () => {} })
    load()
  }

  const completeAppointment = async (a: Appointment) => {
    if (!a.id) return
    await db.appointments.update(a.id, { status: 'completed' })
    load()
  }

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { weekday: 'short', month: 'short', day: 'numeric' })
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })

  const isToday = (ts: number) => new Date(ts).toDateString() === new Date().toDateString()
  const isTomorrow = (ts: number) => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return new Date(ts).toDateString() === d.toDateString()
  }
  const isPast = (ts: number) => ts < Date.now()

  const getDayLabel = (ts: number) => {
    if (isToday(ts)) return 'Hoy'
    if (isTomorrow(ts)) return 'Mañana'
    return fmtDate(ts)
  }

  const groupedAppts: { label: string; items: Appointment[] }[] = []
  appointments.forEach(a => {
    const label = getDayLabel(a.date)
    const existing = groupedAppts.find(g => g.label === label)
    if (existing) existing.items.push(a)
    else groupedAppts.push({ label, items: [a] })
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📅 Calendario</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬 Chat</button>
      </div>

      <div className="flex border-b border-white/10">
        {([
          { key: 'agenda' as Tab, label: '📅 Citas', count: appointments.filter(a => a.status === 'scheduled').length },
          { key: 'reminders' as Tab, label: '🔔 Recordatorios', count: reminders.filter(r => !r.completed).length }
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${tab === t.key ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {contractAlerts.length > 0 && (
          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-700/30">
            <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Contratos por Vencer</p>
            {contractAlerts.map((a, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-yellow-700/20 last:border-0">
                <div>
                  <p className="text-gray-200">{a.clientName}</p>
                  <p className="text-xs text-gray-400">{a.contract.service_type}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  a.daysUntil <= 0 ? 'bg-red-900/50 text-red-400' :
                  a.daysUntil <= 1 ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-blue-900/50 text-blue-400'
                }`}>
                  {a.daysUntil <= 0 ? '¡Vencido!' : a.daysUntil === 1 ? 'Mañana' : `${a.daysUntil} días`}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'agenda' && (
          <>
            {groupedAppts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">📅</p>
                <p className="text-gray-500">Sin citas programadas</p>
                <p className="text-gray-600 text-sm mt-1">Dile al chat &quot;agenda cita con...&quot;</p>
              </div>
            ) : (
              groupedAppts.map((group, gi) => (
                <div key={gi}>
                  <p className={`text-xs font-semibold mb-2 ${
                    group.label === 'Hoy' ? 'text-blue-400' :
                    group.label === 'Mañana' ? 'text-purple-400' : 'text-gray-500'
                  }`}>
                    {group.label.toUpperCase()}
                  </p>
                  <div className="space-y-2">
                    {group.items.map((a, i) => (
                      <div key={i} className={`bg-[#111a2e] rounded-xl p-4 border ${
                        a.status === 'cancelled' ? 'border-red-800/30 opacity-50' :
                        a.status === 'completed' ? 'border-green-800/30' :
                        'border-white/5'
                      }`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-gray-200">{a.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span>🕐 {fmtTime(a.date)}</span>
                              {a.client_name && <span>👤 {a.client_name}</span>}
                              {a.location && <span>📍 {a.location}</span>}
                            </div>
                            {a.notes && <p className="text-xs text-gray-500 mt-2">{a.notes}</p>}
                          </div>
                          {a.status === 'scheduled' && (
                            <div className="flex gap-1 ml-2">
                              <button onClick={() => completeAppointment(a)} className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded-lg">✅</button>
                              <button onClick={() => setConfirmAction({ show: true, title: 'Cancelar Cita', message: `¿Cancelar "${a.title}"?`, action: () => cancelAppointment(a) })} className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded-lg">✕</button>
                            </div>
                          )}
                          {a.status !== 'scheduled' && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              a.status === 'completed' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                            }`}>
                              {a.status === 'completed' ? '✅' : '✕'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'reminders' && (
          <>
            {reminders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🔔</p>
                <p className="text-gray-500">Sin recordatorios</p>
                <p className="text-gray-600 text-sm mt-1">Dile al chat &quot;recuérdame que...&quot;</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reminders.map((r, i) => (
                  <div key={i} className={`bg-[#111a2e] rounded-xl p-4 border ${r.completed ? 'border-white/5 opacity-50' : isPast(r.due_date) ? 'border-red-800/30' : 'border-white/5'}`}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => toggleReminder(r)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                          r.completed ? 'bg-green-600 border-green-600 text-white' : 'border-gray-500 hover:border-blue-400'
                        }`}
                      >
                        {r.completed && <span className="text-xs">✓</span>}
                      </button>
                      <div className="flex-1">
                        <p className={`text-sm ${r.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{r.text}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs ${isPast(r.due_date) && !r.completed ? 'text-red-400' : 'text-gray-500'}`}>
                            {isPast(r.due_date) && !r.completed ? '⚠️ ' : ''}{getDayLabel(r.due_date)} {fmtTime(r.due_date)}
                          </span>
                          {r.priority === 'high' && !r.completed && (
                            <span className="text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">Urgente</span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => setConfirmAction({ show: true, title: 'Eliminar Recordatorio', message: `¿Eliminar "${r.text}"?`, action: () => deleteReminder(r) })} className="text-gray-600 hover:text-red-400 text-sm">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        show={confirmAction.show}
        title={confirmAction.title}
        message={confirmAction.message}
        confirmText="Confirmar"
        confirmColor="red"
        onConfirm={confirmAction.action}
        onCancel={() => setConfirmAction({ show: false, title: '', message: '', action: () => {} })}
      />
    </div>
  )
}