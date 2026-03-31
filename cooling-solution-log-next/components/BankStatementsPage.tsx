import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'

interface BankStatementsPageProps {
  onNavigate: (page: string) => void
}

interface BankTx {
  id?: number
  account_name: string
  date: number
  description: string
  amount: number
  direction: 'debit' | 'credit'
  category: string
  match_status: string
  match_event_id?: number
  match_type?: string
  created_at: number
}

export default function BankStatementsPage({ onNavigate }: BankStatementsPageProps) {
  const [transactions, setTransactions] = useState<BankTx[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAccount, setFilterAccount] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [accounts, setAccounts] = useState<string[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [selectedTx, setSelectedTx] = useState<BankTx | null>(null)

  const loadData = useCallback(async () => {
    try {
      const txs = await db.bank_transactions.toArray()
      const evts = await db.events.toArray()
      txs.sort((a: any, b: any) => b.date - a.date)
      setTransactions(txs)
      setEvents(evts)

      const uniqueAccounts = [...new Set(txs.map((t: any) => t.account_name))].sort()
      setAccounts(uniqueAccounts)

      const uniqueMonths = [...new Set(txs.map((t: any) => {
        const d = new Date(t.date)
        return d.toLocaleDateString('es-PR', { year: 'numeric', month: 'long' })
      }))].sort()
      setMonths(uniqueMonths)
    } catch (e) {
      console.error('Error loading bank data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getAccountLabel = (key: string): string => {
    const labels: Record<string, string> = {
      oriental_checking: 'Oriental Bank',
      chase_visa: 'Chase Ink',
      capital_one_savor: 'Capital One Savor',
      capital_one_quicksilver: 'Capital One Quicksilver',
      sams_mastercard: "Sam's Club MC",
      discover: 'Discover Chrome',
      paypal: 'PayPal MC'
    }
    return labels[key] || key
  }

  const getStatusIcon = (status: string): string => {
    if (status === 'matched') return '✅'
    if (status === 'probable') return '❓'
    if (status === 'unmatched') return '⚠️'
    return '⏳'
  }

  const getStatusColor = (status: string): string => {
    if (status === 'matched') return 'text-green-400'
    if (status === 'probable') return 'text-yellow-400'
    if (status === 'unmatched') return 'text-red-400'
    return 'text-gray-400'
  }

  const getCategoryLabel = (cat: string): string => {
    const labels: Record<string, string> = {
      purchase: 'Compra', payment: 'Pago tarjeta', deposit: 'Depósito',
      transfer: 'Transferencia', fee: 'Cargo', interest: 'Interés', refund: 'Reembolso'
    }
    return labels[cat] || cat
  }

  const filtered = transactions.filter(t => {
    if (filterAccount !== 'all' && t.account_name !== filterAccount) return false
    if (filterStatus !== 'all' && t.match_status !== filterStatus) return false
    if (filterMonth !== 'all') {
      const d = new Date(t.date)
      const m = d.toLocaleDateString('es-PR', { year: 'numeric', month: 'long' })
      if (m !== filterMonth) return false
    }
    return true
  })

  const totalDebits = filtered.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
  const totalCredits = filtered.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amount, 0)
  const matchedCount = filtered.filter(t => t.match_status === 'matched').length
  const unmatchedCount = filtered.filter(t => t.match_status === 'unmatched').length
  const pendingCount = filtered.filter(t => t.match_status === 'pending').length

  const getMatchedEvent = (eventId?: number) => {
    if (!eventId) return null
    return events.find(e => e.id === eventId)
  }

  const deleteTransaction = async (id: number) => {
    await db.bank_transactions.delete(id)
    setSelectedTx(null)
    loadData()
  }

  const clearAccount = async (account: string) => {
    const txs = transactions.filter(t => t.account_name === account)
    for (const tx of txs) {
      if (tx.id) await db.bank_transactions.delete(tx.id)
    }
    loadData()
  }

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-400">Cargando transacciones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🏦 Estados de Cuenta</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      {/* Stats */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
            <p className="text-xs text-gray-400">Transacciones</p>
            <p className="text-xl font-bold">{filtered.length}</p>
          </div>
          <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
            <p className="text-xs text-gray-400">Cuentas</p>
            <p className="text-xl font-bold">{accounts.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-green-900/20 rounded-xl p-3 border border-green-800/30 text-center">
            <p className="text-xs text-green-400">✅ Match</p>
            <p className="text-lg font-bold text-green-400">{matchedCount}</p>
          </div>
          <div className="bg-red-900/20 rounded-xl p-3 border border-red-800/30 text-center">
            <p className="text-xs text-red-400">⚠️ Sin match</p>
            <p className="text-lg font-bold text-red-400">{unmatchedCount}</p>
          </div>
          <div className="bg-gray-900/20 rounded-xl p-3 border border-gray-800/30 text-center">
            <p className="text-xs text-gray-400">⏳ Pendiente</p>
            <p className="text-lg font-bold text-gray-400">{pendingCount}</p>
          </div>
        </div>

        <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Total débitos:</span>
            <span className="text-red-400 font-medium">{fmt(totalDebits)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Total créditos:</span>
            <span className="text-green-400 font-medium">{fmt(totalCredits)}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-2 mb-4">
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm">
            <option value="all">🏦 Todas las cuentas ({transactions.length})</option>
            {accounts.map(a => (
              <option key={a} value={a}>{getAccountLabel(a)} ({transactions.filter(t => t.account_name === a).length})</option>
            ))}
          </select>

          <div className="flex gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm">
              <option value="all">Todos los estados</option>
              <option value="matched">✅ Conciliados</option>
              <option value="probable">❓ Probables</option>
              <option value="unmatched">⚠️ Sin match</option>
              <option value="pending">⏳ Pendientes</option>
            </select>

            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm">
              <option value="all">Todos los meses</option>
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen por cuenta */}
        {filterAccount === 'all' && (
          <div className="space-y-2 mb-4">
            {accounts.map(account => {
              const acctTx = transactions.filter(t => t.account_name === account)
              const acctDebits = acctTx.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amount, 0)
              const acctMatched = acctTx.filter(t => t.match_status === 'matched').length
              const acctUnmatched = acctTx.filter(t => t.match_status === 'unmatched').length
              return (
                <div key={account} className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{getAccountLabel(account)}</p>
                      <p className="text-xs text-gray-500">{acctTx.length} transacciones | {fmt(acctDebits)} débitos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-400">✅ {acctMatched}</p>
                      {acctUnmatched > 0 && <p className="text-xs text-red-400">⚠️ {acctUnmatched}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Clear account button */}
        {filterAccount !== 'all' && (
          <button
            onClick={() => { if (confirm(`¿Borrar todas las transacciones de ${getAccountLabel(filterAccount)}?`)) clearAccount(filterAccount) }}
            className="w-full py-2 rounded-lg text-xs text-red-400 border border-red-800/30 bg-red-900/10 mb-4"
          >
            🗑️ Borrar transacciones de {getAccountLabel(filterAccount)}
          </button>
        )}
      </div>

      {/* Lista de transacciones */}
      <div className="px-4 pb-20">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🏦</p>
            <p>No hay transacciones bancarias</p>
            <p className="text-xs mt-2">Sube un estado de cuenta en el chat 💬</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(tx => {
              const matchedEvent = getMatchedEvent(tx.match_event_id)
              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="bg-[#111a2e] rounded-xl p-3 border border-white/5 cursor-pointer hover:border-white/20 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${getStatusColor(tx.match_status)}`}>{getStatusIcon(tx.match_status)}</span>
                        <p className="text-sm font-medium text-gray-200 truncate">{tx.description}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {fmtDate(tx.date)} • {getAccountLabel(tx.account_name)} • {getCategoryLabel(tx.category)}
                      </p>
                      {matchedEvent && (
                        <p className="text-xs text-green-400 mt-1">→ {matchedEvent.vendor || matchedEvent.client || matchedEvent.category}</p>
                      )}
                    </div>
                    <p className={`text-sm font-bold ${tx.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.direction === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {selectedTx && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setSelectedTx(null)} />
          <div className="fixed inset-x-4 top-20 bottom-20 bg-[#111a2e] rounded-2xl z-50 overflow-auto border border-white/10 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Detalle</h2>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="space-y-3">
              <div className="bg-[#0b1220] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Cuenta:</span>
                  <span>{getAccountLabel(selectedTx.account_name)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fecha:</span>
                  <span>{fmtDate(selectedTx.date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Descripción:</span>
                  <span className="text-right max-w-[60%]">{selectedTx.description}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Monto:</span>
                  <span className={selectedTx.direction === 'credit' ? 'text-green-400' : 'text-red-400'}>
                    {selectedTx.direction === 'credit' ? '+' : '-'}{fmt(selectedTx.amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Categoría:</span>
                  <span>{getCategoryLabel(selectedTx.category)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Estado:</span>
                  <span className={getStatusColor(selectedTx.match_status)}>
                    {getStatusIcon(selectedTx.match_status)} {selectedTx.match_status}
                  </span>
                </div>
              </div>

              {selectedTx.match_event_id && (() => {
                const evt = getMatchedEvent(selectedTx.match_event_id)
                if (!evt) return null
                return (
                  <div className="bg-green-900/20 rounded-xl p-3 border border-green-800/30">
                    <p className="text-xs text-green-400 font-medium mb-2">Match encontrado:</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Tipo:</span>
                        <span>{evt.type === 'expense' ? 'Gasto' : 'Ingreso'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Monto:</span>
                        <span>{fmt(evt.amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Categoría:</span>
                        <span>{evt.category}</span>
                      </div>
                      {evt.vendor && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Vendor:</span>
                          <span>{evt.vendor}</span>
                        </div>
                      )}
                      {evt.client && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Cliente:</span>
                          <span>{evt.client}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              <button
                onClick={() => selectedTx.id && deleteTransaction(selectedTx.id)}
                className="w-full py-3 rounded-xl text-sm font-medium bg-red-900/30 text-red-400 border border-red-800/30"
              >
                🗑️ Eliminar transacción
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}