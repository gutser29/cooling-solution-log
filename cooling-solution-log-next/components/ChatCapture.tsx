'use client'

import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/db'
import { generateCategoryReport } from '@/lib/pdfGenerator'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  photos?: string[]
}

interface ChatCaptureProps {
  onNavigate: (page: string) => void
}

const compressImage = (base64: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = base64
  })
}

export default function ChatCapture({ onNavigate }: ChatCaptureProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '¡Hola! ¿Qué quieres registrar? Puedes escribir o enviar fotos de recibos 📷' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)

  // ============ CARGAR CONTEXTO DE DB (oculto) ============
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
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ ${recentEvents.length} registros cargados. Puedes preguntarme sobre gastos anteriores o enviar fotos. ¿Qué hacemos?`
          }])
        }
      } catch (error) {
        console.error('Error cargando contexto:', error)
      }
    }
    loadContext()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============ FOTOS ============
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const compressed: string[] = []
    for (const file of files) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const small = await compressImage(base64)
      compressed.push(small)
    }
    setPendingPhotos(prev => [...prev, ...compressed])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingPhoto = (index: number) => {
    setPendingPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // ============ ENVIAR MENSAJE ============
  const handleSend = async () => {
    const hasText = input.trim().length > 0
    const hasPhotos = pendingPhotos.length > 0
    if ((!hasText && !hasPhotos) || loading) return

    const userContent = hasText ? input.trim() : '📷 Foto adjunta - analiza por favor'
    const userMessage: ChatMessage = {
      role: 'user',
      content: userContent,
      photos: hasPhotos ? [...pendingPhotos] : undefined
    }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setPendingPhotos([])
    setLoading(true)

    try {
      const apiMessages = [...updatedMessages]
      if (dbContextRef.current) {
        apiMessages.unshift(
          { role: 'user', content: `CONTEXTO_DB (últimos registros, NO mostrar al usuario):\n${dbContextRef.current}` },
          { role: 'assistant', content: 'Entendido, tengo el contexto.' }
        )
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages.map(m => ({
            role: m.role,
            content: m.content,
            photos: m.photos || undefined
          }))
        })
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      // ============ GENERATE_PDF ============
      if (data?.type === 'GENERATE_PDF') {
        const pdfData = data.payload || {}
        const allEvents = await db.events.toArray()
        const now = Date.now()
        let startDate = 0
        let endDate = now
        if (pdfData.period === 'week') startDate = now - (7 * 24 * 60 * 60 * 1000)
        else if (pdfData.period === 'month') { const d = new Date(); startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime() }
        else if (pdfData.period === 'year') { const d = new Date(); startDate = new Date(d.getFullYear(), 0, 1).getTime() }
        console.log('PDF:', pdfData.category, pdfData.period, new Date(startDate).toLocaleDateString(), '-', new Date(endDate).toLocaleDateString())
        generateCategoryReport(allEvents, pdfData.category || 'general', startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte: ${pdfData.category || 'general'} (${pdfData.period || 'custom'})` }])
        return
      }

      const assistantText = (data?.type === 'TEXT' ? (data.text || '') : '') || ''

      // ============ SAVE_EVENT ============
      const saveMatch = assistantText.match(/SAVE_EVENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (saveMatch) {
        try {
          const eventData = JSON.parse(saveMatch[1])
          console.log('📥 SAVE_EVENT:', JSON.stringify(eventData, null, 2))

          const normalizePaymentMethod = (v: any): string => {
            const s = String(v ?? '').trim().toLowerCase()
            if (!s) return ''
            if (s === 'cash' || s.includes('efectivo')) return 'cash'
            if (s === 'ath_movil' || s.includes('ath')) return 'ath_movil'
            if (s === 'business_card' || s.includes('negocio') || s.includes('business')) return 'business_card'
            if (s === 'sams_card' || s.includes('sam')) return 'sams_card'
            if (s === 'paypal' || s.includes('paypal')) return 'paypal'
            if (s === 'personal_card' || s.includes('personal') || s.includes('mi tarjeta')) return 'personal_card'
            return 'other'
          }

          const normalizedPM = normalizePaymentMethod(eventData.payment_method)
          console.log(`💳 raw="${eventData.payment_method}" → "${normalizedPM}"`)

          const savedEvent = {
            timestamp: Date.now(),  // SIEMPRE tiempo real del cliente
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
            raw_text: assistantText,
            photo: userMessage.photos ? userMessage.photos[0] : undefined
          }

          console.log('💾 Guardando:', JSON.stringify({ ...savedEvent, photo: savedEvent.photo ? '[IMG]' : undefined }, null, 2))
          await db.events.add(savedEvent)

          // Actualizar contexto
          const newLine = `[${new Date().toLocaleDateString('es-PR')}] ${savedEvent.category || savedEvent.subtype} - $${savedEvent.amount} (${normalizedPM || 'sin_metodo'}) - ${savedEvent.vendor || savedEvent.note || ''}`
          dbContextRef.current = newLine + '\n' + dbContextRef.current

          const cleanText = assistantText.replace(/SAVE_EVENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: cleanText || `✅ Guardado: ${eventData.category || savedEvent.subtype} $${savedEvent.amount}`
          }])
          return
        } catch (e) {
          console.error('❌ Error SAVE_EVENT:', e, saveMatch[1])
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error al guardar. Intenta de nuevo.' }])
          return
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: assistantText || '...' }])
    } catch (error) {
      console.error('Error API:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 relative dark:bg-[#0b1220] dark:text-gray-100">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">💬 Cooling Solution</h1>
        <button onClick={() => setShowMenu(!showMenu)} className="text-3xl w-10 h-10 flex items-center justify-center">☰</button>
      </div>

      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-16 right-4 bg-white dark:bg-[#111a2e] rounded-lg shadow-2xl z-50 w-56 overflow-hidden border border-black/10 dark:border-white/10">
            <button onClick={() => { setShowMenu(false); onNavigate('capture') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">📝 Captura Rápida</button>
            <button onClick={() => { setShowMenu(false); onNavigate('ask') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">🔍 Consultas</button>
            <button onClick={() => { setShowMenu(false); onNavigate('history') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">📊 Historial</button>
            <button onClick={async () => {
              setShowMenu(false)
              const now = new Date()
              const startDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
              const allEvents = await db.events.toArray()
              generateCategoryReport(allEvents, 'Gasolina', startDate, now.getTime())
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ Reporte: Gasolina (mes)' }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10">📄 Reporte Gasolina</button>
          </div>
        </>
      )}

      {/* MENSAJES */}
      <div className="flex-1 overflow-y-auto p-4 pb-36">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'}`}>
                {msg.photos && msg.photos.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {msg.photos.map((p, i) => (
                      <img key={i} src={p} alt={`Foto ${i + 1}`} className="w-24 h-24 object-cover rounded-lg" />
                    ))}
                  </div>
                )}
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

      {/* INPUT AREA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg dark:bg-[#0f172a] dark:border-white/10">
        {pendingPhotos.length > 0 && (
          <div className="flex gap-2 p-3 bg-gray-50 dark:bg-[#1a2332] border-b dark:border-white/10 overflow-x-auto">
            {pendingPhotos.map((p, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={p} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-blue-400" />
                <button onClick={() => removePendingPhoto(i)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center shadow">✕</button>
              </div>
            ))}
            <span className="flex items-center text-xs text-gray-500 dark:text-gray-400">{pendingPhotos.length} foto{pendingPhotos.length > 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="max-w-2xl mx-auto flex gap-2 p-4">
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="bg-gray-200 dark:bg-[#1a2332] rounded-full w-12 h-12 flex items-center justify-center text-xl disabled:opacity-50 flex-shrink-0" title="Foto">📷</button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={pendingPhotos.length > 0 ? 'Describe la foto...' : 'Escribe aquí...'} className="flex-1 border rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#0b1220] dark:border-white/10" disabled={loading} />
          <button onClick={handleSend} disabled={loading || (!input.trim() && !pendingPhotos.length)} className="bg-blue-500 text-white rounded-full w-12 h-12 flex items-center justify-center text-xl disabled:bg-gray-300 flex-shrink-0">{loading ? '⏳' : '📤'}</button>
        </div>
      </div>
    </div>
  )
}