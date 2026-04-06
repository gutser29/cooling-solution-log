'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '@/lib/db'
import type { BitacoraEntry, Client, Job } from '@/lib/types'
import { generateBitacoraMonthlyPDF } from '@/lib/pdfGenerator'

interface BitacoraPageProps {
  onNavigate?: (page: string) => void
}

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// Simple fuzzy match: does clientName string roughly match a Client?
function fuzzyMatchClient(name: string, clients: Client[]): number | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()
  const nname = norm(name)
  for (const c of clients) {
    const fullName = norm(`${c.first_name} ${c.last_name}`)
    if (fullName === nname || fullName.includes(nname) || nname.includes(fullName)) return c.id
    // Word overlap
    const nameWords = nname.split(' ').filter(w => w.length > 2)
    const clientWords = fullName.split(' ').filter(w => w.length > 2)
    const overlap = nameWords.filter(w => clientWords.some(cw => cw.includes(w) || w.includes(cw)))
    if (overlap.length > 0 && overlap.length >= Math.min(nameWords.length, clientWords.length)) return c.id
  }
  return undefined
}

export default function BitacoraPage({ onNavigate }: BitacoraPageProps) {
  const [entries, setEntries] = useState<BitacoraEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [mode, setMode] = useState<'list' | 'entry' | 'view'>('list')
  const [inputText, setInputText] = useState('')
  const [entryDate, setEntryDate] = useState(toISO(new Date()))
  const [loading, setLoading] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<BitacoraEntry | null>(null)
  const [editingEntry, setEditingEntry] = useState<BitacoraEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState('')
  const [searching, setSearching] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<BitacoraEntry | null>(null)
  const recognitionRef = useRef<any>(null)

  const load = useCallback(async () => {
    try {
      const [all, allClients, allJobs] = await Promise.all([
        db.table('bitacora').orderBy('date').reverse().toArray(),
        db.clients.toArray(),
        db.jobs.orderBy('date').reverse().limit(100).toArray(),
      ])
      setEntries(all)
      setClients(allClients.filter((c: any) => c.active === true || (c.active as any) === 1))
      setJobs(allJobs)
    } catch (e) { console.error('Error loading bitácora:', e) }
  }, [])

  useEffect(() => { load() }, [load])

  // Speech Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'es-PR'
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          setInputText(prev => (prev + ' ' + event.results[i][0].transcript).trim())
        }
      }
    }
    recognition.onend = () => {
      if (recognitionRef.current?._active) {
        setTimeout(() => { try { recognition.start() } catch {} }, 100)
      } else { setIsListening(false) }
    }
    recognitionRef.current = recognition
  }, [])

  const toggleListening = () => {
    const r = recognitionRef.current
    if (!r) { alert('Tu navegador no soporta dictado. Usa Chrome.'); return }
    if (isListening) {
      r._active = false; try { r.stop() } catch {}; setIsListening(false)
    } else {
      r._active = true; try { r.start(); setIsListening(true) } catch {}
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current._active = false; try { recognitionRef.current.stop() } catch {}; setIsListening(false)
    }
  }

  // ── Open entry mode ────────────────────────────────────────────────────────
  function openNewEntry() {
    setEditingEntry(null)
    setInputText('')
    setEntryDate(toISO(new Date()))
    setMode('entry')
  }

  function openEditEntry(entry: BitacoraEntry) {
    setEditingEntry(entry)
    setInputText(entry.raw_text)
    setEntryDate(entry.date)
    setMode('entry')
    setSelectedEntry(null)
  }

  // ── Submit entry (new or edit) ─────────────────────────────────────────────
  async function handleSubmitEntry() {
    if (!inputText.trim()) return
    setLoading(true)
    stopListening()

    try {
      const dateFormatted = new Date(entryDate + 'T12:00:00').toLocaleDateString('es-PR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })

      // Build client list context for AI
      const clientListStr = clients.slice(0, 40).map(c => `${c.first_name} ${c.last_name}`).join(', ')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `MODO BITÁCORA — Procesa este texto como entrada de bitácora. Fecha: ${dateFormatted} (${entryDate}).
Clientes conocidos: ${clientListStr}

RESPONDE ÚNICAMENTE con SAVE_BITACORA: seguido del JSON en una sola línea. NADA MÁS.

SAVE_BITACORA:{"date":"${entryDate}","raw_text":"texto original","summary":"resumen organizado","tags":["tag1"],"clients_mentioned":["Cliente Exacto"],"locations":["Bayamón"],"equipment":["Package Unit Carrier"],"jobs_count":1,"hours_estimated":3,"had_emergency":false,"highlights":["punto clave"],"invoice_pending":false}

REGLAS:
- clients_mentioned: usa el nombre más parecido de la lista de clientes conocidos si coincide
- invoice_pending: true si el usuario menciona trabajo/instalación/servicio pero NO dice que ya se facturó o que el cliente pagó
- invoice_pending: false si el usuario dice "le envié factura", "ya pagó", "está pagado", "lo facturé"
- summary: resumen en 2-3 oraciones de qué hizo el técnico ese día
- highlights: puntos más importantes (equipo cambiado, problema encontrado, cliente satisfecho, etc.)

Texto del usuario:
${inputText}`
          }]
        }),
      })

      const data = await response.json()
      const text = data.text || ''

      // Extract SAVE_BITACORA JSON
      let bitacoraData: any = null
      const match = text.match(/SAVE_BITACORA:\s*(\{[\s\S]*\})/i)
      if (match) {
        try {
          const jsonStr = match[1]
          let depth = 0, inStr = false, esc = false, end = 0
          for (let i = 0; i < jsonStr.length; i++) {
            const c = jsonStr[i]
            if (esc) { esc = false; continue }
            if (c === '\\') { esc = true; continue }
            if (c === '"') { inStr = !inStr; continue }
            if (inStr) continue
            if (c === '{') depth++
            else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break } }
          }
          bitacoraData = JSON.parse(jsonStr.substring(0, end))
        } catch (e) { console.error('JSON parse error:', e) }
      }

      if (!bitacoraData) {
        alert('Error: la AI no pudo procesar la entrada. Intenta de nuevo.')
        setLoading(false)
        return
      }

      // Fuzzy-match clients_mentioned to real client IDs
      const clientIds: number[] = []
      for (const name of (bitacoraData.clients_mentioned || [])) {
        const id = fuzzyMatchClient(name, clients)
        if (id !== undefined) clientIds.push(id)
      }

      // Find matching jobs for the entry date (same date)
      const entryDayStart = new Date(entryDate + 'T00:00:00').getTime()
      const entryDayEnd = entryDayStart + 86400000 - 1
      const matchedJobs = jobs.filter(j => {
        const ts = j.date_started || j.date
        return ts >= entryDayStart && ts <= entryDayEnd
      })
      const jobIds = matchedJobs.map(j => j.id!).filter(Boolean)

      const entry: BitacoraEntry = {
        date: bitacoraData.date || entryDate,
        raw_text: inputText,
        summary: bitacoraData.summary || '',
        tags: bitacoraData.tags || [],
        clients_mentioned: bitacoraData.clients_mentioned || [],
        client_ids: clientIds,
        locations: bitacoraData.locations || [],
        equipment: bitacoraData.equipment || [],
        jobs_count: bitacoraData.jobs_count || 0,
        job_ids: jobIds.length > 0 ? jobIds : undefined,
        hours_estimated: bitacoraData.hours_estimated || 0,
        had_emergency: bitacoraData.had_emergency || false,
        highlights: bitacoraData.highlights || [],
        invoice_pending: bitacoraData.invoice_pending || false,
        created_at: editingEntry?.created_at || Date.now(),
        updated_at: Date.now(),
      }

      if (editingEntry?.id) {
        // Full replace when editing
        await db.table('bitacora').put({ ...entry, id: editingEntry.id })
      } else {
        // Check if entry for this date already exists → merge
        const existing = await db.table('bitacora').where('date').equals(entry.date).first()
        if (existing) {
          const merged: BitacoraEntry = {
            ...entry,
            id: existing.id,
            raw_text: existing.raw_text + '\n\n---\n\n' + inputText,
            tags: [...new Set([...existing.tags, ...entry.tags])],
            clients_mentioned: [...new Set([...existing.clients_mentioned, ...entry.clients_mentioned])],
            client_ids: [...new Set([...(existing.client_ids || []), ...clientIds])],
            locations: [...new Set([...existing.locations, ...entry.locations])],
            equipment: [...new Set([...existing.equipment, ...entry.equipment])],
            jobs_count: (existing.jobs_count || 0) + (entry.jobs_count || 0),
            job_ids: [...new Set([...(existing.job_ids || []), ...jobIds])],
            hours_estimated: (existing.hours_estimated || 0) + (entry.hours_estimated || 0),
            had_emergency: existing.had_emergency || entry.had_emergency,
            highlights: [...existing.highlights, ...entry.highlights],
            invoice_pending: existing.invoice_pending || entry.invoice_pending,
            created_at: existing.created_at,
          }
          await db.table('bitacora').put(merged)
        } else {
          await db.table('bitacora').add(entry)
        }
      }

      setInputText('')
      setEditingEntry(null)
      setMode('list')
      await load()
    } catch (e) {
      console.error('Error processing bitácora:', e)
      alert('Error procesando la entrada. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResult('')
    try {
      const allEntries = await db.table('bitacora').toArray()
      const context = allEntries.map((e: any) => ({
        date: e.date, summary: e.summary, tags: e.tags,
        clients_mentioned: e.clients_mentioned, locations: e.locations,
        equipment: e.equipment, highlights: e.highlights,
        jobs_count: e.jobs_count, had_emergency: e.had_emergency,
        invoice_pending: e.invoice_pending,
      }))
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `MODO BÚSQUEDA BITÁCORA — Responde BREVEMENTE basándote en los datos. Si preguntan por trabajos sin factura, busca los que tienen invoice_pending: true.

DATOS DE BITÁCORA:
${JSON.stringify(context)}

PREGUNTA: ${searchQuery}`
          }]
        }),
      })
      const data = await response.json()
      setSearchResult(data.text || 'No encontré información.')
    } catch { setSearchResult('Error buscando en la bitácora.') }
    finally { setSearching(false) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deleteEntry(entry: BitacoraEntry) {
    if (!entry.id) return
    await db.table('bitacora').delete(entry.id)
    setShowDeleteConfirm(null)
    if (selectedEntry?.id === entry.id) { setSelectedEntry(null); setMode('list') }
    await load()
  }

  // ── Create invoice from bitácora ───────────────────────────────────────────
  function createInvoiceFromEntry(entry: BitacoraEntry) {
    const clientName = entry.clients_mentioned[0] || ''
    const prefill = {
      client_name: clientName,
      description: entry.highlights[0] || entry.summary?.substring(0, 100) || 'Servicio técnico',
      date: entry.date,
    }
    try { sessionStorage.setItem('invoice_bitacora_prefill', JSON.stringify(prefill)) } catch {}
    onNavigate?.('invoices')
  }

  // ── Monthly PDF ───────────────────────────────────────────────────────────
  async function generateMonthPDF() {
    const month = selectedMonth || toISO(new Date()).substring(0, 7)
    const monthEntries = entries.filter(e => e.date.startsWith(month))
    if (monthEntries.length === 0) { alert('No hay entradas para este período.'); return }
    setGeneratingPDF(true)
    try {
      const d = new Date(month + '-01')
      const label = d.toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
      generateBitacoraMonthlyPDF(monthEntries, label)
    } catch (e) { console.error('PDF error:', e); alert('Error generando PDF.') }
    finally { setGeneratingPDF(false) }
  }

  // ── Filter & group ────────────────────────────────────────────────────────
  const filtered = selectedMonth ? entries.filter(e => e.date.startsWith(selectedMonth)) : entries
  const uniqueMonths = [...new Set(entries.map(e => e.date.substring(0, 7)))].sort().reverse()
  const pendingCount = entries.filter(e => e.invoice_pending).length

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const monthLabel = (m: string) => new Date(m + '-01').toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate?.('dashboard')} className="text-lg">←</button>
          <div>
            <h1 className="text-xl font-bold">📒 Bitácora</h1>
            {pendingCount > 0 && (
              <p className="text-xs text-yellow-300">⚠️ {pendingCount} trabajo{pendingCount > 1 ? 's' : ''} sin factura</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generateMonthPDF} disabled={generatingPDF}
            className="bg-white/10 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-50">
            {generatingPDF ? '...' : '📄 PDF'}
          </button>
          <button onClick={openNewEntry} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">
            + Dictar
          </button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="¿Qué hice el martes? ¿Trabajos sin factura?"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button onClick={handleSearch} disabled={searching}
              className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              {searching ? '...' : '🔍'}
            </button>
          </div>
          {searchResult && (
            <div className="mt-2 bg-purple-900/30 border border-purple-700/30 rounded-xl p-3 text-sm whitespace-pre-wrap text-gray-200">
              {searchResult}
            </div>
          )}
        </div>

        {/* Entry / Edit Mode */}
        {mode === 'entry' && (
          <div className="mb-4 bg-[#111a2e] rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-200">
                {editingEntry ? '✏️ Editar entrada' : '📝 Nueva entrada'}
              </h2>
              <div>
                <label className="text-xs text-gray-400 mr-1">Fecha:</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                  className="bg-[#0b1220] border border-white/20 rounded-lg px-2 py-1 text-xs text-white" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Escribe o dicta todo lo que hiciste. La AI extrae clientes, equipos y detecta si falta factura.
            </p>
            {isListening && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-900/20 rounded-xl border border-red-800/30">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-red-400 font-medium">Dictando...</span>
                <span className="text-xs text-gray-500 ml-auto">Toca 🎤 para parar</span>
              </div>
            )}
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Hoy fui a Farmacia Caridad #40, hice limpieza profunda de 2 package units Carrier, cambié filtros poly y contactor... Después fui a Home Depot..."
              rows={7}
              className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { stopListening(); setMode(selectedEntry ? 'view' : 'list'); setEditingEntry(null) }}
                className="bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm px-4">
                Cancelar
              </button>
              <button onClick={toggleListening}
                className={`py-2.5 rounded-xl text-sm px-4 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-purple-600 text-white'}`}>
                🎤 {isListening ? 'Parar' : 'Dictar'}
              </button>
              <button
                onClick={handleSubmitEntry}
                disabled={loading || !inputText.trim()}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                {loading ? '⏳ Procesando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        )}

        {/* View Entry */}
        {mode === 'view' && selectedEntry && (
          <div className="mb-4 bg-[#111a2e] rounded-xl p-4 border border-white/10">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-200">{formatDate(selectedEntry.date)}</h2>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {selectedEntry.had_emergency && (
                    <span className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded-full">🚨 Emergencia</span>
                  )}
                  <span className="bg-blue-900/50 text-blue-400 text-xs px-2 py-0.5 rounded-full">
                    {selectedEntry.jobs_count} trabajo{selectedEntry.jobs_count !== 1 ? 's' : ''}
                  </span>
                  {selectedEntry.hours_estimated > 0 && (
                    <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                      ~{selectedEntry.hours_estimated}h
                    </span>
                  )}
                  {selectedEntry.invoice_pending && (
                    <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                      ⚠️ Sin factura
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 ml-2">
                <button onClick={() => openEditEntry(selectedEntry)}
                  className="text-xs bg-white/10 hover:bg-white/20 text-gray-300 px-2 py-1 rounded-lg">✏️</button>
                <button onClick={() => { setMode('list'); setSelectedEntry(null) }}
                  className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
              </div>
            </div>

            {/* Invoice pending action */}
            {selectedEntry.invoice_pending && (
              <div className="mb-3 bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-yellow-400">⚠️ Trabajo sin factura detectado</p>
                  <p className="text-xs text-gray-400 mt-0.5">Cliente: {selectedEntry.clients_mentioned[0] || 'sin cliente'}</p>
                </div>
                <button
                  onClick={() => createInvoiceFromEntry(selectedEntry)}
                  className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-medium shrink-0 ml-2">
                  🧾 Crear Factura
                </button>
              </div>
            )}

            {selectedEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {selectedEntry.tags.map((tag, i) => (
                  <span key={i} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            )}

            {selectedEntry.clients_mentioned.length > 0 && (
              <div className="mb-2 text-sm">
                <span className="text-xs text-gray-500">👤 Clientes: </span>
                <span className="text-gray-300">{selectedEntry.clients_mentioned.join(', ')}</span>
                {selectedEntry.client_ids && selectedEntry.client_ids.length > 0 && (
                  <span className="text-xs text-green-500 ml-1">✓ vinculados</span>
                )}
              </div>
            )}
            {selectedEntry.locations.length > 0 && (
              <div className="mb-2 text-sm">
                <span className="text-xs text-gray-500">📍 Ubicaciones: </span>
                <span className="text-gray-300">{selectedEntry.locations.join(', ')}</span>
              </div>
            )}
            {selectedEntry.equipment.length > 0 && (
              <div className="mb-2 text-sm">
                <span className="text-xs text-gray-500">🔧 Equipos: </span>
                <span className="text-gray-300">{selectedEntry.equipment.join(', ')}</span>
              </div>
            )}
            {selectedEntry.job_ids && selectedEntry.job_ids.length > 0 && (
              <div className="mb-2 text-sm">
                <span className="text-xs text-gray-500">🔗 Trabajos vinculados: </span>
                <span className="text-gray-300">Job#{selectedEntry.job_ids.join(', #')}</span>
              </div>
            )}
            {selectedEntry.highlights.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 block mb-1">⭐ Puntos importantes:</span>
                {selectedEntry.highlights.map((h, i) => (
                  <div key={i} className="text-sm text-yellow-400 ml-2">• {h}</div>
                ))}
              </div>
            )}

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{showRaw ? 'Texto original' : 'Resumen AI'}</span>
                <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-blue-400">
                  {showRaw ? 'Ver resumen' : 'Ver original'}
                </button>
              </div>
              <div className="bg-[#0b1220] rounded-xl p-3 text-sm whitespace-pre-wrap text-gray-300 border border-white/5">
                {showRaw ? selectedEntry.raw_text : selectedEntry.summary}
              </div>
            </div>

            <button onClick={() => setShowDeleteConfirm(selectedEntry)} className="text-red-400 text-xs">
              🗑️ Eliminar esta entrada
            </button>
          </div>
        )}

        {/* List mode */}
        {mode === 'list' && (
          <>
            {/* Month filter */}
            {uniqueMonths.length > 0 && (
              <div className="mb-3">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedMonth('')}
                    className={`text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${!selectedMonth ? 'bg-purple-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                    Todos
                  </button>
                  {uniqueMonths.map(m => (
                    <button key={m} onClick={() => setSelectedMonth(m)}
                      className={`text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${selectedMonth === m ? 'bg-purple-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                      {monthLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">📒</p>
                <p className="text-gray-500">No hay entradas en la bitácora</p>
                <p className="text-gray-600 text-sm mt-1">Toca "+ Dictar" para registrar tu día</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => { setSelectedEntry(entry); setMode('view'); setShowRaw(false) }}
                    className="w-full text-left bg-[#111a2e] rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-200 capitalize">
                            {formatDate(entry.date)}
                          </span>
                          {entry.invoice_pending && (
                            <span className="text-[10px] bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded-full border border-yellow-600/20 shrink-0">
                              ⚠️ Sin factura
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {entry.summary?.substring(0, 120)}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.had_emergency && (
                            <span className="bg-red-900/50 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full">🚨</span>
                          )}
                          <span className="bg-blue-900/50 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full">
                            {entry.jobs_count} trabajo{entry.jobs_count !== 1 ? 's' : ''}
                          </span>
                          {entry.hours_estimated > 0 && (
                            <span className="bg-gray-800 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">
                              ~{entry.hours_estimated}h
                            </span>
                          )}
                          {entry.clients_mentioned.slice(0, 2).map((c, i) => (
                            <span key={i} className="bg-gray-800 text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[100px]">{c}</span>
                          ))}
                          {entry.clients_mentioned.length > 2 && (
                            <span className="text-gray-600 text-[10px]">+{entry.clients_mentioned.length - 2}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-600 text-lg ml-2 shrink-0">›</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#111a2e] border border-white/10 rounded-2xl p-5 max-w-sm w-full">
            <h3 className="text-base font-bold text-white mb-2">Eliminar entrada</h3>
            <p className="text-sm text-gray-400 mb-4">
              ¿Seguro que deseas borrar la entrada del {formatDate(showDeleteConfirm.date)}? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-white/20 rounded-xl text-sm text-gray-400 hover:text-white">
                Cancelar
              </button>
              <button onClick={() => deleteEntry(showDeleteConfirm)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-semibold text-white">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
