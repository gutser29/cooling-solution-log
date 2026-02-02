'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import {
  generateCategoryReport,
  generatePLReport,
  generateARReport,
  generatePaymentMethodReport
} from '@/lib/pdfGenerator'

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
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = base64
  })
}

// Helper para calcular rango de fechas
function getDateRange(period: string, periodLabel?: string): { startDate: number; endDate: number } {
  const now = Date.now()
  const d = new Date()
  let startDate = 0
  let endDate = now

  if (period === 'week') {
    startDate = now - (7 * 24 * 60 * 60 * 1000)
  } else if (period === 'year') {
    startDate = new Date(d.getFullYear(), 0, 1).getTime()
  } else if (period === 'month') {
    // Checar si es un mes específico
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const monthIdx = periodLabel ? monthNames.indexOf(periodLabel.toLowerCase()) : -1
    if (monthIdx >= 0) {
      const year = monthIdx > d.getMonth() ? d.getFullYear() - 1 : d.getFullYear()
      startDate = new Date(year, monthIdx, 1).getTime()
      endDate = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999).getTime()
    } else {
      startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
  }

  return { startDate, endDate }
}

export default function ChatCapture({ onNavigate }: ChatCaptureProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '¡Hola! ¿Qué quieres registrar? Escribe, dicta 🎤 o envía fotos 📷\n\nPuedes pedirme:\n• Registrar gastos/ingresos\n• P&L del mes\n• ¿Quién me debe?\n• Reporte de gasolina\n• ¿Cuánto gasté con la Capital One?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)

  // ============ SPEECH ============
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'es-PR'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let finalT = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalT += event.results[i][0].transcript
      }
      if (finalT) setInput(prev => (prev.trim() ? prev.trim() + ' ' : '') + finalT)
    }
    recognition.onerror = (e: any) => { if (e.error !== 'no-speech') setIsListening(false) }
    recognition.onend = () => {
      if (recognitionRef.current?._shouldRestart) { try { recognition.start() } catch {} }
      else setIsListening(false)
    }
    recognitionRef.current = recognition
  }, [])

  const toggleListening = useCallback(() => {
    const r = recognitionRef.current
    if (!r) { alert('Tu navegador no soporta dictado. Usa Chrome.'); return }
    if (isListening) { r._shouldRestart = false; r.stop(); setIsListening(false) }
    else { r._shouldRestart = true; try { r.start(); setIsListening(true) } catch {} }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current._shouldRestart = false
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }, [isListening])

  // ============ CONTEXTO ============
  useEffect(() => {
    const load = async () => {
      if (contextLoadedRef.current) return
      contextLoadedRef.current = true
      try {
        const events = await db.events.orderBy('timestamp').reverse().limit(50).toArray()
        const jobs = await db.jobs.orderBy('date').reverse().limit(20).toArray()

        let ctx = ''
        if (events.length > 0) {
          ctx += 'EVENTOS:\n' + events.map(e => {
            const d = new Date(e.timestamp).toLocaleDateString('es-PR')
            return `[${d}] ${e.type} ${e.category || e.subtype} $${e.amount} (${e.payment_method || 'sin_metodo'}) ${e.vendor || e.client || e.note || ''}`
          }).join('\n')
        }

        if (jobs.length > 0) {
          ctx += '\n\nTRABAJOS:\n' + jobs.map(j => {
            const d = new Date(j.date).toLocaleDateString('es-PR')
            const paid = j.payments.reduce((s: number, p: any) => s + p.amount, 0)
            return `[${d}] ${j.type} Cliente#${j.client_id} Total:$${j.total_charged} Pagado:$${paid} Status:${j.payment_status}`
          }).join('\n')
        }

        dbContextRef.current = ctx
        const totalRecords = events.length + jobs.length
        console.log('✅ Contexto:', totalRecords, 'registros')

        if (totalRecords > 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ ${events.length} eventos + ${jobs.length} trabajos cargados. ¿Qué hacemos?`
          }])
        }
      } catch (e) { console.error('Error contexto:', e) }
    }
    load()
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ============ FOTOS ============
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const compressed: string[] = []
    for (const f of files) {
      const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f) })
      compressed.push(await compressImage(b64))
    }
    setPendingPhotos(prev => [...prev, ...compressed])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ============ ENVIAR ============
  const handleSend = async () => {
    const hasText = input.trim().length > 0
    const hasPhotos = pendingPhotos.length > 0
    if ((!hasText && !hasPhotos) || loading) return
    stopListening()

    const userContent = hasText ? input.trim() : '📷 Foto adjunta'
    const userMessage: ChatMessage = { role: 'user', content: userContent, photos: hasPhotos ? [...pendingPhotos] : undefined }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setPendingPhotos([])
    setLoading(true)

    try {
      const apiMessages = [...updatedMessages]
      if (dbContextRef.current) {
        apiMessages.unshift(
          { role: 'user', content: `CONTEXTO_DB:\n${dbContextRef.current}` },
          { role: 'assistant', content: 'Tengo el contexto.' }
        )
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages.map(m => ({ role: m.role, content: m.content, photos: m.photos }))
        })
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      // ====== HANDLE REPORT TYPES ======

      // P&L Report
      if (data?.type === 'GENERATE_PL') {
        const { period, periodLabel } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month', periodLabel)
        const allEvents = await db.events.toArray()
        const allJobs = await db.jobs.toArray()
        generatePLReport(allEvents, allJobs, startDate, endDate, periodLabel || 'este mes')
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ P&L generado: ${periodLabel || period}` }])
        return
      }

      // Cuentas por cobrar
      if (data?.type === 'GENERATE_AR') {
        const allJobs = await db.jobs.toArray()
        const allClients = await db.clients.toArray()
        generateARReport(allJobs, allClients)
        setMessages(prev => [...prev, { role: 'assistant', content: '✅ Reporte de Cuentas por Cobrar generado' }])
        return
      }

      // Reporte por método de pago
      if (data?.type === 'GENERATE_PAYMENT_REPORT') {
        const { paymentMethod, period } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month')
        const allEvents = await db.events.toArray()
        generatePaymentMethodReport(allEvents, paymentMethod, startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte ${paymentMethod} generado` }])
        return
      }

      // Category report
      if (data?.type === 'GENERATE_PDF') {
        const pdfData = data.payload || {}
        const { startDate, endDate } = getDateRange(pdfData.period || 'month')
        const allEvents = await db.events.toArray()
        generateCategoryReport(allEvents, pdfData.category || 'general', startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte: ${pdfData.category} (${pdfData.period})` }])
        return
      }

      const assistantText = (data?.type === 'TEXT' ? (data.text || '') : '') || ''

      // ====== SAVE_EVENT ======
      const saveMatch = assistantText.match(/SAVE_EVENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (saveMatch) {
        try {
          const ed = JSON.parse(saveMatch[1])
          const pm = String(ed.payment_method || '').trim().toLowerCase().replace(/\s+/g, '_')
          const saved = {
            timestamp: Date.now(),
            type: (ed.type || 'expense') as 'expense' | 'income',
            status: 'completed' as const,
            subtype: ed.subtype || '',
            category: ed.category || '',
            amount: Number(ed.amount || 0),
            payment_method: pm,
            vendor: ed.vendor || '',
            vehicle_id: ed.vehicle_id || '',
            client: ed.client || '',
            note: ed.note || ed.description || '',
            raw_text: assistantText,
            photo: userMessage.photos?.[0]
          }
          await db.events.add(saved)

          // Update context
          const line = `[${new Date().toLocaleDateString('es-PR')}] ${saved.type} ${saved.category || saved.subtype} $${saved.amount} (${pm}) ${saved.vendor || saved.client || ''}`
          dbContextRef.current = line + '\n' + dbContextRef.current

          const clean = assistantText.replace(/SAVE_EVENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ ${saved.type === 'income' ? 'Ingreso' : 'Gasto'}: ${saved.category} $${saved.amount}` }])
          return
        } catch (e) {
          console.error('SAVE_EVENT error:', e)
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando. Intenta de nuevo.' }])
          return
        }
      }

      // ====== SAVE_JOB ======
      const jobMatch = assistantText.match(/SAVE_JOB:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (jobMatch) {
        try {
          const jd = JSON.parse(jobMatch[1])

          // Buscar o crear cliente
          let clientId = 0
          if (jd.client_name) {
            const parts = jd.client_name.split(' ')
            const firstName = parts[0] || ''
            const lastName = parts.slice(1).join(' ') || ''
            const existing = await db.clients.where('first_name').equals(firstName).first()
            if (existing?.id) {
              clientId = existing.id
            } else {
              clientId = await db.clients.add({
                first_name: firstName,
                last_name: lastName,
                type: 'residential',
                active: true,
                created_at: Date.now()
              }) as number
            }
          }

          const jobId = await db.jobs.add({
            client_id: clientId,
            date: Date.now(),
            type: jd.type || 'maintenance',
            status: 'completed',
            services: jd.services || [],
            materials: jd.materials || [],
            employees: jd.employees || [],
            subtotal_services: (jd.services || []).reduce((s: number, sv: any) => s + (sv.total || 0), 0),
            subtotal_materials: (jd.materials || []).reduce((s: number, m: any) => s + (m.unit_price * m.quantity), 0),
            total_charged: jd.total_charged || 0,
            payment_status: jd.payment_status || 'pending',
            payments: jd.payments || [],
            balance_due: jd.balance_due || jd.total_charged || 0,
            created_at: Date.now()
          })

          // Si hay depósito, registrar como income
          if (jd.deposit && jd.deposit > 0) {
            await db.events.add({
              timestamp: Date.now(),
              type: 'income',
              status: 'completed',
              category: 'Depósito',
              amount: jd.deposit,
              payment_method: jd.deposit_method || 'cash',
              client: jd.client_name || '',
              note: `Depósito trabajo #${jobId}`,
              raw_text: assistantText
            })
          }

          const line = `[${new Date().toLocaleDateString('es-PR')}] JOB ${jd.type} Cliente:${jd.client_name} Total:$${jd.total_charged} Status:${jd.payment_status}`
          dbContextRef.current = line + '\n' + dbContextRef.current

          const clean = assistantText.replace(/SAVE_JOB:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Trabajo registrado: ${jd.client_name} $${jd.total_charged}` }])
          return
        } catch (e) {
          console.error('SAVE_JOB error:', e)
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando trabajo.' }])
          return
        }
      }

      // ====== SAVE_PAYMENT (pago de cliente a job existente) ======
      const payMatch = assistantText.match(/SAVE_PAYMENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (payMatch) {
        try {
          const pd = JSON.parse(payMatch[1])

          // Registrar como income
          await db.events.add({
            timestamp: Date.now(),
            type: 'income',
            status: 'completed',
            category: 'Cobro',
            amount: pd.amount,
            payment_method: String(pd.method || 'cash').toLowerCase().replace(/\s+/g, '_'),
            client: pd.client_name || '',
            note: pd.job_reference || '',
            raw_text: assistantText
          })

          // Intentar actualizar el job si encontramos uno
          if (pd.client_name) {
            const parts = pd.client_name.split(' ')
            const client = await db.clients.where('first_name').equals(parts[0]).first()
            if (client?.id) {
              const pendingJobs = await db.jobs.where('client_id').equals(client.id)
                .filter(j => j.payment_status !== 'paid').toArray()

              if (pendingJobs.length > 0) {
                const job = pendingJobs[0]
                const newPayment = { date: Date.now(), amount: pd.amount, method: pd.method || 'cash' }
                const updatedPayments = [...job.payments, newPayment]
                const totalPaid = updatedPayments.reduce((s, p) => s + p.amount, 0)
                const newBalance = job.total_charged - totalPaid
                const newStatus = newBalance <= 0 ? 'paid' : 'partial'

                await db.jobs.update(job.id!, {
                  payments: updatedPayments,
                  balance_due: Math.max(0, newBalance),
                  payment_status: newStatus
                })
              }
            }
          }

          const line = `[${new Date().toLocaleDateString('es-PR')}] income Cobro $${pd.amount} (${pd.method}) ${pd.client_name}`
          dbContextRef.current = line + '\n' + dbContextRef.current

          const clean = assistantText.replace(/SAVE_PAYMENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: clean || `✅ Cobro: $${pd.amount} de ${pd.client_name}${pd.remaining > 0 ? ` (Pendiente: $${pd.remaining})` : ' (Saldado ✅)'}`
          }])
          return
        } catch (e) {
          console.error('SAVE_PAYMENT error:', e)
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error registrando pago.' }])
          return
        }
      }

      // ====== SAVE_EMPLOYEE_PAYMENT ======
      const empMatch = assistantText.match(/SAVE_EMPLOYEE_PAYMENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (empMatch) {
        try {
          const ep = JSON.parse(empMatch[1])
          await db.events.add({
            timestamp: Date.now(),
            type: 'expense',
            status: 'completed',
            subtype: 'payroll',
            category: 'Nómina',
            amount: ep.net,
            payment_method: String(ep.payment_method || 'cash').toLowerCase().replace(/\s+/g, '_'),
            note: `${ep.employee_name} - ${ep.days}d × $${ep.daily_rate} = $${ep.gross} - ${ep.retention} ret = $${ep.net} | ${ep.job_reference || ''}`,
            raw_text: assistantText
          })

          const line = `[${new Date().toLocaleDateString('es-PR')}] expense Nómina $${ep.net} ${ep.employee_name}`
          dbContextRef.current = line + '\n' + dbContextRef.current

          const clean = assistantText.replace(/SAVE_EMPLOYEE_PAYMENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: clean || `✅ Nómina: ${ep.employee_name} $${ep.net} (${ep.days}d × $${ep.daily_rate} - 10%)`
          }])
          return
        } catch (e) {
          console.error('SAVE_EMPLOYEE_PAYMENT error:', e)
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando nómina.' }])
          return
        }
      }

      // Normal message
      setMessages(prev => [...prev, { role: 'assistant', content: assistantText || '...' }])

    } catch (error) {
      console.error('API error:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error de conexión.' }])
    } finally {
      setLoading(false)
    }
  }

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 relative dark:bg-[#0b1220] dark:text-gray-100">
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
              const allEvents = await db.events.toArray()
              const allJobs = await db.jobs.toArray()
              const d = new Date()
              const startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
              generatePLReport(allEvents, allJobs, startDate, Date.now(), 'este mes')
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ P&L del mes generado' }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b">📈 P&L del Mes</button>
            <button onClick={async () => {
              setShowMenu(false)
              const allJobs = await db.jobs.toArray()
              const allClients = await db.clients.toArray()
              generateARReport(allJobs, allClients)
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ Cuentas por Cobrar' }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10">💰 ¿Quién me Debe?</button>
          </div>
        </>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-40">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'}`}>
                {msg.photos && msg.photos.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {msg.photos.map((p, i) => <img key={i} src={p} alt="" className="w-24 h-24 object-cover rounded-lg" />)}
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

      {/* INPUT */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg dark:bg-[#0f172a] dark:border-white/10">
        {pendingPhotos.length > 0 && (
          <div className="flex gap-2 p-3 bg-gray-50 dark:bg-[#1a2332] border-b dark:border-white/10 overflow-x-auto">
            {pendingPhotos.map((p, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={p} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-blue-400" />
                <button onClick={() => setPendingPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
          </div>
        )}
        {isListening && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b dark:border-white/10">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Dictando...</span>
            <span className="text-xs text-gray-500 ml-auto">Toca 🎤 para parar</span>
          </div>
        )}
        <div className="max-w-2xl mx-auto flex gap-1.5 p-3">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="bg-gray-200 dark:bg-[#1a2332] rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:opacity-50 flex-shrink-0">📷</button>
          <button onClick={toggleListening} disabled={loading} className={`rounded-full w-11 h-11 flex items-center justify-center text-lg flex-shrink-0 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50' : 'bg-gray-200 dark:bg-[#1a2332] disabled:opacity-50'}`}>🎤</button>
          <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={isListening ? 'Dictando...' : 'Escribe aquí...'} className="flex-1 border rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#0b1220] dark:border-white/10 text-sm" disabled={loading} />
          <button onClick={handleSend} disabled={loading || (!input.trim() && !pendingPhotos.length)} className="bg-blue-500 text-white rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:bg-gray-300 flex-shrink-0">{loading ? '⏳' : '📤'}</button>
        </div>
      </div>
    </div>
  )
}