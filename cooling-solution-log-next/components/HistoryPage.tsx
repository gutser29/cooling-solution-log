import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type { EventRecord, EventType, EventStatus } from '@/lib/types'

export default function HistoryPage() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [filterType, setFilterType] = useState<EventType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<EventStatus | 'all'>('all')

  // ✅ NUEVO: stats de DB
  const [dbStats, setDbStats] = useState<any>(null)

  const loadEvents = async () => {
    const query = db.events.orderBy('timestamp').reverse()
    const allEvents = await query.toArray()

    // Filtros
    let filtered = allEvents
    if (filterType !== 'all') filtered = filtered.filter((e) => e.type === filterType)
    if (filterStatus !== 'all') filtered = filtered.filter((e) => e.status === filterStatus)

    setEvents(filtered)
  }

  // ✅ NUEVO: cargar conteos de tablas
  const loadDbStats = async () => {
    const stats = {
      events: await db.events.count(),
      clients: await db.clients.count(),
      employees: await db.employees.count(),
      jobs: await db.jobs.count(),
      vehicles: await db.vehicles.count(),
      contracts: await db.contracts.count(),
    }
    setDbStats(stats)
  }

  useEffect(() => {
    loadEvents()
    loadDbStats() // ✅ NUEVO
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus])

  const toggleStatus = async (id: number, current: EventStatus) => {
    await db.events.update(id, {
      status: current === 'pending' ? 'completed' : 'pending',
    })
    loadEvents()
    loadDbStats() // ✅ NUEVO (para reflejar cambios si aplica)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Historial</h1>

      {/* ✅ NUEVO: debug box */}
      {dbStats && (
        <div className="bg-blue-50 p-3 rounded mb-4 text-xs">
          <strong>📊 DB Status:</strong> Events: {dbStats.events} | Clients: {dbStats.clients} |
          Employees: {dbStats.employees} | Jobs: {dbStats.jobs} | Vehicles: {dbStats.vehicles} |
          Contracts: {dbStats.contracts}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        <select
          className="border rounded px-2 py-1"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
        >
          <option value="all">Todos los tipos</option>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="note">Nota</option>
        </select>

        <select
          className="border rounded px-2 py-1"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
        >
          <option value="all">Todos</option>
          <option value="pending">Pendiente</option>
          <option value="completed">Completado</option>
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {events.map((e: any) => (
          <div key={e.id} className="border rounded p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {e.category ?? 'Sin categoría'} • {e.type} • {e.status}
              </div>
              <div className="text-xs opacity-70">
                {e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}
              </div>
              <div className="text-sm">
                {typeof e.amount !== 'undefined' ? `Monto: $${e.amount}` : ''}
              </div>
              {e.vendor && <div className="text-sm">Vendor: {e.vendor}</div>}
              {e.payment_method && <div className="text-sm">Pago: {e.payment_method}</div>}
              {e.client && <div className="text-sm">Cliente: {e.client}</div>}
              {e.note && <div className="text-sm">Nota: {e.note}</div>}
            </div>

            <button
              className="border rounded px-2 py-1 text-xs whitespace-nowrap"
              onClick={() => toggleStatus(e.id, e.status)}
            >
              Cambiar estado
            </button>
          </div>
        ))}

        {events.length === 0 && <div className="text-sm opacity-70">No hay eventos.</div>}
      </div>
    </div>
  )
}
