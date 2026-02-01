'use client'

import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/db'
import PhotoUpload from './PhotoUpload'
import { generateCategoryReport } from '@/lib/pdfGenerator'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatCaptureProps {
  onNavigate: (page: string) => void
}

export default function ChatCapture({ onNavigate }: ChatCaptureProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! ¿Qué quieres registrar?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      })

      if (!response.ok) throw new Error('Error')

      const data = await response.json()

      // 1) Si el backend ya devolvió GENERATE_PDF, generamos el PDF aquí con DB real
      if (data?.type === 'GENERATE_PDF') {
        const pdfData = data.payload || {}
        const allEvents = await db.events.toArray()

        console.log('Eventos totales en DB:', allEvents.length)

        const now = Date.now()
        let startDate = 0
        let endDate = now

        if (pdfData.period === 'week') {
          startDate = now - (7 * 24 * 60 * 60 * 1000)
        } else if (pdfData.period === 'month') {
          const d = new Date()
          startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
        } else if (pdfData.period === 'year') {
          const d = new Date()
          startDate = new Date(d.getFullYear(), 0, 1).getTime()
        }

        console.log('Generando PDF:', pdfData)
        console.log('Fechas calculadas:', new Date(startDate), new Date(endDate))

        generateCategoryReport(allEvents, pdfData.category || 'general', startDate, endDate)

        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `✅ Reporte generado: ${pdfData.category || 'general'} (${pdfData.period || 'custom'})` }
        ])
        return
      }

      // 2) Mensaje normal (TEXT)
      const assistantText = (data?.type === 'TEXT' ? (data.text || '') : '') || ''

      // 3) Si viene un SAVE_EVENT dentro del TEXT, guardarlo en IndexedDB
      const saveMatch = assistantText.match(/SAVE_EVENT:\s*({[\s\S]*?})/i)
      if (saveMatch) {
        try {
          const eventData = JSON.parse(saveMatch[1])
          // Normalizar payment_method (acepta variantes por si el modelo se desvía)
const normalizePaymentMethod = (v: any) => {
  const s = String(v ?? '').trim().toLowerCase()

  if (!s) return ''

  if (s === 'cash' || s.includes('efectivo')) return 'cash'
  if (s === 'ath_movil' || s.includes('ath')) return 'ath_movil'
  if (s === 'business_card' || s.includes('negocio')) return 'business_card'
  if (s === 'sams_card' || s.includes("sam")) return 'sams_card'
  if (s === 'paypal' || s.includes('paypal')) return 'paypal'
  if (s === 'personal_card' || s.includes('personal') || s.includes('mi tarjeta')) return 'personal_card'
  if (s === 'other') return 'other'

  return 'other'
}

eventData.payment_method = normalizePaymentMethod(eventData.payment_method)


          await db.events.add({
            timestamp: eventData.timestamp || Date.now(),
            type: eventData.type || 'expense',
            status: 'completed',
            subtype: eventData.subtype || '',
            category: eventData.category || '',
            amount: Number(eventData.amount || 0),
            payment_method: eventData.payment_method || '',
            vendor: eventData.vendor || '',
            vehicle_id: eventData.vehicle_id || '',
            client: eventData.client || '',
            note: eventData.note || eventData.description || '',
            raw_text: assistantText,
          })

          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `✅ Guardado: ${eventData.category || ''} $${eventData.amount || 0}\n\n¿Algo más?` }
          ])
          return
        } catch (e) {
          console.error('Error parseando SAVE_EVENT:', e)
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: '❌ Error al guardar (JSON inválido). Pruébalo de nuevo.' }
          ])
          return
        }
      }

      // 4) Si no era SAVE_EVENT, solo mostramos el texto del asistente
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: assistantText || '...' }
      ])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 relative dark:bg-[#0b1220] dark:text-gray-100">
      {/* Header con menú */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">💬 Chat con Claude</h1>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="text-3xl w-10 h-10 flex items-center justify-center"
        >
          ☰
        </button>
      </div>

      {/* Menú desplegable */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute top-16 right-4 bg-white dark:bg-[#111a2e] rounded-lg shadow-2xl z-50 w-56 overflow-hidden border border-black/10 dark:border-white/10">
            <button
              onClick={() => { setShowMenu(false); onNavigate('capture') }}
              className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b"
            >
              📝 Captura Rápida
            </button>
            <button
              onClick={() => { setShowMenu(false); onNavigate('ask') }}
              className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b"
            >
              🔍 Consultas
            </button>
            <button
              onClick={() => { setShowMenu(false); onNavigate('history') }}
              className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b"
            >
              📊 Historial
            </button>

            <button
              onClick={() => { setShowMenu(false); setShowPhotoUpload(true) }}
              className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/10"
            >
              📷 Subir Recibo
            </button>

            <button
              onClick={async () => {
                setShowMenu(false)
                const now = new Date()
                const category = 'Gasolina'
                const startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
                const endDate = now.getTime()
                const allEvents = await db.events.toArray()
                generateCategoryReport(allEvents, category, startDate, endDate)
                setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte generado: ${category} (month)` }])
              }}
              className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              Generar Reporte
            </button>
          </div>
        </>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-[#111a2e] rounded-2xl px-4 py-3 shadow">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg dark:bg-[#0f172a] dark:border-white/10">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribe aquí..."
            className="flex-1 border rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#0b1220] dark:border-white/10"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-blue-500 text-white rounded-full px-6 py-3 font-bold disabled:bg-gray-300"
          >
            {loading ? '⏳' : '📤'}
          </button>

          {showPhotoUpload && <PhotoUpload onClose={() => setShowPhotoUpload(false)} />}
        </div>
      </div>
    </div>
  )
}
