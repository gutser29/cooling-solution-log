import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord } from './types'

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

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function generateCategoryReport(
  events: EventRecord[],
  category: string,
  startDate: number,
  endDate: number
) {
  console.log('=== PDF DEBUG ===')
  console.log('Total:', events.length, '| Cat:', category, '| Rango:', new Date(startDate).toLocaleDateString(), '-', new Date(endDate).toLocaleDateString())

  const searchTerm = normalizeText(category)
  const filtered = events.filter(e => {
    const inCat = (e.category && normalizeText(e.category).includes(searchTerm)) ||
                  (e.subtype && normalizeText(e.subtype).includes(searchTerm))
    const inDate = e.timestamp >= startDate && e.timestamp <= endDate
    return inCat && inDate
  })

  console.log('Filtrados:', filtered.length)
  filtered.forEach((e, i) => {
    console.log(`  ${i + 1}: [${new Date(e.timestamp).toLocaleDateString()}] $${e.amount} pm="${e.payment_method}" → "${getPaymentLabel(e.payment_method)}"`)
  })

  if (filtered.length === 0) {
    alert(`No se encontraron eventos de "${category}" en el período seleccionado`)
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text(`Reporte: ${category}`, 14, 20)
  doc.setFontSize(10)
  doc.text(`${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, 14, 28)

  const paymentSummary: Record<string, number> = {}
  filtered.forEach(e => {
    const label = getPaymentLabel(e.payment_method)
    paymentSummary[label] = (paymentSummary[label] || 0) + e.amount
  })

  autoTable(doc, {
    startY: 35,
    head: [['Fecha', 'Monto', 'Método Pago', 'Detalle']],
    body: filtered.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      `$${e.amount.toFixed(2)}`,
      getPaymentLabel(e.payment_method),
      e.vendor || e.note || e.category || '-'
    ]),
    foot: [['TOTAL', `$${filtered.reduce((s, e) => s + e.amount, 0).toFixed(2)}`, '', '']]
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Desglose por método de pago:', 14, finalY)
  let y = finalY + 7
  Object.entries(paymentSummary).sort((a, b) => b[1] - a[1]).forEach(([method, total]) => {
    doc.setFontSize(10)
    doc.text(`${method}: $${total.toFixed(2)}`, 20, y)
    y += 6
  })

  const filename = `${category}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
  console.log('✅ PDF:', filename)
}