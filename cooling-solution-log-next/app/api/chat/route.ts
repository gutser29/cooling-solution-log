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

# EJEMPLO CON MATERIALES:
Usuario: "gasté $120 en home depot"
Tú: "✅ $120 en Home Depot. ¿Con qué tarjeta? ¿Es para algún cliente específico?"
Usuario: "chase, es para el trabajo de farmacia caridad"
Tú: SAVE_EVENT:{"type":"expense","category":"Materiales","amount":120,"payment_method":"chase_visa","vendor":"Home Depot","client":"Farmacia Caridad","expense_type":"business","timestamp":${epochNow}}
✅ Guardado: $120 materiales Home Depot, Chase, para Farmacia Caridad

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

# EJEMPLO CON FOTO DE RECIBO:
Usuario: [foto de recibo de Pueblo + "gasté en gasolina"]
Tú: "Veo recibo de Pueblo por $45.50. ¿Con qué tarjeta pagaste? ¿En qué vehículo?"
Usuario: "chase, la van"
Tú: SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":45.50,"payment_method":"chase_visa","vendor":"Pueblo","vehicle_id":"van","expense_type":"business","timestamp":${epochNow}}
✅ Guardado: $45.50 gasolina Pueblo, Chase, Van (foto adjunta)

# EJEMPLO FOTO DE CHEQUE:
Usuario: [foto de cheque de cliente]
Tú: "Veo cheque de $850 de José Rivera. ¿Lo registro como ingreso?"
Usuario: "sí"
Tú: SAVE_EVENT:{"type":"income","category":"Servicio","amount":850,"payment_method":"cheque","client":"José Rivera","expense_type":"business","timestamp":${epochNow}}
✅ Guardado: Ingreso $850 cheque de José Rivera (foto adjunta)

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