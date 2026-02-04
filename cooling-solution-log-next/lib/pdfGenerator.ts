import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord, Job, Invoice, Client, ClientPhoto, ClientDocument } from './types'

// ============ COMPANY INFO ============
const COMPANY_NAME = 'Cooling Solution'
const COMPANY_SLOGAN = '"Donde tu confort es nuestra prioridad"'
const COMPANY_ADDRESS = 'PO BOX 168'
const COMPANY_CITY = 'Toa Alta, Puerto Rico 00954'
const COMPANY_PHONE = '939-425-6081'
const COMPANY_EMAIL = 'Sergio.gutierrez@coolingsolutionpr.com'

// ============ LOGO BASE64 ============
const LOGO_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEtmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTA2LTA4PC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPmIwYmY4Mjc0LTJlMmEtNGNlYy05M2FiLTZiZTc5ZDE4YWQ2YjwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5Db29saW5nIFNvbHV0aW9uIC0gMTwvcmRmOmxpPgogICA8L3JkZjpBbHQ+CiAgPC9kYzp0aXRsZT4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRp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"

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCurrency(n: number): string {
  return '$' + n.toFixed(2)
}

function getPaymentLabel(method?: string): string {
  if (!method) return 'N/A'
  const labels: Record<string, string> = {
    cash: 'Efectivo', ath_movil: 'ATH Móvil', capital_one: 'Capital One',
    chase_visa: 'Chase Visa', paypal: 'PayPal', check: 'Cheque',
    sams_mastercard: "Sam's MC", transfer: 'Transferencia'
  }
  return labels[method] || method
}

function getCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    before: '📷 ANTES',
    after: '✅ DESPUÉS',
    diagnostic: '🔍 DIAGNÓSTICO',
    equipment: '⚙️ EQUIPO',
    area: '📐 ÁREA',
    receipt: '🧾 RECIBO',
    other: '📎 OTROS'
  }
  return labels[cat] || cat.toUpperCase()
}

export function generateInvoiceNumber(type: 'invoice' | 'quote'): string {
  const prefix = type === 'invoice' ? 'CS-INV' : 'CS-COT'
  const d = new Date()
  const yr = d.getFullYear().toString().slice(-2)
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefix}-${yr}${mo}-${rand}`
}

// ============ INVOICE PDF ============
export function generateInvoicePDF(invoice: Invoice): Blob {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const isQuote = invoice.type === 'quote'
  const title = isQuote ? 'Quote' : 'Invoice'
  const marginL = 20
  const marginR = 20

  // === TITLE ===
  doc.setFontSize(32)
  doc.setTextColor(30, 30, 30)
  doc.text(title, marginL, 28)

  // === LOGO ===
  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 14, 40, 17)
  } catch { }

  // === INVOICE META ===
  let y = 38
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  
  doc.setFont('helvetica', 'bold')
  doc.text(isQuote ? 'Quote number' : 'Invoice number', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoice_number, marginL + 40, y)
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Date of issue', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(invoice.issue_date), marginL + 40, y)
  
  y += 6
  if (invoice.due_date && !isQuote) {
    doc.setFont('helvetica', 'bold')
    doc.text('Date due', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.due_date), marginL + 40, y)
  }
  if (isQuote && invoice.expiration_date) {
    doc.setFont('helvetica', 'bold')
    doc.text('Valid until', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.expiration_date), marginL + 40, y)
  }

  // === COMPANY INFO & BILL TO ===
  y = 65
  const colMid = pageW / 2 + 5

  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(COMPANY_NAME, marginL, y)
  doc.text(COMPANY_ADDRESS, marginL, y + 4)
  doc.text(COMPANY_CITY, marginL, y + 8)
  doc.text(COMPANY_PHONE, marginL, y + 12)
  doc.text(COMPANY_EMAIL, marginL, y + 16)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Bill to', colMid, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  let billY = y + 5
  doc.text(invoice.client_name, colMid, billY)
  if (invoice.client_address) { billY += 5; doc.text(invoice.client_address, colMid, billY) }
  if (invoice.client_phone) { billY += 5; doc.text(invoice.client_phone, colMid, billY) }
  if (invoice.client_email) { billY += 5; doc.text(invoice.client_email, colMid, billY) }

  // === ITEMS TABLE ===
  y = 100
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(marginL, y, pageW - marginR, y)
  
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Description', marginL, y)
  doc.text('Qty', pageW - marginR - 65, y, { align: 'right' })
  doc.text('Unit price', pageW - marginR - 30, y, { align: 'right' })
  doc.text('Amount', pageW - marginR, y, { align: 'right' })
  
  y += 4
  doc.line(marginL, y, pageW - marginR, y)
  
  y += 8
  doc.setTextColor(30, 30, 30)
  invoice.items.forEach((item) => {
    doc.text(item.description, marginL, y)
    doc.text(String(item.quantity), pageW - marginR - 65, y, { align: 'right' })
    doc.text(formatCurrency(item.unit_price), pageW - marginR - 30, y, { align: 'right' })
    doc.text(formatCurrency(item.total), pageW - marginR, y, { align: 'right' })
    y += 8
  })

  // === TOTALS ===
  y += 8
  const totalsLabelX = pageW - marginR - 50
  
  doc.setTextColor(60, 60, 60)
  doc.text('Subtotal', totalsLabelX, y, { align: 'right' })
  doc.text(formatCurrency(invoice.subtotal), pageW - marginR, y, { align: 'right' })
  
  if (invoice.tax_rate > 0) {
    y += 6
    doc.text(`Tax (${invoice.tax_rate}%)`, totalsLabelX, y, { align: 'right' })
    doc.text(formatCurrency(invoice.tax_amount), pageW - marginR, y, { align: 'right' })
  }
  
  y += 6
  doc.text('Total', totalsLabelX, y, { align: 'right' })
  doc.text(formatCurrency(invoice.total), pageW - marginR, y, { align: 'right' })
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Amount due', totalsLabelX, y, { align: 'right' })
  doc.text(`${formatCurrency(invoice.total)} USD`, pageW - marginR, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // === NOTES ===
  if (invoice.notes) {
    y += 18
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text('Notes:', marginL, y)
    y += 5
    doc.setTextColor(60, 60, 60)
    const lines = doc.splitTextToSize(invoice.notes, pageW - marginL - marginR)
    doc.text(lines, marginL, y)
  }

  // === PAID STAMP ===
  if (invoice.status === 'paid' && invoice.paid_date) {
    y += 15
    doc.setFontSize(10)
    doc.setTextColor(34, 197, 94)
    doc.setFont('helvetica', 'bold')
    doc.text(`✓ PAID - ${formatDate(invoice.paid_date)} (${getPaymentLabel(invoice.paid_method)})`, marginL, y)
    doc.setFont('helvetica', 'normal')
  }

  // === FOOTER ===
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(marginL, pageH - 22, pageW - marginR, pageH - 22)
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 14, { align: 'center' })
  doc.setTextColor(150, 150, 150)
  doc.text('Page 1 of 1', pageW - marginR, pageH - 8, { align: 'right' })

  return doc.output('blob')
}

export function downloadInvoicePDF(invoice: Invoice) {
  const blob = generateInvoicePDF(invoice)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const prefix = invoice.type === 'quote' ? 'Quote' : 'Invoice'
  a.href = url
  a.download = `${prefix}-${invoice.invoice_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ============ CATEGORY REPORT ============
export function generateCategoryReport(
  events: EventRecord[],
  category: string,
  startDate: number,
  endDate: number
) {
  const filtered = events.filter(e =>
    e.timestamp >= startDate &&
    e.timestamp <= endDate &&
    (category === 'general' || e.category?.toLowerCase() === category.toLowerCase())
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Reporte ${category}`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 22)

  if (filtered.length === 0) {
    doc.text('No hay registros para este período.', 14, 35)
  } else {
    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Detalle', 'Método']],
      body: filtered.map(e => [
        formatDateShort(e.timestamp),
        e.type === 'income' ? 'Ingreso' : 'Gasto',
        e.category || '-',
        formatCurrency(e.amount),
        e.vendor || e.client || e.note || '-',
        getPaymentLabel(e.payment_method)
      ]),
      headStyles: { fillColor: [0, 150, 150], textColor: [255, 255, 255] },
      bodyStyles: { fontSize: 8 }
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    const totalIncome = filtered.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const totalExpense = filtered.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    
    doc.setFontSize(10)
    doc.text(`Total Ingresos: ${formatCurrency(totalIncome)}`, 14, finalY)
    doc.text(`Total Gastos: ${formatCurrency(totalExpense)}`, 14, finalY + 6)
    doc.setFont('helvetica', 'bold')
    doc.text(`Neto: ${formatCurrency(totalIncome - totalExpense)}`, 14, finalY + 12)
  }

  doc.save(`Reporte-${category}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ P&L REPORT ============
export function generatePLReport(
  events: EventRecord[],
  startDate: number,
  endDate: number,
  periodLabel: string
) {
  const filtered = events.filter(e => 
    e.timestamp >= startDate && 
    e.timestamp <= endDate &&
    e.expense_type !== 'personal'
  )

  const income = filtered.filter(e => e.type === 'income')
  const expenses = filtered.filter(e => e.type === 'expense')
  const totalIncome = income.reduce((s, e) => s + e.amount, 0)
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
  const profit = totalIncome - totalExpense

  const expenseByCategory: Record<string, number> = {}
  expenses.forEach(e => {
    const cat = e.category || 'Otros'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount
  })

  const incomeByCategory: Record<string, number> = {}
  income.forEach(e => {
    const cat = e.category || 'Otros'
    incomeByCategory[cat] = (incomeByCategory[cat] || 0) + e.amount
  })

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME}`, 14, 15)
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text(`Estado de Pérdidas y Ganancias - ${periodLabel}`, 14, 24)
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 30)

  let y = 42

  doc.setFontSize(11)
  doc.setTextColor(34, 197, 94)
  doc.setFont('helvetica', 'bold')
  doc.text('INGRESOS', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 7

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
    doc.text(cat, 20, y)
    doc.text(formatCurrency(total), 100, y, { align: 'right' })
    y += 5
  })
  
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(34, 197, 94)
  doc.text('Total Ingresos', 20, y)
  doc.text(formatCurrency(totalIncome), 100, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  y += 12
  doc.setFontSize(11)
  doc.setTextColor(239, 68, 68)
  doc.setFont('helvetica', 'bold')
  doc.text('GASTOS', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 7

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
    doc.text(cat, 20, y)
    doc.text(formatCurrency(total), 100, y, { align: 'right' })
    y += 5
  })

  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(239, 68, 68)
  doc.text('Total Gastos', 20, y)
  doc.text(formatCurrency(totalExpense), 100, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  y += 12
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y - 3, 110, y - 3)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  const profitColor = profit >= 0 ? [34, 197, 94] : [239, 68, 68]
  doc.setTextColor(profitColor[0], profitColor[1], profitColor[2])
  doc.text(profit >= 0 ? 'GANANCIA NETA' : 'PÉRDIDA NETA', 14, y)
  doc.text(formatCurrency(Math.abs(profit)), 100, y, { align: 'right' })

  if (totalIncome > 0) {
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    const margin = ((profit / totalIncome) * 100).toFixed(1)
    doc.text(`Margen: ${margin}%`, 14, y)
  }

  doc.save(`P&L-${periodLabel.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ AR REPORT ============
export function generateARReport(invoices: Invoice[]) {
  const pending = invoices.filter(inv => 
    inv.type === 'invoice' && 
    (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'draft')
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Cuentas por Cobrar`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`Generado: ${formatDate(Date.now())}`, 14, 22)

  if (pending.length === 0) {
    doc.setFontSize(12)
    doc.text('🎉 No hay facturas pendientes', 14, 40)
  } else {
    const total = pending.reduce((s, inv) => s + inv.total, 0)
    
    doc.setFontSize(14)
    doc.setTextColor(239, 68, 68)
    doc.text(`Total Pendiente: ${formatCurrency(total)}`, 14, 32)

    autoTable(doc, {
      startY: 40,
      head: [['#', 'Cliente', 'Fecha', 'Vence', 'Status', 'Total']],
      body: pending.map(inv => [
        inv.invoice_number,
        inv.client_name,
        formatDateShort(inv.issue_date),
        inv.due_date ? formatDateShort(inv.due_date) : '-',
        inv.status === 'overdue' ? 'VENCIDA' : inv.status === 'sent' ? 'Enviada' : 'Borrador',
        formatCurrency(inv.total)
      ]),
      headStyles: { fillColor: [0, 150, 150] },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 4: { cellWidth: 25, fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.column.index === 4 && data.cell.raw === 'VENCIDA') {
          data.cell.styles.textColor = [239, 68, 68]
        }
      }
    })
  }

  doc.save(`Cuentas-por-Cobrar-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ PAYMENT METHOD REPORT ============
export function generatePaymentMethodReport(
  events: EventRecord[],
  paymentMethod: string,
  startDate: number,
  endDate: number
) {
  const filtered = events.filter(e =>
    e.timestamp >= startDate &&
    e.timestamp <= endDate &&
    e.payment_method?.toLowerCase().includes(paymentMethod.replace(/_/g, ' ').toLowerCase())
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Reporte ${getPaymentLabel(paymentMethod)}`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 22)

  if (filtered.length === 0) {
    doc.text('No hay registros para este método de pago.', 14, 35)
  } else {
    const catSummary: Record<string, number> = {}
    filtered.forEach(e => {
      const cat = e.category || 'Otros'
      catSummary[cat] = (catSummary[cat] || 0) + e.amount
    })

    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Categoría', 'Monto', 'Detalle']],
      body: filtered.map(e => [
        formatDateShort(e.timestamp),
        e.category || '-',
        formatCurrency(e.amount),
        e.vendor || e.note || '-'
      ]),
      foot: [['TOTAL', '', formatCurrency(filtered.reduce((s, e) => s + e.amount, 0)), '']]
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.text('Por categoría:', 14, finalY)
    let y = finalY + 7
    doc.setFontSize(9)
    Object.entries(catSummary).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
      doc.text(`${cat}: ${formatCurrency(total)}`, 20, y)
      y += 5
    })
  }

  doc.save(`${paymentMethod}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ PHOTO REPORT - MEJORADO ============
export function generatePhotoReport(
  photos: ClientPhoto[],
  clientName: string,
  jobDescription?: string
) {
  if (photos.length === 0) {
    alert('No hay fotos para este reporte')
    return
  }

  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 15
  const marginR = 15
  const contentW = pageW - marginL - marginR

  // Agrupar fotos por fecha (día)
  const photosByDate: Record<string, ClientPhoto[]> = {}
  photos.forEach(photo => {
    const dateKey = new Date(photo.timestamp).toLocaleDateString('es-PR')
    if (!photosByDate[dateKey]) photosByDate[dateKey] = []
    photosByDate[dateKey].push(photo)
  })

  // Ordenar fechas de más reciente a más antigua
  const sortedDates = Object.keys(photosByDate).sort((a, b) => {
    const dateA = new Date(photosByDate[a][0].timestamp)
    const dateB = new Date(photosByDate[b][0].timestamp)
    return dateB.getTime() - dateA.getTime()
  })

  // === HEADER ===
  const addHeader = (pageNum: number) => {
    // Logo marca de agua (semi-transparente en esquina)
    try {
      doc.setGState(new (doc as any).GState({ opacity: 0.1 }))
      doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - 60, 5, 50, 21)
      doc.setGState(new (doc as any).GState({ opacity: 1 }))
    } catch { }

    // Logo principal
    try {
      doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 10, 40, 17)
    } catch { }

    doc.setFontSize(14)
    doc.setTextColor(0, 150, 150)
    doc.setFont('helvetica', 'bold')
    doc.text(COMPANY_NAME, marginL, 18)
    doc.setFont('helvetica', 'normal')

    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(COMPANY_ADDRESS, marginL, 24)
    doc.text(COMPANY_CITY, marginL, 28)
    doc.text(`Tel: ${COMPANY_PHONE}`, marginL, 32)

    // Línea separadora
    doc.setDrawColor(0, 150, 150)
    doc.setLineWidth(0.5)
    doc.line(marginL, 38, pageW - marginR, 38)

    // Info del cliente
    doc.setFontSize(12)
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'bold')
    doc.text(`Reporte de Fotos - ${clientName}`, marginL, 48)
    doc.setFont('helvetica', 'normal')

    if (jobDescription) {
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.text(jobDescription, marginL, 54)
    }

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`Generado: ${formatDate(Date.now())}`, marginL, jobDescription ? 60 : 54)
    doc.text(`Total: ${photos.length} foto(s)`, marginL + 80, jobDescription ? 60 : 54)
  }

  // === FOOTER ===
  const addFooter = (pageNum: number, totalPages: number) => {
    // Marca de agua diagonal
    doc.setGState(new (doc as any).GState({ opacity: 0.05 }))
    doc.setFontSize(60)
    doc.setTextColor(0, 150, 150)
    doc.text(COMPANY_NAME, pageW / 2, pageH / 2, { align: 'center', angle: 45 })
    doc.setGState(new (doc as any).GState({ opacity: 1 }))

    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(marginL, pageH - 18, pageW - marginR, pageH - 18)
    
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 12, { align: 'center' })
    doc.text(`${COMPANY_PHONE} | ${COMPANY_EMAIL}`, pageW / 2, pageH - 7, { align: 'center' })
    doc.text(`Página ${pageNum}`, pageW - marginR, pageH - 7, { align: 'right' })
  }

  let currentPage = 1
  addHeader(currentPage)

  let y = 70
  const imgWidth = 80
  const imgHeight = 60

  // Iterar por cada fecha
  sortedDates.forEach((dateKey, dateIndex) => {
    const datePhotos = photosByDate[dateKey]
    
    // Check si necesitamos nueva página para el título de fecha
    if (y > pageH - 100) {
      addFooter(currentPage, sortedDates.length)
      doc.addPage()
      currentPage++
      addHeader(currentPage)
      y = 70
    }

    // Título de la fecha
    doc.setFontSize(11)
    doc.setTextColor(0, 150, 150)
    doc.setFont('helvetica', 'bold')
    doc.text(`📅 ${formatDate(datePhotos[0].timestamp)}`, marginL, y)
    doc.setFont('helvetica', 'normal')
    
    // Línea bajo la fecha
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.line(marginL, y + 2, pageW - marginR, y + 2)
    y += 10

    // Agrupar por categoría dentro de la fecha
    const categories = ['before', 'after', 'diagnostic', 'equipment', 'area', 'other']
    
    categories.forEach(cat => {
      const catPhotos = datePhotos.filter(p => p.category === cat)
      if (catPhotos.length === 0) return

      // Check si necesitamos nueva página
      if (y > pageH - 90) {
        addFooter(currentPage, sortedDates.length)
        doc.addPage()
        currentPage++
        addHeader(currentPage)
        y = 70
      }

      // Título de categoría
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.setFont('helvetica', 'bold')
      doc.text(getCategoryLabel(cat), marginL + 5, y)
      doc.setFont('helvetica', 'normal')
      y += 6

      let x = marginL
      catPhotos.forEach((photo, idx) => {
        // Check si necesitamos nueva página
        if (y > pageH - 85) {
          addFooter(currentPage, sortedDates.length)
          doc.addPage()
          currentPage++
          addHeader(currentPage)
          y = 70
          x = marginL
        }

        // Añadir imagen
        try {
          doc.addImage(photo.photo_data, 'JPEG', x, y, imgWidth, imgHeight)
          
          // Borde sutil
          doc.setDrawColor(220, 220, 220)
          doc.setLineWidth(0.3)
          doc.rect(x, y, imgWidth, imgHeight)
        } catch {
          doc.setDrawColor(200, 200, 200)
          doc.rect(x, y, imgWidth, imgHeight)
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text('Imagen no disponible', x + 15, y + 30)
        }

        // Descripción
        let descY = y + imgHeight + 3
        if (photo.description) {
          doc.setFontSize(8)
          doc.setTextColor(40, 40, 40)
          const descLines = doc.splitTextToSize(photo.description, imgWidth)
          doc.text(descLines.slice(0, 2), x, descY)
          descY += descLines.slice(0, 2).length * 3
        }

        // Equipo/ubicación si existe
        if (photo.equipment_type || photo.location) {
          doc.setFontSize(7)
          doc.setTextColor(100, 100, 100)
          const info = [photo.equipment_type, photo.location].filter(Boolean).join(' | ')
          doc.text(info, x, descY + 2)
        }

        // Mover a siguiente posición (2 por fila)
        if ((idx + 1) % 2 === 0) {
          x = marginL
          y += imgHeight + 18
        } else {
          x = marginL + imgWidth + 10
        }
      })

      // Si número impar, mover a siguiente fila
      if (catPhotos.length % 2 !== 0) {
        y += imgHeight + 18
      }
      
      y += 5 // Espacio entre categorías
    })

    y += 8 // Espacio entre fechas
  })

  // Footer en última página
  addFooter(currentPage, currentPage)

  const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '-')
  doc.save(`Fotos-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ CLIENT LIST PDF ============
export function generateClientListPDF(clients: Client[]) {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 20
  const marginR = 20

  doc.setFontSize(18)
  doc.setTextColor(0, 150, 150)
  doc.text(COMPANY_NAME, marginL, 18)
  
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text('Lista de Clientes', marginL, 28)
  
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`Generado: ${formatDate(Date.now())}`, marginL, 36)
  doc.text(`Total: ${clients.length} clientes`, marginL, 42)

  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 10, 40, 17)
  } catch { }

  if (clients.length === 0) {
    doc.setFontSize(12)
    doc.text('No hay clientes registrados', marginL, 60)
  } else {
    autoTable(doc, {
      startY: 50,
      head: [['Nombre', 'Tipo', 'Teléfono', 'Email', 'Dirección']],
      body: clients.map(c => [
        `${c.first_name} ${c.last_name}`,
        c.type === 'commercial' ? 'Comercial' : 'Residencial',
        c.phone || '-',
        c.email || '-',
        c.address || '-'
      ]),
      headStyles: { fillColor: [0, 150, 150], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 30 },
        2: { cellWidth: 35 },
        3: { cellWidth: 45 },
        4: { cellWidth: 'auto' }
      }
    })
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(marginL, pageH - 15, pageW - marginR, pageH - 15)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 8, { align: 'center' })
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginR, pageH - 8, { align: 'right' })
  }

  doc.save(`Lista-Clientes-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ DOCUMENT LIST PDF ============
export function generateDocumentListPDF(docs: ClientDocument[], clientName: string) {
  if (docs.length === 0) {
    alert('No hay documentos para este reporte')
    return
  }

  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 20
  const marginR = 20

  doc.setFontSize(18)
  doc.setTextColor(0, 150, 150)
  doc.text(COMPANY_NAME, marginL, 18)
  
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text(`Documentos - ${clientName}`, marginL, 28)
  
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`Generado: ${formatDate(Date.now())}`, marginL, 36)
  doc.text(`Total: ${docs.length} documento(s)`, marginL, 42)

  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 10, 40, 17)
  } catch { }

  const docTypeLabels: Record<string, string> = {
    contract: 'Contrato',
    permit: 'Permiso',
    warranty: 'Garantía',
    manual: 'Manual',
    receipt: 'Recibo',
    agreement: 'Acuerdo',
    other: 'Otro'
  }

  autoTable(doc, {
    startY: 50,
    head: [['Nombre', 'Tipo', 'Fecha', 'Vencimiento', 'Descripción']],
    body: docs.map(d => [
      d.file_name,
      docTypeLabels[d.doc_type] || d.doc_type,
      formatDateShort(d.timestamp),
      d.expiration_date ? formatDateShort(d.expiration_date) : '-',
      d.description || '-'
    ]),
    headStyles: { fillColor: [0, 150, 150], textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  })

  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(marginL, pageH - 15, pageW - marginR, pageH - 15)
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 8, { align: 'center' })

  const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '-')
  doc.save(`Documentos-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`)
}