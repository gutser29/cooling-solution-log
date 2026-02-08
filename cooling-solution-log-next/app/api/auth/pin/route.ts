import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()
    const serverPin = process.env.APP_PIN

    if (!serverPin) {
      return NextResponse.json({ error: 'PIN no configurado en servidor' }, { status: 500 })
    }

    if (pin === serverPin) {
      const token = Buffer.from(`${serverPin}-${Date.now()}-cs`).toString('base64')
      return NextResponse.json({ success: true, token })
    }

    return NextResponse.json({ success: false, error: 'PIN incorrecto' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}