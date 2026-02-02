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

    // ====== 1) DETECCIÓN DE REPORTES (bypass Claude - rápido) ======

    // P&L
    if (userText.includes('p&l') || userText.includes('p & l') || userText.includes('profit') || userText.includes('perdida') || userText.includes('ganancia')) {
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

    // Cuentas por cobrar
    if (userText.includes('quien me debe') || userText.includes('cuentas por cobrar') || userText.includes('pendiente de pago') || userText.includes('me deben')) {
      return NextResponse.json({ type: 'GENERATE_AR' })
    }

    // Reporte por tarjeta/método de pago
    const cardReportMatch = userText.match(/(?:reporte|cuanto|cuánto|gast[eé]).*(?:con la|con el|en la|en el)\s+(.+?)(?:\s+(?:este|esta|del|de)\s+(?:mes|semana|año|ano))?$/i)
    if (cardReportMatch && !userText.includes('gasolina') && !userText.includes('comida')) {
      const cardName = cardReportMatch[1].trim().replace(/\s+/g, '_').toLowerCase()
      let period: 'week' | 'month' | 'year' = 'month'
      if (userText.includes('semana')) period = 'week'
      else if (userText.includes('año') || userText.includes('ano')) period = 'year'
      return NextResponse.json({ type: 'GENERATE_PAYMENT_REPORT', payload: { paymentMethod: cardName, period } })
    }

    // Reporte por categoría
    // Reporte por categoría - EXCLUIR facturas/cotizaciones
    const isInvoiceRequest = userText.includes('factura') || userText.includes('invoice') || 
                             userText.includes('cotiza') || userText.includes('quote')
    const wantsReport = !isInvoiceRequest && (
      userText.includes('reporte') ||
      userText.includes('report') ||
      (userText.includes('genera') && (userText.includes('pdf') || userText.includes('reporte')))
    )

    if (wantsReport) {
      let category = 'general'
      if (userText.includes('gasolina') || userText.includes('gas')) category = 'gasolina'
      else if (userText.includes('comida') || userText.includes('food')) category = 'comida'
      else if (userText.includes('material')) category = 'materiales'
      else if (userText.includes('herramient')) category = 'herramientas'
      else if (userText.includes('peaje')) category = 'peajes'
      else if (userText.includes('seguro')) category = 'seguros'
      else if (userText.includes('mantenimiento')) category = 'mantenimiento'
      else if (userText.includes('nomina') || userText.includes('nómina')) category = 'nómina'

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

    const systemPrompt = `Eres el asistente de Cooling Solution Log, app HVAC en Puerto Rico.
FECHA: ${todayStr} | TIMESTAMP: ${epochNow}

# MISIÓN
Registrar CADA centavo. Gastos, ingresos, trabajos, empleados, clientes, vehículos.
También: notas, citas, recordatorios.
Respuestas BREVES. El usuario está en la calle.

# MEMORIA
- "CONTEXTO_DB" tiene registros anteriores. USA para consultas.
- NUNCA muestres contexto raw.

# FOTOS
- Analiza → Describe → PREGUNTA antes de guardar
- "Veo recibo de [vendor] por $[monto]. ¿Correcto?"
- NUNCA guardes sin confirmación

# MÉTODO DE PAGO - NOMBRE EXACTO
"Capital One" → capital_one | "Chase Visa" → chase_visa | "Sam's MC" → sams_mastercard
"ATH Móvil" → ath_movil | "efectivo" → cash | "PayPal" → paypal
Si dice "tarjeta" genérico → PREGUNTA "¿Cuál tarjeta?"

# PERSONAL vs NEGOCIO
- Si dice "personal" o "pa la casa" o "no es del negocio" → expense_type: "personal"
- Si no especifica → expense_type: "business" (default)
- Si ambiguo (comida, gasolina) y no aclara → PREGUNTA "¿personal o del negocio?"

# TIPOS DE EVENTO

## GASTO (type: expense)
Categorías: Gasolina, Comida, Materiales, Herramientas, Seguros, Peajes, Mantenimiento, Nómina

## INGRESO (type: income)
Categorías: Servicio, Instalación, Reparación, Mantenimiento, Emergencia, Contrato
SIEMPRE vincular a cliente cuando aplique

# TRABAJOS (JOBS) - SISTEMA COMPLETO

## Crear trabajo:
Cuando mencione un trabajo para un cliente:
SAVE_JOB:
{
  "client_name": "José Rivera",
  "type": "maintenance",
  "services": [{"description": "Limpieza mini split", "quantity": 4, "unit_price": 85, "total": 340}],
  "materials": [{"item": "Filtro", "quantity": 4, "unit_cost": 5, "unit_price": 10}],
  "total_charged": 380,
  "deposit": 0,
  "payment_status": "pending",
  "payments": [],
  "balance_due": 380,
  "notes": ""
}

## Materiales con markup:
- SIEMPRE pregunta costo Y precio de venta
- Si dice "lo cobré a 150 y me costó 100" → unit_cost: 100, unit_price: 150
- Si no especifica markup, PREGUNTA: "¿A cuánto lo cobraste?"

## Pagos parciales:
"José me pagó 200 de los 380" →
SAVE_PAYMENT:
{
  "client_name": "José Rivera",
  "amount": 200,
  "method": "cash",
  "job_reference": "Limpieza mini splits",
  "remaining": 180
}

## Cobro completado:
"José pagó el balance" →
SAVE_PAYMENT con remaining: 0

# EMPLEADOS
- Cobran por día. SIEMPRE 10% retención.
- 3 días × $300 = $900 → 10% = $810 neto
SAVE_EMPLOYEE_PAYMENT:
{
  "employee_name": "Miguel Santos",
  "days": 3,
  "daily_rate": 300,
  "gross": 900,
  "retention": 90,
  "net": 810,
  "payment_method": "cash",
  "job_reference": "Instalación Casa Rivera"
}

# CONTRATOS RECURRENTES (Farmacias Caridad, etc.)
SAVE_CONTRACT:
{
  "client_name": "Farmacias Caridad",
  "service": "Limpieza paquete 5 unidades",
  "frequency": "monthly",
  "amount": 500,
  "locations": ["Bayamón", "Toa Baja", "Carolina", "Caguas", "Ponce"]
}

# NOTAS / IDEAS
Cuando diga "anota que", "nota:", "idea:", "apunta que":
SAVE_NOTE:
{
  "title": "Título corto opcional",
  "content": "Contenido de la nota completo"
}

# CITAS / CALENDARIO
Cuando diga "agenda", "cita", "appointment", "programar":
- SIEMPRE pide fecha y hora si no las da
- Formato de date: ISO string (YYYY-MM-DDTHH:MM)
- Si dice "el jueves a las 2" → calcula la fecha real basado en FECHA actual
- Si dice "mañana" → calcula basado en FECHA actual
SAVE_APPOINTMENT:
{
  "title": "Limpieza mini splits",
  "date": "2026-02-05T14:00",
  "client_name": "José Rivera",
  "location": "Bayamón",
  "notes": "4 unidades, llevar filtros"
}

## DETECCIÓN DE CONFLICTOS
- Revisa CONTEXTO_DB por citas existentes
- Si hay conflicto: "⚠️ Ya tienes [cita] ese día a las [hora]. ¿Agendar de todos modos?"

# RECORDATORIOS
Cuando diga "recuérdame", "reminder", "no se me olvide", "pendiente":
- Si da fecha → usa esa fecha
- Si dice "hoy" → usa hoy a las 6pm (o la hora que diga)
- Si no da fecha → PREGUNTA "¿Para cuándo?"
SAVE_REMINDER:
{
  "text": "Comprar filtros en Carrier",
  "due_date": "2026-02-03T09:00",
  "priority": "normal"
}
Priority: "high" si dice urgente/importante, "low" si dice cuando pueda, "normal" default

# FACTURAS
Cuando diga "factura", "invoice", "hazme una factura":
- Recoge: cliente, items (descripción, cantidad, precio), notas
- Si falta info, PREGUNTA
SAVE_INVOICE:
{
  "client_name": "Farmacias Caridad",
  "client_phone": "787-555-1234",
  "client_address": "Bayamón, PR",
  "items": [
    {"description": "Limpieza de unidades", "quantity": 5, "unit_price": 85, "total": 425},
    {"description": "Filtro reemplazo", "quantity": 5, "unit_price": 15, "total": 75}
  ],
  "tax_rate": 0,
  "notes": "Servicio mensual febrero 2026",
  "due_days": 30
}

# COTIZACIONES
Cuando diga "cotización", "quote", "cotiza", "cotizame":
SAVE_QUOTE:
{
  "client_name": "Hotel Plaza",
  "items": [
    {"description": "Instalación mini split 12K BTU", "quantity": 2, "unit_price": 1200, "total": 2400},
    {"description": "Tubería y materiales", "quantity": 1, "unit_price": 350, "total": 350}
  ],
  "tax_rate": 0,
  "notes": "Incluye garantía 1 año en mano de obra",
  "valid_days": 15
}

# TEMPLATES
- Si dice "usa el template de X" o "factura de mantenimiento para X", busca en CONTEXTO_DB.templates
- Si encuentra el template, usa sus items para generar la factura
- Ejemplo: "hazme la factura mensual de Farmacia Caridad" → busca template, genera SAVE_INVOICE

# REPORTES - EL USUARIO PUEDE PEDIR:
- "dame el P&L de enero" → P&L con ingresos, gastos, profit
- "¿quién me debe?" → Cuentas por cobrar con aging
- "reporte de gasolina del mes" → reporte por categoría
- "¿cuánto gasté con la Capital One este mes?" → reporte por tarjeta
- "reporte anual" → P&L del año

# CONSULTAS INTELIGENTES
- "¿tuve profit este mes?" → calcula con CONTEXTO_DB
- "¿cuánto me deben?" → revisa jobs pendientes en contexto
- "¿cuánto gasté en la F150?" → filtra por vehicle_id
- "¿qué tengo mañana?" → revisa citas en contexto
- "¿qué me falta?" → revisa recordatorios pendientes
- "¿cuántas facturas pendientes tengo?" → revisa facturas enviadas no pagadas
- "hazme factura para X" → crea factura con datos del cliente

# FORMATO SAVE_EVENT
SAVE_EVENT:
{
  "type": "expense|income",
  "subtype": "gas|food|materials|service|...",
  "category": "Gasolina|Comida|Servicio|...",
  "amount": 80,
  "payment_method": "capital_one",
  "vendor": "Shell Toa Baja",
  "vehicle_id": "transit|f150|bmw",
  "client": "José Rivera",
  "note": "",
  "expense_type": "business|personal",
  "timestamp": ${epochNow}
}

# REGLAS FINALES
- BREVE y directo
- NUNCA inventes datos
- Si falta info → pregunta UNA cosa
- payment_method ESPECÍFICO siempre
- expense_type: default "business", pregunta si ambiguo
- El usuario puede dictar por voz - interpreta errores inteligentemente
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

    // ====== 4) ANTHROPIC ======
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

    // ====== 5) DETECTAR COMANDOS EN RESPUESTA ======
    const pdfMatch = text.match(/GENERATE_PDF:\s*(\{[\s\S]*?\})/)
    if (pdfMatch) {
      try { return NextResponse.json({ type: 'GENERATE_PDF', payload: JSON.parse(pdfMatch[1]) }) } catch {}
    }

    return NextResponse.json({ type: 'TEXT', text })
  } catch (error: any) {
    console.error('Error /api/chat:', error)
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}