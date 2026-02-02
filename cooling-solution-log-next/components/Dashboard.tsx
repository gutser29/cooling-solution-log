'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'

interface DashboardProps {
  onNavigate: (page: string) => void
}

interface Stats {
  monthIncome: number
  monthExpenses: number
  monthProfit: number
  todayExpenses: number
  todayIncome: number
  pendingAR: number
  pendingClients: { name: string; amount: number; days: number }[]
  recentEvents: { date: string; type: string; category: string; amount: number; vendor: string }[]
  topCategories: { category: string; total: number }[]
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const now = Date.now()
      const d = new Date()
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

      const allEvents = await db.events.toArray()
      const allJobs = await db.jobs.toArray()
      const allClients = await db.clients.toArray()

      // Month
      const monthEvents = allEvents.filter(e => e.timestamp >= monthStart && e.timestamp <= now)
      const monthIncome = monthEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
      const monthExpenses = monthEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)

      // Today
      const todayEvents = allEvents.filter(e => e.timestamp >= todayStart && e.timestamp <= now)
      const todayExpenses = todayEvents.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
      const todayIncome = todayEvents.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)

      // Job income for month
      let jobIncomeMonth = 0
      allJobs.forEach(j => {
        j.payments?.forEach(p => {
          if (p.date >= monthStart && p.date <= now) jobIncomeMonth += p.amount
        })
      })

      const totalMonthIncome = monthIncome + jobIncomeMonth

      // Pending AR
      const pendingJobs = allJobs.filter(j => j.payment_status === 'pending' || j.payment_status === 'partial')
      const clientMap = new Map(allClients.map(c => [c.id, `${c.first_name} ${c.last_name}`]))
      
      let totalAR = 0
      const pendingClients = pendingJobs.map(j => {
        const paid = j.payments?.reduce((s, p) => s + p.amount, 0) || 0
        const pending = j.total_charged - paid
        totalAR += pending
        const age = Math.floor((now - j.date) / 86400000)
        return {
          name: clientMap.get(j.client_id) || `Cliente #${j.client_id}`,
          amount: pending,
          days: age
        }
      }).sort((a, b) => b.amount - a.amount).slice(0, 5)

      // Top expense categories this month
      const catTotals: Record<string, number> = {}
      monthEvents.filter(e => e.type === 'expense').forEach(e => {
        const cat = e.category || e.subtype || 'Otro'
        catTotals[cat] = (catTotals[cat] || 0) + e.amount
      })
      const topCategories = Object.entries(catTotals)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      // Recent events
      const recentEvents = allEvents
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
        .map(e => ({
          date: new Date(e.timestamp).toLocaleDateString('es-PR', { month: 'short', day: 'numeric' }),
          type: e.type,
          category: e.category || e.subtype || '',
          amount: e.amount,
          vendor: e.vendor || e.client || e.note || ''
        }))

      setStats({
        monthIncome: totalMonthIncome,
        monthExpenses,
        monthProfit: totalMonthIncome - monthExpenses,
        todayExpenses,
        todayIncome,
        pendingAR: totalAR,
        pendingClients,
        recentEvents,
        topCategories
      })
    } catch (e) {
      console.error('Dashboard error:', e)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`

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

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <h1 className="text-xl font-bold">📊 Dashboard</h1>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬 Chat</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Profit Card */}
        <div className={`rounded-xl p-5 shadow-lg ${stats.monthProfit >= 0 ? 'bg-gradient-to-br from-green-900/50 to-green-800/30 border border-green-700/30' : 'bg-gradient-to-br from-red-900/50 to-red-800/30 border border-red-700/30'}`}>
          <p className="text-sm text-gray-300 mb-1">Profit del Mes</p>
          <p className={`text-3xl font-bold ${stats.monthProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.monthProfit)}</p>
          <div className="flex justify-between mt-3 text-sm">
            <span className="text-green-400">↑ {fmt(stats.monthIncome)}</span>
            <span className="text-red-400">↓ {fmt(stats.monthExpenses)}</span>
          </div>
        </div>

        {/* Today Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-xs text-gray-400 mb-1">Gastos Hoy</p>
            <p className="text-xl font-bold text-red-400">{fmt(stats.todayExpenses)}</p>
          </div>
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-xs text-gray-400 mb-1">Ingresos Hoy</p>
            <p className="text-xl font-bold text-green-400">{fmt(stats.todayIncome)}</p>
          </div>
        </div>

        {/* Cuentas por Cobrar */}
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-gray-300">💰 Te Deben</p>
            <p className="text-lg font-bold text-yellow-400">{fmt(stats.pendingAR)}</p>
          </div>
          {stats.pendingClients.length > 0 ? (
            <div className="space-y-2">
              {stats.pendingClients.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span className="text-gray-300">{c.name}</span>
                  <div className="text-right">
                    <span className="text-yellow-400 font-medium">{fmt(c.amount)}</span>
                    <span className="text-gray-500 text-xs ml-2">{c.days}d</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nadie te debe 🎉</p>
          )}
        </div>

        {/* Top Gastos */}
        {stats.topCategories.length > 0 && (
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <p className="text-sm font-semibold text-gray-300 mb-3">📉 Gastos del Mes</p>
            <div className="space-y-2">
              {stats.topCategories.map((c, i) => {
                const pct = stats.monthExpenses > 0 ? (c.total / stats.monthExpenses) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{c.category}</span>
                      <span className="text-gray-400">{fmt(c.total)}</span>
                    </div>
                    <div className="w-full bg-gray-700/50 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Últimos Registros */}
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
                  <p className={`font-medium ${e.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>{fmt(e.amount)}</p>
                  <p className="text-gray-500 text-xs">{e.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 pb-6">
          <button onClick={() => onNavigate('chat')} className="bg-blue-600 hover:bg-blue-700 rounded-xl p-4 text-center transition-colors">
            <span className="text-2xl">💬</span>
            <p className="text-sm mt-1 font-medium">Registrar</p>
          </button>
          <button onClick={() => onNavigate('search')} className="bg-[#111a2e] hover:bg-[#1a2332] border border-white/10 rounded-xl p-4 text-center transition-colors">
            <span className="text-2xl">🔍</span>
            <p className="text-sm mt-1 font-medium">Buscar</p>
          </button>
        </div>
      </div>
    </div>
  )
}