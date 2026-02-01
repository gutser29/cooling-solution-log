'use client'

import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/db'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatCapture() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! ¿Qué quieres registrar?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
      const assistantMessage = data.message

      // Detectar comandos de guardado
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
        // Conversación normal
        setMessages([...updatedMessages, { role: 'assistant', content: assistantMessage }])
      }
    } catch (error) {
      setMessages([...updatedMessages, { role: 'assistant', content: '❌ Error de conexión' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg">
        <h1 className="text-xl font-bold">💬 Chat con Claude</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800'
              }`}>
                {msg.content}
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
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
        </div>
      </div>
    </div>
  )
}