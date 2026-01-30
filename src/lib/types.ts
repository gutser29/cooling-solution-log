export type EventType = 'expense' | 'income'
export type EventStatus = 'pending' | 'completed'

// NUEVO: Subtipos específicos
export type EventSubtype = 
  | 'gas'
  | 'food'
  | 'maintenance'
  | 'service'
  | 'materials'
  | 'other'

// NUEVO: Métodos de pago
export type PaymentMethod = 
  | 'cash'
  | 'ath_movil'
  | 'business_card'
  | 'sams_card'
  | 'paypal'
  | 'personal_card'
  | 'other'

// NUEVO: Vehículos
export type VehicleId = 'transit' | 'f150' | 'bmw' | 'other'

export interface EventRecord {
  id?: number
  timestamp: number
  type: EventType
  status: EventStatus
  subtype?: EventSubtype  // NUEVO (opcional para compatibilidad)
  category: string
  amount: number
  payment_method?: PaymentMethod | string  // acepta ambos
  vendor?: string
  client?: string
  note?: string
  raw_text?: string
  metadata?: any  // NUEVO
  photo?: string  // NUEVO
}