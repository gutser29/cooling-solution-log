export type EventType = 'expense' | 'income'
export type EventStatus = 'pending' | 'completed'
export type PaymentMethod = string
export type VehicleId = 'transit' | 'f150' | 'bmw' | 'other'

export interface EventRecord {
  id?: number
  timestamp: number
  type: EventType
  status: EventStatus
  subtype?: string
  category: string
  amount: number
  client_id?: number
  employee_id?: number
  job_id?: number
  vehicle_id?: string
  payment_method?: string
  vendor?: string
  client?: string
  note?: string
  raw_text?: string
  photo?: string
  metadata?: any
  expense_type?: 'personal' | 'business'
  location_id?: number
  receipt_photos?: string[]
}

// ========== CLIENT LOCATIONS ==========

export interface ClientLocation {
  id?: number
  client_id: number
  name: string               // "Tienda #32", "Casa Bayamón", "Oficina Principal"
  address: string
  city?: string
  zip?: string
  latitude?: number
  longitude?: number
  access_instructions?: string  // "Decirle al guardia que viene de Cooling Solution, código portón: 1234"
  contact_person?: string       // Persona de contacto en esa ubicación
  contact_phone?: string
  equipment_info?: string       // "2x Mini split 12k BTU Carrier, 1x Central 3 ton Trane"
  last_service_date?: number
  next_service_due?: number
  notes?: string
  is_primary: boolean
  active: boolean
  created_at: number
  updated_at?: number
}

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
  updated_at?: number
  active: boolean
}

export interface Employee {
  id?: number
  first_name: string
  last_name: string
  phone?: string
  default_daily_rate: number
  retention_percent: number
  specialties?: string
  active: boolean
  created_at: number
}

export interface Job {
  id?: number
  client_id: number
  date: number
  type: 'installation' | 'repair' | 'maintenance' | 'emergency' | 'warranty' | 'quote'
  status: 'quote' | 'in_progress' | 'completed' | 'cancelled'
  services: JobService[]
  materials: JobMaterial[]
  employees: JobEmployee[]
  subtotal_services: number
  subtotal_materials: number
  tax?: number
  total_charged: number
  payment_status: 'pending' | 'partial' | 'paid'
  payments: JobPayment[]
  balance_due: number
  vehicle_used?: VehicleId
  notes?: string
  created_at: number
  location_id?: number
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
  method: string
}

export interface Vehicle {
  id?: number
  name: VehicleId
  display_name: string
  plate?: string
  insurance_company?: string
  insurance_renewal_date?: number
  insurance_last_payment?: number
  insurance_last_amount?: number
  last_oil_change?: number
  last_oil_change_mileage?: number
  notes?: string
  active: boolean
  created_at: number
}

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

export interface Note {
  id?: number
  timestamp: number
  title?: string
  content: string
  tags?: string[]
  updated_at: number
}

export interface Appointment {
  id?: number
  timestamp: number
  date: number
  end_date?: number
  client_id?: number
  client_name?: string
  title: string
  location?: string
  notes?: string
  status: 'scheduled' | 'completed' | 'cancelled'
  reminder_minutes?: number
  created_at: number
  location_id?: number
}

export interface Reminder {
  id?: number
  timestamp: number
  text: string
  due_date: number
  completed: boolean
  priority: 'low' | 'normal' | 'high'
  created_at: number
}

// ========== INVOICING ==========

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id?: number
  invoice_number: string
  type: 'invoice' | 'quote'
  client_id?: number
  client_name: string
  client_phone?: string
  client_email?: string
  client_address?: string
  job_id?: number
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  notes?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  issue_date: number
  due_date?: number
  expiration_date?: number
  paid_date?: number
  paid_method?: string
  created_at: number
  updated_at: number
  location_id?: number
}

// ========== JOB TEMPLATES ==========

export interface JobTemplateItem {
  description: string
  quantity: number
  unit_price: number
}

export interface JobTemplate {
  id?: number
  name: string
  client_id?: number
  client_name?: string
  items: JobTemplateItem[]
  notes?: string
  default_tax_rate: number
  active: boolean
  created_at: number
  updated_at: number
}

// ========== CLIENT PHOTOS ==========

export interface ClientPhoto {
  id?: number
  client_id?: number
  client_name?: string
  job_id?: number
  invoice_id?: number
  category: 'before' | 'after' | 'diagnostic' | 'receipt' | 'equipment' | 'area' | 'other'
  description?: string
  photo_data: string
  timestamp: number
  visit_date?: number
  location?: string
  equipment_type?: string
  created_at: number
  location_id?: number
}

// ========== CLIENT DOCUMENTS ==========

export interface ClientDocument {
  id?: number
  client_id?: number
  client_name?: string
  employee_id?: number
  employee_name?: string
  job_id?: number
  invoice_id?: number
  doc_type: 'contract' | 'permit' | 'warranty' | 'manual' | 'receipt' | 'agreement' | 'other'
  file_name: string
  file_type: string
  file_data: string
  description?: string
  expiration_date?: number
  timestamp: number
  created_at: number
}

// ========== BITÁCORA ==========

export interface BitacoraEntry {
  id?: number
  date: string                  // "2026-02-07"
  raw_text: string              // Texto original del usuario
  summary: string               // Resumen organizado por AI
  tags: string[]                // mantenimiento, instalación, compras...
  clients_mentioned: string[]   // Nombres de clientes
  locations: string[]           // Ciudades, barrios
  equipment: string[]           // Equipos mencionados
  jobs_count: number
  hours_estimated: number
  had_emergency: boolean
  highlights: string[]          // Puntos importantes del día
  created_at: number
  updated_at?: number
}