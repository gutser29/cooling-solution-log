import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import webpush from 'web-push'

const SUBS_KEY = 'cs:push:subs'
const ALERTS_KEY = 'cs:push:alerts'

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

function setupVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

interface PushNotif {
  title: string
  body: string
  url: string
}

// GET — called by Vercel Cron (7:00 AM AST = 11:00 UTC)
export async function GET(req: NextRequest) {
  // Vercel cron sends Authorization header with CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleNotify()
}

// POST — manual trigger (from app or testing)
export async function POST() {
  return handleNotify()
}

async function handleNotify() {
  try {
    setupVapid()
    const redis = getRedis()
    const now = Date.now()
    const today = new Date().toISOString().split('T')[0]
    const notifiedKey = `cs:push:notified:${today}`

    // Load subscriptions
    const subsHash = await redis.hgetall(SUBS_KEY) as Record<string, string> | null
    if (!subsHash || Object.keys(subsHash).length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no subscribers' })
    }
    const subscriptions: PushSubscription[] = Object.values(subsHash).map(v =>
      typeof v === 'string' ? JSON.parse(v) : v
    )

    // Load alert data synced from client
    const alertsRaw = await redis.get(ALERTS_KEY)
    if (!alertsRaw) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no alert data — open the app to sync' })
    }
    const alerts: {
      equipment: { id: number; clientName: string; type: string; nextServiceDue?: number }[]
      contracts: { id: number; clientName: string; serviceType: string; nextServiceDue: number }[]
      invoices: { id: number; clientName: string; invoiceNumber: string; total: number; dueDate?: number }[]
      appointments: { id: number; title: string; clientName: string; date: number }[]
      lowStockItems?: { id: number; name: string; quantity: number; minQuantity: number; unit: string }[]
      creditCards?: { id: number; name: string; last4: string; closing_day: number; payment_due_day: number; current_balance: number; minimum_payment: number; daysToClosing: number; daysToPayment: number }[]
    } = typeof alertsRaw === 'string' ? JSON.parse(alertsRaw) : alertsRaw

    // Already-notified categories today
    const alreadyNotified = (await redis.smembers(notifiedKey)) as string[]
    const notifiedSet = new Set(alreadyNotified)

    const notifications: PushNotif[] = []

    // ── Overdue equipment maintenance ─────────────────────────────────────────
    if (!notifiedSet.has('equipment')) {
      const overdue = (alerts.equipment || []).filter(e => e.nextServiceDue && e.nextServiceDue < now)
      if (overdue.length > 0) {
        notifications.push({
          title: '🔧 Mantenimiento Vencido',
          body: overdue.length === 1
            ? `${overdue[0].clientName} — ${overdue[0].type}`
            : `${overdue.length} equipos con mantenimiento vencido`,
          url: '/',
        })
        await redis.sadd(notifiedKey, 'equipment')
      }
    }

    // ── Overdue contract services ─────────────────────────────────────────────
    if (!notifiedSet.has('contracts')) {
      const overdue = (alerts.contracts || []).filter(c => c.nextServiceDue < now)
      if (overdue.length > 0) {
        notifications.push({
          title: '📋 Servicios de Contrato Vencidos',
          body: overdue.length === 1
            ? `${overdue[0].clientName} — ${overdue[0].serviceType}`
            : `${overdue.length} contratos con servicio pendiente`,
          url: '/',
        })
        await redis.sadd(notifiedKey, 'contracts')
      }
    }

    // ── Overdue invoices ──────────────────────────────────────────────────────
    if (!notifiedSet.has('invoices')) {
      const overdue = (alerts.invoices || []).filter(i => i.dueDate && i.dueDate < now)
      if (overdue.length > 0) {
        const total = overdue.reduce((s, i) => s + (i.total || 0), 0)
        notifications.push({
          title: '🧾 Facturas Vencidas',
          body: overdue.length === 1
            ? `${overdue[0].clientName} — $${overdue[0].total?.toFixed(0)}`
            : `${overdue.length} facturas vencidas — $${total.toFixed(0)} total`,
          url: '/',
        })
        await redis.sadd(notifiedKey, 'invoices')
      }
    }

    // ── Today's appointments ──────────────────────────────────────────────────
    if (!notifiedSet.has('appointments')) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
      const todayAppts = (alerts.appointments || []).filter(
        a => a.date >= todayStart.getTime() && a.date <= todayEnd.getTime()
      )
      if (todayAppts.length > 0) {
        const first = todayAppts[0]
        const time = new Date(first.date).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
        notifications.push({
          title: `📅 ${todayAppts.length === 1 ? 'Cita' : `${todayAppts.length} Citas`} Hoy`,
          body: todayAppts.length === 1
            ? `${first.title}${first.clientName ? ' — ' + first.clientName : ''} a las ${time}`
            : `Primera: ${first.title} a las ${time}`,
          url: '/',
        })
        await redis.sadd(notifiedKey, 'appointments')
      }
    }

    // ── Credit card — closing in 3 days ──────────────────────────────────────
    for (const card of (alerts.creditCards || [])) {
      const closingKey = `card_closing_${card.id}`
      if (!notifiedSet.has(closingKey) && card.daysToClosing === 3) {
        notifications.push({
          title: '📊 Cierre de ciclo próximo',
          body: `${card.name} (···${card.last4}) cierra en 3 días — balance: $${card.current_balance.toFixed(0)}`,
          url: '/',
        })
        await redis.sadd(notifiedKey, closingKey)
      }
      const closingTodayKey = `card_closing_today_${card.id}`
      if (!notifiedSet.has(closingTodayKey) && card.daysToClosing === 0) {
        notifications.push({
          title: '📊 Hoy cierra el ciclo',
          body: `${card.name} (···${card.last4}) — balance final: $${card.current_balance.toFixed(0)}`,
          url: '/',
        })
        await redis.sadd(notifiedKey, closingTodayKey)
      }
    }

    // ── Credit card — payment due in 5 days or less ───────────────────────────
    for (const card of (alerts.creditCards || [])) {
      const payKey = `card_pay_${card.id}`
      if (!notifiedSet.has(payKey) && card.daysToPayment >= 0 && card.daysToPayment <= 5) {
        const urgency = card.daysToPayment === 0 ? '¡HOY!' : `en ${card.daysToPayment} día${card.daysToPayment === 1 ? '' : 's'}`
        notifications.push({
          title: '💳 Pago de tarjeta próximo',
          body: `${card.name} (···${card.last4}) vence ${urgency}${card.minimum_payment > 0 ? ` — mínimo $${card.minimum_payment.toFixed(0)}` : ''}`,
          url: '/',
        })
        await redis.sadd(notifiedKey, payKey)
      }
    }

    // ── Low stock inventory ───────────────────────────────────────────────────
    if (!notifiedSet.has('lowstock')) {
      const lowStock = alerts.lowStockItems || []
      if (lowStock.length > 0) {
        notifications.push({
          title: '📦 Inventario Bajo',
          body: lowStock.length === 1
            ? `${lowStock[0].name}: ${lowStock[0].quantity} ${lowStock[0].unit} (mín ${lowStock[0].minQuantity})`
            : `${lowStock.length} ítems por debajo del mínimo`,
          url: '/',
        })
        await redis.sadd(notifiedKey, 'lowstock')
      }
    }

    // Set TTL on today's notified set (25h covers timezone drift)
    if (notifications.length > 0) {
      await redis.expire(notifiedKey, 25 * 3600)
    }

    // ── Send to all subscribers ───────────────────────────────────────────────
    const deadFields: string[] = []
    let sent = 0

    for (const notif of notifications) {
      const payload = JSON.stringify({ title: notif.title, body: notif.body, url: notif.url, icon: '/logo.png' })
      for (const [field, subRaw] of Object.entries(subsHash)) {
        const sub = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw
        try {
          await webpush.sendNotification(sub as any, payload)
          sent++
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            deadFields.push(field) // Expired subscription
          }
        }
      }
    }

    // Clean up expired subscriptions
    if (deadFields.length > 0) {
      const pipe = redis.pipeline()
      for (const f of [...new Set(deadFields)]) pipe.hdel(SUBS_KEY, f)
      await pipe.exec()
    }

    return NextResponse.json({
      ok: true,
      notifications: notifications.length,
      subscribers: subscriptions.length,
      sent,
      removed: deadFields.length,
    })
  } catch (e: any) {
    console.error('[Push/notify]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
