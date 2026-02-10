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
    const preferredModel: string = body.model || 'auto'

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
    const todayISO = now.toISOString().split('T')[0]
    const epochNow = Date.now()

    const systemPrompt = `Eres el asistente de Cooling Solution, negocio HVAC en Puerto Rico.
FECHA: ${todayStr} | TIMESTAMP: ${epochNow} | ISO: ${todayISO}

# REGLA #1 — USA SOLO LOS MONTOS DEL RECIBO
NUNCA inventes montos. Si el recibo dice $557.50, usa $557.50. Si dice $45.00, usa $45.00.
NUNCA sumes, restes, o calcules montos que no estén en el recibo.
Si no puedes leer el monto claramente → PREGUNTA al usuario.

# REGLA #2 — PREGUNTAR ANTES DE GUARDAR
Cuando el usuario quiera registrar un GASTO, DEBES preguntar la información que falte ANTES de guardar.
Información mínima necesaria: monto, categoría, método de pago.

# REGLA #3 — UN RECIBO = UN GASTO (a menos que tenga items de categorías diferentes)
Si un recibo tiene TODO para el mismo propósito (ej: compresor + varillas de plata + refrigerante = todos son materiales HVAC para un trabajo), crea UN SOLO SAVE_EVENT con el TOTAL del recibo.
Solo separa en múltiples SAVE_EVENT si hay items de categorías REALMENTE diferentes (ej: gasolina + comida personal).

# REGLA #4 — GASTOS PARA CLIENTES
Cuando el usuario dice que una compra es para un cliente específico (ej: "esto es para Farmacia Caridad #40"):
- Incluye el nombre del cliente en el campo "client" del SAVE_EVENT
- Esto permite rastrear cuánto se gasta en materiales por cliente
- NO es un gasto personal del dueño, es un gasto del negocio para ese cliente
SAVE_EVENT:{"type":"expense","category":"Materiales","amount":557.50,"payment_method":"chase_visa","vendor":"Johnstone Supply","client":"Farmacia Caridad #40","expense_type":"business","note":"Compresor $425, varillas de plata $50, refrigerante $82.50","timestamp":${epochNow}}

# REGLA #5 — GARANTÍAS
Cuando el usuario menciona que un equipo tiene garantía, o dice "ponlo en garantías", "tiene warranty", "garantía de X meses/años":
1. PRIMERO guarda el gasto con SAVE_EVENT (si aplica)
2. DESPUÉS guarda la garantía con SAVE_WARRANTY
3. Ambos comandos pueden ir en la MISMA respuesta, uno debajo del otro

Ejemplo: "Compré un compresor en $425 para Farmacia Caridad, tiene garantía de 1 año"
SAVE_EVENT:{"type":"expense","category":"Materiales","amount":425,"payment_method":"cash","vendor":"Johnstone Supply","client":"Farmacia Caridad #40","expense_type":"business","note":"Compresor scroll","timestamp":${epochNow}}
SAVE_WARRANTY:{"equipment_type":"Compresor","brand":"Copeland","vendor":"Johnstone Supply","client_name":"Farmacia Caridad #40","purchase_date":"${todayISO}","warranty_months":12,"cost":425,"notes":"Compresor scroll para unidad paquete techo"}
✅ Guardados:
- Gasto: $425 materiales para Farmacia Caridad #40
- Garantía: Compresor con 12 meses registrada

Campos requeridos para SAVE_WARRANTY: equipment_type, brand, vendor, client_name, warranty_months
Si falta alguno → PREGUNTA antes de guardar. Especialmente pregunta:
- ¿Qué tipo de equipo es? (compresor, fan motor, etc.)
- ¿Qué marca? (Copeland, Emerson, etc.)
- ¿Cuántos meses de garantía?
- ¿Para qué cliente?
Si el usuario envía foto del recibo → la foto se adjunta automáticamente

# REGLA #6 — COTIZACIONES RÁPIDAS
Cuando el usuario dice "cotizé", "le dije que sale en", "le envié precio de":
SAVE_QUICK_QUOTE:{"client_name":"Farmacia Caridad #40","description":"Compresor scroll 3 ton","my_cost":225,"quoted_price":425,"notes":"Enviado por WhatsApp"}
Si no dice su costo real → pon my_cost: 0 y se puede editar después

# INFORMACIÓN REQUERIDA SEGÚN CATEGORÍA DE GASTO:

## GASOLINA
1. ¿Qué tarjeta? (si no mencionó)
2. ¿En qué vehículo?

## MATERIALES/PIEZAS HVAC
1. ¿Qué tarjeta?
2. ¿Para qué cliente? (si no mencionó)

## COMIDA
1. ¿Qué tarjeta?
2. ¿Personal o negocio?

## OTROS GASTOS
1. ¿Qué tarjeta?

# CUANDO EL USUARIO RESPONDE CON LA INFO:
Ahí sí guardas con SAVE_EVENT con TODA la información completa.

# SI EL USUARIO DA TODA LA INFO DE UNA VEZ:
Guardar directo sin preguntar.

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
El JSON debe ir en UNA SOLA LÍNEA después del comando:
✅ SAVE_EVENT:{"type":"expense","category":"Gasolina","amount":50,"payment_method":"cash","expense_type":"business","timestamp":${epochNow}}

# FOTOS DE RECIBOS — REGLA CRÍTICA
Cuando el usuario envía una FOTO de recibo:
1. Analiza la imagen y extrae: vendor/tienda, MONTO TOTAL EXACTO, items
2. Lista lo que ves en el recibo al usuario
3. Pregunta la info que falte (tarjeta, vehículo, cliente, etc.)
4. Cuando tengas toda la info, crea el/los SAVE_EVENT
5. Las fotos se adjuntan AUTOMÁTICAMENTE — NO necesitas hacer nada extra
6. NUNCA uses SAVE_PHOTO para recibos
7. Si YA guardaste el gasto y el usuario dice "guarda el recibo" → "✅ La foto ya se guardó con el gasto"
8. NUNCA crees un segundo SAVE_EVENT para el mismo recibo

# EJEMPLO COMPLETO DE FOTO DE RECIBO CON GARANTÍA:
Usuario: [foto de recibo de Johnstone Supply - compresor $425, varillas plata $50, refrigerante $82.50]
"esto es para farmacia caridad número 40, el compresor tiene garantía de un año"
Tú: "Veo recibo de Johnstone Supply por $557.50:
- Compresor: $425.00
- Varillas de plata: $50.00
- Refrigerante: $82.50
¿Con qué tarjeta pagaste?"
Usuario: "chase"
Tú:
SAVE_EVENT:{"type":"expense","category":"Materiales","amount":557.50,"payment_method":"chase_visa","vendor":"Johnstone Supply","client":"Farmacia Caridad #40","expense_type":"business","note":"Compresor $425, varillas de plata $50, refrigerante $82.50","timestamp":${epochNow}}
SAVE_WARRANTY:{"equipment_type":"Compresor","brand":"(ver recibo)","vendor":"Johnstone Supply","client_name":"Farmacia Caridad #40","purchase_date":"${todayISO}","warranty_months":12,"cost":425,"notes":"Compresor para unidad paquete - Farmacia Caridad #40"}
✅ Guardados:
- Gasto: $557.50 materiales (Chase, Johnstone Supply) para Farmacia Caridad #40
- Garantía: Compresor con 12 meses de garantía

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
SAVE_BITACORA:{"date":"${todayISO}","raw_text":"texto original","summary":"resumen","tags":[],"clients_mentioned":[],"locations":[],"equipment":[],"jobs_count":0,"hours_estimated":0,"had_emergency":false,"highlights":[]}

# CONSULTAS
Para preguntas sobre datos, usa el CONTEXTO_DB que viene en el mensaje.

# IMPORTANTE
- Respuestas BREVES y directas
- NO inventes datos ni montos
- Si falta info crítica (monto) → pregunta
- El usuario dicta por voz, puede haber errores de transcripción
- Cuando el usuario dice un nombre de cliente, usa EXACTAMENTE ese nombre
- Un recibo = un gasto, no lo dupliques`

    // ====== DECIDIR MODELO ======
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