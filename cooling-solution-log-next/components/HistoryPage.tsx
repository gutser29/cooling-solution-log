import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import type { EventRecord, EventType, EventStatus } from '@/lib/types'


export default function HistoryPage() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [filterType, setFilterType] = useState<EventType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<EventStatus | 'all'>('all')

  const loadEvents = async () => {
    let query = db.events.orderBy('timestamp').reverse()
    const allEvents = await query.toArray()

    // Filtros
    let filtered = allEvents
    if (filterType !== 'all') {
      filtered = filtered.filter((e) => e.type === filterType)
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter((e) => e.status === filterStatus)
    }

    setEvents(filtered)
  }

  useEffect(() => {
    loadEvents()
  }, [filterType, filterStatus])

  const toggleStatus = async (id: number, current: EventStatus) => {
    await db.events.update(id, {
      status: current === 'pending' ? 'completed' : 'pending',
    })
    loadEvents()
  }

  const deleteEvent = async (id: number) => {
    if (confirm('¿Borrar este evento?')) {
      await db.events.delete(id)
      loadEvents()
    }
  }

  const exportData = async () => {
    const all = await db.events.toArray()
    const json = JSON.stringify(all, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cooling-backup-${Date.now()}.json`
    a.click()
  }

  const importData = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const text = await file.text()
      const data = JSON.parse(text)

      if (confirm(`¿Importar ${data.length} eventos? (se agregarán a los existentes)`)) {
        await db.events.bulkAdd(data)
        loadEvents()
        alert('✅ Importado')
      }
    }
    input.click()
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Historial</h1>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex gap-2 mb-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="flex-1 border rounded p-2"
          >
            <option value="all">Todos los tipos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="flex-1 border rounded p-2"
          >
            <option value="all">Todos los status</option>
            <option value="completed">Completados</option>
            <option value="pending">Pendientes</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex-1 bg-green-500 text-white py-2 rounded text-sm"
          >
            📥 Export
          </button>
          <button
            onClick={importData}
            className="flex-1 bg-purple-500 text-white py-2 rounded text-sm"
          >
            📤 Import
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="text-sm text-gray-600 mb-2">
        Mostrando {events.length} eventos
      </div>

      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="bg-white p-4 rounded-lg shadow text-center text-gray-500">
            No hay eventos
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`bg-white p-3 rounded-lg shadow ${
                event.status === 'pending' ? 'border-l-4 border-yellow-400' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs mr-2 ${
                      event.type === 'income'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {event.type === 'income' ? '💰' : '💸'} {event.type}
                  </span>
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs ${
                      event.status === 'completed'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
                <span className="text-lg font-bold">${event.amount.toFixed(2)}</span>
              </div>

              <div className="mb-2">
                <strong>{event.category}</strong>
                {event.vendor && <span className="text-gray-500 ml-2">• {event.vendor}</span>}
              </div>

              {event.note && <div className="text-sm text-gray-600 mb-2">{event.note}</div>}

              <div className="text-xs text-gray-400 mb-2">
                {new Date(event.timestamp).toLocaleString('es-PR')}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => event.id && toggleStatus(event.id, event.status)}
                  className="flex-1 bg-blue-500 text-white py-1 rounded text-sm"
                >
                  {event.status === 'pending' ? '✅ Marcar completado' : '⏳ Marcar pendiente'}
                </button>
                <button
                  onClick={() => event.id && deleteEvent(event.id)}
                  className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}