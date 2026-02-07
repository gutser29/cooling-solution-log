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

// ============ DETECTAR MONTO EN TEXTO ============
function extractAmount(text: string): number | null {
  // Buscar patrones de monto: $45, 45 pesos, 45.50, etc.
  const patterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)/,           // $45, $ 45.50
    /(\d+(?:\.\d{1,2})?)\s*(?:pesos|dolar|dollars?)/i,  // 45 pesos
    /(\d+(?:\.\d{1,2})?)\s+(?:de|en|por)/,  // 45 de gas
    /(?:gast[eéo]|pagu[eé]|ech[eé]|pus[ei]|tanqu(?:eé|ié|ie|ee))\s+(\d+(?:\.\d{1,2})?)/i,  // gasté 45
    /(?:de|por|en)\s+(\d+(?:\.\d{1,2})?)/,  // de 45, por 45
    /^(\d+(?:\.\d{1,2})?)\s/,              // Empieza con número: "45 de gas"
    /(\d+(?:\.\d{1,2})?)/                   // Cualquier número (último recurso)
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const amount = parseFloat(match[1])
      if (amount > 0 && amount < 50000) return amount  // Sanity check
    }
  }
  return null
}

// ============ DETECTAR CATEGORÍA ============
function extractCategory(text: string): { category: string, subtype: string } | null {
  const lower = text.toLowerCase()
  
  const categories: Record<string, { keywords: string[], category: string, subtype: string }> = {
    gas: {
      keywords: ['gasolina', 'gas', 'tanqu', 'full', 'lleno', 'eché', 'eche', 'shell', 'puma', 'total', 'texaco', 'gulf'],
      category: 'Gasolina',
      subtype: 'gas'
    },
    food: {
      keywords: ['comida', 'almuerzo', 'desayuno', 'cena', 'lonch', 'lunch', 'restaurante', 'mcdonalds', 'burger', 'pollo', 'pizza', 'café', 'coffee'],
      category: 'Comida',
      subtype: 'food'
    },
    materials: {
      keywords: ['materiales', 'material', 'home depot', 'homedepot', 'ferretería', 'ferreteria', 'lowes', 'lowe'],
      category: 'Materiales',
      subtype: 'materials'
    },
    tools: {
      keywords: ['herramienta', 'tool', 'taladro', 'drill'],
      category: 'Herramientas',
      subtype: 'tools'
    },
    toll: {
      keywords: ['peaje', 'autoexpreso', 'autopista'],
      category: 'Peajes',
      subtype: 'toll'
    },
    maintenance: {
      keywords: ['mantenimiento', 'aceite', 'oil change', 'goma', 'tire', 'freno', 'brake'],
      category: 'Mantenimiento',
      subtype: 'maintenance'
    }
  }
  
  for (const [key, data] of Object.entries(categories)) {
    for (const keyword of data.keywords) {
      if (lower.includes(keyword)) {
        return { category: data.category, subtype: data.subtype }
      }
    }
  }
  
  return null
}

// ============ DETECTAR MÉTODO DE PAGO ============
function extractPaymentMethod(text: string): string {
  const lower = text.toLowerCase()
  
  // Capital One variations
  if (lower.includes('capital') || lower.includes('cápital') || lower.includes('capitalone') || lower.includes('capital one') || lower.includes('capita')) {
    return 'capital_one'
  }
  
  // Chase variations
  if (lower.includes('chase') || lower.includes('cheis')) {
    return 'chase_visa'
  }
  
  // ATH variations
  if (lower.includes('ath') || lower.includes('athm') || lower.includes('eitiach') || lower.includes('ati') || lower.includes('a t h')) {
    return 'ath_movil'
  }
  
  // Sam's MC variations
  if (lower.includes('sam') || lower.includes('sams') || lower.includes('mastercard') || lower.includes('sam\'s')) {
    return 'sams_mastercard'
  }
  
  // PayPal
  if (lower.includes('paypal') || lower.includes('pay pal')) {
    return 'paypal'
  }
  
  // Cash/Efectivo
  if (lower.includes('efectivo') || lower.includes('cash') || lower.includes('efetivo')) {
    return 'cash'
  }
  
  // Business card generic
  if (lower.includes('business') || lower.includes('bisnes') || lower.includes('tarjeta del negocio')) {
    return 'capital_one'  // Default business card
  }
  
  // Si menciona "tarjeta" sin especificar, no asumimos
  if (lower.includes('tarjeta') || lower.includes('card')) {
    return 'card_unknown'
  }
  
  return 'cash'  // Default
}

// ============ DETECTAR VEHÍCULO ============
function extractVehicle(text: string): string | undefined {
  const lower = text.toLowerCase()
  
  if (lower.includes('van') || lower.includes('camioneta') || lower.includes('transit')) return 'van'
  if (lower.includes('f150') || lower.includes('f-150') || lower.includes('pickup') || lower.includes('truck')) return 'truck'
  if (lower.includes('carro') || lower.includes('car') || lower.includes('caro')) return 'car'
  
  return undefined
}

// ============ DETECTAR SI ES PERSONAL ============
function isPersonalExpense(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('personal') || lower.includes('pa la casa') || lower.includes('para la casa') || lower.includes('mío') || lower.includes('mio')
}

// ============ DETECTAR VENDOR/LUGAR ============
function extractVendor(text: string): string | undefined {
  const lower = text.toLowerCase()
  
  const vendors: Record<string, string> = {
    'shell': 'Shell',
    'puma': 'Puma',
    'total': 'Total',
    'texaco': 'Texaco',
    'gulf': 'Gulf',
    'home depot': 'Home Depot',
    'homedepot': 'Home Depot',
    'lowes': 'Lowes',
    'lowe': 'Lowes',
    'walmart': 'Walmart',
    'costco': 'Costco',
    'sam\'s': 'Sam\'s Club',
    'sams': 'Sam\'s Club',
    'mcdonalds': 'McDonalds',
    'mcdonald': 'McDonalds',
    'burger king': 'Burger King',
    'wendy': 'Wendys',
    'subway': 'Subway',
    'popeyes': 'Popeyes',
    'church': 'Church\'s',
    'kfc': 'KFC',
    'pizza hut': 'Pizza Hut',
    'domino': 'Dominos',
    'starbucks': 'Starbucks',
  }
  
  for (const [key, value] of Object.entries(vendors)) {
    if (lower.includes(key)) return value
  }
  
  return undefined
}

// ============ ES UN GASTO? ============
function isExpenseIntent(text: string): boolean {
  const lower = text.toLowerCase()
  
  const expenseKeywords = [
    'gast', 'pagu', 'pag ', 'ech', 'pus', 'tanqu', 'llen', 'compr',
    'gasolina', 'gas', 'comida', 'almuerzo', 'material', 'peaje',
    'de gas', 'de gasolina', 'de comida', 'de material',
    'en gas', 'en gasolina', 'en comida',
    '$', 'pesos', 'dolar'
  ]
  
  // También si tiene número + categoría conocida
  const hasAmount = extractAmount(text) !== null
  const hasCategory = extractCategory(text) !== null
  
  if (hasAmount && hasCategory) return true
  
  for (const keyword of expenseKeywords) {
    if (lower.includes(keyword)) {
      // Verificar que también tenga un número
      if (hasAmount) return true
    }
  }
  
  return false
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messages: ChatMessage[] = body.messages || []

    if (!messages.length) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 })
    }

    const lastMsg = messages[messages.length - 1]
    const userText = lastMsg.content || ''
    const userTextLower = userText.toLowerCase()

    // ====== DETECCIÓN INTELIGENTE DE GASTOS ======
    if (isExpenseIntent(userText)) {
      const amount = extractAmount(userText)
      const categoryInfo = extractCategory(userText)
      const paymentMethod = extractPaymentMethod(userText)
      const vehicleId = extractVehicle(userText)
      const vendor = extractVendor(userText)
      const isPersonal = isPersonalExpense(userText)
      
      // Si tenemos monto y categoría, guardar directo
      if (amount && categoryInfo) {
        // Si el método de pago es desconocido, preguntar
        if (paymentMethod === 'card_unknown') {
          return NextResponse.json({
            type: 'TEXT',
            text: `📝 Voy a registrar ${categoryInfo.category} por $${amount.toFixed(2)}. ¿Con qué tarjeta pagaste? (Capital One, Chase, ATH, Sam's MC, efectivo)`
          })
        }
        
        return NextResponse.json({
          type: 'SAVE_EVENT',
          payload: {
            type: 'expense',
            subtype: categoryInfo.subtype,
            category: categoryInfo.category,
            amount: amount,
            vendor: vendor || categoryInfo.category,
            payment_method: paymentMethod,
            vehicle_id: vehicleId,
            expense_type: isPersonal ? 'personal' : 'business',
            timestamp: Date.now()
          }
        })
      }
      
      // Si tenemos monto pero no categoría
      if (amount && !categoryInfo) {
        return NextResponse.json({
          type: 'TEXT',
          text: `💰 Veo $${amount.toFixed(2)}. ¿En qué lo gastaste? (gasolina, comida, materiales, etc.)`
        })
      }
      
      // Si tenemos categoría pero no monto
      if (!amount && categoryInfo) {
        return NextResponse.json({
          type: 'TEXT',
          text: `📝 ${categoryInfo.category}. ¿Cuánto fue?`
        })
      }
    }

    // ====== P&L Report ======
    if (userTextLower.includes('p&l') || userTextLower.includes('p & l') || userTextLower.includes('profit') || 
        (userTextLower.includes('perdida') && userTextLower.includes('ganancia')) ||
        (userTextLower.includes('pérdida') && userTextLower.includes('ganancia'))) {
      let period: 'week' | 'month' | 'year' = 'month'
      let periodLabel = 'este mes'
      if (userTextLower.includes('semana') || userTextLower.includes('week')) { period = 'week'; periodLabel = 'esta semana' }
      else if (userTextLower.includes('año') || userTextLower.includes('ano') || userTextLower.includes('year') || userTextLower.includes('anual')) { period = 'year'; periodLabel = 'este año' }
      else if (userTextLower.includes('enero')) { period = 'month'; periodLabel = 'enero' }
      else if (userTextLower.includes('febrero')) { period = 'month'; periodLabel = 'febrero' }
      else if (userTextLower.includes('marzo')) { period = 'month'; periodLabel = 'marzo' }
      else if (userTextLower.includes('abril')) { period = 'month'; periodLabel = 'abril' }
      else if (userTextLower.includes('mayo')) { period = 'month'; periodLabel = 'mayo' }
      else if (userTextLower.includes('junio')) { period = 'month'; periodLabel = 'junio' }
      else if (userTextLower.includes('julio')) { period = 'month'; periodLabel = 'julio' }
      else if (userTextLower.includes('agosto')) { period = 'month'; periodLabel = 'agosto' }
      else if (userTextLower.includes('septiembre') || userTextLower.includes('sept')) { period = 'month'; periodLabel = 'septiembre' }
      else if (userTextLower.includes('octubre')) { period = 'month'; periodLabel = 'octubre' }
      else if (userTextLower.includes('noviembre') || userTextLower.includes('nov')) { period = 'month'; periodLabel = 'noviembre' }
      else if (userTextLower.includes('diciembre') || userTextLower.includes('dic')) { period = 'month'; periodLabel = 'diciembre' }

      return NextResponse.json({ type: 'GENERATE_PL', payload: { period, periodLabel } })
    }

    // ====== Cuentas por cobrar ======
    if (userTextLower.includes('quien me debe') || userTextLower.includes('quién me debe') || 
        userTextLower.includes('cuentas por cobrar') || userTextLower.includes('me deben dinero')) {
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
Cuando diga "nuevo cliente", "agregar cliente", "crea un cliente", "añade cliente":

IMPORTANTE: 
- Si SOLO dice "nuevo cliente" sin dar datos → PREGUNTA nombre y teléfono
- Si da nombre completo → crea cliente con ese nombre
- Si da solo nombre → PREGUNTA apellido (opcional) y teléfono

Ejemplos:
"nuevo cliente Juan Rivera 787-555-1234" → Crear directo
"nuevo cliente farmacia caridad" → Crear con first_name="Farmacia Caridad", type="commercial"
"nuevo cliente" → PREGUNTAR: "¿Cómo se llama el cliente?"

SAVE_CLIENT:{"first_name":"José","last_name":"Rivera","phone":"787-555-1234","email":"jose@email.com","address":"Bayamón, PR","type":"residential","notes":""}

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

    // ====== MENSAJES MULTIMODAL ======
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

    // ====== LLAMADA A ANTHROPIC ======
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

    // ====== DETECTAR GENERATE_PDF EN RESPUESTA ======
    const pdfPayload = extractJSON(text, 'GENERATE_PDF:')
    if (pdfPayload) {
      return NextResponse.json({ type: 'GENERATE_PDF', payload: pdfPayload })
    }

    // ====== DETECTAR GENERATE_PHOTO_REPORT ======
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