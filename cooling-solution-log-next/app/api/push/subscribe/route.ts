import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const SUBS_KEY = 'cs:push:subs'

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

// Stable field name from endpoint URL (last 80 chars is unique enough)
function subField(endpoint: string): string {
  return endpoint.slice(-80).replace(/[^a-zA-Z0-9]/g, '_')
}

// POST — add subscription
export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json()
    if (!subscription?.endpoint) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    const redis = getRedis()
    await redis.hset(SUBS_KEY, { [subField(subscription.endpoint)]: JSON.stringify(subscription) })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[Push/subscribe POST]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — remove subscription
export async function DELETE(req: NextRequest) {
  try {
    const { subscription } = await req.json()
    if (!subscription?.endpoint) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    const redis = getRedis()
    await redis.hdel(SUBS_KEY, subField(subscription.endpoint))
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[Push/subscribe DELETE]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
