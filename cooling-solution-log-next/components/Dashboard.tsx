'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'

interface DashboardProps {
  onNavigate: (page: string) => void
}

interface Stats {
  // Month vs prev month
  monthIncome: number
  monthExpenses: number
  monthProfit: number
  prevMonthIncome: number
  prevMonthExpenses: number
  prevMonthProfit: number
  // Today
  todayExpenses: number
  todayIncome: number
  todayAppts: { title: string; date: number; clientName?: string }[]
  // AR
  pendingAR: number
  pendingClients: { name: string; amount: number; days: number }[]
  // Jobs
  jobsCompletedMonth: number
  jobsPendingCount: number
  quotesUnconverted: number
  // Top clients
  topClients: { name: string; billed: number; collected: number }[]
  // 6-month chart
  monthlyChart: { label: string; income: number; expenses: number }[]
  // Contracts
  monthlyContractRevenue: number
  contractsDueThisMonth: number
  contractAlerts: { clientName: string; service: string; daysUntil: number; overdue: boolean }[]
  // Alerts
  warrantyAlerts: { type: string; brand: string; client: string; days: number }[]
  equipmentAlerts: { clientName: string; items: { type: string; location: string; daysOverdue: number }[] }[]
  overdueEquipmentCount: number
  pendingInvoices: { number: string; client: string; total: number; days: number }[]
  pendingInvoicesTotal: number
  overdueInvoicesCount: number
  lowStockCount: number
  // Legacy
  recentEvents: { date: string; type: string; category: string; amount: number; vendor: string }[]
  topCategories: { category: string; total: number }[]
  upcomingAppts: { title: string; date: number; clientName?: string; location?: string }[]
  activeReminders: { text: string; dueDate: number; priority: string; overdue: boolean }[]
}

const FREQ_MONTHS: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 }

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    try {
      const now = Date.now()
      const d = new Date()
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1
      const prevMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()
      const prevMonthEnd = monthStart - 1
      const yearStart = new Date(d.getFullYear(), 0, 1).getTime()
      const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const todayEnd = todayStart + 86400000

      const [allEvents, allJobs, allClients] = await Promise.all([
        db.events.toArray(),
        db.jobs.toArray(),
        db.clients.toArray(),
      ])

      const clientMap = new Map(allClients.map(c => [c.id, `${c.first_name} ${c.last_name}`.trim()]))

      // ── Current month ────────────────────────────────────────────────────────
      const monthEvents = allEvents.filter(e => e.timestamp >= monthStart && e.timestamp <= now)
      const monthIncome = monthEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
      const monthExpenses = monthEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

      let jobIncomeMonth = 0
      allJobs.forEach(j => j.payments?.forEach(p => { if (p.date >= monthStart && p.date <= now) jobIncomeMonth += p.amount }))
      const totalMonthIncome = monthIncome + jobIncomeMonth
      const monthProfit = totalMonthIncome - monthExpenses

      // ── Previous month ───────────────────────────────────────────────────────
      const prevEvents = allEvents.filter(e => e.timestamp >= prevMonthStart && e.timestamp <= prevMonthEnd)
      const prevMonthIncome = prevEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
      const prevMonthExpenses = prevEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
      let prevJobIncome = 0
      allJobs.forEach(j => j.payments?.forEach(p => { if (p.date >= prevMonthStart && p.date <= prevMonthEnd) prevJobIncome += p.amount }))
      const prevTotalIncome = prevMonthIncome + prevJobIncome
      const prevMonthProfit = prevTotalIncome - prevMonthExpenses

      // ── Today ────────────────────────────────────────────────────────────────
      const todayEvents = allEvents.filter(e => e.timestamp >= todayStart && e.timestamp <= now)
      const todayExpenses = todayEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
      const todayIncome = todayEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)

      let todayAppts: Stats['todayAppts'] = []
      try {
        const appts = await db.appointments.where('date').between(todayStart, todayEnd).toArray()
        todayAppts = appts.filter(a => a.status === 'scheduled').sort((a, b) => a.date - b.date)
          .map(a => ({ title: a.title, date: a.date, clientName: a.client_name }))
      } catch {}

      // ── AR ───────────────────────────────────────────────────────────────────
      const pendingJobs = allJobs.filter(j => j.payment_status === 'pending' || j.payment_status === 'partial')
      let totalAR = 0
      const pendingClients = pendingJobs.map(j => {
        const paid = j.payments?.reduce((s, p) => s + p.amount, 0) || 0
        const pending = j.total_charged - paid
        totalAR += pending
        return { name: clientMap.get(j.client_id) || `Cliente #${j.client_id}`, amount: pending, days: Math.floor((now - j.date) / 86400000) }
      }).sort((a, b) => b.amount - a.amount).slice(0, 5)

      // ── Jobs KPIs ────────────────────────────────────────────────────────────
      const jobsCompletedMonth = allJobs.filter(j => j.status === 'completed' && j.date >= monthStart && j.date <= now).length
      const jobsPendingCount = allJobs.filter(j => j.status === 'in_progress' || j.status === 'quote').length
      const quotesUnconverted = allJobs.filter(j => j.status === 'quote').length

      // ── Top clients (year) ───────────────────────────────────────────────────
      const clientRevenue = new Map<number, { billed: number; collected: number }>()
      allJobs.filter(j => j.date >= yearStart).forEach(j => {
        const existing = clientRevenue.get(j.client_id) || { billed: 0, collected: 0 }
        existing.billed += j.total_charged
        existing.collected += j.payments?.reduce((s, p) => s + p.amount, 0) || 0
        clientRevenue.set(j.client_id, existing)
      })
      const topClients = Array.from(clientRevenue.entries())
        .map(([id, v]) => ({ name: clientMap.get(id) || `Cliente #${id}`, ...v }))
        .sort((a, b) => b.billed - a.billed)
        .slice(0, 3)

      // ── 6-month chart ────────────────────────────────────────────────────────
      const monthlyChart: Stats['monthlyChart'] = []
      for (let i = 5; i >= 0; i--) {
        const mStart = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime()
        const mEnd = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime() - 1
        const mEvents = allEvents.filter(e => e.timestamp >= mStart && e.timestamp <= mEnd)
        const mIncome = mEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
        const mExpenses = mEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
        let mJobInc = 0
        allJobs.forEach(j => j.payments?.forEach(p => { if (p.date >= mStart && p.date <= mEnd) mJobInc += p.amount }))
        const label = new Date(mStart).toLocaleDateString('es-PR', { month: 'short' })
        monthlyChart.push({ label, income: mIncome + mJobInc, expenses: mExpenses })
      }

      // ── Contracts ────────────────────────────────────────────────────────────
      let contractAlerts: Stats['contractAlerts'] = []
      let monthlyContractRevenue = 0
      let contractsDueThisMonth = 0
      try {
        const contracts = await db.contracts.where('status').equals('active').toArray()
        monthlyContractRevenue = contracts.reduce((s, c) => s + c.monthly_fee / (FREQ_MONTHS[c.frequency] || 1), 0)
        contractsDueThisMonth = contracts.filter(c => c.next_service_due >= monthStart && c.next_service_due <= monthEnd).length
        contractAlerts = contracts
          .filter(c => c.next_service_due <= now + 7 * 86400000)
          .map(c => {
            const days = Math.ceil((c.next_service_due - now) / 86400000)
            return { clientName: clientMap.get(c.client_id) || `Cliente #${c.client_id}`, service: c.service_type, daysUntil: days, overdue: days < 0 }
          })
          .sort((a, b) => a.daysUntil - b.daysUntil)
      } catch {}

      // ── Warranty alerts ──────────────────────────────────────────────────────
      let warrantyAlerts: Stats['warrantyAlerts'] = []
      try {
        const allWarranties = await db.table('warranties').toArray()
        warrantyAlerts = allWarranties
          .filter((w: any) => w.status === 'active' && w.expiration_date - now <= 30 * 86400000 && w.expiration_date > now)
          .map((w: any) => ({ type: w.equipment_type, brand: w.brand, client: w.client_name, days: Math.ceil((w.expiration_date - now) / 86400000) }))
          .sort((a, b) => a.days - b.days)
      } catch {}

      // ── Equipment alerts ─────────────────────────────────────────────────────
      let equipmentAlerts: Stats['equipmentAlerts'] = []
      let overdueEquipmentCount = 0
      try {
        const allEquip = await db.equipment.toArray()
        overdueEquipmentCount = allEquip.filter(eq => eq.next_service_due && eq.next_service_due < now).length
        const alertEquip = allEquip.filter(eq => eq.next_service_due && eq.next_service_due - now <= 30 * 86400000)
        const byClient: Record<string, { type: string; location: string; daysOverdue: number }[]> = {}
        alertEquip.forEach(eq => {
          const key = eq.client_name || 'Sin cliente'
          if (!byClient[key]) byClient[key] = []
          byClient[key].push({
            type: eq.equipment_type, location: eq.location || '',
            daysOverdue: eq.next_service_due! < now ? Math.floor((now - eq.next_service_due!) / 86400000) : -Math.floor((eq.next_service_due! - now) / 86400000),
          })
        })
        equipmentAlerts = Object.entries(byClient)
          .map(([clientName, items]) => ({ clientName, items }))
          .sort((a, b) => Math.max(...b.items.map(i => i.daysOverdue)) - Math.max(...a.items.map(i => i.daysOverdue)))
      } catch {}

      // ── Pending invoices ─────────────────────────────────────────────────────
      let pendingInvoices: Stats['pendingInvoices'] = []
      let pendingInvoicesTotal = 0
      let overdueInvoicesCount = 0
      try {
        const allInvoices = await db.invoices.toArray()
        const pending = allInvoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'))
        overdueInvoicesCount = pending.filter(i => i.status === 'overdue' || (i.due_date && i.due_date < now)).length
        pendingInvoices = pending.sort((a, b) => a.issue_date - b.issue_date).slice(0, 5)
          .map(i => ({ number: i.invoice_number, client: i.client_name, total: i.total, days: Math.floor((now - i.issue_date) / 86400000) }))
        pendingInvoicesTotal = pending.reduce((s, i) => s + i.total, 0)
      } catch {}

      // ── Upcoming appts ───────────────────────────────────────────────────────
      let upcomingAppts: Stats['upcomingAppts'] = []
      try {
        const sevenDays = now + 7 * 86400000
        const appts = await db.appointments.where('date').between(now - 3600000, sevenDays).toArray()
        upcomingAppts = appts.filter(a => a.status === 'scheduled').sort((a, b) => a.date - b.date).slice(0, 5)
          .map(a => ({ title: a.title, date: a.date, clientName: a.client_name, location: a.location }))
      } catch {}

      // ── Reminders ────────────────────────────────────────────────────────────
      let activeReminders: Stats['activeReminders'] = []
      try {
        const allReminders = await db.reminders.toArray()
        activeReminders = allReminders.filter(r => !r.completed).sort((a, b) => a.due_date - b.due_date).slice(0, 5)
          .map(r => ({ text: r.text, dueDate: r.due_date, priority: r.priority, overdue: r.due_date < now }))
      } catch {}

      // ── Categories / Recent ──────────────────────────────────────────────────
      const catTotals: Record<string, number> = {}
      monthEvents.filter(e => e.type === 'expense').forEach(e => {
        const cat = e.category || e.subtype || 'Otro'
        catTotals[cat] = (catTotals[cat] || 0) + e.amount
      })
      const topCategories = Object.entries(catTotals).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total).slice(0, 5)

      const recentEvents = allEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map(e => ({
        date: new Date(e.timestamp).toLocaleDateString('es-PR', { month: 'short', day: 'numeric' }),
        type: e.type, category: e.category || e.subtype || '', amount: e.amount, vendor: e.vendor || e.client || e.note || ''
      }))

      // ── Inventory low stock ──────────────────────────────────────────────────
      let lowStockCount = 0
      try {
        const invItems = await db.inventory_items.filter(i => i.active).toArray()
        lowStockCount = invItems.filter(i => i.quantity <= i.min_quantity).length
      } catch {}

      setStats({
        monthIncome: totalMonthIncome, monthExpenses, monthProfit,
        prevMonthIncome: prevTotalIncome, prevMonthExpenses, prevMonthProfit,
        todayExpenses, todayIncome, todayAppts,
        pendingAR: totalAR, pendingClients,
        jobsCompletedMonth, jobsPendingCount, quotesUnconverted,
        topClients, monthlyChart,
        monthlyContractRevenue, contractsDueThisMonth, contractAlerts,
        warrantyAlerts, equipmentAlerts, overdueEquipmentCount,
        pendingInvoices, pendingInvoicesTotal, overdueInvoicesCount,
        lowStockCount,
        recentEvents, topCategories, upcomingAppts, activeReminders,
      })
    } catch (e) { console.error('Dashboard error:', e) }
    finally { setLoading(false) }
  }

  const fmt = (n: number) => `$${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  const fmtD = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

  const pct = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0
    return Math.round(((curr - prev) / Math.abs(prev)) * 100)
  }

  const fmtApptTime = (ts: number) => new Date(ts).toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })

  const fmtApptDate = (ts: number) => {
    const d = new Date(ts); const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const time = d.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
    if (d.toDateString() === today.toDateString()) return `Hoy ${time}`
    if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${time}`
    return `${d.toLocaleDateString('es-PR', { weekday: 'short', day: 'numeric' })} ${time}`
  }

  const fmtReminderDate = (ts: number) => {
    const d = new Date(ts); const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'Hoy'
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === tomorrow.toDateString()) return 'Mañana'
    if (ts < Date.now()) return 'Vencido'
    return d.toLocaleDateString('es-PR', { weekday: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const incomePct = pct(stats.monthIncome, stats.prevMonthIncome)
  const expPct = pct(stats.monthExpenses, stats.prevMonthExpenses)
  const profitPct = pct(stats.monthProfit, stats.prevMonthProfit)
  const margin = stats.monthIncome > 0 ? Math.round((stats.monthProfit / stats.monthIncome) * 100) : 0

  const chartMax = Math.max(...stats.monthlyChart.map(m => Math.max(m.income, m.expenses)), 1)

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">📊 Dashboard</h1>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬 Chat</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {/* ── KPI GRID ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Revenue */}
          <KpiCard
            label="Revenue del Mes"
            value={fmt(stats.monthIncome)}
            prev={fmt(stats.prevMonthIncome)}
            change={incomePct}
            positive={incomePct >= 0}
            accent="text-green-400"
            onClick={() => onNavigate('history')}
          />
          {/* Gastos */}
          <KpiCard
            label="Gastos del Mes"
            value={fmt(stats.monthExpenses)}
            prev={fmt(stats.prevMonthExpenses)}
            change={expPct}
            positive={expPct <= 0}
            accent="text-red-400"
            onClick={() => onNavigate('expenses')}
          />
          {/* Ganancia neta */}
          <div
            className={`rounded-xl p-4 border cursor-pointer ${stats.monthProfit >= 0 ? 'bg-green-900/20 border-green-700/30' : 'bg-red-900/20 border-red-700/30'}`}
            onClick={() => onNavigate('reports')}
          >
            <p className="text-xs text-gray-400 mb-1">Ganancia Neta</p>
            <p className={`text-xl font-bold ${stats.monthProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.monthProfit)}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={`text-xs font-medium ${profitPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profitPct >= 0 ? '▲' : '▼'} {Math.abs(profitPct)}%
              </span>
              <span className="text-xs text-gray-500">· Margen {margin}%</span>
            </div>
          </div>
          {/* Cuentas por cobrar */}
          <div
            className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-700/30 cursor-pointer"
            onClick={() => onNavigate('invoices')}
          >
            <p className="text-xs text-gray-400 mb-1">Cuentas por Cobrar</p>
            <p className="text-xl font-bold text-yellow-400">{fmt(stats.pendingAR + stats.pendingInvoicesTotal)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.overdueInvoicesCount > 0 && <span className="text-red-400">{stats.overdueInvoicesCount} vencida{stats.overdueInvoicesCount > 1 ? 's' : ''} · </span>}
              {stats.pendingClients.length} trabajo{stats.pendingClients.length !== 1 ? 's' : ''} pendiente{stats.pendingClients.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* ── 6-MONTH CHART ─────────────────────────────────────────────────── */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <p className="text-sm font-semibold text-gray-300 mb-4">📈 Ingresos vs Gastos — Últimos 6 Meses</p>
          <div className="flex items-end justify-between gap-1 h-20">
            {stats.monthlyChart.map((m, i) => {
              const incH = Math.round((m.income / chartMax) * 72)
              const expH = Math.round((m.expenses / chartMax) * 72)
              const isCurrent = i === stats.monthlyChart.length - 1
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 72 }}>
                    <div
                      className={`rounded-t flex-1 max-w-[14px] ${isCurrent ? 'bg-green-400' : 'bg-green-700/60'}`}
                      style={{ height: Math.max(incH, 2) }}
                    />
                    <div
                      className={`rounded-t flex-1 max-w-[14px] ${isCurrent ? 'bg-red-400' : 'bg-red-700/60'}`}
                      style={{ height: Math.max(expH, 2) }}
                    />
                  </div>
                  <span className={`text-[9px] ${isCurrent ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>{m.label}</span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded bg-green-600 inline-block" />Ingresos</span>
            <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded bg-red-600 inline-block" />Gastos</span>
          </div>
        </div>

        {/* ── RESUMEN DE HOY ────────────────────────────────────────────────── */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <p className="text-sm font-semibold text-gray-300 mb-3">☀️ Resumen de Hoy</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-xl font-bold text-green-400">{fmt(stats.todayIncome)}</p>
              <p className="text-[10px] text-gray-500">Ingresos</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-red-400">{fmt(stats.todayExpenses)}</p>
              <p className="text-[10px] text-gray-500">Gastos</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${stats.todayIncome - stats.todayExpenses >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>{fmt(stats.todayIncome - stats.todayExpenses)}</p>
              <p className="text-[10px] text-gray-500">Neto</p>
            </div>
          </div>
          {/* Stat chips */}
          <div className="flex flex-wrap gap-2">
            {stats.todayAppts.length > 0 && (
              <button onClick={() => onNavigate('calendar')} className="flex items-center gap-1 bg-blue-900/30 border border-blue-700/30 rounded-lg px-2.5 py-1.5 text-xs text-blue-300">
                📅 {stats.todayAppts.length} cita{stats.todayAppts.length > 1 ? 's' : ''} hoy
              </button>
            )}
            {stats.overdueEquipmentCount > 0 && (
              <button onClick={() => onNavigate('maintenance')} className="flex items-center gap-1 bg-orange-900/30 border border-orange-700/30 rounded-lg px-2.5 py-1.5 text-xs text-orange-300">
                🔧 {stats.overdueEquipmentCount} equipo{stats.overdueEquipmentCount > 1 ? 's' : ''} vencido{stats.overdueEquipmentCount > 1 ? 's' : ''}
              </button>
            )}
            {stats.overdueInvoicesCount > 0 && (
              <button onClick={() => onNavigate('invoices')} className="flex items-center gap-1 bg-red-900/30 border border-red-700/30 rounded-lg px-2.5 py-1.5 text-xs text-red-300">
                🧾 {stats.overdueInvoicesCount} factura{stats.overdueInvoicesCount > 1 ? 's' : ''} vencida{stats.overdueInvoicesCount > 1 ? 's' : ''}
              </button>
            )}
            {stats.lowStockCount > 0 && (
              <button onClick={() => onNavigate('inventory')} className="flex items-center gap-1 bg-yellow-900/30 border border-yellow-700/30 rounded-lg px-2.5 py-1.5 text-xs text-yellow-300">
                📦 {stats.lowStockCount} ítem{stats.lowStockCount > 1 ? 's' : ''} bajo mínimo
              </button>
            )}
            {stats.todayAppts.length === 0 && stats.overdueEquipmentCount === 0 && stats.overdueInvoicesCount === 0 && stats.lowStockCount === 0 && (
              <p className="text-xs text-gray-500">Sin alertas para hoy 🎉</p>
            )}
          </div>
          {/* Today's appointments list */}
          {stats.todayAppts.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
              {stats.todayAppts.map((a, i) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <span className="text-gray-300">{a.title}{a.clientName ? ` — ${a.clientName}` : ''}</span>
                  <span className="text-blue-400">{fmtApptTime(a.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── JOBS & OPERACIONES ────────────────────────────────────────────── */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('jobs')}>
          <p className="text-sm font-semibold text-gray-300 mb-3">🔧 Trabajos & Operaciones</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center bg-green-900/20 rounded-lg p-2.5 border border-green-700/20">
              <p className="text-2xl font-bold text-green-400">{stats.jobsCompletedMonth}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Completados<br />este mes</p>
            </div>
            <div className="text-center bg-blue-900/20 rounded-lg p-2.5 border border-blue-700/20">
              <p className="text-2xl font-bold text-blue-400">{stats.jobsPendingCount - stats.quotesUnconverted}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">En progreso</p>
            </div>
            <div className="text-center bg-yellow-900/20 rounded-lg p-2.5 border border-yellow-700/20">
              <p className="text-2xl font-bold text-yellow-400">{stats.quotesUnconverted}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Cotizaciones<br />sin convertir</p>
            </div>
          </div>
        </div>

        {/* ── TOP CLIENTES ──────────────────────────────────────────────────── */}
        {stats.topClients.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('clients')}>
            <p className="text-sm font-semibold text-gray-300 mb-3">⭐ Top Clientes — {new Date().getFullYear()}</p>
            <div className="space-y-2">
              {stats.topClients.map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                  <span className={`text-sm font-bold w-5 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : 'text-orange-600'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{c.name}</p>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>Facturado: <span className="text-gray-300">{fmt(c.billed)}</span></span>
                      <span>·</span>
                      <span>Cobrado: <span className={c.collected >= c.billed ? 'text-green-400' : 'text-yellow-400'}>{fmt(c.collected)}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CONTRATOS ────────────────────────────────────────────────────── */}
        {stats.monthlyContractRevenue > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('contracts')}>
            <p className="text-sm font-semibold text-gray-300 mb-3">📋 Contratos Recurrentes</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Revenue mensual garantizado</p>
                <p className="text-xl font-bold text-cyan-400">{fmt(stats.monthlyContractRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Servicios este mes</p>
                <p className="text-xl font-bold text-cyan-300">{stats.contractsDueThisMonth}</p>
              </div>
            </div>
          </div>
        )}

        {/* Contract Alerts — overdue */}
        {stats.contractAlerts.filter(a => a.overdue).length > 0 && (
          <div className="bg-red-900/20 rounded-xl p-4 border border-red-700/30 cursor-pointer" onClick={() => onNavigate('contracts')}>
            <p className="text-sm font-semibold text-red-400 mb-2">🔴 Servicios Vencidos</p>
            {stats.contractAlerts.filter(a => a.overdue).map((a, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1">
                <div>
                  <span className="text-gray-300">{a.clientName}</span>
                  <p className="text-xs text-gray-500">{a.service}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400">{Math.abs(a.daysUntil)}d vencido</span>
              </div>
            ))}
          </div>
        )}

        {/* Contract Alerts — upcoming */}
        {stats.contractAlerts.filter(a => !a.overdue).length > 0 && (
          <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-700/30 cursor-pointer" onClick={() => onNavigate('contracts')}>
            <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Servicios por Vencer</p>
            {stats.contractAlerts.filter(a => !a.overdue).map((a, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1">
                <div>
                  <span className="text-gray-300">{a.clientName}</span>
                  <p className="text-xs text-gray-500">{a.service}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/50 text-yellow-400">
                  {a.daysUntil === 0 ? 'Hoy' : `${a.daysUntil}d`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── WARRANTY ALERTS ───────────────────────────────────────────────── */}
        {stats.warrantyAlerts.length > 0 && (
          <div className="bg-orange-900/20 rounded-xl p-4 border border-orange-700/30 cursor-pointer" onClick={() => onNavigate('warranties')}>
            <p className="text-sm font-semibold text-orange-400 mb-2">🛡️ Garantías por Vencer</p>
            {stats.warrantyAlerts.map((a, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1">
                <span className="text-gray-300">{a.type} ({a.brand}) — {a.client}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${a.days <= 7 ? 'bg-red-900/50 text-red-400' : 'bg-orange-900/50 text-orange-400'}`}>{a.days}d</span>
              </div>
            ))}
          </div>
        )}

        {/* ── EQUIPMENT ALERTS ─────────────────────────────────────────────── */}
        {stats.equipmentAlerts.length > 0 && (
          <div className="bg-red-900/15 rounded-xl p-4 border border-red-800/30 cursor-pointer" onClick={() => onNavigate('maintenance')}>
            <p className="text-sm font-semibold text-red-400 mb-2">🔧 Mantenimiento Pendiente</p>
            {stats.equipmentAlerts.slice(0, 4).map((a, i) => (
              <div key={i} className="mb-2 last:mb-0">
                <p className="text-xs font-medium text-gray-300">{a.clientName}</p>
                {a.items.slice(0, 3).map((item, j) => (
                  <div key={j} className="flex justify-between items-center text-xs py-0.5 pl-2">
                    <span className="text-gray-400">{item.type}{item.location ? ` · ${item.location}` : ''}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${item.daysOverdue > 0 ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {item.daysOverdue > 0 ? `${item.daysOverdue}d venció` : `${Math.abs(item.daysOverdue)}d`}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── UPCOMING APPOINTMENTS ─────────────────────────────────────────── */}
        {stats.upcomingAppts.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('calendar')}>
            <p className="text-sm font-semibold text-gray-300 mb-3">📅 Próximas Citas</p>
            <div className="space-y-2">
              {stats.upcomingAppts.map((a, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-gray-200">{a.title}</p>
                    {a.clientName && <p className="text-xs text-gray-500">👤 {a.clientName}</p>}
                  </div>
                  <span className="text-xs text-blue-400">{fmtApptDate(a.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── REMINDERS ────────────────────────────────────────────────────── */}
        {stats.activeReminders.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('calendar')}>
            <p className="text-sm font-semibold text-gray-300 mb-3">🔔 Recordatorios</p>
            <div className="space-y-2">
              {stats.activeReminders.map((r, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                  <span className={`text-gray-300 ${r.overdue ? 'text-red-400' : ''}`}>{r.priority === 'high' ? '🔴 ' : ''}{r.text}</span>
                  <span className={`text-xs ${r.overdue ? 'text-red-400' : 'text-gray-500'}`}>{fmtReminderDate(r.dueDate)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PENDING INVOICES ──────────────────────────────────────────────── */}
        {stats.pendingInvoices.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={() => onNavigate('invoices')}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-gray-300">🧾 Facturas Pendientes</p>
              <p className="text-lg font-bold text-orange-400">{fmtD(stats.pendingInvoicesTotal)}</p>
            </div>
            <div className="space-y-2">
              {stats.pendingInvoices.map((inv, i) => (
                <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-gray-300">{inv.client}</p>
                    <p className="text-xs text-gray-500">#{inv.number}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-orange-400 font-medium">{fmtD(inv.total)}</span>
                    <span className="text-gray-500 text-xs ml-2">{inv.days}d</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TE DEBEN ──────────────────────────────────────────────────────── */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-gray-300">💰 Te Deben (Trabajos)</p>
            <p className="text-lg font-bold text-yellow-400">{fmtD(stats.pendingAR)}</p>
          </div>
          {stats.pendingClients.length > 0 ? (
            <div className="space-y-2">
              {stats.pendingClients.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-gray-300">{c.name}</span>
                  <div className="text-right">
                    <span className="text-yellow-400 font-medium">{fmtD(c.amount)}</span>
                    <span className="text-gray-500 text-xs ml-2">{c.days}d</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-500 text-sm">Nadie te debe 🎉</p>}
        </div>

        {/* ── TOP GASTOS ────────────────────────────────────────────────────── */}
        {stats.topCategories.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-3">📉 Gastos del Mes por Categoría</p>
            <div className="space-y-2">
              {stats.topCategories.map((c, i) => {
                const p = stats.monthExpenses > 0 ? (c.total / stats.monthExpenses) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{c.category}</span>
                      <span className="text-gray-400">{fmtD(c.total)}</span>
                    </div>
                    <div className="w-full bg-gray-700/50 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(p, 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── ÚLTIMOS REGISTROS ────────────────────────────────────────────── */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <p className="text-sm font-semibold text-gray-300 mb-3">🕐 Últimos Registros</p>
          <div className="space-y-2">
            {stats.recentEvents.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.type === 'income' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                    {e.type === 'income' ? '↑' : '↓'}
                  </span>
                  <div>
                    <p className="text-gray-300">{e.category}</p>
                    <p className="text-gray-500 text-xs">{e.vendor}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>{fmtD(e.amount)}</p>
                  <p className="text-gray-500 text-xs">{e.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
        <div className="pb-6">
          <p className="text-sm font-semibold text-gray-300 mb-3">⚡ Acciones Rápidas</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {[
              { page: 'chat', icon: '💬', label: 'Registrar', bg: 'bg-blue-600' },
              { page: 'bitacora', icon: '📒', label: 'Bitácora', bg: 'bg-purple-600' },
              { page: 'jobs', icon: '🔧', label: 'Trabajos', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'contracts', icon: '📋', label: 'Contratos', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'invoices', icon: '🧾', label: 'Facturas', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'clients', icon: '👥', label: 'Clientes', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'employees', icon: '👷', label: 'Empleados', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'calendar', icon: '📅', label: 'Calendario', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'reports', icon: '📊', label: 'Reportes', bg: 'bg-[#111a2e] border border-white/10' },
              { page: 'search', icon: '🔍', label: 'Buscar', bg: 'bg-[#111a2e] border border-white/10' },
            ].map(item => (
              <button key={item.page} onClick={() => onNavigate(item.page)} className={`${item.bg} rounded-xl p-3 text-center flex-shrink-0 w-20 transition-colors`}>
                <span className="text-xl">{item.icon}</span>
                <p className="text-[10px] mt-1 font-medium whitespace-nowrap">{item.label}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── KPI Card component ────────────────────────────────────────────────────────
function KpiCard({ label, value, prev, change, positive, accent, onClick }: {
  label: string; value: string; prev: string; change: number; positive: boolean; accent: string; onClick: () => void
}) {
  return (
    <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 cursor-pointer" onClick={onClick}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
      <div className="flex items-center gap-1 mt-1">
        <span className={`text-xs font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change)}%
        </span>
        <span className="text-xs text-gray-600">vs {prev}</span>
      </div>
    </div>
  )
}
