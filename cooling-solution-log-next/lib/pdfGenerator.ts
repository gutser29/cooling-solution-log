import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord, Job } from './types'

// ============ HELPERS ============

const KNOWN_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  ath_movil: 'ATH Móvil',
  paypal: 'PayPal',
}

function getPaymentLabel(method: string | undefined | null): string {
  if (!method || method.trim() === '') return 'Sin registrar'
  const key = method.trim().toLowerCase()
  if (KNOWN_LABELS[key]) return KNOWN_LABELS[key]
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PR')
}

// ============ 1) CATEGORY REPORT (existente mejorado) ============

export function generateCategoryReport(
  events: EventRecord[],
  category: string,
  startDate: number,
  endDate: number
) {
  const searchTerm = normalizeText(category)
  const filtered = events.filter(e => {
    const inCat = (e.category && normalizeText(e.category).includes(searchTerm)) ||
                  (e.subtype && normalizeText(e.subtype).includes(searchTerm))
    const inDate = e.timestamp >= startDate && e.timestamp <= endDate
    return inCat && inDate
  })

  console.log(`📊 Category Report: ${category} | ${filtered.length} eventos`)

  if (filtered.length === 0) {
    alert(`No se encontraron eventos de "${category}" en el período seleccionado`)
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text(`Reporte: ${category}`, 14, 20)
  doc.setFontSize(10)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 28)
  doc.text(`Cooling Solution Log`, 14, 33)

  const paymentSummary: Record<string, number> = {}
  filtered.forEach(e => {
    const label = getPaymentLabel(e.payment_method)
    paymentSummary[label] = (paymentSummary[label] || 0) + e.amount
  })

  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Monto', 'Método Pago', 'Detalle']],
    body: filtered.map(e => [
      formatDate(e.timestamp),
      formatCurrency(e.amount),
      getPaymentLabel(e.payment_method),
      e.vendor || e.note || e.category || '-'
    ]),
    foot: [['TOTAL', formatCurrency(filtered.reduce((s, e) => s + e.amount, 0)), '', '']]
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Desglose por método de pago:', 14, finalY)
  let y = finalY + 7
  Object.entries(paymentSummary).sort((a, b) => b[1] - a[1]).forEach(([method, total]) => {
    doc.setFontSize(10)
    doc.text(`${method}: ${formatCurrency(total)}`, 20, y)
    y += 6
  })

  doc.save(`${category}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ 2) P&L REPORT ============

export function generatePLReport(
  events: EventRecord[],
  jobs: Job[],
  startDate: number,
  endDate: number,
  periodLabel: string
) {
  const periodEvents = events.filter(e => e.timestamp >= startDate && e.timestamp <= endDate)
  const periodJobs = jobs.filter(j => j.date >= startDate && j.date <= endDate)

  // === INGRESOS ===
  const incomeEvents = periodEvents.filter(e => e.type === 'income')
  const totalIncome = incomeEvents.reduce((s, e) => s + e.amount, 0)

  // Ingresos de jobs (pagos recibidos en el período)
  let jobIncome = 0
  periodJobs.forEach(j => {
    j.payments.forEach(p => {
      if (p.date >= startDate && p.date <= endDate) {
        jobIncome += p.amount
      }
    })
  })

  const grossIncome = totalIncome + jobIncome

  // === GASTOS POR CATEGORÍA ===
  const expenseEvents = periodEvents.filter(e => e.type === 'expense')
  const expenseByCategory: Record<string, number> = {}
  expenseEvents.forEach(e => {
    const cat = e.category || e.subtype || 'Otro'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount
  })
  const totalExpenses = expenseEvents.reduce((s, e) => s + e.amount, 0)

  // === NÓMINA (de jobs) ===
  let totalPayroll = 0
  periodJobs.forEach(j => {
    j.employees.forEach(emp => {
      totalPayroll += emp.total_net
    })
  })

  // === COSTO DE MATERIALES (de jobs) ===
  let materialCost = 0
  let materialCharged = 0
  periodJobs.forEach(j => {
    j.materials.forEach(m => {
      materialCost += m.unit_cost * m.quantity
      materialCharged += m.unit_price * m.quantity
    })
  })
  const materialProfit = materialCharged - materialCost

  // === TOTALES ===
  const totalCosts = totalExpenses + totalPayroll
  const netProfit = grossIncome - totalCosts
  const profitMargin = grossIncome > 0 ? ((netProfit / grossIncome) * 100) : 0

  // === GASTOS POR MÉTODO DE PAGO ===
  const expenseByMethod: Record<string, number> = {}
  expenseEvents.forEach(e => {
    const label = getPaymentLabel(e.payment_method)
    expenseByMethod[label] = (expenseByMethod[label] || 0) + e.amount
  })

  // === GENERAR PDF ===
  const doc = new jsPDF()

  // Header
  doc.setFontSize(20)
  doc.setTextColor(40, 40, 40)
  doc.text('PROFIT & LOSS', 14, 20)
  doc.setFontSize(12)
  doc.text(`Cooling Solution Log`, 14, 27)
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Período: ${periodLabel}`, 14, 33)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 38)
  doc.text(`Generado: ${formatDate(Date.now())}`, 14, 43)

  // === RESUMEN EJECUTIVO ===
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text('Resumen', 14, 55)

  const summaryColor = netProfit >= 0 ? [34, 139, 34] : [220, 20, 20]

  autoTable(doc, {
    startY: 60,
    head: [['Concepto', 'Monto']],
    body: [
      ['Ingresos Totales', formatCurrency(grossIncome)],
      ['  Cobros directos', formatCurrency(totalIncome)],
      ['  Pagos de trabajos', formatCurrency(jobIncome)],
      ['', ''],
      ['Gastos Totales', formatCurrency(totalCosts)],
      ['  Gastos operativos', formatCurrency(totalExpenses)],
      ['  Nómina empleados', formatCurrency(totalPayroll)],
      ['', ''],
      ['Ganancia en materiales', formatCurrency(materialProfit)],
      ['  (Costo: ' + formatCurrency(materialCost) + ' → Cobrado: ' + formatCurrency(materialCharged) + ')', ''],
    ],
    foot: [
      ['PROFIT NETO', formatCurrency(netProfit)],
      ['Margen', `${profitMargin.toFixed(1)}%`]
    ],
    styles: { fontSize: 10 },
    footStyles: { fillColor: summaryColor as any, textColor: [255, 255, 255] },
    columnStyles: { 1: { halign: 'right' } }
  })

  let currentY = (doc as any).lastAutoTable.finalY + 15

  // === DESGLOSE GASTOS POR CATEGORÍA ===
  doc.setFontSize(14)
  doc.text('Gastos por Categoría', 14, currentY)

  const catEntries = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Categoría', 'Monto', '% del Total']],
    body: catEntries.map(([cat, amount]) => [
      cat,
      formatCurrency(amount),
      `${((amount / totalExpenses) * 100).toFixed(1)}%`
    ]),
    foot: [['TOTAL', formatCurrency(totalExpenses), '100%']],
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
  })

  currentY = (doc as any).lastAutoTable.finalY + 15

  // === GASTOS POR MÉTODO DE PAGO ===
  if (currentY > 240) { doc.addPage(); currentY = 20 }

  doc.setFontSize(14)
  doc.text('Gastos por Método de Pago', 14, currentY)

  const methodEntries = Object.entries(expenseByMethod).sort((a, b) => b[1] - a[1])

  autoTable(doc, {
    startY: currentY + 5,
    head: [['Método', 'Monto', '% del Total']],
    body: methodEntries.map(([method, amount]) => [
      method,
      formatCurrency(amount),
      `${((amount / totalExpenses) * 100).toFixed(1)}%`
    ]),
    foot: [['TOTAL', formatCurrency(totalExpenses), '100%']],
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
  })

  doc.save(`PL-${periodLabel}-${new Date().toISOString().split('T')[0]}.pdf`)
  console.log('✅ P&L generado')
}

// ============ 3) ACCOUNTS RECEIVABLE (Cuentas por Cobrar) ============

export function generateARReport(jobs: Job[], clients: { id?: number; first_name: string; last_name: string }[]) {
  const pendingJobs = jobs.filter(j => j.payment_status === 'pending' || j.payment_status === 'partial')

  if (pendingJobs.length === 0) {
    alert('No hay cuentas pendientes de cobro')
    return
  }

  const clientMap = new Map(clients.map(c => [c.id, `${c.first_name} ${c.last_name}`]))

  const doc = new jsPDF()
  doc.setFontSize(20)
  doc.text('CUENTAS POR COBRAR', 14, 20)
  doc.setFontSize(10)
  doc.text(`Cooling Solution Log | ${formatDate(Date.now())}`, 14, 27)

  let totalPending = 0

  autoTable(doc, {
    startY: 35,
    head: [['Cliente', 'Trabajo', 'Fecha', 'Total', 'Pagado', 'Pendiente', 'Status']],
    body: pendingJobs.map(j => {
      const paid = j.payments.reduce((s, p) => s + p.amount, 0)
      const pending = j.total_charged - paid
      totalPending += pending
      const clientName = clientMap.get(j.client_id) || `Cliente #${j.client_id}`

      return [
        clientName,
        j.type,
        formatDate(j.date),
        formatCurrency(j.total_charged),
        formatCurrency(paid),
        formatCurrency(pending),
        j.payment_status === 'partial' ? 'Parcial' : 'Pendiente'
      ]
    }),
    foot: [['', '', '', '', 'TOTAL PENDIENTE:', formatCurrency(totalPending), '']],
    styles: { fontSize: 9 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    }
  })

  // Aging summary
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  let under30 = 0, under60 = 0, under90 = 0, over90 = 0

  pendingJobs.forEach(j => {
    const paid = j.payments.reduce((s, p) => s + p.amount, 0)
    const pending = j.total_charged - paid
    const age = now - j.date

    if (age < 30 * day) under30 += pending
    else if (age < 60 * day) under60 += pending
    else if (age < 90 * day) under90 += pending
    else over90 += pending
  })

  const finalY = (doc as any).lastAutoTable.finalY + 15
  doc.setFontSize(14)
  doc.text('Aging (Antigüedad)', 14, finalY)

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Período', 'Monto']],
    body: [
      ['0-30 días', formatCurrency(under30)],
      ['31-60 días', formatCurrency(under60)],
      ['61-90 días', formatCurrency(under90)],
      ['90+ días', formatCurrency(over90)],
    ],
    foot: [['TOTAL', formatCurrency(totalPending)]],
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' } }
  })

  doc.save(`Cuentas-por-Cobrar-${new Date().toISOString().split('T')[0]}.pdf`)
  console.log('✅ AR Report generado')
}

// ============ 4) PAYMENT METHOD REPORT ============

export function generatePaymentMethodReport(
  events: EventRecord[],
  paymentMethod: string,
  startDate: number,
  endDate: number
) {
  const searchPM = paymentMethod.toLowerCase().replace(/\s+/g, '_')

  const filtered = events.filter(e => {
    const pm = (e.payment_method || '').toLowerCase()
    const inPM = pm === searchPM || pm.includes(searchPM)
    const inDate = e.timestamp >= startDate && e.timestamp <= endDate
    return inPM && inDate
  })

  console.log(`💳 Payment Report: ${paymentMethod} | ${filtered.length} eventos`)

  if (filtered.length === 0) {
    alert(`No se encontraron gastos con "${paymentMethod}" en el período`)
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.text(`Reporte: ${getPaymentLabel(paymentMethod)}`, 14, 20)
  doc.setFontSize(10)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 28)

  const catSummary: Record<string, number> = {}
  filtered.forEach(e => {
    const cat = e.category || 'Otro'
    catSummary[cat] = (catSummary[cat] || 0) + e.amount
  })

  autoTable(doc, {
    startY: 35,
    head: [['Fecha', 'Categoría', 'Monto', 'Detalle']],
    body: filtered.map(e => [
      formatDate(e.timestamp),
      e.category || e.subtype || '-',
      formatCurrency(e.amount),
      e.vendor || e.note || '-'
    ]),
    foot: [['TOTAL', '', formatCurrency(filtered.reduce((s, e) => s + e.amount, 0)), '']]
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Por categoría:', 14, finalY)
  let y = finalY + 7
  Object.entries(catSummary).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
    doc.setFontSize(10)
    doc.text(`${cat}: ${formatCurrency(total)}`, 20, y)
    y += 6
  })

  doc.save(`${paymentMethod}-${new Date().toISOString().split('T')[0]}.pdf`)
}