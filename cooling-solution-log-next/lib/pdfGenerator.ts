import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord, Job, Invoice, Client, ClientPhoto, ClientDocument } from './types'

// ============ COMPANY INFO ============
const COMPANY_NAME = 'Cooling Solution'
const COMPANY_SLOGAN = '"Donde tu confort es nuestra prioridad"'
const COMPANY_ADDRESS = 'PO BOX 168'
const COMPANY_CITY = 'Toa Alta, PR 00954'
const COMPANY_PHONE = '939-425-6081'
const COMPANY_EMAIL = 'sergio.gutierrez@coolingsolutionpr.com'

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

// ============ INVOICE PDF - ESTILO ANTHROPIC ============
export function generateInvoicePDF(invoice: Invoice): Blob {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const isQuote = invoice.type === 'quote'
  const title = isQuote ? 'Quote' : 'Invoice'
  const marginL = 20
  const marginR = 20

  // === TITLE (grande, arriba izquierda) ===
  doc.setFontSize(32)
  doc.setTextColor(30, 30, 30)
  doc.text(title, marginL, 28)

  // === LOGO (arriba derecha) ===
  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 35, 12, 35, 15)
  } catch { }

  // === INVOICE META (debajo del título) ===
  let y = 40
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  
  doc.setFont('helvetica', 'bold')
  doc.text('Invoice number', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoice_number, marginL + 35, y)
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Date of issue', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(invoice.issue_date), marginL + 35, y)
  
  y += 6
  if (invoice.due_date && !isQuote) {
    doc.setFont('helvetica', 'bold')
    doc.text('Date due', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.due_date), marginL + 35, y)
  }
  if (isQuote && invoice.expiration_date) {
    doc.setFont('helvetica', 'bold')
    doc.text('Valid until', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.expiration_date), marginL + 35, y)
  }

  // === COMPANY INFO (izquierda) & BILL TO (derecha) - EN PARALELO ===
  y = 68
  const colRight = 110

  // Company info (izquierda)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text(COMPANY_NAME, marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text(COMPANY_ADDRESS, marginL, y + 5)
  doc.text(COMPANY_CITY, marginL, y + 10)
  doc.text(COMPANY_PHONE, marginL, y + 15)
  doc.text(COMPANY_EMAIL, marginL, y + 20)

  // Bill to (derecha)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Bill to', colRight, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  let billY = y + 5
  doc.text(invoice.client_name, colRight, billY)
  if (invoice.client_address) { billY += 5; doc.text(invoice.client_address, colRight, billY) }
  if (invoice.client_phone) { billY += 5; doc.text(invoice.client_phone, colRight, billY) }
  if (invoice.client_email) { billY += 5; doc.text(invoice.client_email, colRight, billY) }

  // === ITEMS TABLE ===
  y = 105
  
  // Header de tabla
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(marginL, y, pageW - marginR, y)
  
  y += 6
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text('Description', marginL, y)
  doc.text('Qty', pageW - marginR - 55, y, { align: 'right' })
  doc.text('Unit price', pageW - marginR - 25, y, { align: 'right' })
  doc.text('Amount', pageW - marginR, y, { align: 'right' })
  
  y += 3
  doc.line(marginL, y, pageW - marginR, y)
  
  // Rows
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  invoice.items.forEach((item) => {
    doc.text(item.description, marginL, y)
    doc.text(String(item.quantity), pageW - marginR - 55, y, { align: 'right' })
    doc.text(formatCurrency(item.unit_price), pageW - marginR - 25, y, { align: 'right' })
    doc.text(formatCurrency(item.total), pageW - marginR, y, { align: 'right' })
    y += 7
  })

  // === TOTALS (derecha, estilo Anthropic) ===
  y += 10
  const labelX = pageW - marginR - 60
  const valueX = pageW - marginR
  
  doc.setFontSize(10)
  doc.setTextColor(60, 60, 60)
  
  doc.text('Subtotal', labelX, y)
  doc.text(formatCurrency(invoice.subtotal), valueX, y, { align: 'right' })
  
  if (invoice.tax_rate > 0) {
    y += 6
    doc.text(`Tax (${invoice.tax_rate}%)`, labelX, y)
    doc.text(formatCurrency(invoice.tax_amount), valueX, y, { align: 'right' })
  }
  
  y += 6
  doc.text('Total', labelX, y)
  doc.text(formatCurrency(invoice.total), valueX, y, { align: 'right' })
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Amount due', labelX, y)
  doc.text(`${formatCurrency(invoice.total)} USD`, valueX, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // === NOTES ===
  if (invoice.notes) {
    y += 20
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
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

  // === FOOTER (línea, eslogan centrado, página) ===
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(marginL, pageH - 22, pageW - marginR, pageH - 22)
  
  doc.setFontSize(9)
  doc.setTextColor(0, 150, 150)
  doc.setFont('helvetica', 'italic')
  doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  
  doc.setTextColor(120, 120, 120)
  doc.text('Page 1 of 1', pageW - marginR, pageH - 6, { align: 'right' })

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
  const imgWidth = 170
  const imgHeight = 130

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

      catPhotos.forEach((photo, idx) => {
        // Check si necesitamos nueva página
        if (y > pageH - 160) {
          addFooter(currentPage, sortedDates.length)
          doc.addPage()
          currentPage++
          addHeader(currentPage)
          y = 70
        }

        // Añadir imagen centrada
        const imgX = (pageW - imgWidth) / 2
        try {
          // Usar dataURL completo para preservar colores
          doc.addImage(photo.photo_data, imgX, y, imgWidth, imgHeight)
          
          // Borde sutil
          doc.setDrawColor(220, 220, 220)
          doc.setLineWidth(0.3)
          doc.rect(imgX, y, imgWidth, imgHeight)
        } catch {
          doc.setDrawColor(200, 200, 200)
          doc.rect(imgX, y, imgWidth, imgHeight)
          doc.setFontSize(10)
          doc.setTextColor(150, 150, 150)
          doc.text('Imagen no disponible', imgX + 50, y + 65)
        }

        // Descripción
        let descY = y + imgHeight + 4
        if (photo.description) {
          doc.setFontSize(9)
          doc.setTextColor(40, 40, 40)
          const descLines = doc.splitTextToSize(photo.description, imgWidth)
          doc.text(descLines.slice(0, 2), imgX, descY)
          descY += descLines.slice(0, 2).length * 4
        }

        // Equipo/ubicación si existe
        if (photo.equipment_type || photo.location) {
          doc.setFontSize(8)
          doc.setTextColor(100, 100, 100)
          const info = [photo.equipment_type, photo.location].filter(Boolean).join(' | ')
          doc.text(info, imgX, descY + 3)
        }

        // 1 imagen por fila para máxima calidad
        y += imgHeight + 25
      })

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