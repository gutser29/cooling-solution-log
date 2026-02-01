import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord } from './types'

export function generateCategoryReport(
  events: EventRecord[], 
  category: string,
  startDate: number,
  endDate: number
) {
  const doc = new jsPDF()
  
const filtered = events.filter(e =>
  (e.category || '').toLowerCase().includes((category || '').toLowerCase()) &&
  e.timestamp >= startDate &&
  e.timestamp <= endDate
)

  
  doc.setFontSize(18)
  doc.text(`Reporte: ${category}`, 14, 20)
  doc.setFontSize(10)
  doc.text(`${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, 14, 28)
  
  const paymentSummary: Record<string, number> = {}
  filtered.forEach(e => {
    const method = e.payment_method || 'Desconocido'
    paymentSummary[method] = (paymentSummary[method] || 0) + e.amount
  })
  
  autoTable(doc, {
    startY: 35,
    head: [['Fecha', 'Monto', 'Método Pago', 'Vendor/Nota']],
    body: filtered.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      `$${e.amount.toFixed(2)}`,
      e.payment_method || 'N/A',
      e.vendor || e.note || 'N/A'
    ]),
    foot: [['TOTAL', `$${filtered.reduce((s, e) => s + e.amount, 0).toFixed(2)}`, '', '']]
  })
  
  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Desglose por método de pago:', 14, finalY)
  
  let y = finalY + 7
  Object.entries(paymentSummary).forEach(([method, total]) => {
    doc.setFontSize(10)
    doc.text(`${method}: $${total.toFixed(2)}`, 20, y)
    y += 6
  })
  
  doc.save(`${category}-${new Date().toISOString().split('T')[0]}.pdf`)
}