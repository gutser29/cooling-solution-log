import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  photos?: string[]
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messages: ChatMessage[] = body.messages || []

    if (!messages.length) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 })
    }

    const lastMsg = messages[messages.length - 1]
    const userText = (lastMsg.content || '').toLowerCase()

    // ====== SOLO INTERCEPTAR REPORTES P&L Y AR ======
    // Todo lo demás va a Claude

    // P&L Report
    if (userText.includes('p&l') || userText.includes('p & l') || userText.includes('profit') || 
        (userText.includes('perdida') && userText.includes('ganancia')) ||
        (userText.includes('pérdida') && userText.includes('ganancia'))) {
      let period: 'week' | 'month' | 'year' = 'month'
      let periodLabel = 'este mes'
      if (userText.includes('semana') || userText.includes('week')) { period = 'week'; periodLabel = 'esta semana' }
      else if (userText.includes('año') || userText.includes('ano') || userText.includes('year')) { period = 'year'; periodLabel = 'este año' }
      const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
      for (const m of months) {
        if (userText.includes(m)) { period = 'month'; periodLabel = m; break }
      }
      return NextResponse.json({ type: 'GENERATE_PL', payload: { period, periodLabel } })
    }

    // Cuentas por cobrar
    if (userText.includes('quien me debe') || userText.includes('quién me debe') || 
        userText.includes('cuentas por cobrar') || userText.includes('me deben dinero')) {
      return NextResponse.json({ type: 'GENERATE_AR' })
    }

    // ====== TODO LO DEMÁS VA A CLAUDE ======
    const now = new Date()
    const todayStr = now.toLocaleDateString('es-PR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const epochNow = Date.now()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const usedModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

    const systemPrompt = `Eres el asistente de Cooling Solution, negocio HVAC en Puerto Rico.
FECHA: ${todayStr} | TIMESTAMP: ${epochNow}

# REGLA PRINCIPAL
Cuando el usuario quiera registrar un GASTO o INGRESO, DEBES responder con el comando SAVE_EVENT.
NO preguntes confirmación para gastos simples - solo guárdalos.

# EJEMPLOS DE GASTOS (responde con SAVE_EVENT):
- "eché $50 de gasolina" → SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":50,"payment_method":"cash","expense_type":"business","timestamp":${epochNow}}
- "gasté $40 en gasolina" → SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":40,"payment_method":"cash","expense_type":"business","timestamp":${epochNow}}
- "pagué $30 en comida" → SAVE_EVENT:{"type":"expense","category":"Comida","amount":30,"payment_method":"cash","expense_type":"business","timestamp":${epochNow}}
- "40 de gas con capital one" → SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":40,"payment_method":"capital_one","expense_type":"business","timestamp":${epochNow}}
- "$25 de materiales en home depot" → SAVE_EVENT:{"type":"expense","category":"Materiales","amount":25,"payment_method":"cash","vendor":"Home Depot","expense_type":"business","timestamp":${epochNow}}

# MÉTODOS DE PAGO
- "capital one", "capital", "cápital" → payment_method: "capital_one"
- "chase" → payment_method: "chase_visa"
- "ath", "ath movil" → payment_method: "ath_movil"
- "sams", "sam's" → payment_method: "sams_mastercard"
- "efectivo", "cash", o si no menciona → payment_method: "cash"
- Si dice "tarjeta" sin especificar → PREGUNTA cuál

# VEHÍCULOS (para gasolina)
- "van", "camioneta", "transit" → vehicle_id: "van"
- "truck", "pickup", "f150" → vehicle_id: "truck"
- "carro", "car" → vehicle_id: "car"

# PERSONAL vs NEGOCIO
- "personal", "pa la casa" → expense_type: "personal"
- Si no dice nada → expense_type: "business"

# CATEGORÍAS
Gastos: Gasolina, Comida, Materiales, Herramientas, Peajes, Mantenimiento, Seguros, Nómina
Ingresos: Servicio, Instalación, Reparación, Mantenimiento, Contrato

# FORMATO OBLIGATORIO
El JSON debe ir en UNA SOLA LÍNEA después de SAVE_EVENT:
✅ SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":50,"payment_method":"cash","expense_type":"business","timestamp":${epochNow}}

# OTROS COMANDOS

## SAVE_CLIENT (nuevo cliente)
SAVE_CLIENT:{"first_name":"Juan","last_name":"Rivera","phone":"787-555-1234","type":"residential"}

## SAVE_NOTE (nota)
SAVE_NOTE:{"title":"Título","content":"Contenido de la nota"}

## SAVE_APPOINTMENT (cita)
SAVE_APPOINTMENT:{"title":"Servicio","date":"2026-02-10T10:00","client_name":"Juan","location":"Bayamón"}

## SAVE_REMINDER (recordatorio)
SAVE_REMINDER:{"text":"Llamar cliente","due_date":"2026-02-08T09:00","priority":"normal"}

## SAVE_INVOICE (factura)
SAVE_INVOICE:{"client_name":"Cliente","items":[{"description":"Servicio","quantity":1,"unit_price":100,"total":100}],"tax_rate":0,"notes":""}

## SAVE_PHOTO (guardar foto con contexto)
SAVE_PHOTO:{"client_name":"Cliente","category":"before","description":"Descripción"}

# FOTOS
Si el usuario envía foto de recibo:
1. Analiza la imagen
2. Extrae: vendor, monto, fecha
3. Responde: "Veo recibo de [vendor] por $[monto]. ¿Lo registro?" 
4. Si confirma → SAVE_EVENT

# CONSULTAS
Para preguntas sobre datos, usa el CONTEXTO_DB que viene en el mensaje.

# IMPORTANTE
- Respuestas BREVES
- NO inventes datos
- Si falta info crítica (monto) → pregunta
- El usuario dicta por voz, puede haber errores de transcripción`

    // Preparar mensajes para Anthropic
    const anthropicMessages = messages.map((m, idx) => {
      const isLast = idx === messages.length - 1
      if (isLast && m.role === 'user' && m.photos && m.photos.length > 0) {
        const content: any[] = []
        m.photos.forEach(photo => {
          const base64Data = photo.replace(/^data:image\/\w+;base64,/, '')
          content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Data } })
        })
        content.push({ type: 'text', text: m.content || 'Analiza esta imagen.' })
        return { role: m.role as 'user' | 'assistant', content }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })

    // Llamar a Claude
    const response = await client.messages.create({
      model: usedModel,
      max_tokens: 1500,
      system: systemPrompt,
      messages: anthropicMessages
    })

    const text = (response.content as any[])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()

    // Devolver respuesta de Claude
    return NextResponse.json({ type: 'TEXT', text })

  } catch (error: any) {
    console.error('Error /api/chat:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}