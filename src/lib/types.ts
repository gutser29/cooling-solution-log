export type EventType = 'expense' | 'income'
export type EventStatus = 'completed' | 'pending'

export interface EventRecord {
  id?: number
  timestamp: number
  type: EventType
  status: EventStatus
  category: string
  amount: number
  vendor?: string
  payment_method?: string
  client?: string
  note?: string
  raw_text?: string
}
