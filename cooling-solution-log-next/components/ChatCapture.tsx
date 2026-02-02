'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import {
  generateCategoryReport,
  generatePLReport,
  generateARReport,
  generatePaymentMethodReport,
  generateInvoiceNumber
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

function formatCurrency(n: number): string { return `$${n.toFixed(2)}` }

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
  const [isOnline, setIsOnline] = useState(true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)
  const driveConnectedRef = useRef(false)
  const syncingRef = useRef(false)

  useEffect(() => { driveConnectedRef.current = driveConnected }, [driveConnected])

  // ============ AUTO-RESIZE TEXTAREA ============
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  useEffect(() => { autoResize() }, [input, autoResize])

  // ============ ONLINE/OFFLINE DETECTION ============
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const goOnline = () => {
      setIsOnline(true)
      console.log('🌐 Online — processing sync queue')
      processSyncQueue()
    }
    const goOffline = () => {
      setIsOnline(false)
      console.log('📴 Offline')
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Check pending sync count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await db.sync_queue.where('status').equals('pending').count()
      setPendingSyncCount(count)
    } catch { setPendingSyncCount(0) }
  }, [])

  useEffect(() => {
    updatePendingCount()
    const interval = setInterval(updatePendingCount, 30000)
    return () => clearInterval(interval)
  }, [updatePendingCount])

  // ============ SYNC QUEUE PROCESSING ============
  const processSyncQueue = useCallback(async () => {
    if (!driveConnectedRef.current || syncingRef.current || !navigator.onLine) return
    const pending = await db.sync_queue.where('status').equals('pending').toArray()
    if (pending.length === 0) return

    console.log(`☁️ Processing ${pending.length} pending syncs`)
    syncingRef.current = true
    setSyncing(true)

    try {
      const events = await db.events.toArray()
      const clients = await db.clients.toArray()
      const jobs = await db.jobs.toArray()
      const employees = await db.employees.toArray()
      const vehicles = await db.vehicles.toArray()
      const contracts = await db.contracts.toArray()
      const notes = await db.notes.toArray()
      const appointments = await db.appointments.toArray()
      const reminders = await db.reminders.toArray()
      const invoices = await db.invoices.toArray()
      const job_templates = await db.job_templates.toArray()

      const res = await fetch('/api/sync/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, clients, jobs, employees, vehicles, contracts, notes, appointments, reminders, invoices, job_templates })
      })

      if (res.ok) {
        await Promise.all(pending.map(p => db.sync_queue.update(p.id!, { status: 'synced' })))
        const synced = await db.sync_queue.where('status').equals('synced').toArray()
        if (synced.length > 10) {
          const toDelete = synced.slice(0, synced.length - 5).map(s => s.id!)
          await db.sync_queue.bulkDelete(toDelete)
        }
        const time = new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
        setLastSync(time)
        setPendingSyncCount(0)
        console.log('☁️ Queue processed, synced at', time)
      } else {
        console.error('☁️ Queue sync failed')
      }
    } catch (e) {
      console.error('☁️ Queue sync error:', e)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [])

  // ============ GOOGLE DRIVE SYNC ============
  const checkDriveConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status')
      const data = await res.json()
      setDriveConnected(data.connected)
      driveConnectedRef.current = data.connected
    } catch {
      setDriveConnected(false)
      driveConnectedRef.current = false
    }
  }, [])

  const syncToDrive = useCallback(async () => {
    await db.sync_queue.add({ timestamp: Date.now(), status: 'pending', retries: 0 })
    updatePendingCount()

    if (!driveConnectedRef.current || syncingRef.current) return
    if (!navigator.onLine) {
      console.log('📴 Offline — queued for later')
      return
    }

    syncingRef.current = true
    setSyncing(true)
    try {
      // 1. Get local data
      const localEvents = await db.events.toArray()
      const localClients = await db.clients.toArray()
      const localJobs = await db.jobs.toArray()
      const localEmployees = await db.employees.toArray()
      const localVehicles = await db.vehicles.toArray()
      const localContracts = await db.contracts.toArray()
      const localNotes = await db.notes.toArray()
      const localAppointments = await db.appointments.toArray()
      const localReminders = await db.reminders.toArray()
      const localInvoices = await db.invoices.toArray()
      const localTemplates = await db.job_templates.toArray()

      // 2. Fetch remote data from Drive
      let remoteData: any = {}
      try {
        const fetchRes = await fetch('/api/sync/drive')
        if (fetchRes.ok) {
          const { data } = await fetchRes.json()
          if (data) remoteData = data
        }
      } catch { /* no remote data yet */ }

      // 3. Merge function: combine local + remote, newer timestamp wins for conflicts
      const mergeArrays = (local: any[], remote: any[], idKey = 'id', tsKey = 'timestamp') => {
        const merged = new Map()
        // Add all local items
        local.forEach(item => {
          if (item[idKey]) merged.set(item[idKey], item)
        })
        // Add/update with remote items (if newer or not exists)
        ;(remote || []).forEach((item: any) => {
          if (!item[idKey]) return
          const existing = merged.get(item[idKey])
          if (!existing) {
            merged.set(item[idKey], item)
          } else {
            // Keep the one with newer timestamp (or updated_at)
            const localTs = existing[tsKey] || existing.updated_at || existing.created_at || 0
            const remoteTs = item[tsKey] || item.updated_at || item.created_at || 0
            if (remoteTs > localTs) {
              merged.set(item[idKey], item)
            }
          }
        })
        return Array.from(merged.values())
      }

      // 4. Merge all tables
      const mergedEvents = mergeArrays(localEvents, remoteData.events)
      const mergedClients = mergeArrays(localClients, remoteData.clients, 'id', 'created_at')
      const mergedJobs = mergeArrays(localJobs, remoteData.jobs, 'id', 'created_at')
      const mergedEmployees = mergeArrays(localEmployees, remoteData.employees, 'id', 'created_at')
      const mergedVehicles = mergeArrays(localVehicles, remoteData.vehicles, 'id', 'created_at')
      const mergedContracts = mergeArrays(localContracts, remoteData.contracts, 'id', 'created_at')
      const mergedNotes = mergeArrays(localNotes, remoteData.notes, 'id', 'updated_at')
      const mergedAppointments = mergeArrays(localAppointments, remoteData.appointments, 'id', 'created_at')
      const mergedReminders = mergeArrays(localReminders, remoteData.reminders, 'id', 'created_at')
      const mergedInvoices = mergeArrays(localInvoices, remoteData.invoices, 'id', 'updated_at')
      const mergedTemplates = mergeArrays(localTemplates, remoteData.job_templates, 'id', 'updated_at')

      // 5. Push merged data to Drive
      const res = await fetch('/api/sync/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: mergedEvents,
          clients: mergedClients,
          jobs: mergedJobs,
          employees: mergedEmployees,
          vehicles: mergedVehicles,
          contracts: mergedContracts,
          notes: mergedNotes,
          appointments: mergedAppointments,
          reminders: mergedReminders,
          invoices: mergedInvoices,
          job_templates: mergedTemplates
        })
      })

      // 6. Update local DB with any new remote items
      if (res.ok) {
        // Add any remote items that weren't in local
        const addNewItems = async (table: any, local: any[], merged: any[]) => {
          const localIds = new Set(local.map(i => i.id))
          const newItems = merged.filter(i => i.id && !localIds.has(i.id))
          if (newItems.length > 0) {
            await table.bulkPut(newItems)
          }
        }
        
        await addNewItems(db.events, localEvents, mergedEvents)
        await addNewItems(db.clients, localClients, mergedClients)
        await addNewItems(db.jobs, localJobs, mergedJobs)
        await addNewItems(db.employees, localEmployees, mergedEmployees)
        await addNewItems(db.vehicles, localVehicles, mergedVehicles)
        await addNewItems(db.contracts, localContracts, mergedContracts)
        await addNewItems(db.notes, localNotes, mergedNotes)
        await addNewItems(db.appointments, localAppointments, mergedAppointments)
        await addNewItems(db.reminders, localReminders, mergedReminders)
        await addNewItems(db.invoices, localInvoices, mergedInvoices)
        await addNewItems(db.job_templates, localTemplates, mergedTemplates)

        const pending = await db.sync_queue.where('status').equals('pending').toArray()
        await Promise.all(pending.map(p => db.sync_queue.update(p.id!, { status: 'synced' })))
        const time = new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
        setLastSync(time)
        setPendingSyncCount(0)
        console.log('☁️ Synced (merged) at', time)
      } else {
        const err = await res.json()
        console.error('Sync failed:', err)
      }
    } catch (e) {
      console.error('Sync error:', e)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [updatePendingCount])

  const restoreFromDrive = useCallback(async () => {
    if (!driveConnectedRef.current) return
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/drive')
      const { data } = await res.json()
      if (!data) { alert('No hay backup en Google Drive'); return }

      if (data.events?.length) {
        const localIds = new Set((await db.events.toArray()).map(e => e.id))
        const newItems = data.events.filter((e: any) => !localIds.has(e.id))
        if (newItems.length) await db.events.bulkAdd(newItems)
      }
      if (data.clients?.length) {
        const localIds = new Set((await db.clients.toArray()).map(c => c.id))
        const newItems = data.clients.filter((c: any) => !localIds.has(c.id))
        if (newItems.length) await db.clients.bulkAdd(newItems)
      }
      if (data.jobs?.length) {
        const localIds = new Set((await db.jobs.toArray()).map(j => j.id))
        const newItems = data.jobs.filter((j: any) => !localIds.has(j.id))
        if (newItems.length) await db.jobs.bulkAdd(newItems)
      }
      if (data.notes?.length) {
        const localIds = new Set((await db.notes.toArray()).map(n => n.id))
        const newItems = data.notes.filter((n: any) => !localIds.has(n.id))
        if (newItems.length) await db.notes.bulkAdd(newItems)
      }
      if (data.appointments?.length) {
        const localIds = new Set((await db.appointments.toArray()).map(a => a.id))
        const newItems = data.appointments.filter((a: any) => !localIds.has(a.id))
        if (newItems.length) await db.appointments.bulkAdd(newItems)
      }
      if (data.reminders?.length) {
        const localIds = new Set((await db.reminders.toArray()).map(r => r.id))
        const newItems = data.reminders.filter((r: any) => !localIds.has(r.id))
        if (newItems.length) await db.reminders.bulkAdd(newItems)
      }
      if (data.invoices?.length) {
        const localIds = new Set((await db.invoices.toArray()).map(i => i.id))
        const newItems = data.invoices.filter((i: any) => !localIds.has(i.id))
        if (newItems.length) await db.invoices.bulkAdd(newItems)
      }
      if (data.job_templates?.length) {
        const localIds = new Set((await db.job_templates.toArray()).map(t => t.id))
        const newItems = data.job_templates.filter((t: any) => !localIds.has(t.id))
        if (newItems.length) await db.job_templates.bulkAdd(newItems)
      }

      setLastSync(new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' }))
      alert('✅ Datos restaurados desde Google Drive')
    } catch (e) {
      console.error('Restore error:', e)
      alert('❌ Error restaurando datos')
    } finally {
      setSyncing(false)
    }
  }, [])

  // On mount: check Drive + URL params
  useEffect(() => {
    checkDriveConnection()
    const params = new URLSearchParams(window.location.search)
    const gs = params.get('google')
    if (gs === 'connected') {
      setDriveConnected(true)
      driveConnectedRef.current = true
      setMessages(prev => [...prev, { role: 'assistant', content: '✅ Google Drive conectado. Respaldo automático activado.' }])
      window.history.replaceState({}, '', window.location.pathname)
    } else if (gs?.startsWith('error')) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error conectando Google Drive. Intenta de nuevo.' }])
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [checkDriveConnection])

  // ============ SPEECH - FIXED (no duplicates) ============
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'es-PR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript || ''
      if (transcript.trim()) {
        setInput(prev => {
          const existing = prev.trim()
          return existing ? existing + ' ' + transcript.trim() : transcript.trim()
        })
      }
    }

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech error:', e.error)
        setIsListening(false)
      }
    }

    recognition.onend = () => {
      if (recognitionRef.current?._active) {
        setTimeout(() => {
          if (recognitionRef.current?._active) {
            try { recognition.start() } catch {}
          }
        }, 100)
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
      try { r.stop() } catch {}
      setIsListening(false)
    } else {
      r._active = true
      try { r.start(); setIsListening(true) } catch {}
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current._active = false
      try { recognitionRef.current.stop() } catch {}
      setIsListening(false)
    }
  }, [])

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
            return `[${d}] ${e.type} ${e.category || e.subtype} $${e.amount} (${e.payment_method || 'N/A'}) ${e.vendor || e.client || e.note || ''} ${e.expense_type === 'personal' ? '[PERSONAL]' : ''}`
          }).join('\n')
        }
        if (jobs.length > 0) {
          ctx += '\n\nTRABAJOS:\n' + jobs.map(j => {
            const d = new Date(j.date).toLocaleDateString('es-PR')
            const paid = j.payments?.reduce((s: number, p: any) => s + p.amount, 0) || 0
            return `[${d}] ${j.type} Cliente#${j.client_id} Total:$${j.total_charged} Pagado:$${paid} Status:${j.payment_status}`
          }).join('\n')
        }

        // Add appointments context
        try {
          const appts = await db.appointments.where('status').equals('scheduled').toArray()
          if (appts.length > 0) {
            ctx += '\n\nCITAS PROGRAMADAS:\n' + appts.map(a => {
              const d = new Date(a.date)
              return `[${d.toLocaleDateString('es-PR')} ${d.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}] ${a.title} ${a.client_name ? '- ' + a.client_name : ''} ${a.location ? '@ ' + a.location : ''}`
            }).join('\n')
          }
        } catch {}

        // Add reminders context
        try {
          const rems = await db.reminders.where('completed').equals(0).toArray()
          if (rems.length > 0) {
            ctx += '\n\nRECORDATORIOS PENDIENTES:\n' + rems.map(r => {
              const d = new Date(r.due_date)
              return `[${d.toLocaleDateString('es-PR')}] ${r.text} (${r.priority})`
            }).join('\n')
          }
        } catch {}

        // Add templates context
        try {
          const templates = await db.job_templates.where('active').equals(1).toArray()
          if (templates.length > 0) {
            ctx += '\n\nTEMPLATES DISPONIBLES:\n' + templates.map(t => {
              const total = t.items.reduce((s: number, i: any) => s + (i.quantity * i.unit_price), 0)
              return `[${t.name}] ${t.client_name ? 'Cliente: ' + t.client_name + ' ' : ''}Total: $${total.toFixed(2)} Items: ${t.items.length}`
            }).join('\n')
          }
        } catch {}

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
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    if (!navigator.onLine) {
      await db.sync_queue.add({ timestamp: Date.now(), status: 'pending' } as any)
      setLoading(false)
      return
    }

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

      // ====== SAVE_NOTE ======
      const noteMatch = assistantText.match(/SAVE_NOTE:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (noteMatch) {
        try {
          const nd = JSON.parse(noteMatch[1])
          const now = Date.now()
          await db.notes.add({
            timestamp: now,
            title: nd.title || undefined,
            content: nd.content || '',
            updated_at: now
          })
          const clean = assistantText.replace(/SAVE_NOTE:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Nota guardada: ${nd.title || nd.content.substring(0, 40)}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_NOTE error:', e) }
      }

      // ====== SAVE_APPOINTMENT ======
      const apptMatch = assistantText.match(/SAVE_APPOINTMENT:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (apptMatch) {
        try {
          const ad = JSON.parse(apptMatch[1])
          const apptDate = new Date(ad.date).getTime()
          const now = Date.now()
          await db.appointments.add({
            timestamp: now,
            date: apptDate,
            title: ad.title || 'Cita',
            client_name: ad.client_name || undefined,
            location: ad.location || undefined,
            notes: ad.notes || undefined,
            status: 'scheduled',
            reminder_minutes: ad.reminder_minutes || 60,
            created_at: now
          })
          // Update context with new appointment
          dbContextRef.current += `\n[CITA] ${new Date(apptDate).toLocaleDateString('es-PR')} ${new Date(apptDate).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })} ${ad.title} ${ad.client_name || ''}`
          const clean = assistantText.replace(/SAVE_APPOINTMENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Cita: ${ad.title} - ${new Date(apptDate).toLocaleDateString('es-PR')}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_APPOINTMENT error:', e) }
      }

      // ====== SAVE_REMINDER ======
      const remMatch = assistantText.match(/SAVE_REMINDER:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (remMatch) {
        try {
          const rd = JSON.parse(remMatch[1])
          const dueDate = new Date(rd.due_date).getTime()
          const now = Date.now()
          await db.reminders.add({
            timestamp: now,
            text: rd.text || '',
            due_date: dueDate,
            completed: false,
            priority: rd.priority || 'normal',
            created_at: now
          })
          const clean = assistantText.replace(/SAVE_REMINDER:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Recordatorio: ${rd.text}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_REMINDER error:', e) }
      }

      // ====== SAVE_INVOICE ======
      const invoiceMatch = assistantText.match(/SAVE_INVOICE:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (invoiceMatch) {
        try {
          const id = JSON.parse(invoiceMatch[1])
          const now = Date.now()
          const items = (id.items || []).map((i: any) => ({ description: i.description, quantity: i.quantity || 1, unit_price: i.unit_price || 0, total: i.total || (i.quantity || 1) * (i.unit_price || 0) }))
          const subtotal = items.reduce((s: number, i: any) => s + i.total, 0)
          const taxRate = id.tax_rate || 0
          const taxAmount = subtotal * (taxRate / 100)
          await db.invoices.add({
            invoice_number: generateInvoiceNumber('invoice'),
            type: 'invoice',
            client_name: id.client_name || '',
            client_phone: id.client_phone || undefined,
            client_email: id.client_email || undefined,
            client_address: id.client_address || undefined,
            items,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total: subtotal + taxAmount,
            notes: id.notes || undefined,
            status: 'draft',
            issue_date: now,
            due_date: now + (id.due_days || 30) * 86400000,
            created_at: now,
            updated_at: now
          })
          const clean = assistantText.replace(/SAVE_INVOICE:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Factura creada para ${id.client_name} — ${formatCurrency(subtotal + taxAmount)}. Ve a 🧾 Facturas para preview y enviar.` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_INVOICE error:', e) }
      }

      // ====== SAVE_QUOTE ======
      const quoteMatch = assistantText.match(/SAVE_QUOTE:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i)
      if (quoteMatch) {
        try {
          const qd = JSON.parse(quoteMatch[1])
          const now = Date.now()
          const items = (qd.items || []).map((i: any) => ({ description: i.description, quantity: i.quantity || 1, unit_price: i.unit_price || 0, total: i.total || (i.quantity || 1) * (i.unit_price || 0) }))
          const subtotal = items.reduce((s: number, i: any) => s + i.total, 0)
          const taxRate = qd.tax_rate || 0
          const taxAmount = subtotal * (taxRate / 100)
          await db.invoices.add({
            invoice_number: generateInvoiceNumber('quote'),
            type: 'quote',
            client_name: qd.client_name || '',
            client_phone: qd.client_phone || undefined,
            client_email: qd.client_email || undefined,
            client_address: qd.client_address || undefined,
            items,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total: subtotal + taxAmount,
            notes: qd.notes || undefined,
            status: 'draft',
            issue_date: now,
            expiration_date: now + (qd.valid_days || 15) * 86400000,
            created_at: now,
            updated_at: now
          })
          const clean = assistantText.replace(/SAVE_QUOTE:\s*\{[\s\S]*?\}\s*/i, '').trim()
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ Cotización creada para ${qd.client_name} — ${formatCurrency(subtotal + taxAmount)}. Ve a 🧾 Facturas > Cotizaciones para preview.` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_QUOTE error:', e) }
      }

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
            photo: userMessage.photos?.[0],
            expense_type: (ed.expense_type || 'business') as 'personal' | 'business'
          }
          await db.events.add(saved)
          dbContextRef.current = `[${new Date().toLocaleDateString('es-PR')}] ${saved.type} ${saved.category} $${saved.amount} (${pm}) ${saved.vendor || saved.client} ${saved.expense_type === 'personal' ? '[PERSONAL]' : ''}\n` + dbContextRef.current
          const clean = assistantText.replace(/SAVE_EVENT:\s*\{[\s\S]*?\}\s*/i, '').trim()
          const personalTag = saved.expense_type === 'personal' ? ' [Personal]' : ''
          setMessages(prev => [...prev, { role: 'assistant', content: clean || `✅ ${saved.type === 'income' ? 'Ingreso' : 'Gasto'}: ${saved.category} $${saved.amount}${personalTag}` }])
          syncToDrive()
          return
        } catch (e) { console.error('SAVE_EVENT error:', e); setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error guardando.' }]); return }
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
            subtotal_materials: (jd.materials || []).reduce((s: number, m: any) => s + ((m.unit_price || 0) * (m.quantity || 0)), 0),
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
        } catch (e) { console.error('SAVE_PAYMENT error:', e); return }
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
    <div className="flex flex-col h-screen bg-[#0b1220] text-gray-100">
      {/* HEADER - STICKY */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold">💬 Cooling Solution</h1>
          <div className="flex items-center gap-2 text-xs mt-0.5 opacity-80">
            {!isOnline && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                Sin conexión
                {pendingSyncCount > 0 && <span className="bg-red-500/30 px-1.5 rounded text-red-200">{pendingSyncCount} pendiente{pendingSyncCount > 1 ? 's' : ''}</span>}
              </span>
            )}
            {isOnline && driveConnected && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                {syncing ? 'Sincronizando...' : lastSync ? `Sync ${lastSync}` : 'Drive conectado'}
                {pendingSyncCount > 0 && <span className="bg-yellow-500/30 px-1.5 rounded text-yellow-200">{pendingSyncCount} pendiente{pendingSyncCount > 1 ? 's' : ''}</span>}
              </span>
            )}
            {isOnline && !driveConnected && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                Drive no conectado
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowMenu(!showMenu)} className="text-3xl w-10 h-10 flex items-center justify-center">☰</button>
      </div>

      {/* MENU - FIXED position, dark theme */}
      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowMenu(false)} />
          <div className="fixed top-16 right-4 bg-[#111a2e] rounded-xl shadow-2xl z-50 w-60 overflow-hidden border border-white/10">
            <button onClick={() => { setShowMenu(false); onNavigate('dashboard') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📊 Dashboard</button>
            <button onClick={() => { setShowMenu(false); onNavigate('clients') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">👥 Clientes</button>
            <button onClick={() => { setShowMenu(false); onNavigate('invoices') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">🧾 Facturas</button>
            <button onClick={() => { setShowMenu(false); onNavigate('templates') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📋 Templates</button>
            <button onClick={() => { setShowMenu(false); onNavigate('calendar') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📅 Calendario</button>
            <button onClick={() => { setShowMenu(false); onNavigate('notes') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📝 Notas</button>
            <button onClick={() => { setShowMenu(false); onNavigate('search') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">🔍 Buscar</button>
            <button onClick={() => { setShowMenu(false); onNavigate('history') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📋 Historial</button>
            <button onClick={async () => {
              setShowMenu(false)
              const d = new Date()
              generatePLReport(await db.events.toArray(), await db.jobs.toArray(), new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Date.now(), 'este mes')
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ P&L del mes' }])
            }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">📈 P&L del Mes</button>
            <button onClick={async () => {
              setShowMenu(false)
              generateARReport(await db.jobs.toArray(), await db.clients.toArray())
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ Cuentas por Cobrar' }])
            }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">💰 ¿Quién me Debe?</button>

            {/* Drive Section */}
            <div className="border-t border-white/10">
              {driveConnected ? (
                <>
                  <button onClick={() => { setShowMenu(false); syncToDrive() }} disabled={syncing} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5 disabled:opacity-50">
                    {syncing ? '⏳ Sincronizando...' : '☁️ Sync Ahora'}
                  </button>
                  <button onClick={() => { setShowMenu(false); restoreFromDrive() }} disabled={syncing} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 disabled:opacity-50">
                    📥 Restaurar de Drive
                  </button>
                </>
              ) : (
                <a href="/api/auth/google" className="block w-full text-left px-4 py-3 text-blue-400 hover:bg-white/10 font-medium">
                  ☁️ Conectar Google Drive
                </a>
              )}
            </div>
          </div>
        </>
      )}

      {/* MENSAJES */}
      <div className="flex-1 overflow-y-auto p-4 pb-44">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#111a2e] text-gray-100 border border-white/5'
              }`}>
                {msg.photos?.length ? (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {msg.photos.map((p, i) => <img key={i} src={p} alt="" className="w-24 h-24 object-cover rounded-lg" />)}
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#111a2e] rounded-2xl px-4 py-3 shadow border border-white/5">
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
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-white/10 z-20">
        {pendingPhotos.length > 0 && (
          <div className="flex gap-2 p-3 bg-[#1a2332] border-b border-white/10 overflow-x-auto">
            {pendingPhotos.map((p, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={p} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-blue-400" />
                <button onClick={() => setPendingPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
              </div>
            ))}
          </div>
        )}

        {isListening && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border-b border-white/10">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-red-400 font-medium">Dictando...</span>
            <span className="text-xs text-gray-500 ml-auto">Toca 🎤 para parar</span>
          </div>
        )}

        <div className="max-w-2xl mx-auto flex items-end gap-1.5 p-3">
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="bg-[#1a2332] hover:bg-[#222d3e] rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:opacity-50 flex-shrink-0 transition-colors">📷</button>
          <button onClick={toggleListening} disabled={loading} className={`rounded-full w-11 h-11 flex items-center justify-center text-lg flex-shrink-0 transition-all ${isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50' : 'bg-[#1a2332] hover:bg-[#222d3e] disabled:opacity-50'}`}>🎤</button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isListening ? 'Dictando... habla ahora' : 'Escribe aquí...'}
            rows={1}
            className="flex-1 border border-white/10 rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[#0b1220] text-gray-100 text-sm resize-none overflow-hidden placeholder-gray-500"
            disabled={loading}
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />

          <button onClick={handleSend} disabled={loading || (!input.trim() && !pendingPhotos.length)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:bg-gray-600 disabled:opacity-50 flex-shrink-0 transition-colors">{loading ? '⏳' : '📤'}</button>
        </div>
      </div>
    </div>
  )
}