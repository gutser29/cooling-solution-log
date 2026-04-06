'use client'

// ─── VAPID key helper ────────────────────────────────────────────────────────
export function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = (typeof window !== 'undefined' ? window : globalThis).atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output.buffer as ArrayBuffer
}

// ─── Register service worker ─────────────────────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch (e) {
    console.error('[Push] SW registration failed:', e)
    return null
  }
}

// ─── Subscribe and persist to server ────────────────────────────────────────
export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('PushManager' in window)) return false
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) { console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set'); return false }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    })
    return true
  } catch (e) {
    console.error('[Push] Subscription failed:', e)
    return false
  }
}

// ─── Unsubscribe ─────────────────────────────────────────────────────────────
export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    })
    await sub.unsubscribe()
  } catch (e) {
    console.error('[Push] Unsubscribe failed:', e)
  }
}

// ─── Check current permission state ──────────────────────────────────────────
export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

// ─── Sync alert data from IndexedDB to server ────────────────────────────────
// Must only be called client-side after authentication
export async function syncAlertsToServer(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { db } = await import('./db')
    const now = Date.now()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(todayStart); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1); tomorrowEnd.setHours(23, 59, 59, 999)

    const [equipment, contracts, invoices, appointments, inventoryItems] = await Promise.all([
      db.equipment.toArray(),
      db.contracts.toArray(),
      db.invoices.toArray(),
      db.appointments.toArray(),
      db.inventory_items.filter(i => i.active).toArray(),
    ])

    const payload = {
      equipment: equipment
        .filter(e => e.next_service_due)
        .map(e => ({ id: e.id, clientName: e.client_name || '', type: e.equipment_type, nextServiceDue: e.next_service_due })),
      contracts: contracts
        .filter(c => c.status === 'active')
        .map(c => ({ id: c.id, clientName: c.client_name || `Cliente #${c.client_id}`, serviceType: c.service_type, nextServiceDue: c.next_service_due })),
      invoices: invoices
        .filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'))
        .map(i => ({ id: i.id, clientName: i.client_name, invoiceNumber: i.invoice_number, total: i.total, dueDate: i.due_date })),
      appointments: appointments
        .filter(a => a.status === 'scheduled' && a.date >= todayStart.getTime() && a.date <= tomorrowEnd.getTime())
        .map(a => ({ id: a.id, title: a.title, clientName: a.client_name || '', date: a.date })),
      lowStockItems: inventoryItems
        .filter(i => i.quantity <= i.min_quantity)
        .map(i => ({ id: i.id, name: i.name, quantity: i.quantity, minQuantity: i.min_quantity, unit: i.unit })),
      syncedAt: now,
    }

    await fetch('/api/push/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('[Push] Alert sync failed:', e)
  }
}
