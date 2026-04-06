'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { Equipment, MaintenanceLog } from '@/lib/db'
import type { ClientLocation } from '@/lib/types'
import { generateMaintenancePDF } from '@/lib/pdfGenerator'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Props { onNavigate: (page: string) => void }

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Mensual' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Semestral' },
  { value: 12, label: 'Anual' },
]

const MAINTENANCE_TYPES = [
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'deep_cleaning', label: 'Limpieza Profunda' },
  { value: 'repair', label: 'Reparación' },
  { value: 'inspection', label: 'Inspección' },
  { value: 'other', label: 'Otro' },
]

const EQUIPMENT_TYPES = [
  'Package Unit', 'Mini Split', 'Walking Cooler Evaporator',
  'Central AC', 'Condensing Unit', 'Air Handler', 'Heat Pump',
  'Chiller', 'Fan Coil', 'Otro',
]

function calcNextDue(lastServiceDate: number, intervalMonths: number): number {
  const d = new Date(lastServiceDate)
  d.setMonth(d.getMonth() + intervalMonths)
  return d.getTime()
}

function equipmentStatus(eq: Equipment): 'green' | 'yellow' | 'red' | 'gray' {
  const now = Date.now()
  if (!eq.next_service_due) return 'gray'
  if (eq.next_service_due < now) return 'red'
  if (eq.next_service_due - now <= 30 * 86400000) return 'yellow'
  return 'green'
}

const statusColors = {
  green:  { dot: 'bg-green-400',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-400',  label: 'Al día' },
  yellow: { dot: 'bg-yellow-400', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-400', label: 'Próximo' },
  red:    { dot: 'bg-red-400',    text: 'text-red-400',    badge: 'bg-red-900/40 text-red-400',       label: 'Vencido' },
  gray:   { dot: 'bg-gray-500',   text: 'text-gray-400',   badge: 'bg-gray-800 text-gray-400',        label: 'Sin programa' },
}

const intervalLabel = (m: number) =>
  m === 1 ? 'Mensual' : m === 3 ? 'Trimestral' : m === 6 ? 'Semestral' : 'Anual'

const fmtDate = (ts?: number) => ts
  ? new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—'

const maintenanceTypeLabel = (t: string) =>
  MAINTENANCE_TYPES.find(x => x.value === t)?.label || t

export default function MaintenancePage({ onNavigate }: Props) {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [logs, setLogs] = useState<MaintenanceLog[]>([])
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Equipment | null>(null)
  const [view, setView] = useState<'list' | 'detail'>('list')

  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'red' | 'yellow' | 'green' | 'gray'>('')

  // Add equipment modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Equipment>>({ maintenance_interval_months: 6, status: 'active' })

  // Edit equipment modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Equipment>>({})

  // Register service modal
  const [showService, setShowService] = useState(false)
  const [serviceForm, setServiceForm] = useState({
    maintenance_type: 'cleaning',
    date: new Date().toISOString().split('T')[0],
    technician: 'Sergio',
    notes: '',
  })

  const [msg, setMsg] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null)

  const showMsg = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [eq, ml, locs] = await Promise.all([
        db.equipment.toArray(),
        db.maintenance_logs.toArray(),
        db.client_locations.toArray(),
      ])
      setEquipment(eq)
      setLogs(ml)
      setLocations(locs)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Keep selected in sync after reload
  useEffect(() => {
    if (selected?.id) {
      const updated = equipment.find(e => e.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [equipment])

  const clients = [...new Set(equipment.map(e => e.client_name).filter(Boolean))].sort()

  const filtered = equipment.filter(eq => {
    if (filterClient && eq.client_name !== filterClient) return false
    if (filterStatus && equipmentStatus(eq) !== filterStatus) return false
    return true
  })

  // Group by client
  const byClient: Record<string, Equipment[]> = {}
  filtered.forEach(eq => {
    const key = eq.client_name || 'Sin cliente'
    if (!byClient[key]) byClient[key] = []
    byClient[key].push(eq)
  })

  const saveEquipment = async () => {
    if (!addForm.client_name || !addForm.equipment_type) {
      showMsg('⚠️ Cliente y tipo de equipo son requeridos'); return
    }
    const now = Date.now()
    const interval = addForm.maintenance_interval_months || 6
    const nextDue = addForm.last_service_date
      ? calcNextDue(addForm.last_service_date, interval)
      : undefined
    await db.equipment.add({
      client_name: addForm.client_name,
      client_id: addForm.client_id,
      location_id: addForm.location_id,
      location: addForm.location || '',
      equipment_type: addForm.equipment_type,
      brand: addForm.brand || '',
      model: addForm.model || '',
      serial_number: addForm.serial_number || '',
      status: addForm.status || 'active',
      maintenance_interval_months: interval,
      last_service_date: addForm.last_service_date,
      next_service_due: nextDue,
      notes: addForm.notes || '',
      created_at: now,
      updated_at: now,
    })
    showMsg('✅ Equipo guardado')
    setShowAdd(false)
    setAddForm({ maintenance_interval_months: 6, status: 'active' })
    await load()
  }

  const saveEdit = async () => {
    if (!selected?.id) return
    const interval = editForm.maintenance_interval_months || selected.maintenance_interval_months || 6
    const lastSvc = editForm.last_service_date ?? selected.last_service_date
    const nextDue = lastSvc ? calcNextDue(lastSvc, interval) : undefined
    await db.equipment.update(selected.id, {
      ...editForm,
      maintenance_interval_months: interval,
      next_service_due: nextDue,
      updated_at: Date.now(),
    })
    showMsg('✅ Equipo actualizado')
    setShowEdit(false)
    await load()
  }

  const saveService = async () => {
    if (!selected?.id) return
    const dateTs = new Date(serviceForm.date + 'T12:00:00').getTime()
    const interval = selected.maintenance_interval_months || 6
    const nextDue = calcNextDue(dateTs, interval)

    await db.maintenance_logs.add({
      equipment_id: selected.id,
      client_name: selected.client_name,
      client_id: selected.client_id,
      maintenance_type: serviceForm.maintenance_type as MaintenanceLog['maintenance_type'],
      date: dateTs,
      notes: serviceForm.notes,
      technician: serviceForm.technician,
      photos: [],
      created_at: Date.now(),
    })
    await db.equipment.update(selected.id, {
      last_service_date: dateTs,
      next_service_due: nextDue,
      updated_at: Date.now(),
    })
    showMsg('✅ Servicio registrado')
    setShowService(false)
    setServiceForm({ maintenance_type: 'cleaning', date: new Date().toISOString().split('T')[0], technician: 'Sergio', notes: '' })
    await load()
  }

  const deleteEquipment = async (eq: Equipment) => {
    if (!eq.id) return
    await db.maintenance_logs.where('equipment_id').equals(eq.id).delete()
    await db.equipment.delete(eq.id)
    setDeleteTarget(null)
    setView('list')
    setSelected(null)
    await load()
  }

  const deleteLog = async (log: MaintenanceLog) => {
    if (!log.id) return
    await db.maintenance_logs.delete(log.id)
    // Recalculate last_service_date on the equipment
    if (selected?.id) {
      const remaining = await db.maintenance_logs.where('equipment_id').equals(selected.id).toArray()
      const sorted = remaining.sort((a, b) => b.date - a.date)
      const lastSvc = sorted[0]?.date
      const interval = selected.maintenance_interval_months || 6
      const nextDue = lastSvc ? calcNextDue(lastSvc, interval) : undefined
      await db.equipment.update(selected.id, { last_service_date: lastSvc, next_service_due: nextDue, updated_at: Date.now() })
    }
    await load()
  }

  const eqLogs = (eq: Equipment) =>
    logs.filter(l => l.equipment_id === eq.id).sort((a, b) => b.date - a.date)

  const st = (eq: Equipment) => statusColors[equipmentStatus(eq)]

  // Stats
  const now = Date.now()
  const overdue  = equipment.filter(e => e.next_service_due && e.next_service_due < now).length
  const dueSoon  = equipment.filter(e => e.next_service_due && e.next_service_due >= now && e.next_service_due - now <= 30 * 86400000).length
  const upToDate = equipment.filter(e => e.next_service_due && e.next_service_due - now > 30 * 86400000).length

  return (
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-teal-700 to-cyan-700 text-white p-4 shadow-lg flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          {view === 'detail' && (
            <button onClick={() => { setView('list'); setSelected(null) }} className="text-white/70 hover:text-white">←</button>
          )}
          <div>
            <h1 className="text-lg font-bold">🔧 Mantenimiento Preventivo</h1>
            {view === 'list' && (
              <p className="text-xs opacity-70">{equipment.length} equipos · {overdue > 0 ? `${overdue} vencidos` : dueSoon > 0 ? `${dueSoon} próximos` : 'todo al día'}</p>
            )}
            {view === 'detail' && selected && (
              <p className="text-xs opacity-70">{selected.equipment_type} — {selected.client_name}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {view === 'list' && (
            <>
              <button onClick={() => generateMaintenancePDF(equipment, logs, filterClient || undefined)}
                className="bg-white/20 rounded-lg px-3 py-1.5 text-xs font-medium">📄 PDF</button>
              <button onClick={() => setShowAdd(true)}
                className="bg-white/20 rounded-lg px-3 py-1.5 text-xs font-medium">+ Equipo</button>
            </>
          )}
          {view === 'detail' && selected && (
            <>
              <button onClick={() => { setEditForm({ ...selected }); setShowEdit(true) }}
                className="bg-white/20 rounded-lg px-3 py-1.5 text-xs font-medium">✏️ Editar</button>
              <button onClick={() => setShowService(true)}
                className="bg-cyan-500/40 rounded-lg px-3 py-1.5 text-xs font-medium">+ Servicio</button>
            </>
          )}
          <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-xs">💬</button>
        </div>
      </div>

      {msg && (
        <div className="mx-4 mt-2 p-3 bg-green-900/40 border border-green-700/30 rounded-lg text-green-400 text-sm text-center">{msg}</div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
        </div>
      ) : view === 'list' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Vencidos', count: overdue, color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/30', status: 'red' as const },
              { label: 'Próximos', count: dueSoon, color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800/30', status: 'yellow' as const },
              { label: 'Al día', count: upToDate, color: 'text-green-400', bg: 'bg-green-900/20 border-green-800/30', status: 'green' as const },
            ].map(s => (
              <button key={s.status} onClick={() => setFilterStatus(filterStatus === s.status ? '' : s.status)}
                className={`rounded-xl p-3 border text-center ${s.bg} ${filterStatus === s.status ? 'ring-2 ring-white/30' : ''}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filterClient || filterStatus) && (
              <button onClick={() => { setFilterClient(''); setFilterStatus('') }}
                className="px-3 py-2 bg-[#111a2e] border border-white/10 rounded-lg text-sm text-gray-400">✕</button>
            )}
          </div>

          {/* Equipment list grouped by client */}
          {Object.keys(byClient).length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-4xl mb-3">🔧</p>
              <p className="text-lg font-medium mb-1">No hay equipos registrados</p>
              <p className="text-sm mb-4">Agrega equipos manualmente o dile al chat: "tienda 32 tiene 6 paquetes"</p>
              <button onClick={() => setShowAdd(true)} className="bg-cyan-600 text-white px-6 py-2 rounded-lg text-sm">+ Agregar Equipo</button>
            </div>
          ) : (
            Object.entries(byClient).sort().map(([clientName, eqList]) => (
              <div key={clientName} className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-200">{clientName}</p>
                    <p className="text-xs text-gray-500">{eqList.length} equipo{eqList.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => generateMaintenancePDF(equipment, logs, clientName)}
                    className="text-xs text-cyan-400 hover:text-cyan-300">📄</button>
                </div>
                <div className="divide-y divide-white/5">
                  {eqList.sort((a, b) => (a.next_service_due || 9e15) - (b.next_service_due || 9e15)).map(eq => {
                    const s = st(eq)
                    const eqLog = eqLogs(eq)
                    return (
                      <div key={eq.id} className="flex items-center hover:bg-white/5 transition-colors">
                        <button onClick={() => { setSelected(eq); setView('detail') }}
                          className="flex-1 px-4 py-3 flex items-center gap-3 text-left">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${s.dot}`}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-200">{eq.equipment_type}</span>
                              {eq.brand && <span className="text-xs text-gray-500">{eq.brand} {eq.model}</span>}
                            </div>
                            {eq.location && <p className="text-xs text-gray-500 truncate">📍 {eq.location}</p>}
                            {eq.serial_number && <p className="text-xs text-gray-600">S/N: {eq.serial_number}</p>}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                            {eq.next_service_due && (
                              <p className={`text-xs mt-1 ${s.text}`}>
                                {eq.next_service_due < now
                                  ? `${Math.floor((now - eq.next_service_due) / 86400000)}d venció`
                                  : `${Math.floor((eq.next_service_due - now) / 86400000)}d`}
                              </p>
                            )}
                            {eqLog.length > 0 && (
                              <p className="text-xs text-gray-600 mt-0.5">Último: {fmtDate(eqLog[0].date).slice(0, 6)}</p>
                            )}
                          </div>
                          <span className="text-gray-600 flex-shrink-0">›</span>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(eq) }}
                          className="px-3 py-3 text-red-400/50 hover:text-red-400 flex-shrink-0"
                        >🗑️</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : selected ? (
        // ── DETAIL VIEW ──────────────────────────────────────────────────────────
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Equipment info card */}
          <div className={`rounded-xl border p-4 ${
            equipmentStatus(selected) === 'red' ? 'bg-red-900/10 border-red-800/30' :
            equipmentStatus(selected) === 'yellow' ? 'bg-yellow-900/10 border-yellow-800/30' :
            'bg-[#111a2e] border-white/10'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${st(selected).dot}`}></div>
                  <h2 className="text-lg font-bold text-gray-100">{selected.equipment_type}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st(selected).badge}`}>{st(selected).label}</span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{selected.client_name}</p>
              </div>
              <button onClick={() => setDeleteTarget(selected)}
                className="text-red-400/60 hover:text-red-400 text-xs px-2 py-1 rounded border border-red-900/30">🗑️ Eliminar</button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Marca', selected.brand || '—'],
                ['Modelo', selected.model || '—'],
                ['Serial', selected.serial_number || '—'],
                ['Localidad', selected.location || '—'],
                ['Frecuencia', selected.maintenance_interval_months ? intervalLabel(selected.maintenance_interval_months) : '—'],
                ['Último servicio', fmtDate(selected.last_service_date)],
                ['Próximo servicio', fmtDate(selected.next_service_due)],
                ['Status', selected.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-gray-200 ${label === 'Próximo servicio' && selected.next_service_due && selected.next_service_due < now ? 'text-red-400 font-semibold' : ''}`}>{value}</p>
                </div>
              ))}
            </div>
            {selected.notes && <p className="mt-3 text-sm text-gray-400 italic">📝 {selected.notes}</p>}
          </div>

          {/* Service history */}
          <div className="bg-[#111a2e] rounded-xl border border-white/5 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
              <p className="font-semibold text-gray-300">Historial de Servicios</p>
              <span className="text-xs text-gray-500">{eqLogs(selected).length} registros</span>
            </div>
            {eqLogs(selected).length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">Sin servicios registrados</div>
            ) : (
              <div className="divide-y divide-white/5">
                {eqLogs(selected).map(log => (
                  <div key={log.id} className="px-4 py-3 flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-cyan-400">{maintenanceTypeLabel(log.maintenance_type)}</span>
                        <span className="text-xs text-gray-500">{fmtDate(log.date)}</span>
                      </div>
                      {log.technician && <p className="text-xs text-gray-500 mt-0.5">👤 {log.technician}</p>}
                      {log.notes && <p className="text-xs text-gray-400 mt-0.5">{log.notes}</p>}
                    </div>
                    <button onClick={() => deleteLog(log)} className="text-red-400/50 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => setShowService(true)}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-3 text-sm font-semibold">
            + Registrar Servicio
          </button>
        </div>
      ) : null}

      {/* ── ADD EQUIPMENT MODAL ─────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-[#111a2e] rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-100">+ Nuevo Equipo</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Cliente *</label>
                <input value={addForm.client_name || ''} onChange={e => setAddForm(f => ({ ...f, client_name: e.target.value }))}
                  list="client-list" className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Farmacia Caridad #32" />
                <datalist id="client-list">{clients.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo de Equipo *</label>
                <select value={addForm.equipment_type || ''} onChange={e => setAddForm(f => ({ ...f, equipment_type: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  <option value="">Seleccionar...</option>
                  {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Marca</label>
                  <input value={addForm.brand || ''} onChange={e => setAddForm(f => ({ ...f, brand: e.target.value }))}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Carrier" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Modelo</label>
                  <input value={addForm.model || ''} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="50XC048" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Número de Serie</label>
                <input value={addForm.serial_number || ''} onChange={e => setAddForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="2819E40123" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Localidad / Tienda</label>
                <input value={addForm.location || ''} onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Tienda #32" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Frecuencia de Mantenimiento</label>
                <select value={addForm.maintenance_interval_months || 6} onChange={e => setAddForm(f => ({ ...f, maintenance_interval_months: Number(e.target.value) }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Último Servicio (opcional)</label>
                <input type="date" value={addForm.last_service_date ? new Date(addForm.last_service_date).toISOString().split('T')[0] : ''}
                  onChange={e => setAddForm(f => ({ ...f, last_service_date: e.target.value ? new Date(e.target.value + 'T12:00:00').getTime() : undefined }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas</label>
                <input value={addForm.notes || ''} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Notas opcionales" />
              </div>
              <button onClick={saveEquipment} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-3 text-sm font-semibold mt-2">
                Guardar Equipo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT EQUIPMENT MODAL ────────────────────────────────────────────── */}
      {showEdit && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-[#111a2e] rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-100">✏️ Editar Equipo</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3">
              {[
                { field: 'client_name', label: 'Cliente', placeholder: '' },
                { field: 'location', label: 'Localidad', placeholder: '' },
                { field: 'brand', label: 'Marca', placeholder: '' },
                { field: 'model', label: 'Modelo', placeholder: '' },
                { field: 'serial_number', label: 'Serial', placeholder: '' },
              ].map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                  <input value={(editForm as any)[field] ?? (selected as any)[field] ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder={placeholder} />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo de Equipo</label>
                <select value={editForm.equipment_type ?? selected.equipment_type}
                  onChange={e => setEditForm(f => ({ ...f, equipment_type: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  {EQUIPMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Frecuencia</label>
                <select value={editForm.maintenance_interval_months ?? selected.maintenance_interval_months ?? 6}
                  onChange={e => setEditForm(f => ({ ...f, maintenance_interval_months: Number(e.target.value) }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Status</label>
                <select value={editForm.status ?? selected.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Equipment['status'] }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="replaced">Reemplazado</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas</label>
                <input value={editForm.notes ?? selected.notes ?? ''}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={saveEdit} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-3 text-sm font-semibold mt-2">
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTER SERVICE MODAL ──────────────────────────────────────────── */}
      {showService && selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full bg-[#111a2e] rounded-t-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-100">+ Registrar Servicio</h2>
                <p className="text-xs text-gray-400">{selected.equipment_type} — {selected.client_name}</p>
              </div>
              <button onClick={() => setShowService(false)} className="text-gray-400 text-2xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo de Trabajo</label>
                <select value={serviceForm.maintenance_type}
                  onChange={e => setServiceForm(f => ({ ...f, maintenance_type: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
                  {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Fecha</label>
                <input type="date" value={serviceForm.date}
                  onChange={e => setServiceForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Técnico</label>
                <input value={serviceForm.technician}
                  onChange={e => setServiceForm(f => ({ ...f, technician: e.target.value }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="Sergio" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Notas</label>
                <textarea value={serviceForm.notes}
                  onChange={e => setServiceForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="Trabajo realizado, observaciones..." />
              </div>
              <div className="bg-cyan-900/20 border border-cyan-800/30 rounded-lg p-3 text-xs text-cyan-300">
                Próximo servicio se calculará automáticamente:
                <span className="font-semibold ml-1">
                  {fmtDate(calcNextDue(
                    new Date(serviceForm.date + 'T12:00:00').getTime(),
                    selected.maintenance_interval_months || 6
                  ))}
                </span>
              </div>
              <button onClick={saveService} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl py-3 text-sm font-semibold">
                Guardar Servicio
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        show={!!deleteTarget}
        title="¿Eliminar equipo?"
        message={deleteTarget ? `¿Eliminar ${deleteTarget.equipment_type}${deleteTarget.brand ? ' ' + deleteTarget.brand : ''}? También se eliminarán todos sus logs de servicio.` : ''}
        confirmText="Sí, eliminar"
        onConfirm={() => deleteTarget && deleteEquipment(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
