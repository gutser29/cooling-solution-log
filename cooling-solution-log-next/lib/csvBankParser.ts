// CSV Bank Statement Parser
// Supports: Chase CC, Chase Checking, Oriental Bank, Capital One, Discover, Sam's Club

export interface CsvTransaction {
  date: number           // epoch ms
  description: string
  amount: number         // always positive
  direction: 'debit' | 'credit'
  category: string
}

export interface CsvParseResult {
  bank: string
  suggestedAccountKey: string
  transactions: CsvTransaction[]
  parseErrors: string[]
}

// ── CSV line parser (handles quoted fields with commas) ───────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

// ── Date parsers ─────────────────────────────────────────────────────────────
function parseDate(raw: string): number | null {
  if (!raw) return null
  raw = raw.trim().replace(/"/g, '')

  // MM/DD/YYYY or M/D/YYYY
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime()

  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime()

  // DD/MM/YYYY (some Oriental Bank exports)
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const asMMDD = new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime()
    return asMMDD
  }

  // Try native parser as fallback
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  return Math.abs(parseFloat(raw.replace(/[$,"\s]/g, '')) || 0)
}

function clean(s: string): string {
  return (s || '').replace(/^"|"$/g, '').trim()
}

// ── Header fingerprint → bank detection ──────────────────────────────────────
type BankId = 'chase_cc' | 'chase_checking' | 'oriental' | 'capital_one' | 'discover' | 'sams'

function detectBank(headers: string[]): BankId | null {
  const h = headers.map(x => x.toLowerCase().trim())
  const has = (...terms: string[]) => terms.every(t => h.some(x => x.includes(t)))
  const hasAny = (...terms: string[]) => terms.some(t => h.some(x => x.includes(t)))

  // Discover: unique "trans. date" header
  if (hasAny('trans. date', 'trans.date')) return 'discover'

  // Oriental: Spanish headers
  if (hasAny('débito', 'debito', 'monto del débito', 'crédito', 'fecha')) return 'oriental'

  // Capital One: has "card no." or separate debit+credit columns with "transaction date"
  if (hasAny('card no.', 'card no')) return 'capital_one'
  if (has('transaction date') && hasAny('debit', 'credit') && !has('type')) return 'capital_one'

  // Sam's Club / Synchrony: has "reference no."
  if (hasAny('reference no.', 'reference no')) return 'sams'

  // Chase Checking: has "details" and "posting date"
  if (has('details') && hasAny('posting date', 'posting')) return 'chase_checking'

  // Chase CC: has "transaction date", "post date", "type", "amount" (no separate debit/credit)
  if (has('transaction date') && has('post date') && has('type') && has('amount')) return 'chase_cc'

  return null
}

// ── Individual parsers ────────────────────────────────────────────────────────

function parseChaseCC(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Headers: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
  const dateTs = parseDate(rows[0]?.[idx['transaction date']])
  const description = clean(rows[0]?.[idx['description']] || '')
  const amtRaw = clean(rows[0]?.[idx['amount']] || '0')
  const amtNum = parseFloat(amtRaw.replace(/[$,\s]/g, '')) || 0
  const category = clean(rows[0]?.[idx['category']] || '')
  const txType = clean(rows[0]?.[idx['type']] || '').toLowerCase()

  if (!dateTs) return { tx: null, err: `Fecha inválida: ${rows[0]?.[idx['transaction date']]}` }
  if (!description) return { tx: null }

  // Chase CC: negative = purchase (debit), positive = payment/credit
  let direction: 'debit' | 'credit'
  if (txType === 'payment' || txType === 'adjustment' || amtNum > 0) {
    direction = 'credit'
  } else {
    direction = 'debit'
  }

  return { tx: { date: dateTs, description, amount: Math.abs(amtNum), direction, category } }
}

function parseChaseChecking(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Headers: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
  const details = clean(rows[0]?.[idx['details']] || '').toLowerCase()
  const dateTs = parseDate(rows[0]?.[idx['posting date']])
  const description = clean(rows[0]?.[idx['description']] || '')
  const amtRaw = clean(rows[0]?.[idx['amount']] || '0')
  const amtNum = parseFloat(amtRaw.replace(/[$,\s]/g, '')) || 0

  if (!dateTs) return { tx: null, err: `Fecha inválida: ${rows[0]?.[idx['posting date']]}` }
  if (!description) return { tx: null }

  const direction: 'debit' | 'credit' = (details === 'credit' || amtNum > 0) ? 'credit' : 'debit'

  return { tx: { date: dateTs, description, amount: Math.abs(amtNum), direction, category: '' } }
}

function parseOriental(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Possible formats:
  // Format A: Fecha, Descripción, Referencia, Débito, Crédito, Balance
  // Format B: Date, Description, Reference, Debit, Credit, Balance
  const dateKey = idx['fecha'] !== undefined ? 'fecha' : idx['date'] !== undefined ? 'date' : ''
  const descKey = idx['descripción'] !== undefined ? 'descripción' : idx['description'] !== undefined ? 'description' : 'descripcion'
  const debitKey = ['débito', 'debito', 'monto del débito', 'monto del debito', 'debit', 'withdrawals', 'retiros'].find(k => idx[k] !== undefined) || ''
  const creditKey = ['crédito', 'credito', 'monto del crédito', 'monto del credito', 'credit', 'deposits', 'depósitos'].find(k => idx[k] !== undefined) || ''

  const dateTs = parseDate(rows[0]?.[idx[dateKey]])
  const description = clean(rows[0]?.[idx[descKey]] || '')
  const debitRaw = debitKey ? clean(rows[0]?.[idx[debitKey]] || '') : ''
  const creditRaw = creditKey ? clean(rows[0]?.[idx[creditKey]] || '') : ''
  const debitAmt = parseAmount(debitRaw)
  const creditAmt = parseAmount(creditRaw)

  if (!dateTs) return { tx: null, err: `Fecha inválida` }
  if (!description) return { tx: null }
  if (debitAmt === 0 && creditAmt === 0) return { tx: null }

  const direction: 'debit' | 'credit' = debitAmt > 0 ? 'debit' : 'credit'
  const amount = debitAmt > 0 ? debitAmt : creditAmt

  return { tx: { date: dateTs, description, amount, direction, category: '' } }
}

function parseCapitalOne(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Headers: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
  const dateKey = idx['transaction date'] !== undefined ? 'transaction date' : 'posted date'
  const dateTs = parseDate(rows[0]?.[idx[dateKey]])
  const description = clean(rows[0]?.[idx['description']] || '')
  const category = clean(rows[0]?.[idx['category']] || '')
  const debitRaw = clean(rows[0]?.[idx['debit']] || '')
  const creditRaw = clean(rows[0]?.[idx['credit']] || '')
  const debitAmt = parseAmount(debitRaw)
  const creditAmt = parseAmount(creditRaw)

  if (!dateTs) return { tx: null, err: `Fecha inválida: ${rows[0]?.[idx[dateKey]]}` }
  if (!description) return { tx: null }
  if (debitAmt === 0 && creditAmt === 0) return { tx: null }

  const direction: 'debit' | 'credit' = debitAmt > 0 ? 'debit' : 'credit'
  const amount = debitAmt > 0 ? debitAmt : creditAmt

  return { tx: { date: dateTs, description, amount, direction, category } }
}

function parseDiscover(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Headers: Trans. Date, Post Date, Description, Amount, Category
  const dateKey = Object.keys(idx).find(k => k.includes('trans')) || 'trans. date'
  const dateTs = parseDate(rows[0]?.[idx[dateKey]])
  const description = clean(rows[0]?.[idx['description']] || '')
  const category = clean(rows[0]?.[idx['category']] || '')
  const amtRaw = clean(rows[0]?.[idx['amount']] || '0')
  const amtNum = parseFloat(amtRaw.replace(/[$,\s]/g, '')) || 0

  if (!dateTs) return { tx: null, err: `Fecha inválida` }
  if (!description) return { tx: null }

  // Discover: negative = purchase (debit), positive = payment (credit)
  const direction: 'debit' | 'credit' = amtNum < 0 ? 'debit' : 'credit'
  return { tx: { date: dateTs, description, amount: Math.abs(amtNum), direction, category } }
}

function parseSams(rows: string[][], idx: Record<string, number>): { tx: CsvTransaction | null; err?: string } {
  // Headers: Transaction Date, Description, Category, Reference No., Amount
  const dateTs = parseDate(rows[0]?.[idx['transaction date']])
  const description = clean(rows[0]?.[idx['description']] || '')
  const category = clean(rows[0]?.[idx['category']] || '')
  const amtRaw = clean(rows[0]?.[idx['amount']] || '0')
  const amtNum = parseFloat(amtRaw.replace(/[$,\s]/g, '')) || 0

  if (!dateTs) return { tx: null, err: `Fecha inválida` }
  if (!description) return { tx: null }

  // Sam's: negative = charge (debit), positive = payment (credit)
  const direction: 'debit' | 'credit' = amtNum < 0 ? 'debit' : 'credit'
  return { tx: { date: dateTs, description, amount: Math.abs(amtNum), direction, category } }
}

// ── Main export ───────────────────────────────────────────────────────────────
export function parseCSV(text: string): CsvParseResult {
  const errors: string[] = []

  // Normalize line endings, skip BOM
  const clean2 = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean2.split('\n').filter(l => l.trim())

  if (lines.length < 2) {
    return { bank: 'Desconocido', suggestedAccountKey: '', transactions: [], parseErrors: ['Archivo vacío o sin datos'] }
  }

  // Find header row (skip leading info rows from some banks)
  let headerIdx = 0
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = parseCSVLine(lines[i]).map(c => c.toLowerCase())
    if (cols.some(c => ['date', 'fecha', 'transaction date', 'trans. date', 'details', 'posting date'].some(k => c.includes(k)))) {
      headerIdx = i
      break
    }
  }

  const rawHeaders = parseCSVLine(lines[headerIdx])
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/^"|"$/g, '').trim())
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => { idx[h] = i })

  const bank = detectBank(headers)
  if (!bank) {
    return {
      bank: 'Desconocido',
      suggestedAccountKey: '',
      transactions: [],
      parseErrors: [`Formato no reconocido. Headers: ${headers.join(', ')}`]
    }
  }

  const bankNames: Record<BankId, string> = {
    chase_cc: 'Chase (Tarjeta de crédito)',
    chase_checking: 'Chase (Checking)',
    oriental: 'Oriental Bank',
    capital_one: 'Capital One',
    discover: 'Discover',
    sams: "Sam's Club Mastercard",
  }

  const accountKeys: Record<BankId, string> = {
    chase_cc: 'chase_visa',
    chase_checking: 'chase_checking',
    oriental: 'oriental_checking',
    capital_one: 'capital_one_savor',
    discover: 'discover',
    sams: 'sams_mastercard',
  }

  const parsers: Record<BankId, (rows: string[][], idx: Record<string, number>) => { tx: CsvTransaction | null; err?: string }> = {
    chase_cc: parseChaseCC,
    chase_checking: parseChaseChecking,
    oriental: parseOriental,
    capital_one: parseCapitalOne,
    discover: parseDiscover,
    sams: parseSams,
  }

  const transactions: CsvTransaction[] = []
  const dataLines = lines.slice(headerIdx + 1)

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line)
    if (cols.every(c => !c)) continue

    const { tx, err } = parsers[bank]([[...cols]], idx)
    if (tx && tx.amount > 0) {
      transactions.push(tx)
    } else if (err) {
      errors.push(`Fila ${i + headerIdx + 2}: ${err}`)
    }
  }

  return {
    bank: bankNames[bank],
    suggestedAccountKey: accountKeys[bank],
    transactions,
    parseErrors: errors,
  }
}
