import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { photos } = await request.json()

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const content: any[] = [
      {
        type: 'text',
        text:
          'Analiza estas fotos de recibos/trabajos. Extrae: categoría (comida/gasolina/materiales/etc), monto total, vendor/restaurante, cliente (si aplica), descripción. Responde SOLO con JSON: {"category":"","amount":0,"vendor":"","client":"","description":""}'
      }
    ]

    photos.forEach((photo: string) => {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: photo.split(',')[1]
        }
      })
    })

    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content }]
    })

    const text = response.content
      .map((block: any) => (block.type === 'text' ? block.text : ''))
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    return NextResponse.json(parsed)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unknown error' }, { status: 500 })
  }
}
