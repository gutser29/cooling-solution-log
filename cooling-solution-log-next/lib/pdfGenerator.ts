import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord } from './types'

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
}

export function generateCategoryReport(
  events: EventRecord[], 
  category: string,
  startDate: number,
  endDate: number
) {
  console.log('=== PDF DEBUG ===')
  console.log('Total eventos:', events.length)
  console.log('Buscando categoría:', category)
  console.log('Rango:', new Date(startDate), 'a', new Date(endDate))
  
  const searchTerm = normalizeText(category)
  
  const filtered = events.filter(e => {
    const inCategory = 
      (e.category && normalizeText(e.category).includes(searchTerm)) ||
      (e.subtype && normalizeText(e.subtype).includes(searchTerm))
    
    const inDateRange = e.timestamp >= startDate && e.timestamp <= endDate
    
    return inCategory && inDateRange
  })
  
  console.log('Eventos filtrados:', filtered.length)
  console.log('Primeros 3:', filtered.slice(0, 3))
  
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
    const method = e.payment_method || 'Desconocido'
    paymentSummary[method] = (paymentSummary[method] || 0) + e.amount
  })
  
  autoTable(doc, {
    startY: 35,
    head: [['Fecha', 'Monto', 'Método Pago', 'Detalle']],
    body: filtered.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      `$${e.amount.toFixed(2)}`,
      e.payment_method || 'N/A',
      e.vendor || e.note || e.category || 'N/A'
    ]),
    foot: [['TOTAL', `$${filtered.reduce((s, e) => s + e.amount, 0).toFixed(2)}`, '', '']]
  })
  
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
  
  console.log('PDF generado:', filename)
}