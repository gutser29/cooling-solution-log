import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  photos?: string[]
}

// ============ ROBUST JSON EXTRACTOR ============
function extractJSON(text: string, command: string): any {
  const upperText = text.toUpperCase()
  const upperCmd = command.toUpperCase()
  const idx = upperText.indexOf(upperCmd)
  if (idx === -1) return null
  
  const after = text.slice(idx + command.length)
  const start = after.indexOf('{')
  if (start === -1) return null
  
  let depth = 0
  let inString = false
  let escaped = false
  
  for (let i = start; i < after.length; i++) {
    const c = after[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(after.slice(start, i + 1)) }
        catch { return null }
      }
    }
  }
  return null
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

    // ====== 1) DETECCIÓN DE REPORTES (bypass Claude - SOLO P&L y AR) ======
    // IMPORTANTE: Solo interceptamos P&L y cuentas por cobrar
    // Todo lo demás (facturas, clientes, reportes de categoría) va a Claude

    // P&L Report
    if (userText.includes('p&l') || userText.includes('p & l') || userText.includes('profit') || 
        (userText.includes('perdida') && userText.includes('ganancia')) ||
        (userText.includes('pérdida') && userText.includes('ganancia'))) {
      let period: 'week' | 'month' | 'year' = 'month'
      let periodLabel = 'este mes'
      if (userText.includes('semana') || userText.includes('week')) { period = 'week'; periodLabel = 'esta semana' }
      else if (userText.includes('año') || userText.includes('ano') || userText.includes('year') || userText.includes('anual')) { period = 'year'; periodLabel = 'este año' }
      else if (userText.includes('enero')) { period = 'month'; periodLabel = 'enero' }
      else if (userText.includes('febrero')) { period = 'month'; periodLabel = 'febrero' }
      else if (userText.includes('marzo')) { period = 'month'; periodLabel = 'marzo' }
      else if (userText.includes('abril')) { period = 'month'; periodLabel = 'abril' }
      else if (userText.includes('mayo')) { period = 'month'; periodLabel = 'mayo' }
      else if (userText.includes('junio')) { period = 'month'; periodLabel = 'junio' }
      else if (userText.includes('julio')) { period = 'month'; periodLabel = 'julio' }
      else if (userText.includes('agosto')) { period = 'month'; periodLabel = 'agosto' }
      else if (userText.includes('septiembre') || userText.includes('sept')) { period = 'month'; periodLabel = 'septiembre' }
      else if (userText.includes('octubre')) { period = 'month'; periodLabel = 'octubre' }
      else if (userText.includes('noviembre') || userText.includes('nov')) { period = 'month'; periodLabel = 'noviembre' }
      else if (userText.includes('diciembre') || userText.includes('dic')) { period = 'month'; periodLabel = 'diciembre' }

      return NextResponse.json({ type: 'GENERATE_PL', payload: { period, periodLabel } })
    }

    // Cuentas por cobrar - solo keywords específicos
    if (userText.includes('quien me debe') || userText.includes('quién me debe') || 
        userText.includes('cuentas por cobrar') || userText.includes('me deben dinero')) {
      return NextResponse.json({ type: 'GENERATE_AR' })
    }

    // ====== 2) TODO LO DEMÁS VA A CLAUDE ======
    const now = new Date()
    const todayStr = now.toLocaleDateString('es-PR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const epochNow = Date.now()

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const usedModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

    const systemPrompt = `Eres el asistente de Cooling Solution, app HVAC en Puerto Rico.
FECHA ACTUAL: ${todayStr} | TIMESTAMP: ${epochNow}

# TU MISIÓN
Registrar gastos, ingresos, clientes, facturas, citas, notas. Respuestas BREVES.

# DATOS DISPONIBLES
El CONTEXTO_DB contiene: eventos, trabajos, clientes, citas, recordatorios, facturas, notas, templates.
SIEMPRE consulta el contexto antes de responder preguntas sobre datos existentes.

# FOTOS
- Analiza → Describe → PREGUNTA antes de guardar
- "Veo recibo de [vendor] por $[monto]. ¿Lo registro?"
- NUNCA guardes sin confirmación

# MÉTODO DE PAGO
"Capital One" → capital_one | "Chase Visa" → chase_visa | "ATH Móvil" → ath_movil
"efectivo/cash" → cash | "PayPal" → paypal | "Sam's MC" → sams_mastercard
Si dice "tarjeta" sin especificar → PREGUNTA "¿Cuál tarjeta?"

# PERSONAL vs NEGOCIO
- "personal", "pa la casa" → expense_type: "personal"
- Default → expense_type: "business"
- Si ambiguo (comida, gas) → PREGUNTA

# ========== COMANDOS DE GUARDADO ==========

## SAVE_EVENT (Gastos e Ingresos)
SAVE_EVENT:{"type":"expense","subtype":"gas","category":"Gasolina","amount":45,"payment_method":"capital_one","vendor":"Shell","vehicle_id":"f150","expense_type":"business","timestamp":${epochNow}}
SAVE_EVENT:{"type":"income","subtype":"service","category":"Servicio","amount":500,"payment_method":"cash","client":"Hotel Plaza","note":"Limpieza 4 unidades","timestamp":${epochNow}}

Categorías gasto: Gasolina, Comida, Materiales, Herramientas, Seguros, Peajes, Mantenimiento, Nómina
Categorías ingreso: Servicio, Instalación, Reparación, Mantenimiento, Emergencia, Contrato

## SAVE_CLIENT (Crear cliente nuevo)
Cuando diga "nuevo cliente", "agregar cliente", "cliente nuevo":
SAVE_CLIENT:{"first_name":"José","last_name":"Rivera","phone":"787-555-1234","email":"jose@email.com","address":"Bayamón, PR","type":"residential","notes":"Referido por María"}

type: "residential" o "commercial"

## SAVE_JOB (Trabajo completo)
SAVE_JOB:{"client_name":"Hotel Plaza","type":"maintenance","services":[{"description":"Limpieza unidades","quantity":4,"unit_price":85,"total":340}],"materials":[{"item":"Filtro","quantity":4,"unit_cost":5,"unit_price":10}],"total_charged":380,"payment_status":"pending","notes":""}

## SAVE_INVOICE (Factura)
Cuando diga "factura", "invoice", "hazme factura", "genera factura":
SAVE_INVOICE:{"client_name":"Farmacia Caridad","client_phone":"787-555-0000","client_address":"Bayamón, PR","items":[{"description":"Limpieza de unidades","quantity":5,"unit_price":85,"total":425},{"description":"Filtros","quantity":5,"unit_price":15,"total":75}],"tax_rate":0,"notes":"Servicio mensual","due_days":30}

IMPORTANTE: El JSON debe estar en UNA SOLA LÍNEA sin saltos de línea.

## SAVE_QUOTE (Cotización)
SAVE_QUOTE:{"client_name":"Hotel Plaza","items":[{"description":"Instalación mini split","quantity":2,"unit_price":1200,"total":2400}],"tax_rate":0,"notes":"Incluye garantía","valid_days":15}

## SAVE_JOB_TEMPLATE (Template reutilizable)
Cuando diga "guardar como template", "crear template", "template nuevo":
SAVE_JOB_TEMPLATE:{"name":"Mantenimiento Farmacia Caridad","client_name":"Farmacia Caridad","items":[{"description":"Limpieza unidades","quantity":5,"unit_price":85},{"description":"Filtros","quantity":5,"unit_price":15}],"notes":"Servicio mensual","default_tax_rate":0}

## SAVE_NOTE
SAVE_NOTE:{"title":"Idea equipo","content":"Comprar van nueva para materiales grandes"}

## SAVE_APPOINTMENT
SAVE_APPOINTMENT:{"title":"Instalación mini split","date":"2026-02-10T10:00","client_name":"María López","location":"Guaynabo","notes":"Llevar escalera"}

Si dice "mañana" o "el jueves" → calcula la fecha basado en FECHA ACTUAL.
Revisa CONTEXTO_DB por conflictos antes de confirmar.

## SAVE_REMINDER
SAVE_REMINDER:{"text":"Llamar a proveedor filtros","due_date":"2026-02-05T09:00","priority":"normal"}

priority: "high" (urgente), "normal" (default), "low" (cuando pueda)

## SAVE_PHOTO
Para guardar fotos con cliente/trabajo:
SAVE_PHOTO:{"client_name":"Farmacia Caridad","category":"before","description":"Estado de filtros antes de limpieza"}

category: "before", "after", "diagnostic", "receipt", "other"

# ========== REPORTES ==========

El usuario puede pedir reportes. Tú puedes:
1. Contestar con datos del CONTEXTO_DB
2. Generar PDF con GENERATE_PDF

## Reporte de categoría específica:
"reporte de gasolina" → GENERATE_PDF:{"category":"gasolina","period":"month"}
"cuánto gasté en comida este año" → GENERATE_PDF:{"category":"comida","period":"year"}

## Reporte por tarjeta:
"reporte de la Capital One" → GENERATE_PDF:{"payment_method":"capital_one","period":"month"}

## Reporte de ingresos:
"reporte de ingresos del mes" → GENERATE_PDF:{"type":"income","period":"month"}

## Reporte de gastos:
"reporte de gastos de la semana" → GENERATE_PDF:{"type":"expense","period":"week"}

## Reporte de fotos:
"genera reporte de fotos de [cliente]" → responde con type GENERATE_PHOTO_REPORT
"PDF con fotos de [cliente]" → responde con type GENERATE_PHOTO_REPORT
Ejemplo respuesta: Voy a generar el reporte de fotos. GENERATE_PHOTO_REPORT:{"client_name":"Farmacia Caridad","job_description":"Mantenimiento mensual"}

# ========== CONSULTAS ==========

Cuando pregunten sobre datos, USA EL CONTEXTO:
- "¿cuántas facturas pendientes?" → cuenta en CONTEXTO_DB
- "¿qué tengo mañana?" → busca en citas
- "¿cuánto me debe X?" → busca en facturas/trabajos
- "¿qué notas tengo?" → lista de CONTEXTO_DB
- "¿qué templates tengo?" → lista de CONTEXTO_DB
- "¿qué clientes tengo?" → lista de CONTEXTO_DB

# ========== TEMPLATES ==========

Si el usuario tiene TEMPLATES en el contexto y pide factura para un cliente:
1. Busca si hay template para ese cliente
2. Usa los items del template
3. Genera SAVE_INVOICE con esos items

Ejemplo: "hazme la factura de farmacia caridad"
→ Busca template "Farmacia Caridad" en contexto
→ Copia items exactamente
→ SAVE_INVOICE con esos items

# ========== REGLAS FINALES ==========
- BREVE y directo
- NUNCA inventes datos
- Si falta info → pregunta UNA cosa
- JSON en UNA LÍNEA (importante para parsing)
- El usuario puede dictar por voz - interpreta errores fonéticos
- "cápital wan" = Capital One, "eitiach" = ATH, etc.`

    // ====== 3) MENSAJES MULTIMODAL ======
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
      let text = m.content
      if (m.role === 'user' && m.photos && m.photos.length > 0) {
        text = `[📷 ${m.photos.length} foto(s) - ya analizadas] ${text}`
      }
      return { role: m.role as 'user' | 'assistant', content: text }
    })

    // ====== 4) LLAMADA A ANTHROPIC ======
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

    // ====== 5) DETECTAR GENERATE_PDF EN RESPUESTA (usando extractJSON) ======
    const pdfPayload = extractJSON(text, 'GENERATE_PDF:')
    if (pdfPayload) {
      return NextResponse.json({ type: 'GENERATE_PDF', payload: pdfPayload })
    }

    // ====== 6) DETECTAR GENERATE_PHOTO_REPORT ======
    const photoReportPayload = extractJSON(text, 'GENERATE_PHOTO_REPORT:')
    if (photoReportPayload) {
      return NextResponse.json({ type: 'GENERATE_PHOTO_REPORT', payload: photoReportPayload })
    }

    return NextResponse.json({ type: 'TEXT', text })
  } catch (error: any) {
    console.error('Error /api/chat:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}