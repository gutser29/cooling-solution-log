'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import {
  generateCategoryReport,
  generatePLReport,
  generateARReport,
  generatePaymentMethodReport,
  generatePhotoReport,
  generateInvoiceNumber,
  generateIncomeByClientReport
} from '@/lib/pdfGenerator'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  photos?: string[]
  timestamp?: number
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

// ============ ROBUST JSON EXTRACTOR ============
function extractJSON(text: string, command: string): any {
  const upperText = text.toUpperCase()
  const upperCmd = command.toUpperCase()
  const idx = upperText.indexOf(upperCmd)
  if (idx === -1) return null
  
  const after = text.slice(idx + command.length)
  const start = after.indexOf('{')
  if (start === -1) return null
  
  let depth = 0
  let inString = false
  let escaped = false
  
  for (let i = start; i < after.length; i++) {
    const c = after[i]
    
    if (escaped) {
      escaped = false
      continue
    }
    
    if (c === '\\') {
      escaped = true
      continue
    }
    
    if (c === '"') {
      inString = !inString
      continue
    }
    
    if (inString) continue
    
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        const jsonStr = after.slice(start, i + 1)
        try {
          return JSON.parse(jsonStr)
        } catch (e) {
          console.error('JSON parse error:', e, jsonStr)
          return null
        }
      }
    }
  }
  return null
}

// ============ EXTRACT ALL OCCURRENCES OF A COMMAND ============
function extractAllJSON(text: string, command: string): any[] {
  const results: any[] = []
  let remaining = text
  
  while (true) {
    const data = extractJSON(remaining, command)
    if (!data) break
    results.push(data)
    
    // Remove the processed command from remaining text
    const upperRemaining = remaining.toUpperCase()
    const cmdIdx = upperRemaining.indexOf(command.toUpperCase())
    if (cmdIdx < 0) break
    
    const afterCmd = remaining.slice(cmdIdx)
    const braceStart = afterCmd.indexOf('{')
    if (braceStart < 0) break
    
    let depth = 0
    let end = braceStart
    for (let j = braceStart; j < afterCmd.length; j++) {
      if (afterCmd[j] === '{') depth++
      else if (afterCmd[j] === '}') {
        depth--
        if (depth === 0) {
          end = j + 1
          break
        }
      }
    }
    remaining = remaining.slice(0, cmdIdx) + remaining.slice(cmdIdx + end)
  }
  
  return results
}

// ============ CLEAN ALL COMMANDS FROM TEXT ============
function cleanCommandsFromText(text: string): string {
  const commands = [
    'SAVE_EVENT:', 'SAVE_CLIENT:', 'SAVE_NOTE:', 'SAVE_APPOINTMENT:', 'SAVE_REMINDER:', 
    'SAVE_INVOICE:', 'SAVE_QUOTE:', 'SAVE_JOB_TEMPLATE:', 'SAVE_PHOTO:', 'SAVE_BITACORA:', 
    'SAVE_WARRANTY:', 'SAVE_QUICK_QUOTE:', 'SAVE_JOB:', 'SAVE_PRODUCT:', 'DELETE_EVENT:', 'SAVE_EQUIPMENT:', 'SAVE_MAINTENANCE:'
  ]
  let cleaned = text
  for (const cmd of commands) {
    const regex = new RegExp(
      cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[\\s\\S]*?\\}(?:\\s*\\})?',
      'gi'
    )
    cleaned = cleaned.replace(regex, '')
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}

export default function ChatCapture({ onNavigate }: ChatCaptureProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cs_chat_messages')
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return [{ role: 'assistant', content: '¡Hola! ¿Qué quieres registrar? Escribe, dicta 🎤 o envía fotos 📷' }]
  })
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
  const fileInputRef2 = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)
  const dbContextRef = useRef<string>('')
  const contextLoadedRef = useRef(false)
  const driveConnectedRef = useRef(false)
  const syncingRef = useRef(false)
  // ====== Ref para fotos de recibos pendientes ======
  const receiptPhotosRef = useRef<string[]>([])
  const [aiModel, setAiModel] = useState<'auto' | 'gpt' | 'claude'>('auto')
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [todayStats, setTodayStats] = useState({ gastos: 0, ingresos: 0, count: 0 })
  const chatContainerRef = useRef<HTMLDivElement>(null)

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
      if (driveConnectedRef.current) syncToDrive()
    }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await db.sync_queue.where('status').equals('pending').count()
      setPendingSyncCount(pending)
    } catch { setPendingSyncCount(0) }
  }, [])

  useEffect(() => {
    updatePendingCount()
    const interval = setInterval(updatePendingCount, 30000)
    return () => clearInterval(interval)
  }, [updatePendingCount])

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
    if (!driveConnectedRef.current || syncingRef.current) {
      console.log('⏭️ Sync skipped - not connected or already syncing')
      return
    }
    
    if (!navigator.onLine) {
      await db.sync_queue.add({ timestamp: Date.now(), status: 'pending', retries: 0 })
      updatePendingCount()
      console.log('📴 Offline — queued for later')
      return
    }

    syncingRef.current = true
    setSyncing(true)
    try {
      // === DATA SYNC (sin fotos — pasan directo a Drive por separado) ===
      const events = (await db.events.toArray()).map(e => ({ ...e, receipt_photos: undefined, photo: undefined }))
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
      const client_documents = await db.client_documents.toArray()
      const client_locations = await db.client_locations.toArray()
      const bitacora = await db.bitacora.toArray()
      const warranties = await db.warranties.toArray()
      let product_prices: any[] = []
      try { product_prices = await db.table('product_prices').toArray() } catch {}
      let equipment: any[] = []
      try { equipment = await db.table('equipment').toArray() } catch {}
      let maintenance_logs: any[] = []
      try { maintenance_logs = await db.table('maintenance_logs').toArray() } catch {}

      const res = await fetch('/api/sync/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, clients, jobs, employees, vehicles, contracts, notes, appointments, reminders, invoices, job_templates, client_documents, client_locations, bitacora, warranties, product_prices, equipment, maintenance_logs })
      })

      if (res.ok) {
        await db.sync_queue.clear()
        const time = new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
        setLastSync(time)
        setPendingSyncCount(0)
        console.log('☁️ Data synced at', time)

        // === PHOTO SYNC (directo browser → Google Drive, una por una) ===
        try {
          const photoRes = await fetch('/api/sync/photos')
          if (photoRes.ok) {
            const { accessToken, photosFolderId } = await photoRes.json()
            const allPhotos = await db.client_photos.toArray()
            const unsyncedPhotos = allPhotos.filter((p: any) => !p.drive_synced)

            if (unsyncedPhotos.length > 0) {
              console.log(`📷 Photos to sync: ${unsyncedPhotos.length} of ${allPhotos.length}`)

              for (const photo of unsyncedPhotos) {
                try {
                  const photoRecord = { ...photo }
                  const photoData = photoRecord.photo_data
                  delete (photoRecord as any).photo_data

                  const boundary = '===CSPhoto==='
                  const metadata = JSON.stringify({
                    name: `photo_${photo.id}_meta.json`,
                    parents: [photosFolderId],
                    mimeType: 'application/json',
                  })
                  const metaContent = JSON.stringify(photoRecord)

                  const metaBody = [
                    `--${boundary}`,
                    'Content-Type: application/json; charset=UTF-8',
                    '',
                    metadata,
                    `--${boundary}`,
                    'Content-Type: application/json',
                    '',
                    metaContent,
                    `--${boundary}--`,
                  ].join('\r\n')

                  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      'Content-Type': `multipart/related; boundary=${boundary}`,
                    },
                    body: metaBody,
                  })

                  if (photoData) {
                    const imgBoundary = '===CSPhotoImg==='
                    const imgMetadata = JSON.stringify({
                      name: `photo_${photo.id}_data.txt`,
                      parents: [photosFolderId],
                      mimeType: 'text/plain',
                    })

                    const imgBody = [
                      `--${imgBoundary}`,
                      'Content-Type: application/json; charset=UTF-8',
                      '',
                      imgMetadata,
                      `--${imgBoundary}`,
                      'Content-Type: text/plain',
                      '',
                      photoData,
                      `--${imgBoundary}--`,
                    ].join('\r\n')

                    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': `multipart/related; boundary=${imgBoundary}`,
                      },
                      body: imgBody,
                    })
                  }

                  await db.client_photos.update(photo.id!, { drive_synced: true } as any)
                  console.log(`📷 Synced photo ${photo.id}`)
                } catch (photoErr) {
                  console.warn(`📷 Failed photo ${photo.id}:`, photoErr)
                }
              }
              console.log('📷 Photo sync complete')
            }
          }
        } catch (photoSyncErr) {
          console.warn('📷 Photo sync error (data sync OK):', photoSyncErr)
        }
      } else {
        const err = await res.json()
        console.error('Sync failed:', err)
        await db.sync_queue.add({ timestamp: Date.now(), status: 'pending', retries: 0 })
        updatePendingCount()
      }
    } catch (e) {
      console.error('Sync error:', e)
      await db.sync_queue.add({ timestamp: Date.now(), status: 'pending', retries: 0 })
      updatePendingCount()
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [updatePendingCount])

  const restoreFromDrive = useCallback(async () => {
    if (!driveConnectedRef.current) return
    setSyncing(true)
    try {
      // === RESTORE DATA ===
      const res = await fetch('/api/sync/drive')
      const { data } = await res.json()
      if (!data) { alert('No hay backup en Google Drive'); return }

      const mergeArray = async (table: any, items: any[]) => {
        if (!items?.length) return
        const local = await table.toArray()
        const localMap = new Map(local.map((item: any) => [item.id, item]))
        
        for (const item of items) {
          const existing = localMap.get(item.id) as any
          if (!existing) {
            await table.add(item)
          } else {
            const existingTime = existing.updated_at || existing.created_at || existing.timestamp || 0
            const newTime = (item as any).updated_at || (item as any).created_at || (item as any).timestamp || 0
            if (newTime > existingTime) {
              await table.put(item)
            }
          }
        }
      }

      await mergeArray(db.events, data.events)
      await mergeArray(db.clients, data.clients)
      await mergeArray(db.jobs, data.jobs)
      await mergeArray(db.employees, data.employees)
      await mergeArray(db.vehicles, data.vehicles)
      await mergeArray(db.contracts, data.contracts)
      await mergeArray(db.notes, data.notes)
      await mergeArray(db.appointments, data.appointments)
      await mergeArray(db.reminders, data.reminders)
      await mergeArray(db.invoices, data.invoices)
      await mergeArray(db.job_templates, data.job_templates)
      await mergeArray(db.client_documents, data.client_documents)
      await mergeArray(db.client_locations, data.client_locations)
      await mergeArray(db.bitacora, data.bitacora)
      await mergeArray(db.warranties, data.warranties)
      try { await mergeArray(db.table('product_prices'), data.product_prices) } catch {}
      try { await mergeArray(db.table('equipment'), data.equipment) } catch {}
      try { await mergeArray(db.table('maintenance_logs'), data.maintenance_logs) } catch {}

      console.log('✅ Data restored')

      // === RESTORE PHOTOS (directo desde Google Drive) ===
      try {
        const photoRes = await fetch('/api/sync/photos')
        if (photoRes.ok) {
          const { accessToken, photosFolderId } = await photoRes.json()

          const listUrl = `https://www.googleapis.com/drive/v3/files?q='${photosFolderId}'+in+parents+and+trashed=false&fields=files(id,name)&pageSize=1000`
          const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
          const listData = await listRes.json()
          const driveFiles = listData.files || []

          const localPhotos = await db.client_photos.toArray()
          const localIds = new Set(localPhotos.map((p: any) => p.id))

          const metaFiles = driveFiles.filter((f: any) => f.name.endsWith('_meta.json'))
          console.log(`📷 Found ${metaFiles.length} photos in Drive, ${localPhotos.length} local`)

          let restored = 0
          for (const metaFile of metaFiles) {
            try {
              const photoIdMatch = metaFile.name.match(/photo_(\d+)_meta\.json/)
              if (!photoIdMatch) continue
              const photoId = parseInt(photoIdMatch[1])
              if (localIds.has(photoId)) continue

              const metaDl = await fetch(`https://www.googleapis.com/drive/v3/files/${metaFile.id}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              })
              const metaData = await metaDl.json()

              const dataFile = driveFiles.find((f: any) => f.name === `photo_${photoId}_data.txt`)
              let photoData = ''
              if (dataFile) {
                const dataDl = await fetch(`https://www.googleapis.com/drive/v3/files/${dataFile.id}?alt=media`, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                })
                photoData = await dataDl.text()
              }

              const fullRecord = { ...metaData, photo_data: photoData, drive_synced: true }
              await db.client_photos.put(fullRecord)
              restored++
              console.log(`📷 Restored photo ${photoId}`)
            } catch (photoErr) {
              console.warn(`📷 Failed to restore photo:`, metaFile.name, photoErr)
            }
          }
          if (restored > 0) console.log(`📷 Photo restore complete: ${restored} new photos`)
        }
      } catch (photoRestoreErr) {
        console.warn('📷 Photo restore error (data restore OK):', photoRestoreErr)
      }

      alert('✅ Datos restaurados')
      contextLoadedRef.current = false
    } catch (e) {
      console.error('Restore error:', e)
      alert('Error al restaurar')
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => { checkDriveConnection() }, [checkDriveConnection])

  // ============ SPEECH RECOGNITION ============
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'es-PR'

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript
          setInput(prev => (prev + ' ' + transcript).trim())
        }
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

  // ============ CONTEXTO COMPLETO ============
  useEffect(() => {
    const load = async () => {
      if (contextLoadedRef.current) return
      contextLoadedRef.current = true
      try {
        let ctx = ''
        
        // Events (últimos 50)
        const events = await db.events.orderBy('timestamp').reverse().limit(200).toArray()
        if (events.length > 0) {
          ctx += 'EVENTOS RECIENTES:\n' + events.map(e => {
            const d = new Date(e.timestamp).toLocaleDateString('es-PR')
            const hasPhoto = e.receipt_photos && e.receipt_photos.length > 0 ? ' 📷' : ''
            return `[${d}] ${e.type} ${e.category} $${e.amount} ${e.vendor || e.client || ''} ${e.expense_type === 'personal' ? '[PERSONAL]' : ''}${hasPhoto}`
          }).join('\n')
        }

        // ====== FIX: Clientes — handle both boolean true and number 1 for active ======
        const clients = await db.clients.toArray().then(all => all.filter(c => c.active === true || (c.active as any) === 1))
        if (clients.length > 0) {
        ctx += '\n\nCLIENTES:\n' + clients.map(c =>
            `[ID:${c.id}] ${c.first_name} ${c.last_name} | ${c.type} | Tel: ${c.phone || 'N/A'}${c.address ? ' | 📍 ' + c.address : ''}${(c as any).retention_percent ? ' | ⚠️ Retención: ' + (c as any).retention_percent + '%' : ''}${c.notes ? ' | ' + c.notes : ''}`
          ).join('\n')
        }

        // Jobs
        const jobs = await db.jobs.orderBy('date').reverse().limit(20).toArray()
        if (jobs.length > 0) {
          ctx += '\n\nTRABAJOS:\n' + jobs.map(j => {
            const d = new Date(j.date).toLocaleDateString('es-PR')
            const paid = j.payments?.reduce((s: number, p: any) => s + p.amount, 0) || 0
            return `[${d}] ${j.type} Cliente#${j.client_id} Total:$${j.total_charged} Pagado:$${paid} Status:${j.payment_status}`
          }).join('\n')
        }

        // Citas programadas
        const appts = await db.appointments.where('status').equals('scheduled').toArray()
        if (appts.length > 0) {
          ctx += '\n\nCITAS PROGRAMADAS:\n' + appts.map(a => {
            const d = new Date(a.date)
            return `[${d.toLocaleDateString('es-PR')} ${d.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}] ${a.title} ${a.client_name ? '- ' + a.client_name : ''} ${a.location ? '@ ' + a.location : ''}`
          }).join('\n')
        }

        // Recordatorios pendientes
        const rems = await db.reminders.where('completed').equals(0).toArray()
        if (rems.length > 0) {
          ctx += '\n\nRECORDATORIOS PENDIENTES:\n' + rems.map(r => {
            const d = new Date(r.due_date)
            return `[${d.toLocaleDateString('es-PR')}] ${r.text} (${r.priority})`
          }).join('\n')
        }

        // Facturas
        const invoices = await db.invoices.toArray()
        if (invoices.length > 0) {
          const pending = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
          ctx += '\n\nFACTURAS PENDIENTES:\n' + pending.map(i => 
            `[${i.invoice_number}] ${i.client_name} | $${i.total} | Status: ${i.status}`
          ).join('\n')
        }

        // Notas (últimas 10)
        const notes = await db.notes.orderBy('timestamp').reverse().limit(10).toArray()
        if (notes.length > 0) {
          ctx += '\n\nNOTAS RECIENTES:\n' + notes.map(n => 
            `[${new Date(n.timestamp).toLocaleDateString('es-PR')}] ${n.title || 'Sin título'}: ${n.content.substring(0, 100)}...`
          ).join('\n')
        }

        // ====== FIX: Templates — handle both boolean true and number 1 for active ======
        const templates = await db.job_templates.toArray().then(all => all.filter(t => t.active === true || (t.active as any) === 1))
        if (templates.length > 0) {
          ctx += '\n\nTEMPLATES DISPONIBLES:\n' + templates.map(t => {
            const itemsStr = t.items.map(i => `${i.description}(${i.quantity}x$${i.unit_price})`).join(', ')
            const total = t.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0)
            return `[${t.name}] Cliente: ${t.client_name || 'N/A'} | Items: ${itemsStr} | Total: $${total.toFixed(2)}`
          }).join('\n')
        }

        // Fotos por cliente
        const photos = await db.client_photos.toArray()
        if (photos.length > 0) {
          const photosByClient: Record<string, number> = {}
          photos.forEach(p => {
            const name = p.client_name || 'Sin cliente'
            photosByClient[name] = (photosByClient[name] || 0) + 1
          })
          ctx += '\n\nFOTOS POR CLIENTE:\n' + Object.entries(photosByClient).map(([name, count]) => 
            `${name}: ${count} foto(s)`
          ).join('\n')
        }

        // Equipos y mantenimiento preventivo
        try {
          const equip = await db.table('equipment').toArray()
          if (equip.length > 0) {
            ctx += '\n\nEQUIPOS REGISTRADOS:\n' + equip.map((eq: any) => {
              return `[ID:${eq.id}] ${eq.equipment_type} ${eq.brand || ''} ${eq.model || ''} | ${eq.client_name} @ ${eq.location || 'N/A'} | Serial: ${eq.serial_number || 'N/A'} | Status: ${eq.status}`
            }).join('\n')

            const logs = await db.table('maintenance_logs').toArray()
            const currentYear = new Date().getFullYear()
            const yearStart = new Date(currentYear, 0, 1).getTime()

            // Resumen de mantenimiento por cliente
            const byClient: Record<string, { total: number; done: number; lastDate: number }> = {}
            equip.forEach((eq: any) => {
              const key = eq.client_name || 'Sin cliente'
              if (!byClient[key]) byClient[key] = { total: 0, done: 0, lastDate: 0 }
              byClient[key].total++
              const eqLogs = logs.filter((l: any) => l.equipment_id === eq.id && l.date >= yearStart)
              if (eqLogs.length > 0) {
                byClient[key].done++
                const lastLog = eqLogs.sort((a: any, b: any) => b.date - a.date)[0]
                if (lastLog.date > byClient[key].lastDate) byClient[key].lastDate = lastLog.date
              }
            })

            ctx += '\n\nMANTENIMIENTO PREVENTIVO (este año):\n' + Object.entries(byClient).map(([name, data]) => {
              const lastStr = data.lastDate ? new Date(data.lastDate).toLocaleDateString('es-PR') : 'Nunca'
              return `${name}: ${data.done}/${data.total} equipos limpiados | Último: ${lastStr} | Faltan: ${data.total - data.done}`
            }).join('\n')
          }
        } catch {}

        // Historial de precios de productos
        try {
          const prices = await db.table('product_prices').toArray()
          if (prices.length > 0) {
            ctx += '\n\nHISTORIAL DE PRECIOS:\n' + prices
              .sort((a: any, b: any) => b.timestamp - a.timestamp)
              .slice(0, 100)
              .map((p: any) => {
                const d = new Date(p.timestamp).toLocaleDateString('es-PR')
                return `[${d}] ${p.product_name} | ${p.vendor} | $${p.unit_price} x${p.quantity} ${p.unit || 'und'} | ${p.client_for || 'stock'}`
              }).join('\n')
          }
        } catch {}

        dbContextRef.current = ctx
        
        // Summary message
        const counts = {
          events: events.length,
          clients: clients.length,
          invoices: invoices.length,
          templates: templates.length,
          appts: appts.length,
          rems: rems.length
        }
        
        if (Object.values(counts).some(v => v > 0)) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `✅ Contexto cargado: ${counts.events} eventos, ${counts.clients} clientes, ${counts.invoices} facturas, ${counts.templates} templates, ${counts.appts} citas, ${counts.rems} recordatorios` 
          }])
        }
      } catch (e) { console.error('Context error:', e) }
    }
    load()
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ============ PERSIST CHAT MESSAGES ============
  useEffect(() => {
    try {
      // Strip photo data to avoid localStorage size limits
      const toSave = messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
      localStorage.setItem('cs_chat_messages', JSON.stringify(toSave))
    } catch {}
  }, [messages])

  // ============ TODAY'S STATS ============
  useEffect(() => {
    const loadTodayStats = async () => {
      try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayStart = today.getTime()
        const events = await db.events.where('timestamp').above(todayStart).toArray()
        const gastos = events.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0)
        const ingresos = events.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0)
        setTodayStats({ gastos, ingresos, count: events.length })
      } catch {}
    }
    loadTodayStats()
    // Refresh stats when messages change (might have saved new events)
    if (messages.length > 1) loadTodayStats()
  }, [messages])

  // ============ SCROLL DETECTION ============
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // ============ CLEAR CHAT ============
  const clearChat = () => {
    setMessages([{ role: 'assistant', content: '¡Hola! ¿Qué quieres registrar? Escribe, dicta 🎤 o envía fotos 📷', timestamp: Date.now() }])
    localStorage.removeItem('cs_chat_messages')
    contextLoadedRef.current = false
  }

  // ============ QUICK ACTIONS ============
  const quickActions = [
    { emoji: '💵', label: 'Gasto', prompt: 'Registrar gasto: ' },
    { emoji: '📸', label: 'Recibo', action: () => fileInputRef.current?.click() },
    { emoji: '👤', label: 'Cliente', prompt: 'Registrar nuevo cliente: ' },
    { emoji: '📋', label: 'Cotización', prompt: 'Crear cotización para ' },
    { emoji: '📅', label: 'Cita', prompt: 'Agendar cita para ' },
    { emoji: '🔧', label: 'Trabajo', prompt: 'Registrar trabajo: ' },
  ]

  const handleQuickAction = (action: typeof quickActions[0]) => {
    if (action.action) {
      action.action()
    } else if (action.prompt) {
      setInput(action.prompt)
      setShowQuickActions(false)
      textareaRef.current?.focus()
    }
  }

  // ============ FOTOS ============
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const f of files) {
      const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f) })
      if (f.type === 'application/pdf') {
        setPendingPhotos(prev => [...prev, b64])
      } else {
        const compressed = await compressImage(b64)
        setPendingPhotos(prev => [...prev, compressed])
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (fileInputRef2.current) fileInputRef2.current.value = ''
  }

  // ============ ENVIAR ============
  const handleSend = async () => {
    const hasText = input.trim().length > 0
    const hasPhotos = pendingPhotos.length > 0
    if ((!hasText && !hasPhotos) || loading) return
    stopListening()

    const userContent = hasText ? input.trim() : '📷 Foto adjunta'
    const userPhotos = [...pendingPhotos]

    // Guardar fotos para adjuntar al próximo SAVE_EVENT
    if (userPhotos.length > 0) {
      receiptPhotosRef.current = userPhotos
    }

    setMessages(prev => [...prev, { role: 'user', content: userContent, photos: userPhotos.length ? userPhotos : undefined, timestamp: Date.now() }])
    setInput('')
    setPendingPhotos([])
    setLoading(true)
    setShowQuickActions(false)

    try {
      // Build context message
      const contextMsg = dbContextRef.current ? `\n\n[CONTEXTO_DB]\n${dbContextRef.current}\n[/CONTEXTO_DB]` : ''
      const fullContent = userContent + contextMsg

      const payload = {
        model: aiModel,
        messages: [
          ...messages.filter(m => m.role !== 'assistant' || !m.content.startsWith('✅')).slice(-10),
          { role: 'user', content: fullContent, photos: userPhotos.length ? userPhotos : undefined }
        ]
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      // ====== HANDLE STRUCTURED RESPONSE TYPES (from route.ts interceptors) ======
      if (data.type === 'SAVE_EVENT' && data.payload) {
        try {
          await db.events.add({
            timestamp: data.payload.timestamp || Date.now(),
            type: data.payload.type,
            status: 'completed',
            subtype: data.payload.subtype,
            category: data.payload.category,
            amount: data.payload.amount,
            payment_method: data.payload.payment_method,
            vendor: data.payload.vendor,
            client: data.payload.client,
            vehicle_id: data.payload.vehicle_id,
            note: data.payload.note,
            expense_type: data.payload.expense_type || 'business',
            receipt_photos: receiptPhotosRef.current.length > 0 ? receiptPhotosRef.current : undefined
          })
          const hadPhotos = receiptPhotosRef.current.length > 0
          receiptPhotosRef.current = []
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `✅ ${data.payload.type === 'income' ? 'Ingreso' : 'Gasto'} registrado: $${data.payload.amount} ${data.payload.category ? `(${data.payload.category})` : ''}${hadPhotos ? ' 📷 foto adjunta' : ''}` 
          }])
          syncToDrive()
          return
        } catch (e) {
          console.error('SAVE_EVENT error:', e)
        }
      }

      if (data.type === 'GENERATE_PL') {
        const { period, periodLabel } = data.payload
        const { startDate, endDate } = getDateRange(period, periodLabel)
        const events = await db.events.toArray()
        generatePLReport(events, startDate, endDate, periodLabel || 'este mes')
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ P&L generado para ${periodLabel || 'este mes'}` }])
        return
      }

      if (data.type === 'GENERATE_AR') {
        const invoices = await db.invoices.toArray()
        generateARReport(invoices)
        setMessages(prev => [...prev, { role: 'assistant', content: '✅ Reporte de cuentas por cobrar generado' }])
        return
      }

      if (data.type === 'GENERATE_INCOME_REPORT') {
        const { period, periodLabel } = data.payload
        const { startDate, endDate } = getDateRange(period, periodLabel)
        const events = await db.events.toArray()
        const clients = await db.clients.toArray()
        generateIncomeByClientReport(events, clients, startDate, endDate, periodLabel || 'este año')
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte de ingresos por cliente generado (${periodLabel})` }])
        return
      }

      if (data.type === 'GENERATE_PDF') {
        const { category, period, type, payment_method } = data.payload || {}
        const { startDate, endDate } = getDateRange(period || 'month')
        const events = await db.events.toArray()
        
        if (payment_method) {
          generatePaymentMethodReport(events, payment_method, startDate, endDate)
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte de ${payment_method} generado` }])
        } else if (type === 'income') {
          generateCategoryReport(events.filter(e => e.type === 'income'), 'ingresos', startDate, endDate)
          setMessages(prev => [...prev, { role: 'assistant', content: '✅ Reporte de ingresos generado' }])
        } else if (type === 'expense') {
          generateCategoryReport(events.filter(e => e.type === 'expense'), 'gastos', startDate, endDate)
          setMessages(prev => [...prev, { role: 'assistant', content: '✅ Reporte de gastos generado' }])
        } else {
          generateCategoryReport(events, category || 'general', startDate, endDate)
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte de ${category || 'general'} generado` }])
        }
        return
      }

      if (data.type === 'GENERATE_PAYMENT_REPORT') {
        const { paymentMethod, period } = data.payload
        const { startDate, endDate } = getDateRange(period)
        const events = await db.events.toArray()
        generatePaymentMethodReport(events, paymentMethod, startDate, endDate)
        setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte de ${paymentMethod} generado` }])
        return
      }

      // ====== GENERATE_PHOTO_REPORT ======
      if (data.type === 'GENERATE_PHOTO_REPORT') {
        const { client_name, job_description } = data.payload || {}
        const photos = await db.client_photos.toArray()
        const clientPhotos = photos.filter(p => 
          p.client_name?.toLowerCase().includes((client_name || '').toLowerCase())
        )
        if (clientPhotos.length === 0) {
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ No hay fotos guardadas para ${client_name || 'este cliente'}` }])
        } else {
          generatePhotoReport(clientPhotos, client_name || 'Cliente', job_description)
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ Reporte de fotos generado para ${client_name} (${clientPhotos.length} fotos)` }])
        }
        return
      }

      // ====================================================================
      // TEXT RESPONSE - PARSE ALL COMMANDS IN ONE PASS (NO EARLY RETURNS)
      // This is the KEY FIX: process ALL commands before showing the message
      // ====================================================================
      const assistantText = data.text || data.error || 'Sin respuesta'
      
      // Track what we saved
      const savedItems: string[] = []
      let needsSync = false

      // ====== PROCESS ALL SAVE_EVENTs ======
      const eventMatches = assistantText.match(/SAVE_EVENT:\s*\{/gi)
      if (eventMatches && eventMatches.length > 0) {
        const allEvents = extractAllJSON(assistantText, 'SAVE_EVENT:')
        for (let i = 0; i < allEvents.length; i++) {
          const evData = allEvents[i]
          try {
           const eventPhotos = receiptPhotosRef.current.length > 0 ? [...receiptPhotosRef.current] : []
            await db.events.add({
              timestamp: evData.timestamp || Date.now(),
              type: evData.type,
              status: 'completed',
              subtype: evData.subtype,
              category: evData.category,
              amount: evData.amount,
              payment_method: evData.payment_method,
              vendor: evData.vendor,
              client: evData.client,
              vehicle_id: evData.vehicle_id,
              note: evData.note,
              expense_type: evData.expense_type || 'business',
              receipt_photos: eventPhotos.length > 0 ? eventPhotos : undefined
            })
            // Guardar cada foto del recibo en client_photos para sync y búsqueda
            if (eventPhotos.length > 0) {
              const now = Date.now()
              for (const photo of eventPhotos) {
                await db.client_photos.add({
                  client_name: evData.client || 'General',
                  category: 'receipt',
                  description: `Recibo ${evData.vendor || ''} $${evData.amount} - ${evData.category || ''}`,
                  photo_data: photo,
                  timestamp: evData.timestamp || now,
                  created_at: now
                })
              }
            }
            savedItems.push(`${evData.type === 'income' ? 'Ingreso' : 'Gasto'}: $${evData.amount} ${evData.category || ''}${evData.client ? ` (${evData.client})` : ''}${eventPhotos.length > 0 ? ' 📷' : ''}`)
            needsSync = true
          } catch (e) {
            console.error('SAVE_EVENT error:', e)
          }
        }
        if (allEvents.length > 0) {
          receiptPhotosRef.current = []
        }
      }

      // ====== PROCESS SAVE_WARRANTY ======
      const warrantyData = extractJSON(assistantText, 'SAVE_WARRANTY:')
      if (warrantyData) {
        try {
          const now = Date.now()
          const purchaseDate = warrantyData.purchase_date ? new Date(warrantyData.purchase_date).getTime() : now
          const months = warrantyData.warranty_months || 12
          const expDate = new Date(purchaseDate)
          expDate.setMonth(expDate.getMonth() + months)

          await db.table('warranties').add({
            equipment_type: warrantyData.equipment_type || '',
            brand: warrantyData.brand || '',
            model_number: warrantyData.model_number,
            serial_number: warrantyData.serial_number,
            vendor: warrantyData.vendor || '',
            vendor_phone: warrantyData.vendor_phone,
            vendor_invoice: warrantyData.vendor_invoice,
            client_name: warrantyData.client_name || '',
            client_id: warrantyData.client_id,
            location: warrantyData.location,
            purchase_date: purchaseDate,
            warranty_months: months,
            expiration_date: expDate.getTime(),
            cost: warrantyData.cost,
            receipt_photos: receiptPhotosRef.current.length > 0 ? receiptPhotosRef.current : undefined,
            notes: warrantyData.notes,
            status: 'active',
            created_at: now,
          })
          receiptPhotosRef.current = []
          savedItems.push(`Garantía: ${warrantyData.equipment_type} (${warrantyData.brand}) — ${warrantyData.client_name}, ${months} meses`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_WARRANTY error:', e)
        }
      }

      // ====== PROCESS SAVE_QUICK_QUOTE ======
      const quickQuoteData = extractJSON(assistantText, 'SAVE_QUICK_QUOTE:')
      if (quickQuoteData) {
        try {
          const now = Date.now()
          const myCost = quickQuoteData.my_cost || 0
          const quoted = quickQuoteData.quoted_price || 0
          await db.table('quick_quotes').add({
            client_name: quickQuoteData.client_name || '',
            client_id: quickQuoteData.client_id,
            description: quickQuoteData.description || '',
            my_cost: myCost,
            quoted_price: quoted,
            markup: quoted - myCost,
            status: 'pending',
            notes: quickQuoteData.notes,
            created_at: now,
          })
          savedItems.push(`Cotización: ${quickQuoteData.description} — ${quickQuoteData.client_name}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_QUICK_QUOTE error:', e)
        }
      }

      // ====== PROCESS SAVE_CLIENT ======
      const clientData = extractJSON(assistantText, 'SAVE_CLIENT:')
      if (clientData) {
        try {
          const now = Date.now()
          await db.clients.add({
            first_name: clientData.first_name || '',
            last_name: clientData.last_name || '',
            phone: clientData.phone,
            email: clientData.email,
            address: clientData.address,
            type: clientData.type || 'residential',
            notes: clientData.notes,
            active: true,
            created_at: now,
            updated_at: now
          })
          savedItems.push(`Cliente: ${clientData.first_name} ${clientData.last_name}`)
          needsSync = true
          // ====== FIX: Reload context after adding client so AI can see them immediately ======
          contextLoadedRef.current = false
        } catch (e) {
          console.error('SAVE_CLIENT error:', e)
        }
      }

      // ====== PROCESS SAVE_NOTE ======
      const noteData = extractJSON(assistantText, 'SAVE_NOTE:')
      if (noteData) {
        try {
          const now = Date.now()
          await db.notes.add({
            timestamp: now,
            title: noteData.title || '',
            content: noteData.content || '',
            tags: noteData.tags,
            updated_at: now
          })
          savedItems.push(`Nota: ${noteData.title || noteData.content?.substring(0, 30)}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_NOTE error:', e)
        }
      }

      // ====== PROCESS SAVE_APPOINTMENT ======
      const apptData = extractJSON(assistantText, 'SAVE_APPOINTMENT:')
      if (apptData) {
        try {
          const apptDate = new Date(apptData.date).getTime()
          const now = Date.now()
          await db.appointments.add({
            timestamp: now,
            date: apptDate,
            title: apptData.title || 'Cita',
            client_name: apptData.client_name,
            location: apptData.location,
            notes: apptData.notes,
            status: 'scheduled',
            reminder_minutes: apptData.reminder_minutes || 60,
            created_at: now
          })
          dbContextRef.current += `\n[CITA] ${new Date(apptDate).toLocaleDateString('es-PR')} ${apptData.title}`
          savedItems.push(`Cita: ${apptData.title} - ${new Date(apptDate).toLocaleDateString('es-PR')}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_APPOINTMENT error:', e)
        }
      }

      // ====== PROCESS SAVE_REMINDER ======
      const remData = extractJSON(assistantText, 'SAVE_REMINDER:')
      if (remData) {
        try {
          const dueDate = new Date(remData.due_date).getTime()
          const now = Date.now()
          await db.reminders.add({
            timestamp: now,
            text: remData.text || '',
            due_date: dueDate,
            completed: false,
            priority: remData.priority || 'normal',
            created_at: now
          })
          savedItems.push(`Recordatorio: ${remData.text}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_REMINDER error:', e)
        }
      }

      // ====== PROCESS SAVE_INVOICE ======
      const invoiceData = extractJSON(assistantText, 'SAVE_INVOICE:')
      if (invoiceData) {
        try {
          const now = Date.now()
          const items = (invoiceData.items || []).map((i: any) => ({
            description: i.description,
            quantity: i.quantity || 1,
            unit_price: i.unit_price || 0,
            total: i.total || (i.quantity || 1) * (i.unit_price || 0)
          }))
          const subtotal = items.reduce((s: number, i: any) => s + i.total, 0)
          const taxRate = invoiceData.tax_rate || 0
          const taxAmount = subtotal * (taxRate / 100)
          
          await db.invoices.add({
            invoice_number: generateInvoiceNumber('invoice'),
            type: 'invoice',
            client_name: invoiceData.client_name || '',
            client_phone: invoiceData.client_phone,
            client_email: invoiceData.client_email,
            client_address: invoiceData.client_address,
            items,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total: subtotal + taxAmount,
            notes: invoiceData.notes,
            status: 'draft',
            issue_date: now,
            due_date: now + (invoiceData.due_days || 30) * 86400000,
            created_at: now,
            updated_at: now
          })
          
          console.log('✅ Invoice saved:', invoiceData.client_name, 'items:', items.length, 'total:', subtotal + taxAmount)
          savedItems.push(`Factura: ${invoiceData.client_name} — ${formatCurrency(subtotal + taxAmount)}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_INVOICE error:', e)
        }
      }

      // ====== PROCESS SAVE_QUOTE ======
      const quoteData = extractJSON(assistantText, 'SAVE_QUOTE:')
      if (quoteData) {
        try {
          const now = Date.now()
          const items = (quoteData.items || []).map((i: any) => ({
            description: i.description,
            quantity: i.quantity || 1,
            unit_price: i.unit_price || 0,
            total: i.total || (i.quantity || 1) * (i.unit_price || 0)
          }))
          const subtotal = items.reduce((s: number, i: any) => s + i.total, 0)
          const taxRate = quoteData.tax_rate || 0
          const taxAmount = subtotal * (taxRate / 100)
          
          await db.invoices.add({
            invoice_number: generateInvoiceNumber('quote'),
            type: 'quote',
            client_name: quoteData.client_name || '',
            client_phone: quoteData.client_phone,
            client_email: quoteData.client_email,
            client_address: quoteData.client_address,
            items,
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total: subtotal + taxAmount,
            notes: quoteData.notes,
            status: 'draft',
            issue_date: now,
            expiration_date: now + (quoteData.valid_days || 15) * 86400000,
            created_at: now,
            updated_at: now
          })
          
          savedItems.push(`Cotización: ${quoteData.client_name} — ${formatCurrency(subtotal + taxAmount)}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_QUOTE error:', e)
        }
      }

      // ====== PROCESS SAVE_JOB_TEMPLATE ======
      const templateData = extractJSON(assistantText, 'SAVE_JOB_TEMPLATE:')
      if (templateData) {
        try {
          const now = Date.now()
          const items = (templateData.items || []).map((i: any) => ({
            description: i.description,
            quantity: i.quantity || 1,
            unit_price: i.unit_price || 0
          }))
          
          await db.job_templates.add({
            name: templateData.name || '',
            client_name: templateData.client_name,
            client_id: templateData.client_id,
            items,
            notes: templateData.notes,
            default_tax_rate: templateData.default_tax_rate || 0,
            active: true,
            created_at: now,
            updated_at: now
          })
          
          savedItems.push(`Template: ${templateData.name}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_JOB_TEMPLATE error:', e)
        }
      }

      // ====== PROCESS SAVE_PHOTO ======
      const photoData = extractJSON(assistantText, 'SAVE_PHOTO:')
      if (photoData && userPhotos.length > 0) {
        try {
          const now = Date.now()
          for (const photo of userPhotos) {
            await db.client_photos.add({
              client_name: photoData.client_name,
              client_id: photoData.client_id,
              job_id: photoData.job_id,
              category: photoData.category || 'other',
              description: photoData.description,
              photo_data: photo,
              timestamp: now,
              created_at: now
            })
          }
          receiptPhotosRef.current = []
          savedItems.push(`${userPhotos.length} foto(s) para ${photoData.client_name}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_PHOTO error:', e)
        }
      }

      // ====== PROCESS SAVE_BITACORA ======
      const bitacoraData = extractJSON(assistantText, 'SAVE_BITACORA:')
      if (bitacoraData) {
        try {
          const now = Date.now()
          await db.bitacora.add({
            date: bitacoraData.date || new Date().toISOString().split('T')[0],
            raw_text: bitacoraData.raw_text || '',
            summary: bitacoraData.summary || '',
            tags: bitacoraData.tags || [],
            clients_mentioned: bitacoraData.clients_mentioned || [],
            locations: bitacoraData.locations || [],
            equipment: bitacoraData.equipment || [],
            jobs_count: bitacoraData.jobs_count || 0,
            hours_estimated: bitacoraData.hours_estimated || 0,
            had_emergency: bitacoraData.had_emergency || false,
            highlights: bitacoraData.highlights || [],
            created_at: now
          })
          savedItems.push(`Bitácora: ${bitacoraData.date}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_BITACORA error:', e)
        }
      }

      // ====== PROCESS SAVE_JOB ======
      const jobData = extractJSON(assistantText, 'SAVE_JOB:')
      if (jobData) {
        try {
          const now = Date.now()
          await db.jobs.add({
            client_id: jobData.client_id || 0,
            date: now,
            type: jobData.type || 'service',
            status: 'completed',
            services: jobData.services || [],
            materials: jobData.materials || [],
            employees: [],
            subtotal_services: 0,
            subtotal_materials: 0,
            total_charged: jobData.total_charged || 0,
            payment_status: jobData.payment_status || 'pending',
            payments: jobData.payments || [],
            balance_due: jobData.balance_due || jobData.total_charged || 0,
            notes: jobData.notes,
            created_at: now
          })
          savedItems.push(`Trabajo: $${jobData.total_charged}`)
          needsSync = true
        } catch (e) {
          console.error('SAVE_JOB error:', e)
        }
      }

      // ====== PROCESS SAVE_PRODUCT (precio de producto) ======
      const productMatches = assistantText.match(/SAVE_PRODUCT:\s*\{/gi)
      if (productMatches && productMatches.length > 0) {
        const allProducts = extractAllJSON(assistantText, 'SAVE_PRODUCT:')
        for (const prodData of allProducts) {
          try {
            const now = Date.now()
            await db.table('product_prices').add({
              product_name: prodData.product_name || '',
              aliases: prodData.aliases || [],
              vendor: prodData.vendor || '',
              unit_price: prodData.unit_price || 0,
              quantity: prodData.quantity || 1,
              unit: prodData.unit || 'und',
              total_price: prodData.total_price || (prodData.unit_price * (prodData.quantity || 1)),
              client_for: prodData.client_for || '',
              category: prodData.category || 'Materiales',
              notes: prodData.notes || '',
              timestamp: now,
              created_at: now
            })
            savedItems.push(`Precio: ${prodData.product_name} @ $${prodData.unit_price} (${prodData.vendor})`)
            needsSync = true
          } catch (e) {
            console.error('SAVE_PRODUCT error:', e)
          }
        }
      }

      // ====== PROCESS DELETE_EVENT ======
      const deleteData = extractJSON(assistantText, 'DELETE_EVENT:')
      if (deleteData && deleteData.id) {
        try {
          const existing = await db.events.get(deleteData.id)
          if (existing) {
            await db.events.delete(deleteData.id)
            savedItems.push(`Eliminado: evento #${deleteData.id} ($${existing.amount} ${existing.category || ''})`)
            needsSync = true
            contextLoadedRef.current = false
          }
        } catch (e) {
          console.error('DELETE_EVENT error:', e)
        }
      }

      // ====== PROCESS SAVE_EQUIPMENT ======
      const equipMatches = assistantText.match(/SAVE_EQUIPMENT:\s*\{/gi)
      if (equipMatches && equipMatches.length > 0) {
        const allEquip = extractAllJSON(assistantText, 'SAVE_EQUIPMENT:')
        for (const eq of allEquip) {
          try {
            const now = Date.now()
            await db.table('equipment').add({
              client_name: eq.client_name || '',
              client_id: eq.client_id,
              location: eq.location || '',
              equipment_type: eq.equipment_type || '',
              brand: eq.brand || '',
              model: eq.model || '',
              serial_number: eq.serial_number || '',
              status: eq.status || 'active',
              notes: eq.notes || '',
              created_at: now
            })
            savedItems.push(`Equipo: ${eq.equipment_type} ${eq.brand || ''} → ${eq.client_name}`)
            needsSync = true
          } catch (e) {
            console.error('SAVE_EQUIPMENT error:', e)
          }
        }
      }

      // ====== PROCESS SAVE_MAINTENANCE ======
      const maintMatches = assistantText.match(/SAVE_MAINTENANCE:\s*\{/gi)
      if (maintMatches && maintMatches.length > 0) {
        const allMaint = extractAllJSON(assistantText, 'SAVE_MAINTENANCE:')
        for (const m of allMaint) {
          try {
            const now = Date.now()
            await db.table('maintenance_logs').add({
              equipment_id: m.equipment_id,
              client_name: m.client_name || '',
              client_id: m.client_id,
              maintenance_type: m.maintenance_type || 'cleaning',
              date: m.date || now,
              notes: m.notes || '',
              technician: m.technician || 'Sergio',
              photos: [],
              created_at: now
            })
            savedItems.push(`Mantenimiento: ${m.maintenance_type} → ${m.client_name}`)
            needsSync = true
            contextLoadedRef.current = false
          } catch (e) {
            console.error('SAVE_MAINTENANCE error:', e)
          }
        }
      }
      // ====================================================================
      // BUILD FINAL MESSAGE — show everything we saved in one message
      // ====================================================================
      if (savedItems.length > 0) {
        // Clean all command blocks from the AI text
        const cleanText = cleanCommandsFromText(assistantText)
        
        // Build confirmation summary
        const confirmation = savedItems.length === 1 
          ? `✅ ${savedItems[0]}`
          : `✅ Guardados:\n${savedItems.map(s => `• ${s}`).join('\n')}`
        
        const finalMessage = cleanText ? `${cleanText}\n\n${confirmation}` : confirmation
        setMessages(prev => [...prev, { role: 'assistant', content: finalMessage }])
        if (needsSync) syncToDrive()
      } else {
        // No commands found — just show the text response
        setMessages(prev => [...prev, { role: 'assistant', content: assistantText }])
      }

    } catch (error: any) {
      console.error('handleSend error:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: ' + (error?.message || 'Intenta de nuevo') }])
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiModel(prev => prev === 'auto' ? 'gpt' : prev === 'gpt' ? 'claude' : 'auto')}
            className={`text-xs px-2 py-1 rounded-lg font-medium ${
              aiModel === 'auto' ? 'bg-white/20 text-white' :
              aiModel === 'gpt' ? 'bg-green-500/30 text-green-300' :
              'bg-orange-500/30 text-orange-300'
            }`}
          >
            {aiModel === 'auto' ? '⚡ Auto' : aiModel === 'gpt' ? '🟢 GPT' : '🟠 Claude'}
          </button>
          <button
            onClick={clearChat}
            className="text-xs px-2 py-1 rounded-lg font-medium bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
            title="Nuevo Chat"
          >
            🗑️ Nuevo
          </button>
          <button onClick={() => setShowMenu(!showMenu)} className="text-3xl w-10 h-10 flex items-center justify-center">☰</button>
        </div>
      </div>

      {/* MENU - FIXED position, dark theme */}
      {showMenu && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowMenu(false)} />
          <div className="fixed top-16 right-4 bg-[#111a2e] rounded-xl shadow-2xl z-50 w-60 border border-white/10 max-h-[80vh] overflow-y-auto">
            <button onClick={() => { setShowMenu(false); onNavigate('dashboard') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📊 Dashboard
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('clients') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              👥 Clientes
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('expenses') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              💵 Gastos
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('receipts') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              🧾 Recibos
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('invoices') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📄 Facturas
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('templates') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📋 Templates
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('calendar') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📅 Calendario
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('notes') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📝 Notas
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('search') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              🔍 Buscar
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('history') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📜 Historial
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('bitacora') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📒 Bitácora
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('reports') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📊 Reportes
            </button>
            <button onClick={() => { setShowMenu(false); onNavigate('warranties') }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              🛡️ Garantías
            </button>
            <button onClick={async () => {
              setShowMenu(false)
              const d = new Date()
              const events = await db.events.toArray()
              generatePLReport(events, new Date(d.getFullYear(), d.getMonth(), 1).getTime(), Date.now(), 'este mes')
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ P&L del mes generado' }])
            }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              📈 P&L del Mes
            </button>
            <button onClick={async () => {
              setShowMenu(false)
              const invoices = await db.invoices.toArray()
              generateARReport(invoices)
              setMessages(prev => [...prev, { role: 'assistant', content: '✅ Cuentas por Cobrar generado' }])
            }} className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5">
              💰 ¿Quién me Debe?
            </button>

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

      {/* TODAY'S STATS BAR */}
      {todayStats.count > 0 && (
        <div className="bg-[#111a2e] border-b border-white/10 px-4 py-2 flex items-center justify-center gap-4 text-xs flex-shrink-0">
          <span className="text-gray-400">📅 Hoy:</span>
          {todayStats.gastos > 0 && <span className="text-red-400">↓ ${todayStats.gastos.toFixed(2)}</span>}
          {todayStats.ingresos > 0 && <span className="text-green-400">↑ ${todayStats.ingresos.toFixed(2)}</span>}
          <span className="text-gray-500">{todayStats.count} registro{todayStats.count > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* MENSAJES */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 pb-44">
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
                    {msg.photos.map((p, i) => (
                      <img key={i} src={p} alt="" className="w-24 h-24 object-cover rounded-lg" />
                    ))}
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                {msg.timestamp && (
                  <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200/60' : 'text-gray-500'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
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

      {/* SCROLL TO BOTTOM BUTTON */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-48 right-4 z-20 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg shadow-blue-600/30 transition-all"
        >
          ↓
        </button>
      )}

      {/* INPUT AREA */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a] border-t border-white/10 z-20">
        {/* QUICK ACTIONS */}
        {showQuickActions && !loading && messages.length <= 3 && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-white/5">
            {quickActions.map((qa, i) => (
              <button
                key={i}
                onClick={() => handleQuickAction(qa)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2332] hover:bg-[#222d3e] rounded-full text-xs text-gray-300 whitespace-nowrap transition-colors border border-white/5"
              >
                <span>{qa.emoji}</span>
                <span>{qa.label}</span>
              </button>
            ))}
          </div>
        )}
        {pendingPhotos.length > 0 && (
          <div className="flex gap-2 p-3 bg-[#1a2332] border-b border-white/10 overflow-x-auto">
            {pendingPhotos.map((p, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={p} alt="" className="w-16 h-16 object-cover rounded-lg border-2 border-blue-400" />
                <button
                  onClick={() => setPendingPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                >
                  ✕
                </button>
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
          <input ref={fileInputRef} type="file" accept="*/*" multiple onChange={handlePhotoSelect} className="hidden" />
          
      <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="bg-[#1a2332] hover:bg-[#222d3e] rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:opacity-50 flex-shrink-0 transition-colors"
          >
            📷
          </button>
          
          <input ref={fileInputRef2} type="file" accept="application/pdf,.pdf,image/*" multiple onChange={handlePhotoSelect} className="hidden" />
          <button
            onClick={() => fileInputRef2.current?.click()}
            disabled={loading}
            className="bg-[#1a2332] hover:bg-[#222d3e] rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:opacity-50 flex-shrink-0 transition-colors"
          >
            📎
          </button>
          
          <button
            onClick={toggleListening}
            disabled={loading}
            className={`rounded-full w-11 h-11 flex items-center justify-center text-lg flex-shrink-0 transition-all ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                : 'bg-[#1a2332] hover:bg-[#222d3e] disabled:opacity-50'
            }`}
          >
            🎤
          </button>

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

          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !pendingPhotos.length)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-11 h-11 flex items-center justify-center text-lg disabled:bg-gray-600 disabled:opacity-50 flex-shrink-0 transition-colors"
          >
            {loading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  )
}