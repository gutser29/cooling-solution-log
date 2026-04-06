import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import webpush from 'web-push'

const SUBS_KEY = 'cs:push:subs'
const ALERTS_KEY = 'cs:push:alerts'

export const runtime = 'nodejs'

function getRedis() {
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

// GET — called by Vercel Cron at 22:00 UTC (6pm AST)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    )

    const redis = getRedis()
    const today = new Date().toISOString().split('T')[0]
    const notifiedKey = `cs:push:bitacora:${today}`

    // Only send once per day
    const alreadySent = await redis.exists(notifiedKey)
    if (alreadySent) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'already sent today' })
    }

    // Check if user already created bitácora entry today
    const alertsRaw = await redis.get(ALERTS_KEY)
    if (alertsRaw) {
      const alerts: any = typeof alertsRaw === 'string' ? JSON.parse(alertsRaw) : alertsRaw
      if (alerts.lastBitacoraDate === today) {
        return NextResponse.json({ ok: true, sent: 0, reason: 'bitacora already written today' })
      }
    }

    // Load subscribers
    const subsHash = await redis.hgetall(SUBS_KEY) as Record<string, string> | null
    if (!subsHash || Object.keys(subsHash).length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no subscribers' })
    }

    const payload = JSON.stringify({
      title: '📒 ¿Ya dictaste tu bitácora?',
      body: 'Registra los trabajos de hoy antes de que se te olvide.',
      url: '/',
      icon: '/logo.png',
    })

    const deadFields: string[] = []
    let sent = 0

    for (const [field, subRaw] of Object.entries(subsHash)) {
      const sub = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw
      try {
        await webpush.sendNotification(sub as any, payload)
        sent++
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) deadFields.push(field)
      }
    }

    // Mark as sent today (TTL 25h)
    await redis.set(notifiedKey, '1', { ex: 25 * 3600 })

    // Clean expired subscriptions
    if (deadFields.length > 0) {
      const pipe = redis.pipeline()
      for (const f of [...new Set(deadFields)]) pipe.hdel(SUBS_KEY, f)
      await pipe.exec()
    }

    return NextResponse.json({ ok: true, sent, removed: deadFields.length })
  } catch (e: any) {
    console.error('[Push/bitacora-reminder]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
