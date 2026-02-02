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

  // ============ FIX BUG 2: CONTEXTO OCULTO (no se muestra en chat) ============
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)

  useEffect(() => {
    const loadContext = async () => {
      if (contextLoadedRef.current) return
      contextLoadedRef.current = true
      try {
        const recentEvents = await db.events.orderBy('timestamp').reverse().limit(50).toArray()
        if (recentEvents.length > 0) {
          const contextSummary = recentEvents.map(e => {
            const date = new Date(e.timestamp).toLocaleDateString('es-PR')
            const pm = e.payment_method || 'sin_metodo'
            return `[${date}] ${e.category || e.subtype || 'sin_cat'} - $${e.amount} (${pm}) - ${e.vendor || e.note || ''}`
          }).join('\n')

          dbContextRef.current = contextSummary
          console.log('✅ Contexto cargado:', recentEvents.length, 'eventos')
          console.log('📋 Contexto:', contextSummary)

          // Solo mostramos mensaje limpio en UI, NO el dump de datos
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ ${recentEvents.length} registros cargados. Puedes preguntarme sobre tus gastos anteriores. ¿Qué registramos?`
          }])
        }
      } catch (error) {
        console.error('Error cargando contexto:', error)
      }
    }
    loadContext()
  }, [])
  // ===========================================================================

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
      // ============ FIX BUG 2: INYECTAR CONTEXTO EN PRIMER MENSAJE ============
      const apiMessages = [...updatedMessages]

      // Si hay contexto de DB, lo inyectamos como primer mensaje oculto
      if (dbContextRef.current) {
        apiMessages.unshift(
          { role: 'user', content: `CONTEXTO_DB (últimos registros del usuario, NO mostrar al usuario, usar para responder consultas):\n${dbContextRef.current}` },
          { role: 'assistant', content: 'Entendido, tengo el contexto de los registros anteriores.' }
        )
      }
      // ========================================================================

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      })

      if (!response.ok) throw new Error('Error')
      const data = await response.json()

      if (data?.type === 'GENERATE_PDF') {
        const pdfData = data.payload || {}
        const allEvents = await db.events.toArray()
        console.log('Generando PDF...')
        console.log('Total eventos en DB:', allEvents.length)

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

        console.log('Categoría:', pdfData.category)
        console.log('Período:', pdfData.period)
        console.log('Rango:', new Date(startDate), 'a', new Date(endDate))

        generateCategoryReport(allEvents, pdfData.category || 'general', startDate, endDate)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Reporte generado: ${pdfData.category || 'general'} (${pdfData.period || 'custom'})`
        }])
        return
      }

      const assistantText = (data?.type === 'TEXT' ? (data.text || '') : '') || ''

      // ============ MEJORADO: REGEX MÁS ROBUSTO PARA SAVE_EVENT ============
      const saveMatch = assistantText.match(/SAVE_EVENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)

      if (saveMatch) {
        try {
          const eventData = JSON.parse(saveMatch[1])
          console.log('📥 SAVE_EVENT recibido de Claude:', JSON.stringify(eventData, null, 2))

          const normalizePaymentMethod = (v: any): string => {
            const s = String(v ?? '').trim().toLowerCase()
            if (!s) return ''
            if (s === 'cash' || s.includes('efectivo')) return 'cash'
            if (s === 'ath_movil' || s.includes('ath')) return 'ath_movil'
            if (s === 'business_card' || s.includes('negocio') || s.includes('business')) return 'business_card'
            if (s === 'sams_card' || s.includes('sam')) return 'sams_card'
            if (s === 'paypal' || s.includes('paypal')) return 'paypal'
            if (s === 'personal_card' || s.includes('personal') || s.includes('mi tarjeta')) return 'personal_card'
            if (s === 'other') return 'other'
            return 'other'
          }

          const normalizedPM = normalizePaymentMethod(eventData.payment_method)
          console.log(`💳 payment_method: raw="${eventData.payment_method}" → normalized="${normalizedPM}"`)

          const savedEvent = {
            timestamp: eventData.timestamp || Date.now(),
            type: (eventData.type || 'expense') as 'expense' | 'income',
            status: 'completed' as 'pending' | 'completed',
            subtype: eventData.subtype || '',
            category: eventData.category || '',
            amount: Number(eventData.amount || 0),
            payment_method: normalizedPM,
            vendor: eventData.vendor || '',
            vehicle_id: eventData.vehicle_id || '',
            client: eventData.client || '',
            note: eventData.note || eventData.description || '',
            raw_text: assistantText
          }

          console.log('💾 Evento a guardar:', JSON.stringify(savedEvent, null, 2))
          await db.events.add(savedEvent)

          // Actualizar contexto local con el nuevo evento
          const pmLabel = normalizedPM || 'sin_metodo'
          const newLine = `[${new Date().toLocaleDateString('es-PR')}] ${savedEvent.category || savedEvent.subtype} - $${savedEvent.amount} (${pmLabel}) - ${savedEvent.vendor || savedEvent.note || ''}`
          dbContextRef.current = newLine + '\n' + dbContextRef.current

          // Mensaje limpio al usuario (sin el JSON crudo)
          const cleanText = assistantText.replace(/SAVE_EVENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: cleanText || `✅ Guardado: ${eventData.category || savedEvent.subtype} $${savedEvent.amount} (${pmLabel})`
          }])
          return

        } catch (e) {
          console.error('❌ Error parseando SAVE_EVENT:', e)
          console.error('Raw match:', saveMatch[1])
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '❌ Error al guardar. Intenta de nuevo.'
          }])
          return
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: assistantText || '...' }])

    } catch (error) {
      console.error('Error de API:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 relative dark:bg-[#0b1220] dark:text-gray-100">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">💬 Chat con Claude</h1>
        <button onClick={() => setShowMenu(!showMenu)} className="text-3xl w-10 h-10 flex items-center justify-center">☰</button>
      </div>

      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-16 right-4 bg-white dark:bg-[#111a2e] rounded-lg shadow-2xl z-50 w-56 overflow-hidden border border-black/10 dark:border-white/10">
            <button onClick={() => { setShowMenu(false); onNavigate('capture') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">📝 Captura Rápida</button>
            <button onClick={() => { setShowMenu(false); onNavigate('ask') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">🔍 Consultas</button>
            <button onClick={() => { setShowMenu(false); onNavigate('history') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">📊 Historial</button>
            <button onClick={() => { setShowMenu(false); setShowPhotoUpload(true) }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/10">📷 Subir Recibo</button>
            <button onClick={async () => {
              setShowMenu(false)
              const now = new Date()
              const category = 'Gasolina'
              const startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
              const endDate = now.getTime()
              const allEvents = await db.events.toArray()
              generateCategoryReport(allEvents, category, startDate, endDate)
              setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte generado: ${category} (month)` }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10">Generar Reporte</button>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'}`}>
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