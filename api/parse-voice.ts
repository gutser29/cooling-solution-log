import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body

  if (!text) {
    return res.status(400).json({ error: 'Text required' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Eres un asistente que extrae información de gastos/ingresos de un técnico HVAC en Puerto Rico.

Extrae la siguiente información del texto y devuelve SOLO un JSON válido sin explicaciones:

{
  "amount": número,
  "subtype": "gas" | "food" | "maintenance" | "service" | "materials" | "other",
  "payment_method": "cash" | "ath_movil" | "business_card" | "sams_card" | "paypal" | "personal_card" | "other",
  "category": string (nombre descriptivo),
  "vendor": string | null,
  "client": string | null,
  "note": string | null,
  "metadata": objeto con campos específicos según subtype
}

Ejemplos:
- "40 de gas con la business card" → {"amount": 40, "subtype": "gas", "payment_method": "business_card", "category": "Gasolina"}
- "Compré comida 25 dólares en efectivo" → {"amount": 25, "subtype": "food", "payment_method": "cash", "category": "Comida"}
- "Le cambié aceite a la Transit por 80 con ATH" → {"amount": 80, "subtype": "maintenance", "payment_method": "ath_movil", "category": "Mantenimiento", "metadata": {"vehicle_id": "transit", "service_type": "aceite"}}

Texto a procesar: "${text}"

Devuelve SOLO el JSON, sin markdown ni explicaciones.`,
          },
        ],
      }),
    })

    const data = await response.json()
    
    if (data.error) {
      throw new Error(data.error.message)
    }

    // Extraer el JSON de la respuesta de Claude
    let parsedData
    try {
      const content = data.content[0].text.trim()
      // Remover markdown si existe
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsedData = JSON.parse(jsonStr)
    } catch (e) {
      throw new Error('Failed to parse Claude response')
    }

    return res.status(200).json(parsedData)
  } catch (error: any) {
    console.error('Error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}