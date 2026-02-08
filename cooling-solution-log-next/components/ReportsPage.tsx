'use client'

import { useState, useCallback } from 'react'
import { db } from '@/lib/db'
import {
  generatePLReport,
  generateARReport,
  generateCategoryReport,
  generatePaymentMethodReport,
  generatePhotoReport,
  generatePayrollReport,
  generateExpenseReceiptsReport,
  generateAccountantReport,
  generateDelinquentReport,
  generateClientProfitabilityReport,
  generateContractsReport,
  generateProductivityReport,
  exportEventsCSV
} from '@/lib/pdfGenerator'

interface ReportsPageProps {
  onNavigate: (page: string) => void
}

type PeriodType = 'week' | 'month' | 'year' | 'custom'

export default function ReportsPage({ onNavigate }: ReportsPageProps) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodType>('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const getDateRange = useCallback((): { startDate: number; endDate: number; label: string } => {
    const now = Date.now()
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

    if (period === 'week') {
      return { startDate: now - 7 * 86400000, endDate: now, label: 'esta semana' }
    } else if (period === 'year') {
      return { startDate: new Date(selectedYear, 0, 1).getTime(), endDate: new Date(selectedYear, 11, 31, 23, 59, 59, 999).getTime(), label: `${selectedYear}` }
    } else if (period === 'custom' && customStart && customEnd) {
      return { startDate: new Date(customStart).getTime(), endDate: new Date(customEnd + 'T23:59:59').getTime(), label: `${customStart} a ${customEnd}` }
    } else {
      const start = new Date(selectedYear, selectedMonth, 1).getTime()
      const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).getTime()
      return { startDate: start, endDate: end, label: `${months[selectedMonth]} ${selectedYear}` }
    }
  }, [period, selectedMonth, selectedYear, customStart, customEnd])

  const generate = async (reportType: string) => {
    setGenerating(reportType)
    try {
      const { startDate, endDate, label } = getDateRange()
      const events = await db.events.toArray()

      switch (reportType) {
        case 'pl': {
          generatePLReport(events, startDate, endDate, label)
          showMsg(`✅ P&L de ${label} generado`)
          break
        }
        case 'expenses': {
          const filtered = events.filter(e => e.type === 'expense' && e.timestamp >= startDate && e.timestamp <= endDate)
          if (filtered.length === 0) { showMsg('No hay gastos en este período', 'error'); break }
          generateCategoryReport(filtered, 'gastos', startDate, endDate)
          showMsg(`✅ Reporte de gastos de ${label}`)
          break
        }
        case 'income': {
          const filtered = events.filter(e => e.type === 'income' && e.timestamp >= startDate && e.timestamp <= endDate)
          if (filtered.length === 0) { showMsg('No hay ingresos en este período', 'error'); break }
          generateCategoryReport(filtered, 'ingresos', startDate, endDate)
          showMsg(`✅ Reporte de ingresos de ${label}`)
          break
        }
        case 'ar': {
          const invoices = await db.invoices.toArray()
          if (invoices.length === 0) { showMsg('No hay facturas', 'error'); break }
          generateARReport(invoices)
          showMsg('✅ Cuentas por cobrar generado')
          break
        }
        case 'gas': {
          const filtered = events.filter(e => e.category?.toLowerCase() === 'gasolina' && e.timestamp >= startDate && e.timestamp <= endDate)
          if (filtered.length === 0) { showMsg('No hay gastos de gasolina', 'error'); break }
          generateCategoryReport(filtered, 'gasolina', startDate, endDate)
          showMsg(`✅ Reporte de gasolina de ${label}`)
          break
        }
        case 'vehicle': {
          const filtered = events.filter(e => e.vehicle_id && e.timestamp >= startDate && e.timestamp <= endDate)
          if (filtered.length === 0) { showMsg('No hay gastos con vehículo', 'error'); break }
          generateCategoryReport(filtered, 'vehículos', startDate, endDate)
          showMsg(`✅ Reporte por vehículo de ${label}`)
          break
        }
        case 'capital_one':
        case 'chase_visa':
        case 'sams_mastercard':
        case 'ath_movil':
        case 'cash': {
          generatePaymentMethodReport(events, reportType, startDate, endDate)
          showMsg(`✅ Reporte de ${reportType} de ${label}`)
          break
        }
        case 'personal': {
          const filtered = events.filter(e => e.expense_type === 'personal' && e.timestamp >= startDate && e.timestamp <= endDate)
          if (filtered.length === 0) { showMsg('No hay gastos personales', 'error'); break }
          generateCategoryReport(filtered, 'personales', startDate, endDate)
          showMsg(`✅ Reporte de gastos personales de ${label}`)
          break
        }
        case 'photos': {
          const photos = await db.client_photos.toArray()
          if (photos.length === 0) { showMsg('No hay fotos guardadas', 'error'); break }
          generatePhotoReport(photos, 'Todos los Clientes')
          showMsg(`✅ Reporte de fotos generado (${photos.length} fotos)`)
          break
        }
        case 'payroll': {
          const employees = await db.employees.toArray()
          const payrollEvents = events.filter(e => e.employee_id != null && e.timestamp >= startDate && e.timestamp <= endDate)
          if (payrollEvents.length === 0) { showMsg('No hay pagos a empleados en este período', 'error'); break }
          generatePayrollReport(events, employees, startDate, endDate, label)
          showMsg(`✅ Nómina de ${label} generada`)
          break
        }
        case 'receipts_photos': {
          const withPhotos = events.filter(e =>
            e.type === 'expense' && e.timestamp >= startDate && e.timestamp <= endDate &&
            ((e.receipt_photos && e.receipt_photos.length > 0) || e.photo)
          )
          if (withPhotos.length === 0) { showMsg('No hay gastos con fotos en este período', 'error'); break }
          generateExpenseReceiptsReport(events, startDate, endDate, label)
          showMsg(`✅ Gastos con recibos de ${label}`)
          break
        }
        case 'accountant': {
          const invoices = await db.invoices.toArray()
          generateAccountantReport(events, invoices, startDate, endDate, label)
          showMsg(`✅ Reporte para contable de ${label}`)
          break
        }
        case 'delinquent': {
          const invoices = await db.invoices.toArray()
          const pending = invoices.filter(inv => inv.type === 'invoice' && (inv.status === 'sent' || inv.status === 'overdue'))
          if (pending.length === 0) { showMsg('🎉 No hay facturas pendientes', 'success'); break }
          generateDelinquentReport(invoices)
          showMsg('✅ Reporte de morosos generado')
          break
        }
        case 'client_profit': {
          const clients = await db.clients.toArray()
          generateClientProfitabilityReport(events, clients, startDate, endDate, label)
          showMsg(`✅ Rentabilidad por cliente de ${label}`)
          break
        }
        case 'contracts': {
          const contracts = await db.contracts.toArray()
          const clients = await db.clients.toArray()
          if (contracts.length === 0) { showMsg('No hay contratos registrados', 'error'); break }
          generateContractsReport(contracts, clients)
          showMsg('✅ Reporte de contratos generado')
          break
        }
        case 'productivity': {
          const jobs = await db.jobs.toArray()
          const clients = await db.clients.toArray()
          generateProductivityReport(jobs, events, clients, startDate, endDate, label)
          showMsg(`✅ Productividad de ${label}`)
          break
        }
        case 'csv': {
          const periodEvents = events.filter(e => e.timestamp >= startDate && e.timestamp <= endDate)
          if (periodEvents.length === 0) { showMsg('No hay transacciones en este período', 'error'); break }
          exportEventsCSV(events, startDate, endDate)
          showMsg(`✅ CSV exportado (${periodEvents.length} transacciones)`)
          break
        }
      }
    } catch (error) {
      console.error('Report error:', error)
      showMsg('Error al generar reporte', 'error')
    } finally {
      setGenerating(null)
    }
  }

  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1]

  const ReportButton = ({ id, icon, title, subtitle, color = 'blue', badge }: { id: string; icon: string; title: string; subtitle: string; color?: string; badge?: string }) => {
    const isGenerating = generating === id
    const colorMap: Record<string, string> = {
      blue: 'border-blue-800/30 hover:bg-blue-900/20',
      red: 'border-red-800/30 hover:bg-red-900/20',
      green: 'border-green-800/30 hover:bg-green-900/20',
      purple: 'border-purple-800/30 hover:bg-purple-900/20',
      yellow: 'border-yellow-800/30 hover:bg-yellow-900/20',
      cyan: 'border-cyan-800/30 hover:bg-cyan-900/20',
      orange: 'border-orange-800/30 hover:bg-orange-900/20',
    }
    return (
      <button
        onClick={() => generate(id)}
        disabled={!!generating}
        className={`w-full bg-[#111a2e] rounded-xl p-4 border ${colorMap[color] || colorMap.blue} text-left transition-colors disabled:opacity-50`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{isGenerating ? '⏳' : icon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-200">{title}</p>
              {badge && <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>}
            </div>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <span className="text-gray-600">{id === 'csv' ? 'CSV →' : 'PDF →'}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📊 Reportes</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      {message && (
        <div className={`mx-4 mt-3 p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800/30' : 'bg-red-900/30 text-red-400 border border-red-800/30'}`}>
          {message.text}
        </div>
      )}

      <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
        {/* Período */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <p className="text-sm font-semibold text-gray-300 mb-3">📅 Período</p>
          <div className="flex gap-2 mb-3">
            {([
              { key: 'week' as PeriodType, label: 'Semana' },
              { key: 'month' as PeriodType, label: 'Mes' },
              { key: 'year' as PeriodType, label: 'Año' },
              { key: 'custom' as PeriodType, label: 'Custom' },
            ]).map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium ${period === p.key ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-400 border border-white/10'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'month' && (
            <div className="space-y-2">
              <div className="flex gap-1 flex-wrap">
                {months.map((m, i) => (
                  <button key={i} onClick={() => setSelectedMonth(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs ${selectedMonth === i ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-500 border border-white/10'}`}
                  >{m}</button>
                ))}
              </div>
              <div className="flex gap-2">
                {years.map(y => (
                  <button key={y} onClick={() => setSelectedYear(y)}
                    className={`flex-1 py-1.5 rounded-lg text-xs ${selectedYear === y ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-500 border border-white/10'}`}
                  >{y}</button>
                ))}
              </div>
            </div>
          )}

          {period === 'year' && (
            <div className="flex gap-2">
              {years.map(y => (
                <button key={y} onClick={() => setSelectedYear(y)}
                  className={`flex-1 py-2 rounded-lg text-sm ${selectedYear === y ? 'bg-blue-600 text-white' : 'bg-[#0b1220] text-gray-500 border border-white/10'}`}
                >{y}</button>
              ))}
            </div>
          )}

          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Desde</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Hasta</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Financieros */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">💰 Financieros</p>
          <div className="space-y-2">
            <ReportButton id="pl" icon="📈" title="P&L (Ganancia y Pérdida)" subtitle="Ingresos vs gastos, ganancia neta" color="green" />
            <ReportButton id="expenses" icon="📉" title="Reporte de Gastos" subtitle="Todos los gastos desglosados por categoría" color="red" />
            <ReportButton id="income" icon="💵" title="Reporte de Ingresos" subtitle="Todos los ingresos por categoría y cliente" color="green" />
            <ReportButton id="ar" icon="💰" title="Cuentas por Cobrar" subtitle="Facturas pendientes, aging 30/60/90" color="yellow" />
            <ReportButton id="delinquent" icon="⚠️" title="Clientes Morosos" subtitle="Aging detallado 30/60/90/90+ días" color="red" badge="NUEVO" />
            <ReportButton id="personal" icon="🏠" title="Gastos Personales" subtitle="Solo gastos marcados como personales" color="purple" />
            <ReportButton id="client_profit" icon="👤" title="Rentabilidad por Cliente" subtitle="Ingresos - gastos por cada cliente" color="green" badge="NUEVO" />
          </div>
        </div>

        {/* Por Método de Pago */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">💳 Por Método de Pago</p>
          <div className="space-y-2">
            <ReportButton id="capital_one" icon="💳" title="Capital One" subtitle="Gastos con Capital One" color="blue" />
            <ReportButton id="chase_visa" icon="💳" title="Chase Visa" subtitle="Gastos con Chase" color="blue" />
            <ReportButton id="sams_mastercard" icon="💳" title="Sam's Mastercard" subtitle="Gastos con Sam's MC" color="blue" />
            <ReportButton id="ath_movil" icon="📱" title="ATH Móvil" subtitle="Transacciones por ATH" color="cyan" />
            <ReportButton id="cash" icon="💵" title="Efectivo" subtitle="Transacciones en efectivo" color="green" />
          </div>
        </div>

        {/* Operacionales */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🔧 Operacionales</p>
          <div className="space-y-2">
            <ReportButton id="gas" icon="⛽" title="Gasolina" subtitle="Gastos de combustible por vehículo" color="yellow" />
            <ReportButton id="vehicle" icon="🚐" title="Por Vehículo" subtitle="Todos los gastos asociados a vehículos" color="yellow" />
            <ReportButton id="payroll" icon="👷" title="Nómina" subtitle="Pagos a empleados por período" color="orange" badge="NUEVO" />
            <ReportButton id="contracts" icon="📋" title="Contratos Recurrentes" subtitle="Mantenimientos activos, revenue recurrente" color="cyan" badge="NUEVO" />
            <ReportButton id="productivity" icon="📊" title="Productividad & Trabajos" subtitle="Trabajos completados, ingreso promedio, eficiencia" color="green" badge="NUEVO" />
            <ReportButton id="photos" icon="📸" title="Reporte de Fotos" subtitle="Fotos de trabajos por cliente" color="purple" />
          </div>
        </div>

        {/* Para el Contable */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🧾 Para el Contable</p>
          <div className="space-y-2">
            <ReportButton id="accountant" icon="🏦" title="Reporte para Contable" subtitle="P&L formal + gastos deducibles + facturas" color="blue" badge="NUEVO" />
            <ReportButton id="receipts_photos" icon="🧾" title="Gastos con Fotos de Recibos" subtitle="PDF con cada gasto y su foto adjunta" color="purple" badge="NUEVO" />
            <ReportButton id="csv" icon="📥" title="Exportar CSV (Excel)" subtitle="Todas las transacciones para el contable" color="green" badge="NUEVO" />
          </div>
        </div>

        {/* Próximamente */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🔜 Próximamente</p>
          <div className="space-y-2">
            <div className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 opacity-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏦</span>
                <div>
                  <p className="text-sm font-medium text-gray-400">Consolidación de Estados de Cuenta</p>
                  <p className="text-xs text-gray-600">Sube CSV/PDF del banco y cruza con tus gastos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}