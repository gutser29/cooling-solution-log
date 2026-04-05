'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { db, BankAccount, BankTransaction } from '@/lib/db'
import { generateBankReconciliationPDF } from '@/lib/pdfGenerator'
import { parseCSV, CsvTransaction, CsvParseResult } from '@/lib/csvBankParser'

interface BankStatementsPageProps {
  onNavigate: (page: string) => void
}

type Tab = 'accounts' | 'transactions'

const ACCOUNT_LABELS: Record<string, string> = {
  oriental_checking: 'Oriental Bank',
  chase_visa: 'Chase Ink',
  capital_one_savor: 'Capital One Savor',
  capital_one_quicksilver: 'Capital One Quicksilver',
  sams_mastercard: "Sam's Club MC",
  discover: 'Discover Chrome',
  paypal: 'PayPal MC',
}

const emptyAccount: Omit<BankAccount, 'id' | 'created_at'> = {
  name: '',
  institution: '',
  type: 'credit',
  last_four: '',
  payment_method_key: '',
  active: true,
}

export default function BankStatementsPage({ onNavigate }: BankStatementsPageProps) {
  const [tab, setTab] = useState<Tab>('transactions')
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [statements, setStatements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Transaction filters
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')

  // Selected transaction for detail/match
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null)
  const [matchModalOpen, setMatchModalOpen] = useState(false)
  const [matchSearch, setMatchSearch] = useState('')
  const [matchBusy, setMatchBusy] = useState(false)

  // Account form
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const [accountForm, setAccountForm] = useState({ ...emptyAccount })
  const [accountSaving, setAccountSaving] = useState(false)

  // PDF filter modal
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfAccount, setPdfAccount] = useState('all')
  const [pdfMonth, setPdfMonth] = useState('all')

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [csvParsed, setCsvParsed] = useState<CsvParseResult | null>(null)
  const [csvAccountKey, setCsvAccountKey] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvDupeCount, setCsvDupeCount] = useState(0)
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; dupes: number } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [txs, evts, accts, stmts] = await Promise.all([
        db.bank_transactions.toArray(),
        db.events.toArray(),
        db.bank_accounts.toArray(),
        db.bank_statements.toArray(),
      ])
      txs.sort((a: any, b: any) => b.date - a.date)
      setTransactions(txs)
      setEvents(evts)
      setAccounts(accts)
      setStatements(stmts)
    } catch (e) {
      console.error('Error loading bank data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Accounts ──────────────────────────────────────────────

  const openNewAccount = () => {
    setEditingAccount(null)
    setAccountForm({ ...emptyAccount })
    setShowAccountForm(true)
  }

  const openEditAccount = (a: BankAccount) => {
    setEditingAccount(a)
    setAccountForm({
      name: a.name,
      institution: a.institution,
      type: a.type,
      last_four: a.last_four || '',
      payment_method_key: a.payment_method_key || '',
      active: a.active,
    })
    setShowAccountForm(true)
  }

  const saveAccount = async () => {
    if (!accountForm.name || !accountForm.payment_method_key) return
    setAccountSaving(true)
    try {
      const now = Date.now()
      if (editingAccount?.id) {
        await db.bank_accounts.update(editingAccount.id, { ...accountForm })
      } else {
        await db.bank_accounts.add({ ...accountForm, created_at: now })
      }
      setShowAccountForm(false)
      await loadData()
    } finally {
      setAccountSaving(false)
    }
  }

  const toggleAccountActive = async (a: BankAccount) => {
    await db.bank_accounts.update(a.id!, { active: !a.active })
    await loadData()
  }

  // ── Match / Unmatch ───────────────────────────────────────

  const openMatchModal = (tx: BankTransaction) => {
    setSelectedTx(tx)
    setMatchModalOpen(true)
    setMatchSearch('')
  }

  const confirmMatch = async (eventId: number) => {
    if (!selectedTx?.id) return
    setMatchBusy(true)
    try {
      await db.bank_transactions.update(selectedTx.id, {
        match_status: 'matched',
        match_event_id: eventId,
        match_type: 'manual',
      })
      setMatchModalOpen(false)
      setSelectedTx(null)
      await loadData()
    } finally {
      setMatchBusy(false)
    }
  }

  const unmatchTx = async (tx: BankTransaction) => {
    if (!tx.id) return
    await db.bank_transactions.update(tx.id, {
      match_status: 'unmatched',
      match_event_id: undefined,
      match_type: undefined,
    })
    setSelectedTx(null)
    await loadData()
  }

  const deleteTx = async (tx: BankTransaction) => {
    if (!confirm('¿Eliminar esta transacción?')) return
    await db.bank_transactions.delete(tx.id!)
    setSelectedTx(null)
    await loadData()
  }

  const clearAccount = async (accountName: string) => {
    if (!confirm(`¿Borrar todas las transacciones de ${getAccountLabel(accountName)}?`)) return
    const toDelete = transactions.filter(t => t.account_name === accountName)
    for (const tx of toDelete) await db.bank_transactions.delete(tx.id!)
    await loadData()
  }

  // ── PDF generation ────────────────────────────────────────

  const generatePDF = async () => {
    let filterStart: number | undefined
    let filterEnd: number | undefined
    if (pdfMonth !== 'all') {
      const [yr, mo] = pdfMonth.split('-').map(Number)
      filterStart = new Date(yr, mo - 1, 1).getTime()
      filterEnd = new Date(yr, mo, 0, 23, 59, 59).getTime()
    }
    const filterAcct = pdfAccount === 'all' ? undefined : pdfAccount
    generateBankReconciliationPDF(
      transactions,
      events,
      accounts,
      filterAcct,
      filterStart,
      filterEnd,
      statements
    )
    setShowPdfModal(false)
  }

  // ── CSV import ────────────────────────────────────────────

  const handleCSVFile = async (file: File) => {
    const text = await file.text()
    const result = parseCSV(text)
    setCsvParsed(result)
    setCsvAccountKey(result.suggestedAccountKey)
    setCsvImportResult(null)
    // Count likely dupes against existing transactions
    if (result.transactions.length > 0) {
      const existing = await db.bank_transactions.toArray()
      let dupes = 0
      for (const tx of result.transactions) {
        const isDupe = existing.some(e =>
          e.account_name === result.suggestedAccountKey &&
          Math.abs(e.date - tx.date) < 86400000 &&
          Math.abs(e.amount - tx.amount) < 0.02 &&
          e.description.toLowerCase().trim() === tx.description.toLowerCase().trim()
        )
        if (isDupe) dupes++
      }
      setCsvDupeCount(dupes)
    }
  }

  const confirmCSVImport = async () => {
    if (!csvParsed || !csvAccountKey) return
    setCsvImporting(true)
    try {
      const existing = await db.bank_transactions.toArray()
      const now = Date.now()
      let imported = 0
      let dupes = 0

      // Find account_id if matched
      const acct = accounts.find(a => a.payment_method_key === csvAccountKey)

      for (const tx of csvParsed.transactions) {
        const isDupe = existing.some(e =>
          e.account_name === csvAccountKey &&
          Math.abs(e.date - tx.date) < 86400000 &&
          Math.abs(e.amount - tx.amount) < 0.02 &&
          e.description.toLowerCase().trim() === tx.description.toLowerCase().trim()
        )
        if (isDupe) { dupes++; continue }

        await db.bank_transactions.add({
          account_name: csvAccountKey,
          account_id: acct?.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          direction: tx.direction,
          category: tx.category || '',
          match_status: 'pending',
          created_at: now,
        })
        imported++
      }

      // Create a statement record summarizing this import
      if (imported > 0 && csvParsed.transactions.length > 0) {
        const sorted = [...csvParsed.transactions].sort((a, b) => a.date - b.date)
        const periodStart = sorted[0].date
        const periodEnd = sorted[sorted.length - 1].date
        const d = new Date(periodStart)
        const periodLabel = d.toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
        await db.bank_statements.add({
          account_name: csvAccountKey,
          account_id: acct?.id,
          period_start: periodStart,
          period_end: periodEnd,
          period_label: `${periodLabel} (CSV)`,
          tx_count: imported,
          status: 'imported',
          created_at: now,
        })
      }

      setCsvImportResult({ imported, dupes })
      await loadData()
    } finally {
      setCsvImporting(false)
    }
  }

  const closeCsvModal = () => {
    setCsvParsed(null)
    setCsvImportResult(null)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  // ── Helpers ──────────────────────────────────────────────

  const getAccountLabel = (key: string): string =>
    accounts.find(a => a.payment_method_key === key)?.name || ACCOUNT_LABELS[key] || key

  const getMatchedEvent = (id?: number) => id ? events.find(e => e.id === id) : null

  const getStatusIcon = (s: string) =>
    s === 'matched' ? '✅' : s === 'probable' ? '❓' : s === 'unmatched' ? '⚠️' : '⏳'

  const getStatusColor = (s: string) =>
    s === 'matched' ? 'text-green-400' : s === 'probable' ? 'text-yellow-400' : s === 'unmatched' ? 'text-red-400' : 'text-gray-400'

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })

  // ── Filtering ─────────────────────────────────────────────

  const uniqueAccounts = [...new Set(transactions.map(t => t.account_name))].sort()
  const uniqueMonths = [...new Set(transactions.map(t => {
    const d = new Date(t.date)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }))].sort().reverse()

  const filtered = transactions.filter(t => {
    if (filterAccount !== 'all' && t.account_name !== filterAccount) return false
    if (filterStatus !== 'all' && t.match_status !== filterStatus) return false
    if (filterMonth !== 'all') {
      const d = new Date(t.date)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (m !== filterMonth) return false
    }
    return true
  })

  const matchedCount = filtered.filter(t => t.match_status === 'matched').length
  const unmatchedCount = filtered.filter(t => t.match_status === 'unmatched').length

  // Events filtered for match modal
  const matchCandidates = selectedTx
    ? events.filter(e => {
        const typeOk = selectedTx.direction === 'debit' ? e.type === 'expense' : e.type === 'income'
        const amtOk = Math.abs(e.amount - selectedTx.amount) / Math.max(selectedTx.amount, 0.01) < 0.35
        const dateOk = Math.abs(e.timestamp - selectedTx.date) < 20 * 86400000
        return typeOk && amtOk && dateOk
      }).sort((a, b) => {
        const da = Math.abs(a.amount - selectedTx!.amount)
        const db2 = Math.abs(b.amount - selectedTx!.amount)
        return da - db2
      }).filter(e => {
        if (!matchSearch) return true
        const q = matchSearch.toLowerCase()
        return (
          (e.vendor || '').toLowerCase().includes(q) ||
          (e.client || '').toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q)
        )
      })
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-400">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-emerald-700 to-teal-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🏦 Estados de Cuenta</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => csvInputRef.current?.click()}
            className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            📂 CSV
          </button>
          <button
            onClick={() => setShowPdfModal(true)}
            className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            📄 PDF
          </button>
        </div>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f) }}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab('transactions')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'transactions' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-gray-400'}`}
        >
          📋 Transacciones ({transactions.length})
        </button>
        <button
          onClick={() => setTab('accounts')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'accounts' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-gray-400'}`}
        >
          🏦 Cuentas ({accounts.length})
        </button>
      </div>

      {/* ===== ACCOUNTS TAB ===== */}
      {tab === 'accounts' && (
        <div className="p-4 space-y-3 pb-20">
          <button
            onClick={openNewAccount}
            className="w-full bg-teal-600/20 hover:bg-teal-600/40 border border-teal-500/40 text-teal-300 rounded-xl py-3 text-sm font-medium transition-colors"
          >
            + Agregar cuenta bancaria
          </button>

          {accounts.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-3xl mb-2">🏦</p>
              <p>No hay cuentas configuradas</p>
              <p className="text-xs mt-1">Agrega tus cuentas para vincularlas a los estados</p>
            </div>
          ) : (
            accounts.map(a => {
              const txCount = transactions.filter(t => t.account_name === a.payment_method_key).length
              const matched = transactions.filter(t => t.account_name === a.payment_method_key && t.match_status === 'matched').length
              return (
                <div key={a.id} className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{a.name}</h3>
                        {!a.active && <span className="text-xs text-gray-600">(inactiva)</span>}
                      </div>
                      <p className="text-xs text-gray-400">{a.institution} · {a.type} {a.last_four ? `···${a.last_four}` : ''}</p>
                      <p className="text-xs text-gray-600 mt-0.5">key: {a.payment_method_key}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-gray-400">{txCount} tx</p>
                      <p className="text-green-400">✅ {matched}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openEditAccount(a)}
                      className="flex-1 bg-white/5 hover:bg-white/10 rounded-lg py-2 text-xs transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => toggleAccountActive(a)}
                      className="flex-1 bg-white/5 hover:bg-white/10 rounded-lg py-2 text-xs transition-colors"
                    >
                      {a.active ? '🔴 Desactivar' : '🟢 Activar'}
                    </button>
                    {txCount > 0 && (
                      <button
                        onClick={() => clearAccount(a.payment_method_key || '')}
                        className="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg py-2 text-xs transition-colors"
                      >
                        🗑 Borrar tx
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {/* Statements list */}
          {statements.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Estados subidos</h3>
              <div className="space-y-2">
                {statements.sort((a, b) => b.created_at - a.created_at).map(s => (
                  <div key={s.id} className="bg-[#111a2e] rounded-xl p-3 border border-white/5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{getAccountLabel(s.account_name)}</p>
                        <p className="text-xs text-gray-400">{s.period_label || `${fmtDate(s.period_start)} — ${fmtDate(s.period_end)}`}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>{s.tx_count || 0} tx</p>
                        <p>Subido {fmtDate(s.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TRANSACTIONS TAB ===== */}
      {tab === 'transactions' && (
        <div className="p-4 pb-20">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-green-900/20 rounded-xl p-3 border border-green-800/30 text-center">
              <p className="text-xs text-green-400">✅ Match</p>
              <p className="text-xl font-bold text-green-400">{matchedCount}</p>
            </div>
            <div className="bg-red-900/20 rounded-xl p-3 border border-red-800/30 text-center">
              <p className="text-xs text-red-400">⚠️ Sin match</p>
              <p className="text-xl font-bold text-red-400">{unmatchedCount}</p>
            </div>
            <div className="bg-[#111a2e] rounded-xl p-3 border border-white/5 text-center">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-xl font-bold">{filtered.length}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2 mb-3">
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm"
            >
              <option value="all">🏦 Todas las cuentas ({transactions.length})</option>
              {uniqueAccounts.map(a => (
                <option key={a} value={a}>
                  {getAccountLabel(a)} ({transactions.filter(t => t.account_name === a).length})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="matched">✅ Conciliados</option>
                <option value="probable">❓ Probables</option>
                <option value="unmatched">⚠️ Sin match</option>
                <option value="pending">⏳ Pendientes</option>
              </select>
              <select
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="flex-1 bg-[#111a2e] border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value="all">Todos los meses</option>
                {uniqueMonths.map(m => {
                  const [yr, mo] = m.split('-')
                  const label = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
                  return <option key={m} value={m}>{label}</option>
                })}
              </select>
            </div>
          </div>

          {/* Transaction list */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-4xl mb-2">🏦</p>
              <p>No hay transacciones</p>
              <p className="text-xs mt-2">Sube un estado de cuenta en el chat 💬</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(tx => {
                const matchedEv = getMatchedEvent(tx.match_event_id)
                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="bg-[#111a2e] rounded-xl p-3 border border-white/5 cursor-pointer hover:border-white/20 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${getStatusColor(tx.match_status)}`}>
                            {getStatusIcon(tx.match_status)}
                          </span>
                          <p className="text-sm font-medium text-gray-200 truncate">{tx.description}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {fmtDate(tx.date)} · {getAccountLabel(tx.account_name)}
                        </p>
                        {matchedEv && (
                          <p className="text-xs text-green-400 mt-0.5 truncate">
                            → {matchedEv.vendor || matchedEv.client || matchedEv.category}
                            {tx.match_type === 'manual' && ' ✏️'}
                          </p>
                        )}
                      </div>
                      <p className={`text-sm font-bold ml-2 flex-shrink-0 ${tx.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.direction === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== TRANSACTION DETAIL MODAL ===== */}
      {selectedTx && !matchModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setSelectedTx(null)} />
          <div className="fixed inset-x-3 bottom-4 top-20 bg-[#111a2e] rounded-2xl z-50 overflow-auto border border-white/10 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold">Detalle transacción</h2>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="bg-[#0b1220] rounded-xl p-3 space-y-2 mb-3">
              {[
                ['Cuenta', getAccountLabel(selectedTx.account_name)],
                ['Fecha', fmtDate(selectedTx.date)],
                ['Descripción', selectedTx.description],
                ['Monto', `${selectedTx.direction === 'credit' ? '+' : '-'}${fmt(selectedTx.amount)}`],
                ['Categoría', selectedTx.category],
                ['Estado', `${getStatusIcon(selectedTx.match_status)} ${selectedTx.match_status}`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-400">{label}:</span>
                  <span className={`text-right max-w-[58%] ${label === 'Estado' ? getStatusColor(selectedTx.match_status) : ''}`}>{val}</span>
                </div>
              ))}
            </div>

            {/* Matched event info */}
            {selectedTx.match_event_id && (() => {
              const ev = getMatchedEvent(selectedTx.match_event_id)
              if (!ev) return null
              return (
                <div className="bg-green-900/20 rounded-xl p-3 border border-green-800/30 mb-3">
                  <p className="text-xs text-green-400 font-medium mb-2">
                    Evento vinculado {selectedTx.match_type === 'manual' ? '(manual)' : '(automático)'}:
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Tipo:</span>
                      <span>{ev.type === 'expense' ? 'Gasto' : 'Ingreso'}</span>
                    </div>
                    {ev.vendor && <div className="flex justify-between"><span className="text-gray-400">Vendor:</span><span>{ev.vendor}</span></div>}
                    {ev.client && <div className="flex justify-between"><span className="text-gray-400">Cliente:</span><span>{ev.client}</span></div>}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Monto:</span>
                      <span className={Math.abs(ev.amount - selectedTx.amount) > 0.02 ? 'text-yellow-400' : ''}>{fmt(ev.amount)}</span>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-400">Categoría:</span><span>{ev.category}</span></div>
                  </div>
                  <button
                    onClick={() => unmatchTx(selectedTx)}
                    className="mt-2 w-full text-xs text-yellow-400 border border-yellow-800/30 bg-yellow-900/10 rounded-lg py-2 hover:bg-yellow-900/20 transition-colors"
                  >
                    🔗 Desconectar match
                  </button>
                </div>
              )
            })()}

            <div className="space-y-2">
              {(selectedTx.match_status !== 'matched') && (
                <button
                  onClick={() => openMatchModal(selectedTx)}
                  className="w-full bg-teal-600/20 hover:bg-teal-600/40 border border-teal-500/40 text-teal-300 rounded-xl py-3 text-sm font-medium transition-colors"
                >
                  🔗 Conectar manualmente
                </button>
              )}
              <button
                onClick={() => deleteTx(selectedTx)}
                className="w-full bg-red-900/20 hover:bg-red-900/40 border border-red-800/30 text-red-400 rounded-xl py-3 text-sm transition-colors"
              >
                🗑️ Eliminar transacción
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== MATCH MODAL ===== */}
      {matchModalOpen && selectedTx && (
        <>
          <div className="fixed inset-0 bg-black/90 z-50" onClick={() => { setMatchModalOpen(false) }} />
          <div className="fixed inset-x-2 top-4 bottom-4 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-teal-500/30 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex-shrink-0 bg-teal-900/20">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-bold text-teal-300">🔗 Conectar manualmente</h2>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[85%]">{selectedTx.description}</p>
                  <p className="text-sm font-bold text-white">{selectedTx.direction === 'credit' ? '+' : '-'}{fmt(selectedTx.amount)} · {fmtDate(selectedTx.date)}</p>
                </div>
                <button onClick={() => setMatchModalOpen(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <input
                type="text"
                value={matchSearch}
                onChange={e => setMatchSearch(e.target.value)}
                placeholder="Buscar vendor, cliente, categoría..."
                className="mt-3 w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-2">
              {matchCandidates.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <p>Sin eventos coincidentes</p>
                  <p className="text-xs mt-1">±35% del monto · ±20 días de la fecha · mismo tipo</p>
                </div>
              ) : (
                matchCandidates.map(ev => {
                  const diff = Math.abs(ev.amount - selectedTx.amount)
                  const daysDiff = Math.round(Math.abs(ev.timestamp - selectedTx.date) / 86400000)
                  return (
                    <div
                      key={ev.id}
                      onClick={() => !matchBusy && confirmMatch(ev.id!)}
                      className="bg-[#0b1220] rounded-xl p-3 border border-white/5 cursor-pointer hover:border-teal-500/40 hover:bg-teal-900/10 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">
                            {ev.vendor || ev.client || ev.category}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(ev.timestamp).toLocaleDateString('es-PR')} · {ev.category} · {daysDiff}d
                          </p>
                          {ev.note && <p className="text-xs text-gray-600 truncate">{ev.note}</p>}
                        </div>
                        <div className="ml-2 text-right flex-shrink-0">
                          <p className={`text-sm font-bold ${ev.type === 'expense' ? 'text-red-400' : 'text-green-400'}`}>
                            {fmt(ev.amount)}
                          </p>
                          {diff > 0.02 && (
                            <p className="text-xs text-yellow-500">dif {fmt(diff)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="p-4 border-t border-white/10 flex-shrink-0">
              <button
                onClick={() => setMatchModalOpen(false)}
                className="w-full bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== ACCOUNT FORM MODAL ===== */}
      {showAccountForm && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => !accountSaving && setShowAccountForm(false)} />
          <div className="fixed inset-x-2 top-10 bottom-10 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center flex-shrink-0">
              <h2 className="text-lg font-bold">{editingAccount ? 'Editar cuenta' : '+ Nueva cuenta'}</h2>
              {!accountSaving && <button onClick={() => setShowAccountForm(false)} className="text-gray-400 text-2xl">✕</button>}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {[
                { label: 'Nombre display *', field: 'name', placeholder: 'Chase Ink' },
                { label: 'Banco / Institución *', field: 'institution', placeholder: 'Chase' },
                { label: 'Últimos 4 dígitos', field: 'last_four', placeholder: '5536' },
                { label: 'payment_method_key *', field: 'payment_method_key', placeholder: 'chase_visa' },
              ].map(({ label, field, placeholder }) => (
                <div key={field}>
                  <label className="text-xs text-gray-400 mb-1 block">{label}</label>
                  <input
                    type="text"
                    value={(accountForm as any)[field]}
                    onChange={e => setAccountForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
                <select
                  value={accountForm.type}
                  onChange={e => setAccountForm(f => ({ ...f, type: e.target.value as any }))}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="checking">Checking</option>
                  <option value="credit">Tarjeta de crédito</option>
                  <option value="savings">Savings</option>
                  <option value="paypal">PayPal</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">
                El <strong>payment_method_key</strong> debe coincidir con el valor usado en los gastos del app. Ej: chase_visa, capital_one_savor, oriental_checking
              </p>
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowAccountForm(false)}
                disabled={accountSaving}
                className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={saveAccount}
                disabled={accountSaving || !accountForm.name || !accountForm.payment_method_key}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-900/40 disabled:text-teal-700 rounded-xl py-3 text-sm font-bold transition-colors"
              >
                {accountSaving ? 'Guardando...' : '✓ Guardar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== CSV IMPORT MODAL ===== */}
      {csvParsed && (
        <>
          <div className="fixed inset-0 bg-black/85 z-40" onClick={() => !csvImporting && closeCsvModal()} />
          <div className="fixed inset-x-2 top-4 bottom-4 bg-[#111a2e] rounded-2xl z-50 flex flex-col border border-teal-500/30 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex-shrink-0 bg-teal-900/20">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-bold text-teal-300">📂 Importar CSV</h2>
                  <p className="text-sm text-gray-300 mt-0.5">{csvParsed.bank}</p>
                </div>
                {!csvImporting && <button onClick={closeCsvModal} className="text-gray-400 text-2xl">✕</button>}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Import result */}
              {csvImportResult ? (
                <div className="bg-green-900/30 border border-green-700/40 rounded-xl p-4 text-center">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-green-400 font-bold text-lg">{csvImportResult.imported} transacciones importadas</p>
                  {csvImportResult.dupes > 0 && (
                    <p className="text-gray-400 text-sm mt-1">{csvImportResult.dupes} duplicadas omitidas</p>
                  )}
                  <button onClick={closeCsvModal} className="mt-4 bg-teal-600 hover:bg-teal-700 rounded-xl px-6 py-2.5 text-sm font-bold">
                    Listo
                  </button>
                </div>
              ) : (
                <>
                  {/* Parse errors */}
                  {csvParsed.parseErrors.length > 0 && (
                    <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3">
                      <p className="text-xs font-semibold text-yellow-400 mb-1">⚠️ Advertencias al parsear ({csvParsed.parseErrors.length})</p>
                      {csvParsed.parseErrors.slice(0, 3).map((e, i) => (
                        <p key={i} className="text-xs text-yellow-300/70">{e}</p>
                      ))}
                      {csvParsed.parseErrors.length > 3 && <p className="text-xs text-gray-500">...y {csvParsed.parseErrors.length - 3} más</p>}
                    </div>
                  )}

                  {csvParsed.transactions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-3xl mb-2">😕</p>
                      <p>No se encontraron transacciones</p>
                      <p className="text-xs mt-1">Verifica que el archivo sea un CSV de estado de cuenta</p>
                    </div>
                  ) : (
                    <>
                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-cyan-400">{csvParsed.transactions.length}</p>
                          <p className="text-[10px] text-gray-500">Total</p>
                        </div>
                        <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-green-400">{csvParsed.transactions.length - csvDupeCount}</p>
                          <p className="text-[10px] text-gray-500">A importar</p>
                        </div>
                        <div className="bg-[#0b1220] rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-gray-500">{csvDupeCount}</p>
                          <p className="text-[10px] text-gray-500">Duplicadas</p>
                        </div>
                      </div>

                      {/* Account selector */}
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Cuenta destino</label>
                        <select
                          value={csvAccountKey}
                          onChange={e => setCsvAccountKey(e.target.value)}
                          className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                        >
                          {accounts.map(a => (
                            <option key={a.id} value={a.payment_method_key || ''}>{a.name} ({a.payment_method_key})</option>
                          ))}
                          {/* Also offer the suggested key if not in accounts list */}
                          {csvParsed.suggestedAccountKey && !accounts.some(a => a.payment_method_key === csvParsed.suggestedAccountKey) && (
                            <option value={csvParsed.suggestedAccountKey}>{csvParsed.bank} — {csvParsed.suggestedAccountKey} (auto)</option>
                          )}
                        </select>
                        <p className="text-[10px] text-gray-600 mt-1">Detectado automáticamente. Cambia si es necesario.</p>
                      </div>

                      {/* Preview table */}
                      <div>
                        <p className="text-xs text-gray-400 mb-2 font-medium">
                          Preview — primeras {Math.min(csvParsed.transactions.length, 15)} de {csvParsed.transactions.length}
                        </p>
                        <div className="space-y-1.5">
                          {csvParsed.transactions.slice(0, 15).map((tx, i) => (
                            <div key={i} className="bg-[#0b1220] rounded-lg px-3 py-2 flex justify-between items-center text-xs">
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-200 truncate">{tx.description}</p>
                                <p className="text-gray-600">
                                  {new Date(tx.date).toLocaleDateString('es-PR', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  {tx.category ? ` · ${tx.category}` : ''}
                                </p>
                              </div>
                              <p className={`ml-2 font-bold flex-shrink-0 ${tx.direction === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                                {tx.direction === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                              </p>
                            </div>
                          ))}
                        </div>
                        {csvParsed.transactions.length > 15 && (
                          <p className="text-xs text-gray-600 text-center mt-2">
                            ...y {csvParsed.transactions.length - 15} transacciones más
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!csvImportResult && csvParsed.transactions.length > 0 && (
              <div className="p-4 border-t border-white/10 flex gap-3 flex-shrink-0">
                <button
                  onClick={closeCsvModal}
                  disabled={csvImporting}
                  className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmCSVImport}
                  disabled={csvImporting || !csvAccountKey || csvParsed.transactions.length - csvDupeCount === 0}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-900/40 disabled:text-teal-700 rounded-xl py-3 text-sm font-bold transition-colors"
                >
                  {csvImporting ? 'Importando...' : `✓ Importar ${csvParsed.transactions.length - csvDupeCount} transacciones`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== PDF FILTER MODAL ===== */}
      {showPdfModal && (
        <>
          <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setShowPdfModal(false)} />
          <div className="fixed inset-x-4 top-1/4 bg-[#111a2e] rounded-2xl z-50 p-5 border border-white/10">
            <h3 className="text-lg font-bold mb-4">📄 Generar PDF Conciliación</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Cuenta</label>
                <select
                  value={pdfAccount}
                  onChange={e => setPdfAccount(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">Todas las cuentas</option>
                  {uniqueAccounts.map(a => (
                    <option key={a} value={a}>{getAccountLabel(a)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Período</label>
                <select
                  value={pdfMonth}
                  onChange={e => setPdfMonth(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">Todo el historial</option>
                  {uniqueMonths.map(m => {
                    const [yr, mo] = m.split('-')
                    const label = new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
                    return <option key={m} value={m}>{label}</option>
                  })}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowPdfModal(false)} className="flex-1 bg-[#0b1220] border border-white/10 rounded-xl py-3 text-sm">
                Cancelar
              </button>
              <button onClick={generatePDF} className="flex-1 bg-teal-600 hover:bg-teal-700 rounded-xl py-3 text-sm font-bold transition-colors">
                📄 Generar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
