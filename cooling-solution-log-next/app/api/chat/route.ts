import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

type Incoming =
  | { message: string; system?: string }
  | { messages: Array<{ role: 'user' | 'assistant'; content: string }>; system?: string }

export async function POST(req: Request) {
  // model debe existir también en catch
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'

  try {
    const body = (await req.json()) as Partial<Incoming>

    // Acepta { message: "hola" } o { messages: [...] }
    const messages =
      'messages' in (body as any) && Array.isArray((body as any).messages)
        ? (body as any).messages
        : typeof (body as any).message === 'string'
          ? [{ role: 'user', content: (body as any).message }]
          : null

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing `message` or `messages` in request body.' },
        { status: 400 }
      )
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    // DEBUG: confirma qué modelo se está usando en Vercel
    console.log('USED_MODEL=', model)

    const result = await client.messages.create({
      model,
      max_tokens: 800,
      // system es opcional
      ...(typeof (body as any).system === 'string' ? { system: (body as any).system } : {}),
      messages,
    })

    const text = result.content?.[0]?.type === 'text' ? result.content[0].text : ''

    return NextResponse.json({ text })
  } catch (err: any) {
    // Devuelve el error REAL (Anthropic da status y body)
    const status = err?.status ?? 500
    const details = err?.error ?? err?.message ?? 'API error'

    // DEBUG: incluye el modelo usado
    return NextResponse.json({ error: details, usedModel: model }, { status })
  }
}
