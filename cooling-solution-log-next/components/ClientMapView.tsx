'use client'

import { useEffect, useRef, useState } from 'react'
import { db } from '@/lib/db'
import type { Client } from '@/lib/types'

interface Props {
  clients: Client[]
  onSelectClient: (clientId: number) => void
  onClose: () => void
}

const PR_CENTER: [number, number] = [18.22, -66.59]
const GEOCACHE_KEY = 'cs_geocache_v2'
const SOON_MS = 30 * 86400000 // 30 days

type CacheEntry = { lat: number; lng: number } | null
type GeoCache = Record<string, CacheEntry>

function loadCache(): GeoCache {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(GEOCACHE_KEY) || '{}') } catch { return {} }
}
function saveCache(c: GeoCache) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(GEOCACHE_KEY, JSON.stringify(c)) } catch {}
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = encodeURIComponent(`${address}, Puerto Rico`)
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=es`,
      { headers: { 'User-Agent': 'CoolingSolutionPR/1.0 (management app)' } }
    )
    if (!r.ok) return null
    const d = await r.json()
    if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    return null
  } catch { return null }
}

function markerSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27S30 25.5 30 15C30 6.7 23.3 0 15 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="15" cy="15" r="7" fill="white" fill-opacity="0.85"/>
  </svg>`
}

const MARKER_COLORS = { red: '#ef4444', yellow: '#f59e0b', green: '#22c55e' }

interface MapPoint {
  lat: number
  lng: number
  clientId: number
  clientName: string
  label: string
  address: string
  status: 'red' | 'yellow' | 'green'
  lastService?: number
  nextDue?: number
  phone?: string
}

// ── Legend pill ───────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span> Al día</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span> Próx. 30d</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Vencido</span>
    </div>
  )
}

export default function ClientMapView({ clients, onSelectClient, onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState('Cargando datos...')
  const [total, setTotal] = useState(0)
  const [geocoded, setGeocoded] = useState(0)
  const [done, setDone] = useState(false)

  // Mount guard — ensures this component never executes browser APIs during SSR
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    if (typeof window === 'undefined') return

    // Inject Leaflet CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
    link.crossOrigin = ''
    document.head.appendChild(link)

    let cancelled = false

    async function init() {
      // Dynamic import to avoid SSR
      const L = (await import('leaflet')).default
      if (cancelled || !mapRef.current) return

      // Init map
      const map = L.map(mapRef.current, { center: PR_CENTER, zoom: 10, zoomControl: true })
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      // Load maintenance data
      setStatus('Leyendo datos de mantenimiento...')
      const [allLocations, allEquipment, allContracts] = await Promise.all([
        db.client_locations.toArray(),
        db.equipment.toArray(),
        db.contracts.toArray(),
      ])
      if (cancelled) return

      const now = Date.now()

      function clientStatus(clientId: number): { status: 'red' | 'yellow' | 'green'; nextDue?: number; lastService?: number } {
        let st: 'red' | 'yellow' | 'green' = 'green'
        let nextDue: number | undefined
        const lastDates: number[] = []

        // Equipment
        allEquipment.filter(e => e.client_id === clientId).forEach(e => {
          if (e.last_service_date) lastDates.push(e.last_service_date)
          if (!e.next_service_due) return
          if (!nextDue || e.next_service_due < nextDue) nextDue = e.next_service_due
          if (e.next_service_due < now) st = 'red'
          else if (e.next_service_due - now < SOON_MS && st !== 'red') st = 'yellow'
        })

        // Contracts
        allContracts.filter(c => c.client_id === clientId && c.status === 'active').forEach(c => {
          if (!nextDue || c.next_service_due < nextDue) nextDue = c.next_service_due
          if (c.next_service_due < now) st = 'red'
          else if (c.next_service_due - now < SOON_MS && st !== 'red') st = 'yellow'
        })

        // Locations
        allLocations.filter(l => l.client_id === clientId).forEach(l => {
          if (l.last_service_date) lastDates.push(l.last_service_date)
          if (!l.next_service_due) return
          if (!nextDue || l.next_service_due < nextDue) nextDue = l.next_service_due
          if (l.next_service_due < now) st = 'red'
          else if (l.next_service_due - now < SOON_MS && st !== 'red') st = 'yellow'
        })

        const lastService = lastDates.length > 0 ? Math.max(...lastDates) : undefined
        return { status: st, nextDue, lastService }
      }

      // Build geocoding queue
      type GeoTask = { address: string; clientId: number; clientName: string; label: string; phone?: string }
      const tasks: GeoTask[] = []

      for (const client of clients) {
        const cName = `${client.first_name} ${client.last_name}`.trim()
        const locs = allLocations.filter(l => l.client_id === client.id && l.active && l.address?.trim())
        if (locs.length > 0) {
          locs.forEach(loc => tasks.push({
            address: loc.address,
            clientId: client.id!,
            clientName: cName,
            label: `${cName} — ${loc.name}`,
            phone: client.phone,
          }))
        } else if (client.address?.trim()) {
          tasks.push({ address: client.address, clientId: client.id!, clientName: cName, label: cName, phone: client.phone })
        }
      }

      setTotal(tasks.length)

      const cache = loadCache()
      const points: MapPoint[] = []
      let needSave = false

      for (let i = 0; i < tasks.length; i++) {
        if (cancelled) return
        const task = tasks[i]
        const key = task.address.trim().toLowerCase()
        let coords: CacheEntry = key in cache ? cache[key] : undefined as any

        if (coords === undefined) {
          setStatus(`Geocodificando ${i + 1}/${tasks.length}: ${task.clientName}`)
          const result = await geocodeAddress(task.address)
          cache[key] = result
          coords = result
          needSave = true
          // Nominatim rate limit: 1 req/sec
          if (i < tasks.length - 1) await new Promise(r => setTimeout(r, 1100))
        }

        if (coords) {
          const { status: st, nextDue, lastService } = clientStatus(task.clientId)
          points.push({
            lat: coords.lat, lng: coords.lng,
            clientId: task.clientId, clientName: task.clientName,
            label: task.label, address: task.address,
            status: st, nextDue, lastService, phone: task.phone,
          })
        }
        setGeocoded(i + 1)
      }

      if (needSave) saveCache(cache)
      if (cancelled) return

      setStatus('')
      setDone(true)

      // Register global popup callback
      ;(window as any)._csSelectClient = (id: number) => {
        onSelectClient(id)
      }

      // Add markers
      for (const pt of points) {
        const icon = L.divIcon({
          html: markerSvg(MARKER_COLORS[pt.status]),
          className: '',
          iconSize: [30, 42],
          iconAnchor: [15, 42],
          popupAnchor: [0, -44],
        })

        const statusLabel = pt.status === 'red' ? '<span style="color:#ef4444">🔴 Vencido</span>'
          : pt.status === 'yellow' ? '<span style="color:#f59e0b">🟡 Próximo (30d)</span>'
          : '<span style="color:#22c55e">🟢 Al día</span>'

        const nextDueHtml = pt.nextDue
          ? `<div style="font-size:11px;margin-top:2px">Próximo: <b>${new Date(pt.nextDue).toLocaleDateString('es-PR', { day: '2-digit', month: 'short', year: 'numeric' })}</b></div>`
          : ''
        const lastHtml = pt.lastService
          ? `<div style="font-size:11px;color:#94a3b8">Último: ${new Date(pt.lastService).toLocaleDateString('es-PR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>`
          : ''

        const popupHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-width:190px;max-width:240px;padding:2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.2">${pt.clientName}</div>
            ${pt.label !== pt.clientName ? `<div style="font-size:11px;color:#6366f1;margin-top:1px">${pt.label.replace(pt.clientName + ' — ', '')}</div>` : ''}
            <div style="font-size:11px;color:#64748b;margin-top:3px">${pt.address}</div>
            <div style="margin-top:5px;font-size:12px">${statusLabel}</div>
            ${nextDueHtml}${lastHtml}
            <button
              onclick="window._csSelectClient(${pt.clientId})"
              style="margin-top:8px;width:100%;padding:7px 0;background:#3b82f6;color:white;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s"
              onmouseover="this.style.background='#2563eb'"
              onmouseout="this.style.background='#3b82f6'"
            >Ver Perfil →</button>
          </div>`

        L.marker([pt.lat, pt.lng], { icon })
          .addTo(map)
          .bindPopup(popupHtml, { maxWidth: 270, closeButton: true })
          .bindTooltip(pt.clientName, { direction: 'top', offset: [0, -40] })
      }

      // Fit map to all markers
      if (points.length > 0) {
        const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      }
    }

    init().catch(e => {
      console.error('Map init error:', e)
      setStatus('Error cargando mapa')
    })

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove() } catch {}
        mapInstanceRef.current = null
      }
      link.remove()
      delete (window as any)._csSelectClient
    }
  }, [mounted]) // runs once after client mount confirmed

  // Never render anything on the server — prevents Leaflet SSR crashes
  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1220]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-lg font-bold">←</button>
          <h2 className="text-lg font-bold">🗺️ Mapa de Clientes</h2>
        </div>
        <div className="flex items-center gap-2">
          <Legend />
          {done && total > 0 && (
            <span className="text-xs text-white/70 ml-1">{geocoded} ubicaciones</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!done && total > 0 && (
        <div className="shrink-0 bg-[#111a2e] px-4 py-2 border-b border-white/10">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{status}</span>
            <span>{geocoded}/{total}</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: total > 0 ? `${(geocoded / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Loading overlay before map is ready */}
      {!done && total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 top-16">
          <div className="bg-[#111a2e] border border-white/10 rounded-xl px-6 py-4 text-gray-400 text-sm">
            {status}
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1" />
    </div>
  )
}
