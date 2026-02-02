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

    // ====== 1) DETECCIÓN DE REPORTES (bypass Claude) ======
    const wantsReport =
      userText.includes('reporte') ||
      userText.includes('report') ||
      (userText.includes('genera') && (userText.includes('pdf') || userText.includes('reporte')))

    if (wantsReport) {
      let category = 'general'
      if (userText.includes('gasolina') || userText.includes('gas')) category = 'gasolina'
      else if (userText.includes('comida') || userText.includes('food')) category = 'comida'
      else if (userText.includes('material')) category = 'materiales'
      else if (userText.includes('herramient')) category = 'herramientas'
      else if (userText.includes('peaje')) category = 'peajes'
      else if (userText.includes('seguro') || userText.includes('insurance')) category = 'seguros'
      else if (userText.includes('mantenimiento')) category = 'mantenimiento'

      let period: 'week' | 'month' | 'year' = 'month'
      if (userText.includes('semana') || userText.includes('week')) period = 'week'
      else if (userText.includes('año') || userText.includes('ano') || userText.includes('year') || userText.includes('anual')) period = 'year'

      return NextResponse.json({ type: 'GENERATE_PDF', payload: { category, period } })
    }

    // ====== 2) FECHA REAL ======
    const now = new Date()
    const todayStr = now.toLocaleDateString('es-PR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const epochNow = Date.now()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const usedModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

    const systemPrompt = `Eres el asistente inteligente de Cooling Solution Log, app de un técnico HVAC en Puerto Rico.
FECHA REAL: ${todayStr}
TIMESTAMP ACTUAL: ${epochNow}

# MISIÓN
Registrar CADA centavo que entra y sale del negocio. Gastos, ingresos, trabajos, empleados, clientes, vehículos.

# MEMORIA
- El primer mensaje puede ser "CONTEXTO_DB" con registros anteriores
- USA ese contexto para consultas: "¿cuándo fue la última gasolina?", "¿cuánto gasté esta semana?"
- NUNCA muestres el contexto raw. Solo responde con la info relevante.
- Si no encuentras algo: "No tengo ese registro en los datos cargados"

# CUANDO RECIBES FOTOS
- Analiza la imagen: lee texto, montos, vendor, items, fecha
- DESCRIBE lo que ves al usuario
- PREGUNTA para confirmar ANTES de guardar:
  • "Veo un recibo de [vendor] por $[monto]. ¿Es correcto?"
  • "¿En qué categoría va? (materiales, comida, gasolina, etc.)"
  • "¿Cómo pagaste?"
  • "¿Es para algún cliente o trabajo específico?"
- NUNCA guardes automáticamente sin confirmación
- Si no puedes leer algo, pregunta al usuario

# REGLAS ABSOLUTAS
1. SIEMPRE incluye payment_method en SAVE_EVENT
2. Si falta payment_method → pregunta "¿Cómo pagaste?"
3. NUNCA emitas SAVE_EVENT sin payment_method
4. Pregunta UNA cosa a la vez
5. Info completa → emite comando inmediato
6. SIEMPRE usa timestamp ${epochNow} en SAVE_EVENT

# MÉTODOS DE PAGO (valores exactos)
cash, ath_movil, business_card, sams_card, paypal, personal_card, other

# MAPEO
"tarjeta del negocio" / "business" → business_card
"tarjeta Sam's" / "sams" → sams_card
"efectivo" / "cash" → cash
"ATH" / "ath movil" → ath_movil
"PayPal" → paypal
"tarjeta personal" / "mi tarjeta" / "capital one" → personal_card

# TIPOS DE REGISTRO

## GASTOS (type: "expense")
Categorías: Gasolina, Comida, Materiales, Herramientas, Seguros, Peajes, Mantenimiento, Nómina, Otro
Subtipos: gas, food, materials, tools, insurance, maintenance, payroll, other

## INGRESOS (type: "income")
Categorías: Servicio, Instalación, Reparación, Mantenimiento, Emergencia
Siempre vincular a cliente si es posible

## EMPLEADOS
- Cobran por día. SIEMPRE retención 10%
- Cálculo: días × rate × 0.9

## VEHÍCULOS
- Transit, F150, BMW
- Vincular gasolina/mantenimiento al vehículo

# FLUJOS

## Gasto simple:
"Gasté 40 en gasolina" → preguntar vehículo → preguntar método pago → preguntar dónde → SAVE_EVENT

## Foto de recibo:
[foto] → analizar → describir → confirmar con usuario → preguntar categoría/pago → SAVE_EVENT

## Ingreso/cobro:
"José me pagó 500" → preguntar por qué servicio → preguntar método pago → SAVE_EVENT con type:"income"

## Consulta:
"¿Cuánto gasté en gasolina esta semana?" → revisar CONTEXTO_DB → responder con datos

# COMANDOS DE SALIDA

## Para guardar evento:
SAVE_EVENT:
{
  "type": "expense",
  "subtype": "gas",
  "category": "Gasolina",
  "amount": 40,
  "payment_method": "business_card",
  "vendor": "Shell",
  "vehicle_id": "transit",
  "client": "",
  "note": "",
  "timestamp": ${epochNow}
}

✅ Registrado: Gasolina $40 en Shell (Tarjeta Negocio) - Transit

## Para reportes:
GENERATE_PDF:
{
  "category": "Gasolina",
  "period": "week"
}

# IMPORTANTE
- Respuestas BREVES y directas
- Nunca inventes datos
- Confirma cálculos
- Si falta info, pregunta UNA cosa
- SIEMPRE usa los valores exactos de payment_method
- Para fotos: SIEMPRE confirmar antes de guardar`

    // ====== 3) CONSTRUIR MENSAJES PARA ANTHROPIC (multimodal) ======
    const anthropicMessages = messages.map((m, idx) => {
      const isLast = idx === messages.length - 1

      // Último mensaje con fotos → multimodal
      if (isLast && m.role === 'user' && m.photos && m.photos.length > 0) {
        const content: any[] = []
        m.photos.forEach(photo => {
          const base64Data = photo.replace(/^data:image\/\w+;base64,/, '')
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
          })
        })
        content.push({ type: 'text', text: m.content || 'Analiza esta imagen.' })
        return { role: m.role as 'user' | 'assistant', content }
      }

      // Mensaje histórico que TUVO fotos → nota de texto
      let text = m.content
      if (m.role === 'user' && m.photos && m.photos.length > 0) {
        text = `[📷 ${m.photos.length} foto(s) adjunta(s) - ya analizadas] ${text}`
      }

      return { role: m.role as 'user' | 'assistant', content: text }
    })

    // ====== 4) LLAMAR A ANTHROPIC ======
    const response = await client.messages.create({
      model: usedModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages
    })

    const text = (response.content as any[])
      .map(block => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()

    // ====== 5) DETECTAR GENERATE_PDF EN RESPUESTA DE CLAUDE ======
    const pdfMatch = text.match(/GENERATE_PDF:\s*(\{[\s\S]*?\})/)
    if (pdfMatch) {
      let payload: any = {}
      try { payload = JSON.parse(pdfMatch[1]) } catch {}
      return NextResponse.json({ type: 'GENERATE_PDF', payload })
    }

    return NextResponse.json({ type: 'TEXT', text })
  } catch (error: any) {
    console.error('Error /api/chat:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
