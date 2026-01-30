import { useState } from 'react'
import { db } from '../lib/db'

const SUGGESTED_QUERIES = [
  '¿Cuánto gasté en gasolina?',
  '¿Cuánto tengo pendiente?',
  '¿Cuánto gasté este mes?',
  '¿Cuál es el total?',
  '¿Cuánto cobré este mes?',
  '¿Balance del mes?',
]

export default function AskPage() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleAsk = async (q?: string) => {
    const searchQuery = (q || query).toLowerCase()
    setLoading(true)

    try {
      const events = await db.events.toArray()
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

      // Helpers
      const thisMonthEvents = events.filter((e) => e.timestamp >= startOfMonth)
      const gastos = events.filter((e) => e.type === 'expense')
      const ingresos = events.filter((e) => e.type === 'income')
      const pendientes = events.filter((e) => e.status === 'pending')

      // Parser mejorado
      if (searchQuery.includes('gasolina')) {
        const gastosGasolina = gastos.filter((e) =>
          e.category.toLowerCase().includes('gasolina')
        )
        const total = gastosGasolina.reduce((sum, e) => sum + e.amount, 0)
        const thisMonth = gastosGasolina.filter((e) => e.timestamp >= startOfMonth)
        const totalMonth = thisMonth.reduce((sum, e) => sum + e.amount, 0)

        setResult(
          `⛽ Gasolina:\n` +
            `💸 Total: $${total.toFixed(2)} (${gastosGasolina.length} eventos)\n` +
            `📅 Este mes: $${totalMonth.toFixed(2)} (${thisMonth.length} eventos)`
        )
      } else if (searchQuery.includes('comida') || searchQuery.includes('comidas')) {
        const gastosComida = gastos.filter((e) => e.category.toLowerCase().includes('comida'))
        const total = gastosComida.reduce((sum, e) => sum + e.amount, 0)
        setResult(`🍔 Comida: $${total.toFixed(2)} (${gastosComida.length} eventos)`)
      } else if (searchQuery.includes('materiales')) {
        const gastosMat = gastos.filter((e) => e.category.toLowerCase().includes('materiales'))
        const total = gastosMat.reduce((sum, e) => sum + e.amount, 0)
        setResult(`🔧 Materiales: $${total.toFixed(2)} (${gastosMat.length} eventos)`)
      } else if (searchQuery.includes('pendiente')) {
        const totalPendiente = pendientes.reduce((sum, e) => sum + e.amount, 0)
        const detalles = pendientes
          .slice(0, 5)
          .map((e) => `• ${e.category}: $${e.amount.toFixed(2)}`)
          .join('\n')

        setResult(
          `⏳ Pendientes: $${totalPendiente.toFixed(2)} (${pendientes.length} eventos)\n\n` +
            `Últimos 5:\n${detalles}`
        )
      } else if (searchQuery.includes('cobr') || searchQuery.includes('ingres')) {
        const totalIngresos = ingresos.reduce((sum, e) => sum + e.amount, 0)
        const thisMonth = thisMonthEvents.filter((e) => e.type === 'income')
        const totalMonth = thisMonth.reduce((sum, e) => sum + e.amount, 0)

        setResult(
          `💰 Ingresos:\n` +
            `Total: $${totalIngresos.toFixed(2)} (${ingresos.length})\n` +
            `Este mes: $${totalMonth.toFixed(2)} (${thisMonth.length})`
        )
      } else if (searchQuery.includes('balance') || searchQuery.includes('mes')) {
        const gastosMonth = thisMonthEvents.filter((e) => e.type === 'expense')
        const ingresosMonth = thisMonthEvents.filter((e) => e.type === 'income')
        const totalGastos = gastosMonth.reduce((sum, e) => sum + e.amount, 0)
        const totalIngresos = ingresosMonth.reduce((sum, e) => sum + e.amount, 0)
        const balance = totalIngresos - totalGastos

        setResult(
          `📅 Este mes:\n` +
            `💰 Ingresos: $${totalIngresos.toFixed(2)}\n` +
            `💸 Gastos: $${totalGastos.toFixed(2)}\n` +
            `📊 Balance: $${balance.toFixed(2)} ${balance >= 0 ? '✅' : '⚠️'}`
        )
      } else if (searchQuery.includes('total')) {
        const totalGastos = gastos.reduce((sum, e) => sum + e.amount, 0)
        const totalIngresos = ingresos.reduce((sum, e) => sum + e.amount, 0)
        const balance = totalIngresos - totalGastos

        setResult(
          `💼 Total general:\n` +
            `💰 Ingresos: $${totalIngresos.toFixed(2)}\n` +
            `💸 Gastos: $${totalGastos.toFixed(2)}\n` +
            `📊 Balance: $${balance.toFixed(2)}`
        )
      } else {
        // Categorías genéricas
        const categoria = events.filter((e) =>
          e.category.toLowerCase().includes(searchQuery)
        )
        if (categoria.length > 0) {
          const total = categoria.reduce((sum, e) => sum + e.amount, 0)
          setResult(
            `🔍 "${searchQuery}":\n` +
              `Total: $${total.toFixed(2)} (${categoria.length} eventos)`
          )
        } else {
          setResult(
            '❓ No entendí la consulta.\n\n' +
              'Prueba con: "gasolina", "comida", "materiales", "pendientes", "cobros", "balance", "total"'
          )
        }
      }
    } catch (error) {
      setResult('❌ Error al consultar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">💬 Consultas</h1>

      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: ¿Cuánto gasté en gasolina?"
          className="w-full border rounded-lg p-3 mb-3 text-base"
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading}
          className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium text-base disabled:bg-gray-400"
        >
          {loading ? '⏳ Consultando...' : '🔍 Consultar'}
        </button>
      </div>

      {result && (
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg shadow whitespace-pre-wrap border border-blue-200">
          <div className="text-base leading-relaxed">{result}</div>
        </div>
      )}

      {/* Suggested Queries */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-600 mb-2">💡 Sugerencias:</h3>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUERIES.map((sq) => (
            <button
              key={sq}
              onClick={() => {
                setQuery(sq)
                handleAsk(sq)
              }}
              className="bg-white px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}