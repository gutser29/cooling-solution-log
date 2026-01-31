import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    const result = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: 800,
      messages,
    })

    const text =
      result.content?.[0]?.type === 'text' ? result.content[0].text : ''

    return NextResponse.json({ text })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'API error' },
      { status: 500 }
    )
  }
}
