'use client'

import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/db'
import PhotoUpload from './PhotoUpload'
import { generateCategoryReport } from '../lib/pdfGenerator'




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
      if (data?.type === 'GENERATE_PDF') {
  const { category, period } = data.payload || {}
  const events = await db.events.toArray()

  const now = new Date()
  let startDate = 0
  let endDate = now.getTime()

  if (period === 'week') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime()
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1).getTime()
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  }

  generateCategoryReport(events, category || 'general', startDate, endDate)

  setMessages(prev => [...prev, { role: 'assistant', content: `✅ Generé el reporte PDF de ${category} (${period})` }])
  return
}
if (data?.type === 'TEXT') {
  setMessages(prev => [
    ...prev,
    { role: 'assistant', content: data.text || '' }
  ])
  return
}


      const assistantMessage = data.message

      if (assistantMessage.includes('SAVE_EVENT:')) {
        const jsonMatch = assistantMessage.match(/SAVE_EVENT:\s*(\{[\s\S]*?\})/i)
        if (jsonMatch) {
          try {
            const eventData = JSON.parse(jsonMatch[1])
            await db.events.add({
              timestamp: Date.now(),
              type: eventData.type || 'expense',
              status: 'completed',
              subtype: eventData.subtype,
              category: eventData.category,
              amount: eventData.amount,
              payment_method: eventData.payment_method,
              vendor: eventData.vendor,
              vehicle_id: eventData.vehicle_id,
              raw_text: updatedMessages.map(m => m.content).join('\n'),
            })

            setMessages([
              ...updatedMessages,
              { role: 'assistant', content: `✅ Guardado: ${eventData.category} $${eventData.amount}\n\n¿Algo más?` }
            ])
          } catch (e) {
            console.error(e)
            setMessages([...updatedMessages, { role: 'assistant', content: '❌ Error al guardar' }])
          }
        }
      } else {
        setMessages([...updatedMessages, { role: 'assistant', content: assistantMessage }])
      }
    } catch (error) {
      setMessages([...updatedMessages, { role: 'assistant', content: '❌ Error de conexión' }])
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
    const now = new Date()
    const category = 'gasolina'
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const endDate = now.getTime()

    const events = await db.events.toArray()
    generateCategoryReport(events, category, startDate, endDate)
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
                msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'

              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl px-4 py-3 shadow">
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
            className="flex-1 border rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
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