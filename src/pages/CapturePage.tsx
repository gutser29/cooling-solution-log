import { useState, type FormEvent } from 'react'
import { db } from '../lib/db'
import type { EventType, EventStatus } from '../lib/types'

const QUICK_ACTIONS = [
  { label: '⛽ Gasolina', category: 'Gasolina', type: 'expense' as EventType },
  { label: '🍔 Comida', category: 'Comida', type: 'expense' as EventType },
  { label: '🔧 Materiales', category: 'Materiales', type: 'expense' as EventType },
  { label: '💰 Cobro', category: 'Servicio', type: 'income' as EventType },
]

export default function CapturePage() {
  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState<EventType>('expense')
  const [status, setStatus] = useState<EventStatus>('completed')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [client, setClient] = useState('')
  const [note, setNote] = useState('')

  // ===== Claude (voice input states) =====
  const [voiceInput, setVoiceInput] = useState('')
  const [voiceParsing, setVoiceParsing] = useState(false)
  // =====================================

  const handleQuickAction = async (action: typeof QUICK_ACTIONS[0]) => {
    const amountInput = prompt(`${action.label} - Monto:`)
    if (!amountInput) return

    await db.events.add({
      timestamp: Date.now(),
      type: action.type,
      status: 'completed',
      category: action.category,
      amount: parseFloat(amountInput),
      payment_method: undefined,
    })

    alert('✅ Guardado')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!category || !amount) {
      alert('Category y Amount requeridos')
      return
    }

    await db.events.add({
      timestamp: Date.now(),
      type,
      status,
      category,
      amount: parseFloat(amount),
      vendor: vendor || undefined,
      payment_method: paymentMethod || undefined,
      client: client || undefined,
      note: note || undefined,
    })

    setCategory('')
    setAmount('')
    setVendor('')
    setPaymentMethod('')
    setClient('')
    setNote('')
    setShowForm(false)
    alert('✅ Evento guardado')
  }

  // ===== Claude (voice handler) =====
  const handleVoiceSubmit = async () => {
    if (!voiceInput.trim()) {
      alert('Escribe o dicta algo primero')
      return
    }

    setVoiceParsing(true)

    try {
      const response = await fetch('/api/parse-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceInput }),
      })

      if (!response.ok) {
        throw new Error('Error parsing voice input')
      }

      const parsed = await response.json()

      await db.events.add({
        timestamp: Date.now(),
        type:
          parsed.amount > 0
            ? parsed.subtype === 'service'
              ? 'income'
              : 'expense'
            : 'expense',
        status: 'completed',
        subtype: parsed.subtype,
        category: parsed.category,
        amount: Math.abs(parsed.amount),
        payment_method: parsed.payment_method,
        vendor: parsed.vendor,
        client: parsed.client,
        note: parsed.note,
        metadata: parsed.metadata,
        raw_text: voiceInput,
      })

      alert('✅ Guardado: ' + parsed.category + ' $' + parsed.amount)
      setVoiceInput('')
    } catch (error) {
      console.error(error)
      alert('❌ Error al procesar')
    } finally {
      setVoiceParsing(false)
    }
  }
  // =================================

  return (
    <div className="p-4">
      {/* ===== Claude (Voice UI) ===== */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-4 rounded-lg shadow-lg mb-4">
        <h2 className="text-white font-bold mb-2">🎤 Entrada por Voz/Texto</h2>
        <textarea
          value={voiceInput}
          onChange={(e) => setVoiceInput(e.target.value)}
          placeholder='Ej: "40 de gas con la business card"'
          className="w-full p-3 rounded-lg mb-2 text-base"
          rows={3}
        />
        <button
          onClick={handleVoiceSubmit}
          disabled={voiceParsing}
          className="w-full bg-white text-purple-600 font-bold py-3 rounded-lg disabled:bg-gray-300"
        >
          {voiceParsing ? '⏳ Procesando con IA...' : '✨ Procesar con Claude'}
        </button>
      </div>
      {/* ============================ */}

      <h1 className="text-2xl font-bold mb-4">Captura Rápida</h1>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => handleQuickAction(action)}
            className="bg-white p-4 rounded-lg shadow text-center hover:bg-gray-50"
          >
            <div className="text-3xl mb-2">{action.label.split(' ')[0]}</div>
            <div className="text-sm font-medium">
              {action.label.split(' ')[1]}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium mb-4"
      >
        {showForm ? '❌ Cancelar' : '➕ Formulario Completo'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as EventType)}
                className="w-full border rounded p-2"
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EventStatus)}
                className="w-full border rounded p-2"
              >
                <option value="completed">Completado</option>
                <option value="pending">Pendiente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Categoría *
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Monto *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Método Pago
              </label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Cliente</label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Nota</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border rounded p-2"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-500 text-white py-3 rounded-lg font-medium"
            >
              Guardar Evento
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
