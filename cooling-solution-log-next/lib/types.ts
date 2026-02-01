// ============================================
// TIPOS BASE
// ============================================

export type EventType = 'expense' | 'income'
export type EventStatus = 'pending' | 'completed'

export type EventSubtype = 
  | 'gas'           // Gasolina
  | 'food'          // Comida
  | 'maintenance'   // Vehículos
  | 'service'       // Trabajo/servicios
  | 'materials'     // Materiales
  | 'insurance'     // Seguros
  | 'payroll'       // Nómina
  | 'tools'         // Herramientas
  | 'other'         // Otro

export type PaymentMethod = 
  | 'cash'
  | 'ath_movil'
  | 'business_card'
  | 'sams_card'
  | 'paypal'
  | 'personal_card'
  | 'other'

export type VehicleId = 'transit' | 'f150' | 'bmw' | 'other'

// ============================================
// EVENTOS (tabla principal - compatible con existente)
// ============================================

export interface EventRecord {
  id?: number
  timestamp: number
  type: EventType
  status: EventStatus
  subtype?: EventSubtype
  category: string
  amount: number
  
  // Relaciones
  client_id?: number
  employee_id?: number
  job_id?: number
  vehicle_id?: number
  
  // Campos generales
  payment_method?: PaymentMethod | string
  vendor?: string
  client?: string  // legacy - mantener por compatibilidad
  note?: string
  raw_text?: string
  
  // Extras
  metadata?: any
  photo?: string  // base64
}

// ============================================
// CLIENTES
// ============================================

export interface Client {
  id?: number
  first_name: string
  last_name: string
  phone?: string
  email?: string
  address?: string
  type: 'residential' | 'commercial'
  notes?: string
  created_at: number
  active: boolean
}

// ============================================
// EMPLEADOS
// ============================================

export interface Employee {
  id?: number
  first_name: string
  last_name: string
  phone?: string
  default_daily_rate: number  // 300
  retention_percent: number   // 10
  specialties?: string        // JSON string: ["instalación", "refrigeración"]
  active: boolean
  created_at: number
}

// ============================================
// TRABAJOS/SERVICIOS
// ============================================

export interface Job {
  id?: number
  client_id: number
  date: number
  type: 'installation' | 'repair' | 'maintenance' | 'emergency' | 'warranty' | 'quote'
  status: 'quote' | 'in_progress' | 'completed' | 'cancelled'
  
  // Servicios
  services: JobService[]
  
  // Materiales
  materials: JobMaterial[]
  
  // Empleados que trabajaron
  employees: JobEmployee[]
  
  // Totales
  subtotal_services: number
  subtotal_materials: number
  tax?: number
  total_charged: number
  
  // Pagos
  payment_status: 'pending' | 'partial' | 'paid'
  payments: JobPayment[]
  balance_due: number
  
  // Otros
  vehicle_used?: VehicleId
  notes?: string
  created_at: number
}

export interface JobService {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface JobMaterial {
  item: string
  quantity: number
  unit_cost: number
  unit_price: number
  supplier?: string
}

export interface JobEmployee {
  employee_id: number
  days_worked: number
  daily_rate: number
  retention_percent: number
  total_gross: number
  total_net: number
}

export interface JobPayment {
  date: number
  amount: number
  method: PaymentMethod
}

// ============================================
// VEHÍCULOS
// ============================================

export interface Vehicle {
  id?: number
  name: VehicleId
  display_name: string
  plate?: string
  
  // Seguro
  insurance_company?: string
  insurance_renewal_date?: number
  insurance_last_payment?: number
  insurance_last_amount?: number
  
  // Mantenimiento
  last_oil_change?: number
  last_oil_change_mileage?: number
  
  notes?: string
  active: boolean
  created_at: number
}

// ============================================
// CONTRATOS RECURRENTES
// ============================================

export interface RecurringContract {
  id?: number
  client_id: number
  service_type: string
  frequency: 'monthly' | 'quarterly'
  monthly_fee: number
  start_date: number
  next_service_due: number
  auto_reminder_days: number
  status: 'active' | 'cancelled'
  created_at: number
}