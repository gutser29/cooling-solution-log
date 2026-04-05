import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const ALERTS_KEY = 'cs:push:alerts'
const TTL = 8 * 24 * 3600 // 8 days — covers a full week + buffer

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

// POST — client syncs current alert data from IndexedDB
export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const redis = getRedis()
    await redis.set(ALERTS_KEY, JSON.stringify(data), { ex: TTL })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[Push/sync]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
