import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord } from './types'

// ============ FIX BUG 1: MAPA DE LABELS LEGIBLES ============
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  ath_movil: 'ATH Móvil',
  business_card: 'Tarjeta Negocio',
  sams_card: "Sam's Card",
  paypal: 'PayPal',
  personal_card: 'Tarjeta Personal',
  other: 'Otro',
}

function getPaymentLabel(method: string | undefined | null): string {
  if (!method || method.trim() === '') return 'Sin registrar'
  const key = method.trim().toLowerCase()
  return PAYMENT_LABELS[key] || method
}
// =============================================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function generateCategoryReport(
  events: EventRecord[],
  category: string,
  startDate: number,
  endDate: number
) {
  console.log('=== PDF DEBUG START ===')
  console.log('📊 Total eventos recibidos:', events.length)
  console.log('🔍 Buscando categoría:', category)
  console.log('📅 Rango:', new Date(startDate).toLocaleDateString(), 'a', new Date(endDate).toLocaleDateString())

  const searchTerm = normalizeText(category)

  const filtered = events.filter(e => {
    const inCategory =
      (e.category && normalizeText(e.category).includes(searchTerm)) ||
      (e.subtype && normalizeText(e.subtype).includes(searchTerm))

    const inDateRange = e.timestamp >= startDate && e.timestamp <= endDate

    return inCategory && inDateRange
  })

  console.log('✅ Eventos filtrados:', filtered.length)

  // DEBUG DETALLADO DE PAYMENT_METHOD
  console.log('--- PAYMENT_METHOD DEBUG ---')
  filtered.forEach((e, idx) => {
    console.log(`Evento ${idx + 1}:`, {
      fecha: new Date(e.timestamp).toLocaleDateString(),
      categoria: e.category,
      monto: e.amount,
      raw_payment_method: e.payment_method,
      tipo: typeof e.payment_method,
      esVacio: e.payment_method === '',
      esNull: e.payment_method === null,
      esUndefined: e.payment_method === undefined,
      label: getPaymentLabel(e.payment_method),
      vendor: e.vendor
    })
  })
  console.log('----------------------------')

  if (filtered.length === 0) {
    alert(`No se encontraron eventos de "${category}" en el período seleccionado`)
    return
  }

  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text(`Reporte: ${category}`, 14, 20)
  doc.setFontSize(10)
  doc.text(`${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, 14, 28)

  // ============ FIX: USA getPaymentLabel() EN VEZ DE || 'N/A' ============
  const paymentSummary: Record<string, number> = {}
  filtered.forEach(e => {
    const label = getPaymentLabel(e.payment_method)
    paymentSummary[label] = (paymentSummary[label] || 0) + e.amount
    console.log(`💳 Raw: "${e.payment_method}" → Label: "${label}" → $${e.amount}`)
  })

  console.log('📋 Resumen por método:', paymentSummary)

  autoTable(doc, {
    startY: 35,
    head: [['Fecha', 'Monto', 'Método Pago', 'Detalle']],
    body: filtered.map(e => {
      const label = getPaymentLabel(e.payment_method)
      console.log(`📄 PDF Row - raw: "${e.payment_method}" → display: "${label}"`)
      return [
        new Date(e.timestamp).toLocaleDateString(),
        `$${e.amount.toFixed(2)}`,
        label,
        e.vendor || e.note || e.category || '-'
      ]
    }),
    foot: [['TOTAL', `$${filtered.reduce((s, e) => s + e.amount, 0).toFixed(2)}`, '', '']]
  })
  // ======================================================================

  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Desglose por método de pago:', 14, finalY)

  let y = finalY + 7
  Object.entries(paymentSummary)
    .sort((a, b) => b[1] - a[1])
    .forEach(([method, total]) => {
      doc.setFontSize(10)
      doc.text(`${method}: $${total.toFixed(2)}`, 20, y)
      y += 6
    })

  const filename = `${category}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)

  console.log('✅ PDF generado:', filename)
  console.log('=== PDF DEBUG END ===')
}