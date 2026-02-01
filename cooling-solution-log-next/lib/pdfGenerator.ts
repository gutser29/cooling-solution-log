import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord } from './types'

export function generateMonthlyReport(events: EventRecord[], month: string) {
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(18)
  doc.text('Reporte Mensual - Cooling Solution', 14, 20)
  doc.setFontSize(12)
  doc.text(month, 14, 28)
  
  // Gastos
  const expenses = events.filter(e => e.type === 'expense')
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  
  doc.text('GASTOS', 14, 40)
  autoTable(doc, {
    startY: 45,
    head: [['Fecha', 'Categoría', 'Monto', 'Método']],
    body: expenses.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      e.category,
      `$${e.amount.toFixed(2)}`,
      e.payment_method || 'N/A'
    ]),
    foot: [['', 'TOTAL', `$${totalExpenses.toFixed(2)}`, '']]
  })
  
  // Ingresos
  const income = events.filter(e => e.type === 'income')
  const totalIncome = income.reduce((sum, e) => sum + e.amount, 0)
  
  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.text('INGRESOS', 14, finalY)
  autoTable(doc, {
    startY: finalY + 5,
    head: [['Fecha', 'Cliente', 'Monto', 'Status']],
    body: income.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      e.client || e.category,
      `$${e.amount.toFixed(2)}`,
      e.status
    ]),
    foot: [['', 'TOTAL', `$${totalIncome.toFixed(2)}`, '']]
  })
  
  // Balance
  const balance = totalIncome - totalExpenses
  const finalY2 = (doc as any).lastAutoTable.finalY + 15
  doc.setFontSize(14)
  doc.text(`BALANCE: $${balance.toFixed(2)}`, 14, finalY2)
  
  doc.save(`reporte-${month}.pdf`)
}