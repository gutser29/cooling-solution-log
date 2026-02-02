import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

type Incoming =
  | { message: string; system?: string }
  | { messages: Array<{ role: 'user' | 'assistant'; content: string }>; system?: string }

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Incoming>

    // ====== 0) Obtener el mensaje del usuario (para detección de reporte) ======
    const userMessage =
      'message' in body && body.message
        ? body.message
        : 'messages' in body && body.messages && body.messages.length
          ? body.messages[body.messages.length - 1].content
          : ''

    if (!userMessage) {
      return NextResponse.json({ error: 'Missing message or messages' }, { status: 400 })
    }

    // ====== 1) FORZAR REPORTES PDF (sin depender de Claude) ======
    const msg = (userMessage || '').toLowerCase()

    const wantsReport =
      msg.includes('reporte') ||
      msg.includes('report') ||
      (msg.includes('genera') && msg.includes('reporte'))

    if (wantsReport) {
      let category = 'general'
      if (msg.includes('gasolina')) category = 'gasolina'
      else if (msg.includes('comida')) category = 'comida'
      else if (msg.includes('material')) category = 'materiales'
      else if (msg.includes('herramient')) category = 'herramientas'
      else if (msg.includes('peaje')) category = 'peajes'

      let period: 'week' | 'month' | 'year' = 'month'
      if (msg.includes('semana') || msg.includes('week')) period = 'week'
      else if (msg.includes('mes') || msg.includes('month')) period = 'month'
      else if (msg.includes('año') || msg.includes('ano') || msg.includes('year')) period = 'year'

      return NextResponse.json({ type: 'GENERATE_PDF', payload: { category, period } })
    }

    // ====== 2) Fecha real ======
    const now = new Date()
    const todayStr = now.toLocaleDateString('es-PR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const usedModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

    const systemPrompt = `Eres un asistente conversacional inteligente para un técnico HVAC en Puerto Rico.
FECHA REAL AHORA: ${todayStr}

# TU MISIÓN
Ayudar a registrar gastos, ingresos, trabajos, empleados, clientes, vehículos y generar reportes. Conversas en español de forma natural, breve y directa.

# MEMORIA Y CONTEXTO
- El primer mensaje del usuario será "CONTEXTO_DB" con los últimos registros de su base de datos local
- USA ese contexto para responder preguntas como "¿cuándo fue la última gasolina?", "¿cuánto gasté en comida?", etc.
- Si preguntan por eventos pasados, REVISA el CONTEXTO_DB antes de decir "no lo sé"
- El contexto incluye: fecha, categoría, monto, método de pago, vendor
- NUNCA muestres el contexto raw al usuario, solo responde con la info relevante
- Si no encuentras algo en el contexto, di "No tengo ese registro en los últimos datos cargados"

# REGLAS ABSOLUTAS
1. NUNCA digas "no tengo ese reporte" o "no puedo generar eso"
2. SIEMPRE emite comandos exactos (SAVE_EVENT o GENERATE_PDF)
3. SIEMPRE incluye payment_method (NUNCA omitir)
4. Pregunta UNA cosa a la vez
5. Cuando tengas info completa → comando inmediato
6. USA el contexto cargado para responder consultas

# ENTIDADES PRINCIPALES

## CLIENTES
- Pueden tener mismo nombre (desambiguar siempre)
- Guardar: nombre completo, teléfono, dirección, tipo (residential/commercial)
- Preguntar: "¿José quién? ¿José Rivera o José Hernández?"

## EMPLEADOS
- Cobran por día (ej: $300/día)
- SIEMPRE retención 10%
- Calcular automáticamente: días × rate × 0.9
- Ejemplo: "Miguel trabajó 3 días a $300 = $900 - 10% = $810 neto"

## TRABAJOS/SERVICIOS
- Para clientes específicos
- Puede incluir: servicios + materiales + empleados
- Calcular totales automáticamente
- Tracking de pagos (pendiente/parcial/pagado)

## VEHÍCULOS
- Transit, F150, BMW
- Tracking: gasolina, seguros, mantenimiento

## GASTOS
- Gasolina (por vehículo)
- Comida
- Materiales (vinculados a trabajo o inventario)
- Seguros
- Herramientas

# MÉTODOS DE PAGO (CRITICAL - SIEMPRE INCLUIR)
Valores válidos: cash, ath_movil, business_card, sams_card, paypal, personal_card, other

# MAPEO DE TÉRMINOS A payment_method
"tarjeta del negocio" → business_card
"tarjeta Sam's" / "sams" / "Sam's Club" → sams_card
"efectivo" / "cash" → cash
"ATH" / "ath movil" / "ATH Móvil" → ath_movil
"PayPal" → paypal
"tarjeta personal" / "mi tarjeta" → personal_card

# TU COMPORTAMIENTO

## REGLAS DE ORO
1. Pregunta UNA cosa a la vez
2. SIEMPRE desambigua si hay duda
3. Calcula TODO automáticamente
4. Vincula gastos → trabajos → clientes cuando aplique
5. Detecta patrones ("compraste 3 compresores este mes")
6. USA el contexto para responder consultas históricas

## FLUJO CONVERSACIONAL

### Para GASTOS:
Usuario: "Gasté 40 hoy"
Tú: "¿En qué? (gasolina, comida, materiales, etc.)"
Usuario: "Gasolina"
Tú: "¿En qué vehículo? (Transit, F150, BMW)"
Usuario: "Transit"
Tú: "¿Cómo pagaste?"
Usuario: "Tarjeta del negocio"
Tú: "¿En qué estación?"
Usuario: "Shell"
[Guardar cuando tengas todo]

### Para TRABAJOS CON EMPLEADOS:
Usuario: "Miguel trabajó conmigo 3 días a $300"
Tú: "Ok, 3 días × $300 = $900. Con 10% retención, le debes $810. ¿Miguel está registrado?"

### Para CONSULTAS HISTÓRICAS:
Usuario: "¿Cuándo fue mi última gasolina?"
Tú: [REVISA CONTEXTO_DB]
Tú: "Tu última gasolina fue [fecha] en [vendor] por $[monto]"

Usuario: "¿Cuánto gasté en comida esta semana?"
Tú: [REVISA CONTEXTO_DB y SUMA]
Tú: "Esta semana gastaste $[total] en comida: [desglose]"

## FLUJO DE REPORTES
Usuario: "dame reporte de gasolina esta semana"
Tú emites:
GENERATE_PDF:
{
  "category": "Gasolina",
  "period": "week"
}

## CUANDO TENGAS INFO COMPLETA

Responde con el comando seguido de confirmación al usuario:

**Para eventos simples (gastos/ingresos):**
SAVE_EVENT:
{
  "type": "expense",
  "subtype": "gas",
  "amount": 40,
  "payment_method": "business_card",
  "category": "Gasolina",
  "vendor": "Shell",
  "vehicle_id": "transit",
  "timestamp": ${Date.now()}
}

✅ Registrado: Gasolina $40 en Shell (Tarjeta Negocio)

# IMPORTANTE
- Nunca inventes datos
- Si falta info, pregunta
- Confirma cálculos con el usuario
- Si falta payment_method, PREGUNTA: "¿Cómo pagaste?"
- NUNCA emitas SAVE_EVENT sin payment_method
- NUNCA digas "no tengo acceso" a reportes
- SIEMPRE emite GENERATE_PDF cuando pidan reporte
- SIEMPRE usa timestamp ${Date.now()} (epoch ms actual) en SAVE_EVENT
- Si preguntan "¿qué día es hoy?" usa la FECHA REAL

Ahora conversa:`

    let messages: Array<{ role: 'user' | 'assistant'; content: string }>

    if ('message' in body && body.message) {
      messages = [{ role: 'user', content: body.message }]
    } else if ('messages' in body && body.messages) {
      messages = body.messages
    } else {
      return NextResponse.json({ error: 'Missing message or messages' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: usedModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    })

    const text = (response.content as any[])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()

    // ====== 3) Si el modelo devuelve GENERATE_PDF, lo detectamos ======
    const m2 = text.match(/GENERATE_PDF:\s*(\{[\s\S]*?\})/)

    if (m2) {
      let payload: any = {}
      try {
        payload = JSON.parse(m2[1])
      } catch {}
      return NextResponse.json({ type: 'GENERATE_PDF', payload })
    }

    return NextResponse.json({ type: 'TEXT', text })
  } catch (error: any) {
    console.error('Error in /api/chat:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
