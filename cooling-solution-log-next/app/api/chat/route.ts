import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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
    const preferredModel: string = body.model || 'auto' // 'auto' | 'gpt' | 'claude'

    if (!messages.length) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 })
    }

    const lastMsg = messages[messages.length - 1]
    const userText = (lastMsg.content || '').toLowerCase()
    const hasPhotos = lastMsg.photos && lastMsg.photos.length > 0

    // ====== SOLO INTERCEPTAR REPORTES P&L Y AR ======
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

    if (userText.includes('quien me debe') || userText.includes('quién me debe') || 
        userText.includes('cuentas por cobrar') || userText.includes('me deben dinero')) {
      return NextResponse.json({ type: 'GENERATE_AR' })
    }

    // ====== SYSTEM PROMPT ======
    const now = new Date()
    const todayStr = now.toLocaleDateString('es-PR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const epochNow = Date.now()

    const systemPrompt = `Eres el asistente de Cooling Solution, negocio HVAC en Puerto Rico.
FECHA: ${todayStr} | TIMESTAMP: ${epochNow}

# REGLA PRINCIPAL - PREGUNTAR ANTES DE GUARDAR
Cuando el usuario quiera registrar un GASTO, DEBES preguntar la información que falte ANTES de guardar.

# INFORMACIÓN REQUERIDA SEGÚN CATEGORÍA:

## GASOLINA - Preguntar si falta:
1. ¿Qué tarjeta? (si no mencionó método de pago)
2. ¿En qué vehículo? (van, truck, carro)
Ejemplo: "eché $50 de gasolina" → "✅ $50 de gasolina. ¿Con qué tarjeta pagaste? ¿En qué vehículo?"

## MATERIALES - Preguntar si falta:
1. ¿Qué tarjeta?
2. ¿Es para un cliente específico? Si sí → ¿Cuál cliente? ¿Qué trabajo?
Ejemplo: "$80 en materiales" → "✅ $80 en materiales. ¿Con qué tarjeta? ¿Es para algún cliente específico?"

## COMIDA - Preguntar si falta:
1. ¿Qué tarjeta?
2. ¿Es personal o del negocio?
Ejemplo: "$15 de almuerzo" → "✅ $15 de comida. ¿Con qué tarjeta? ¿Personal o negocio?"

## OTROS GASTOS - Preguntar:
1. ¿Qué tarjeta?

# CUANDO EL USUARIO RESPONDE CON LA INFO:
Ahí sí guardas con SAVE_EVENT con TODA la información completa.

# EJEMPLO DE FLUJO COMPLETO:
Usuario: "eché $50 de gasolina"
Tú: "✅ $50 de gasolina. ¿Con qué tarjeta pagaste? ¿En qué vehículo?"
Usuario: "capital one, en la van"
Tú: SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":50,"payment_method":"capital_one","vehicle_id":"van","expense_type":"business","timestamp":${epochNow}}
✅ Guardado: $50 gasolina, Capital One, Van

# MÚLTIPLES GASTOS EN UN RECIBO
Si un recibo tiene items de DIFERENTES categorías (ej: gasolina + artículos personales), crea un SAVE_EVENT POR CADA categoría, uno debajo del otro:
SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":45.50,"payment_method":"chase_visa","vendor":"Pueblo","expense_type":"business","timestamp":${epochNow}}
SAVE_EVENT:{"type":"expense","category":"Artículos Personales","amount":12.75,"payment_method":"chase_visa","vendor":"Pueblo","expense_type":"personal","timestamp":${epochNow}}
✅ Guardados: 2 gastos — $45.50 gasolina (negocio) + $12.75 personales

# SI EL USUARIO DA TODA LA INFO DE UNA VEZ:
"eché $50 de gas con capital one en la van" → Guardar directo sin preguntar
SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":50,"payment_method":"capital_one","vehicle_id":"van","expense_type":"business","timestamp":${epochNow}}

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

# FOTOS DE RECIBOS — REGLA CRÍTICA
Cuando el usuario envía una FOTO de recibo, compra, cheque o factura:
1. Analiza la imagen y extrae: vendor/tienda, monto, fecha, items si se ven
2. Pregunta la info que falte (tarjeta, vehículo, etc.) IGUAL que siempre
3. Cuando tengas toda la info, usa SAVE_EVENT normalmente
4. Las fotos se adjuntan AUTOMÁTICAMENTE al gasto/ingreso — el sistema lo hace solo
5. NUNCA uses SAVE_PHOTO para recibos — eso es solo para fotos de clientes/equipos
6. Si el usuario dice "guarda la foto" o "guarda el recibo" después de que YA guardaste el gasto → responde "✅ La foto ya se guardó junto al gasto de $X" — NO crees otro SAVE_EVENT
7. Si el usuario envía foto y dice "guárdalo" todo junto, y tienes toda la info → haz UN solo SAVE_EVENT
8. Si el recibo tiene MÚLTIPLES items de diferentes categorías → crea un SAVE_EVENT por cada categoría

# EJEMPLO FOTO CON MÚLTIPLES ITEMS:
Usuario: [foto de recibo con gasolina $45 + coca cola $2.50 + cigarrillos $8]
Tú: "Veo recibo con: $45 gasolina, $2.50 refresco, $8 cigarrillos. ¿Con qué tarjeta? ¿En qué vehículo?"
Usuario: "capital one, van"
Tú: SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":45,"payment_method":"capital_one","vendor":"Pueblo","vehicle_id":"van","expense_type":"business","timestamp":${epochNow}}
SAVE_EVENT:{"type":"expense","category":"Artículos Personales","amount":10.50,"payment_method":"capital_one","vendor":"Pueblo","expense_type":"personal","note":"coca cola, cigarrillos","timestamp":${epochNow}}
✅ Guardados: $45 gasolina (negocio) + $10.50 personales (Capital One, Van)

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

## SAVE_PHOTO (guardar foto de CLIENTE/EQUIPO — NO para recibos)
SAVE_PHOTO:{"client_name":"Cliente","category":"before","description":"Descripción"}

## SAVE_BITACORA (resumen del día de trabajo)
Cuando el usuario describe su día de trabajo, servicios realizados, o dice "bitácora" / "resumen del día":
SAVE_BITACORA:{"date":"2026-02-09","raw_text":"texto original del usuario","summary":"resumen organizado","tags":["mantenimiento","instalación"],"clients_mentioned":["Cliente 1"],"locations":["Bayamón"],"equipment":["Mini split 12k"],"jobs_count":3,"hours_estimated":8,"had_emergency":false,"highlights":["Completé 3 mantenimientos","Instalé unidad nueva"]}

## SAVE_WARRANTY (registrar garantía de equipo)
Cuando el usuario compra un equipo/parte con garantía, o dice "garantía", "warranty":
SAVE_WARRANTY:{"equipment_type":"Fan Motor","brand":"Emerson","model_number":"K55","serial_number":"ABC123","vendor":"Steffan Motors","vendor_phone":"787-555-1234","client_name":"Farmacia Caridad","location":"Sucursal #40, Bayamón","purchase_date":"2026-02-09","warranty_months":12,"cost":285.00,"notes":"Para unidad paquete techo"}

Campos requeridos: equipment_type, brand, vendor, client_name, warranty_months
Si falta alguno → PREGUNTA antes de guardar
Si el usuario envía foto del recibo → se adjunta automáticamente

# CONSULTAS
Para preguntas sobre datos, usa el CONTEXTO_DB que viene en el mensaje.

# IMPORTANTE
- Respuestas BREVES
- NO inventes datos
- Si falta info crítica (monto) → pregunta
- El usuario dicta por voz, puede haber errores de transcripción`

    // ====== DECIDIR MODELO ======
    // 'auto' = fotos→Claude, texto→GPT
    // 'gpt' = siempre GPT (incluyendo fotos via vision)
    // 'claude' = siempre Claude
    const useClaude = preferredModel === 'claude' || (preferredModel === 'auto' && hasPhotos)

    if (useClaude) {
      // ====== CLAUDE ======
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const claudeModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

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

      const response = await client.messages.create({
        model: claudeModel,
        max_tokens: 1500,
        system: systemPrompt,
        messages: anthropicMessages
      })

      const text = (response.content as any[])
        .map(block => (block.type === 'text' ? block.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim()

      return NextResponse.json({ type: 'TEXT', text, model: 'claude' })

    } else {
      // ====== GPT ======
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const gptModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

      const gptMessages: any[] = [{ role: 'system', content: systemPrompt }]

      for (let idx = 0; idx < messages.length; idx++) {
        const m = messages[idx]
        const isLast = idx === messages.length - 1

        if (isLast && m.role === 'user' && m.photos && m.photos.length > 0) {
          const content: any[] = []
          m.photos.forEach(photo => {
            content.push({ type: 'image_url', image_url: { url: photo } })
          })
          content.push({ type: 'text', text: m.content || 'Analiza esta imagen.' })
          gptMessages.push({ role: 'user', content })
        } else {
          gptMessages.push({ role: m.role, content: m.content })
        }
      }

      const response = await openai.chat.completions.create({
        model: gptModel,
        max_tokens: 1500,
        messages: gptMessages
      })

      const text = response.choices[0]?.message?.content?.trim() || ''

      return NextResponse.json({ type: 'TEXT', text, model: 'gpt' })
    }

  } catch (error: any) {
    console.error('Error /api/chat:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}