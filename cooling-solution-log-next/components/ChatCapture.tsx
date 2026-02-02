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
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = base64
  })
}

function getDateRange(period: string, periodLabel?: string): { startDate: number; endDate: number } {
  const now = Date.now()
  const d = new Date()
  let startDate = 0, endDate = now
  if (period === 'week') startDate = now - 7 * 86400000
  else if (period === 'year') startDate = new Date(d.getFullYear(), 0, 1).getTime()
  else if (period === 'month') {
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    const idx = periodLabel ? months.indexOf(periodLabel.toLowerCase()) : -1
    if (idx >= 0) {
      const yr = idx > d.getMonth() ? d.getFullYear() - 1 : d.getFullYear()
      startDate = new Date(yr, idx, 1).getTime()
      endDate = new Date(yr, idx + 1, 0, 23, 59, 59, 999).getTime()
    } else {
      startDate = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
  }
  return { startDate, endDate }
}

export default function ChatCapture({ onNavigate }: ChatCaptureProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '¡Hola! ¿Qué quieres registrar? Escribe, dicta 🎤 o envía fotos 📷' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)

  // ============ GOOGLE DRIVE SYNC FUNCTIONS ============

  const checkDriveConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status')
      const data = await res.json()
      setDriveConnected(data.connected)
      console.log('☁️ Drive connected:', data.connected)
    } catch {
      setDriveConnected(false)
    }
  }, [])

  const syncToDrive = useCallback(async () => {
    if (!driveConnected || syncing) return
    setSyncing(true)
    try {
      const events = await db.events.toArray()
      const clients = await db.clients.toArray()
      const jobs = await db.jobs.toArray()
      const employees = await db.employees.toArray()
      const vehicles = await db.vehicles.toArray()
      const contracts = await db.contracts.toArray()

      const res = await fetch('/api/sync/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, clients, jobs, employees, vehicles, contracts })
      })

      if (res.ok) {
        const time = new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
        setLastSync(time)
        console.log('☁️ Synced to Drive at', time)
      } else {
        const err = await res.json()
        console.error('Sync failed:', err)
      }
    } catch (e) {
      console.error('Sync error:', e)
    } finally {
      setSyncing(false)
    }
  }, [driveConnected, syncing])

  const restoreFromDrive = useCallback(async () => {
    if (!driveConnected) return
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/drive')
      const { data } = await res.json()

      if (!data) {
        alert('No hay backup en Google Drive')
        return
      }

      // Merge: add records that don't exist locally
      if (data.events?.length) {
        const localIds = new Set((await db.events.toArray()).map(e => e.id))
        const newEvents = data.events.filter((e: any) => !localIds.has(e.id))
        if (newEvents.length) await db.events.bulkAdd(newEvents)
        console.log(`📥 Restored ${newEvents.length} new events`)
      }
      if (data.clients?.length) {
        const localIds = new Set((await db.clients.toArray()).map(c => c.id))
        const newClients = data.clients.filter((c: any) => !localIds.has(c.id))
        if (newClients.length) await db.clients.bulkAdd(newClients)
      }
      if (data.jobs?.length) {
        const localIds = new Set((await db.jobs.toArray()).map(j => j.id))
        const newJobs = data.jobs.filter((j: any) => !localIds.has(j.id))
        if (newJobs.length) await db.jobs.bulkAdd(newJobs)
      }
      if (data.employees?.length) {
        const localIds = new Set((await db.employees.toArray()).map(e => e.id))
        const newEmps = data.employees.filter((e: any) => !localIds.has(e.id))
        if (newEmps.length) await db.employees.bulkAdd(newEmps)
      }

      setLastSync(new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }))
      alert('✅ Datos restaurados desde Google Drive')
    } catch (e) {
      console.error('Restore error:', e)
      alert('❌ Error restaurando datos')
    } finally {
      setSyncing(false)
    }
  }, [driveConnected])

  // Check Drive connection on mount + check URL params
  useEffect(() => {
    checkDriveConnection()

    // Check if just connected
    const params = new URLSearchParams(window.location.search)
    const googleStatus = params.get('google')
    if (googleStatus === 'connected') {
      setDriveConnected(true)
      setMessages(prev => [...prev, { role: 'assistant', content: '✅ Google Drive conectado. Tus datos se respaldarán automáticamente.' }])
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } else if (googleStatus?.startsWith('error')) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error conectando Google Drive. Intenta de nuevo desde el menú.' }])
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [checkDriveConnection])

  // ============ SPEECH ============
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'es-PR'
    recognition.continuous = false    // Un resultado a la vez
    recognition.interimResults = false // Solo resultados finales (evita duplicados)

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript || ''
      if (transcript) {
        setInput(prev => (prev.trim() ? prev.trim() + ' ' : '') + transcript)
      }
    }
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech error:', e.error)
      }
      setIsListening(false)
    }
    recognition.onend = () => {
      // En modo no-continuous, reiniciar si aún está "listening"
      if (recognitionRef.current?._active) {
        try { recognition.start() } catch {}
      } else {
        setIsListening(false)
      }
    }
    recognitionRef.current = recognition
  }, [])

  const toggleListening = useCallback(() => {
    const r = recognitionRef.current
    if (!r) { alert('Tu navegador no soporta dictado. Usa Chrome.'); return }
    if (isListening) {
      r._active = false
      r.stop()
      setIsListening(false)
    } else {
      r._active = true
      try { r.start(); setIsListening(true) } catch {}
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current._active = false
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
            return `[${d}] ${e.type} ${e.category || e.subtype} $${e.amount} (${e.payment_method || 'N/A'}) ${e.vendor || e.client || e.note || ''}`
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
        const total = events.length + jobs.length
        if (total > 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ ${events.length} eventos + ${jobs.length} trabajos cargados.` }])
        }
      } catch (e) { console.error('Context error:', e) }
    }
    load()
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ============ FOTOS ============
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) {
      const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f) })
      const compressed = await compressImage(b64)
      setPendingPhotos(prev => [...prev, compressed])
    }
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
        body: JSON.stringify({ messages: apiMessages.map(m => ({ role: m.role, content: m.content, photos: m.photos })) })
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()

      // ====== REPORTS ======
      if (data?.type === 'GENERATE_PL') {
        const { period, periodLabel } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month', periodLabel)
        generatePLReport(await db.events.toArray(), await db.jobs.toArray(), startDate, endDate, periodLabel || 'este mes')
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ P&L: ${periodLabel || period}` }])
        return
      }
      if (data?.type === 'GENERATE_AR') {
        generateARReport(await db.jobs.toArray(), await db.clients.toArray())
        setMessages(prev => [...prev, { role: 'assistant', content: '✅ Cuentas por Cobrar generado' }])
        return
      }
      if (data?.type === 'GENERATE_PAYMENT_REPORT') {
        const { paymentMethod, period } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month')
        generatePaymentMethodReport(await db.events.toArray(), paymentMethod, startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte ${paymentMethod}` }])
        return
      }
      if (data?.type === 'GENERATE_PDF') {
        const { category, period } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month')
        generateCategoryReport(await db.events.toArray(), category || 'general', startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte: ${category} (${period})` }])
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
            timestamp: Date.now(), type: (ed.type || 'expense') as 'expense' | 'income',
            status: 'completed' as const, subtype: ed.subtype || '', category: ed.category || '',
            amount: Number(ed.amount || 0), payment_method: pm, vendor: ed.vendor || '',
            vehicle_id: ed.vehicle_id || '', client: ed.client || '',
            note: ed.note || ed.description || '', raw_text: assistantText,
            photo: userMessage.photos?.[0]
          }
          await db.events.add(saved)
          dbContextRef.current = `[${new Date().toLocaleDateString('es-PR')}] ${saved.type} ${saved.category} $${saved.amount} (${pm}) ${saved.vendor || saved.client}\n` + dbContextRef.current

          const clean = assistantText.replace(/SAVE_EVENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ ${saved.type === 'income' ? 'Ingreso' : 'Gasto'}: ${saved.category} $${saved.amount}` }])

          // AUTO-SYNC TO DRIVE
          syncToDrive()
          return
        } catch (e) {
          console.error('SAVE_EVENT error:', e)
          setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando.' }])
          return
        }
      }

      // ====== SAVE_JOB ======
      const jobMatch = assistantText.match(/SAVE_JOB:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (jobMatch) {
        try {
          const jd = JSON.parse(jobMatch[1])
          let clientId = 0
          if (jd.client_name) {
            const parts = jd.client_name.split(' ')
            const existing = await db.clients.where('first_name').equals(parts[0]).first()
            if (existing?.id) { clientId = existing.id }
            else { clientId = await db.clients.add({ first_name: parts[0], last_name: parts.slice(1).join(' '), type: 'residential', active: true, created_at: Date.now() }) as number }
          }
          await db.jobs.add({
            client_id: clientId, date: Date.now(), type: jd.type || 'maintenance', status: 'completed',
            services: jd.services || [], materials: jd.materials || [], employees: jd.employees || [],
            subtotal_services: (jd.services || []).reduce((s: number, sv: any) => s + (sv.total || 0), 0),
            subtotal_materials: (jd.materials || []).reduce((s: number, m: any) => s + (m.unit_price * m.quantity), 0),
            total_charged: jd.total_charged || 0, payment_status: jd.payment_status || 'pending',
            payments: jd.payments || [], balance_due: jd.balance_due || jd.total_charged || 0, created_at: Date.now()
          })
          if (jd.deposit > 0) {
            await db.events.add({ timestamp: Date.now(), type: 'income', status: 'completed', category: 'Depósito', amount: jd.deposit, payment_method: jd.deposit_method || 'cash', client: jd.client_name, note: 'Depósito trabajo', raw_text: assistantText })
          }
          const clean = assistantText.replace(/SAVE_JOB:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Trabajo: ${jd.client_name} $${jd.total_charged}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_JOB error:', e); setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando trabajo.' }]); return }
      }

      // ====== SAVE_PAYMENT ======
      const payMatch = assistantText.match(/SAVE_PAYMENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (payMatch) {
        try {
          const pd = JSON.parse(payMatch[1])
          await db.events.add({ timestamp: Date.now(), type: 'income', status: 'completed', category: 'Cobro', amount: pd.amount, payment_method: String(pd.method || 'cash').toLowerCase().replace(/\s+/g, '_'), client: pd.client_name || '', note: pd.job_reference || '', raw_text: assistantText })
          if (pd.client_name) {
            const parts = pd.client_name.split(' ')
            const client = await db.clients.where('first_name').equals(parts[0]).first()
            if (client?.id) {
              const pendingJobs = await db.jobs.where('client_id').equals(client.id).filter(j => j.payment_status !== 'paid').toArray()
              if (pendingJobs.length > 0) {
                const job = pendingJobs[0]
                const updPayments = [...job.payments, { date: Date.now(), amount: pd.amount, method: pd.method || 'cash' }]
                const totalPaid = updPayments.reduce((s, p) => s + p.amount, 0)
                const bal = job.total_charged - totalPaid
                await db.jobs.update(job.id!, { payments: updPayments, balance_due: Math.max(0, bal), payment_status: bal <= 0 ? 'paid' : 'partial' })
              }
            }
          }
          const clean = assistantText.replace(/SAVE_PAYMENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Cobro: $${pd.amount} de ${pd.client_name}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_PAYMENT error:', e); setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error registrando pago.' }]); return }
      }

      // ====== SAVE_EMPLOYEE_PAYMENT ======
      const empMatch = assistantText.match(/SAVE_EMPLOYEE_PAYMENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (empMatch) {
        try {
          const ep = JSON.parse(empMatch[1])
          await db.events.add({ timestamp: Date.now(), type: 'expense', status: 'completed', subtype: 'payroll', category: 'Nómina', amount: ep.net, payment_method: String(ep.payment_method || 'cash').toLowerCase().replace(/\s+/g, '_'), note: `${ep.employee_name} ${ep.days}d×$${ep.daily_rate}=$${ep.gross}-${ep.retention}ret=$${ep.net} | ${ep.job_reference || ''}`, raw_text: assistantText })
          const clean = assistantText.replace(/SAVE_EMPLOYEE_PAYMENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Nómina: ${ep.employee_name} $${ep.net}` }])
          syncToDrive()
          return
        } catch (e) { console.error('EMP_PAY error:', e); return }
      }

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
      {/* HEADER - FIXED */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">💬 Cooling Solution</h1>
          {/* SYNC STATUS */}
          <div className="flex items-center gap-2 text-xs mt-0.5 opacity-80">
            {driveConnected ? (
              <>
                <span className="w-2 h-2 bg-green-400 rounded-full inline-block"></span>
                <span>Drive {syncing ? 'sincronizando...' : lastSync ? `sync ${lastSync}` : 'conectado'}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 bg-yellow-400 rounded-full inline-block"></span>
                <span>Drive no conectado</span>
              </>
            )}
          </div>
        </div>
        <button onClick={() => setShowMenu(!showMenu)} className="text-3xl w-10 h-10 flex items-center justify-center">☰</button>
      </div>

      {/* MENU */}
      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowMenu(false)} />
          <div className="fixed top-16 right-4 bg-white dark:bg-[#111a2e] rounded-lg shadow-2xl z-50 w-60 overflow-hidden border border-black/10 dark:border-white/10">
            <button onClick={() => { setShowMenu(false); onNavigate('capture') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">📝 Captura Rápida</button>
            <button onClick={() => { setShowMenu(false); onNavigate('ask') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">🔍 Consultas</button>
            <button onClick={() => { setShowMenu(false); onNavigate('history') }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">📊 Historial</button>
            <button onClick={async () => {
              setShowMenu(false)
              const d = new Date()
              generatePLReport(await db.events.toArray(), await db.jobs.toArray(), new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Date.now(), 'este mes')
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ P&L del mes' }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">📈 P&L del Mes</button>
            <button onClick={async () => {
              setShowMenu(false)
              generateARReport(await db.jobs.toArray(), await db.clients.toArray())
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ Cuentas por Cobrar' }])
            }} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">💰 ¿Quién me Debe?</button>

            {/* GOOGLE DRIVE SECTION */}
            <div className="border-t-2 dark:border-white/10">
              {driveConnected ? (
                <>
                  <button onClick={() => { setShowMenu(false); syncToDrive() }} disabled={syncing} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 border-b dark:border-white/5">
                    {syncing ? '⏳ Sincronizando...' : '☁️ Sync Ahora'}
                  </button>
                  <button onClick={() => { setShowMenu(false); restoreFromDrive() }} disabled={syncing} className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10">
                    📥 Restaurar de Drive
                  </button>
                </>
              ) : (
                <a href="/api/auth/google" className="block w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-blue-500 font-medium">
                  ☁️ Conectar Google Drive
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {/* MENSAJES */}
      <div className="flex-1 overflow-y-auto p-4 pb-40">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 dark:bg-[#111a2e] dark:text-gray-100'}`}>
                {msg.photos?.length ? (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {msg.photos.map((p, i) => <img key={i} src={p} alt="" className="w-24 h-24 object-cover rounded-lg" />)}
                  </div>
                ) : null}
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