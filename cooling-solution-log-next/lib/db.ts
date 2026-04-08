import Dexie from 'dexie'
import type {
  EventRecord,
  Client,
  Employee,
  Job,
  Vehicle,
  RecurringContract,
  ContractServiceRecord,
  Note,
  Appointment,
  Reminder,
  Invoice,
  JobTemplate,
  ClientPhoto,
  ClientDocument,
  ClientLocation,
  BitacoraEntry,
  Warranty,
  InventoryItem,
  InventoryMovement,
  InvoiceBatch
} from './types'

export interface SyncQueueItem {
  id?: number
  timestamp: number
  status: 'pending' | 'synced' | 'failed'
  retries: number
}

export interface ScannedDoc {
  id?: number
  name: string
  driveFileId?: string
  status: 'pending' | 'processing' | 'processed' | 'error'
  scannedAt: number
  processedAt?: number
  eventId?: number
  clientName?: string
  notes?: string
  thumbnailUrl?: string
  created_at: number
}

export interface ScanFile {
  id?: number
  docId: number
  fileData: string // base64
  mimeType: string
  created_at: number
}

export interface ProductPrice {
  id?: number
  product_name: string      // nombre normalizado: "Filtro Poly AC"
  aliases?: string[]         // otros nombres: ["poly", "rollo de filtros", "filter media"]
  vendor: string             // "Refricentro", "Oldach", "Johnstone Supply"
  unit_price: number         // precio por unidad
  quantity: number           // cantidad comprada
  unit?: string              // "rollo", "und", "caja", "pie"
  total_price: number        // unit_price * quantity
  client_for?: string        // para qué cliente se compró
  category?: string          // "Materiales", "Herramientas", etc.
  notes?: string
  timestamp: number
  created_at: number
}

export interface BankAccount {
  id?: number
  name: string                     // "Chase Ink"
  institution: string              // "Chase"
  type: 'checking' | 'credit' | 'paypal' | 'savings'
  last_four?: string               // "5536"
  payment_method_key?: string      // maps to events.payment_method: "chase_visa"
  active: boolean
  created_at: number
}

export interface BankStatement {
  id?: number
  account_id?: number
  account_name: string             // "chase_visa"
  period_start: number             // epoch ms of first tx
  period_end: number               // epoch ms of last tx
  period_label: string             // "Marzo 2026"
  opening_balance?: number
  closing_balance?: number
  total_debits?: number
  total_credits?: number
  tx_count?: number
  status: 'imported' | 'reconciled'
  pdf_pages?: string[]             // base64 JPEG pages of original statement PDF
  created_at: number
}

export interface BankTransaction {
  id?: number
  statement_id?: number
  account_id?: number
  account_name: string
  date: number
  description: string
  amount: number
  direction: 'debit' | 'credit'
  category: string
  match_status: 'pending' | 'matched' | 'probable' | 'unmatched'
  match_event_id?: number
  match_type?: string
  created_at: number
}

export interface Equipment {
  id?: number
  client_name: string
  client_id?: number
  location_id?: number            // link to client_locations.id
  location: string
  equipment_type: string          // "Package Unit", "Mini Split", "Walking Cooler Evaporator", etc.
  brand: string
  model: string
  serial_number: string
  status: 'active' | 'inactive' | 'replaced'
  maintenance_interval_months: number  // 1, 3, 6, 12
  last_service_date?: number      // epoch ms
  next_service_due?: number       // epoch ms — auto-calculated
  notes?: string
  created_at: number
  updated_at?: number
}

export interface MaintenanceLog {
  id?: number
  equipment_id: number
  client_name: string
  client_id?: number
  log_type: 'maintenance' | 'repair'   // NEW: distinguishes scheduled PM from repairs
  maintenance_type: 'cleaning' | 'deep_cleaning' | 'repair' | 'inspection' | 'other'
  date: number
  notes?: string
  technician: string
  photos?: string[]
  // Repair-specific fields (only used when log_type === 'repair')
  diagnosis?: string
  parts_replaced?: string[]
  parameters_set?: string
  labor_hours?: number
  repair_notes?: string
  created_at: number
}

export interface EmployeePayment {
  id?: number
  employee_id: number
  employee_name: string         // denormalized for display
  date: number                  // epoch ms
  description: string           // "Farmacia Caridad #40 – instalación"
  days_worked: number
  daily_rate: number
  amount_gross: number          // days_worked * daily_rate
  retention_percent: number     // 10 for 480.6B
  retention_amount: number      // amount_gross * retention_percent / 100
  amount_net: number            // amount_gross - retention_amount
  payment_method?: string
  job_id?: number               // optional link to jobs table
  event_id?: number             // link to events table if imported from there
  notes?: string
  created_at: number
}

export interface CreditCard {
  id?: number
  name: string            // "Chase Ink"
  last4: string           // "5536"
  closing_day: number     // day of month (1-31)
  payment_due_day: number // day of month (1-31) of the month AFTER closing
  current_balance: number
  minimum_payment: number
  credit_limit: number
  active: boolean
  updated_at?: number
}

export class CoolingDB extends Dexie {
  events!: Dexie.Table<EventRecord, number>
  clients!: Dexie.Table<Client, number>
  employees!: Dexie.Table<Employee, number>
  jobs!: Dexie.Table<Job, number>
  vehicles!: Dexie.Table<Vehicle, number>
  contracts!: Dexie.Table<RecurringContract, number>
  sync_queue!: Dexie.Table<SyncQueueItem, number>
  notes!: Dexie.Table<Note, number>
  appointments!: Dexie.Table<Appointment, number>
  reminders!: Dexie.Table<Reminder, number>
  invoices!: Dexie.Table<Invoice, number>
  job_templates!: Dexie.Table<JobTemplate, number>
  client_photos!: Dexie.Table<ClientPhoto, number>
  client_documents!: Dexie.Table<ClientDocument, number>
  client_locations!: Dexie.Table<ClientLocation, number>
  bitacora!: Dexie.Table<BitacoraEntry, number>
  warranties!: Dexie.Table<Warranty, number>
  scanned_docs!: Dexie.Table<ScannedDoc, number>
  scan_files!: Dexie.Table<ScanFile, number>
  product_prices!: Dexie.Table<ProductPrice, number>
  equipment!: Dexie.Table<Equipment, number>
  maintenance_logs!: Dexie.Table<MaintenanceLog, number>
  bank_accounts!: Dexie.Table<BankAccount, number>
  bank_statements!: Dexie.Table<BankStatement, number>
  bank_transactions!: Dexie.Table<BankTransaction, number>
  vendor_aliases!: Dexie.Table<any, number>
  employee_payments!: Dexie.Table<EmployeePayment, number>
  contract_service_records!: Dexie.Table<ContractServiceRecord, number>
  inventory_items!: Dexie.Table<InventoryItem, number>
  inventory_movements!: Dexie.Table<InventoryMovement, number>
  invoice_batches!: Dexie.Table<InvoiceBatch, number>
  credit_cards!: Dexie.Table<CreditCard, number>
  constructor() {
    super('CoolingSolutionDB')
    
    this.version(1).stores({
      events: '++id,timestamp,type,status,category,amount,vendor,payment_method,client'
    })
    
    this.version(2).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,vendor,payment_method,client'
    })
    
    this.version(3).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at'
    })

    this.version(4).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status'
    })

    this.version(5).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at',
      reminders: '++id,timestamp,due_date,completed,priority,created_at'
    })

    this.version(6).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at'
    })

    this.version(7).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at',
      job_templates: '++id,name,client_id,active,created_at,updated_at'
    })

    this.version(8).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at',
      job_templates: '++id,name,client_id,active,created_at,updated_at',
      client_photos: '++id,client_id,client_name,job_id,invoice_id,category,timestamp,created_at'
    })

    this.version(9).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at',
      job_templates: '++id,name,client_id,active,created_at,updated_at',
      client_photos: '++id,client_id,client_name,job_id,invoice_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at'
    })

    this.version(10).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type,location_id',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at,location_id',
      job_templates: '++id,name,client_id,active,created_at,updated_at',
      client_photos: '++id,client_id,client_name,job_id,invoice_id,category,timestamp,created_at,location_id',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at'
    })

    this.version(11).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method,expense_type,location_id',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,priority,created_at',
      invoices: '++id,invoice_number,type,client_id,client_name,status,issue_date,due_date,created_at,updated_at,location_id',
      job_templates: '++id,name,client_id,active,created_at,updated_at',
      client_photos: '++id,client_id,client_name,job_id,invoice_id,category,timestamp,created_at,location_id',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at'
    })

    this.version(12).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at'
    })

    this.version(13).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      quick_quotes: '++id,client_name,client_id,status,created_at'
    })

    // Version 14 - Add scanner tables, remove quick_quotes
    this.version(14).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      quick_quotes: null, // DELETE table
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at'
    })

    // Version 15 - Add product prices tracking
    this.version(15).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at'
    })

    // Version 16 - Equipment tracking & preventive maintenance
    this.version(16).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location,equipment_type,brand,model,serial_number,status,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at'
    })

    // Version 18 - Full bank reconciliation system
    this.version(18).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location,equipment_type,brand,model,serial_number,status,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,period_start,period_end,opening_balance,closing_balance,total_debits,total_credits,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at'
    })

    // Version 19 - Vendor aliases for reconciliation
    this.version(19).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location,equipment_type,brand,model,serial_number,status,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,period_start,period_end,opening_balance,closing_balance,total_debits,total_credits,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at'
    })

    // Version 20 — bank_statements gains account_name index for dedup queries
    this.version(20).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location,equipment_type,brand,model,serial_number,status,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at'
    })

    // Version 23 — Contracts: expand indexes + service records table
    this.version(23).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,client_name,status,next_service_due,frequency,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location_id,location,equipment_type,brand,model,serial_number,status,next_service_due,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at',
      employee_payments: '++id,employee_id,employee_name,date,job_id,event_id,created_at',
      contract_service_records: '++id,contract_id,client_name,date,invoice_id,event_id,created_at'
    })

    // Version 24 — Inventory management
    this.version(24).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,client_name,status,next_service_due,frequency,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location_id,location,equipment_type,brand,model,serial_number,status,next_service_due,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at',
      employee_payments: '++id,employee_id,employee_name,date,job_id,event_id,created_at',
      contract_service_records: '++id,contract_id,client_name,date,invoice_id,event_id,created_at',
      inventory_items: '++id,name,category,location,supplier,active,created_at',
      inventory_movements: '++id,item_id,item_name,type,date,job_id,created_at'
    })

    // Version 22 — Employee payments table for 480.6B tracking
    this.version(22).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location_id,location,equipment_type,brand,model,serial_number,status,next_service_due,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at',
      employee_payments: '++id,employee_id,employee_name,date,job_id,event_id,created_at'
    })

    // Version 21 — Equipment: add location_id, maintenance_interval_months, next_service_due
    this.version(21).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,*tags,*clients_mentioned,*locations,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location_id,location,equipment_type,brand,model,serial_number,status,next_service_due,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at'
    })

    // Version 25 — Bitácora: add invoice_pending index
    this.version(25).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client,employee_id,job_id,vehicle_id,payment_method,expense_type',
      clients: '++id,first_name,last_name,phone,type,active,created_at,updated_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at,location_id',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,client_name,status,next_service_due,frequency,created_at',
      sync_queue: '++id,timestamp,status',
      notes: '++id,timestamp,updated_at',
      appointments: '++id,timestamp,date,client_id,status,created_at,location_id',
      reminders: '++id,timestamp,due_date,completed,created_at',
      invoices: '++id,invoice_number,type,client_name,status,issue_date,created_at',
      job_templates: '++id,name,active,created_at',
      client_photos: '++id,client_id,client_name,job_id,category,timestamp,created_at',
      client_documents: '++id,client_id,client_name,job_id,invoice_id,doc_type,file_name,timestamp,created_at',
      client_locations: '++id,client_id,name,city,is_primary,active,created_at',
      bitacora: '++id,date,invoice_pending,*tags,*clients_mentioned,created_at',
      warranties: '++id,equipment_type,brand,vendor,client_name,client_id,status,purchase_date,expiration_date,created_at',
      scanned_docs: '++id,name,driveFileId,status,scannedAt,processedAt,created_at',
      scan_files: '++id,docId,created_at',
      product_prices: '++id,product_name,vendor,unit_price,client_for,category,timestamp,created_at',
      equipment: '++id,client_name,client_id,location_id,location,equipment_type,brand,model,serial_number,status,next_service_due,created_at',
      maintenance_logs: '++id,equipment_id,client_name,client_id,maintenance_type,date,created_at',
      bank_accounts: '++id,name,type,institution,last_four,payment_method_key,active,created_at',
      bank_statements: '++id,account_id,account_name,period_start,period_end,status,created_at',
      bank_transactions: '++id,statement_id,account_id,account_name,date,description,amount,direction,category,match_status,match_event_id,match_type,created_at',
      vendor_aliases: '++id,canonical_name,*aliases,category,created_at',
      employee_payments: '++id,employee_id,employee_name,date,job_id,event_id,created_at',
      contract_service_records: '++id,contract_id,client_name,date,invoice_id,event_id,created_at',
      inventory_items: '++id,name,category,location,supplier,active,created_at',
      inventory_movements: '++id,item_id,item_name,type,date,job_id,created_at'
    })

    // Version 26 — Invoice batches (lotes de facturación)
    this.version(26).stores({
      invoice_batches: '++id,client_name,client_id,status,created_at'
    })

    // Version 27 — maintenance_logs: add log_type index for repair/maintenance split
    this.version(27).stores({
      maintenance_logs: '++id,equipment_id,client_name,client_id,log_type,maintenance_type,date,created_at'
    })

    // Version 28 — credit_cards table with initial seed data
    this.version(28).stores({
      credit_cards: '++id,active'
    }).upgrade(async tx => {
      const now = Date.now()
      const initial: Omit<CreditCard, 'id'>[] = [
        { name: 'PayPal Mastercard',           last4: '7711', closing_day: 10, payment_due_day: 2,  current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
        { name: "Sam's Club Mastercard",        last4: '7073', closing_day: 16, payment_due_day: 8,  current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
        { name: 'Chase Ink',                    last4: '5536', closing_day: 17, payment_due_day: 11, current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
        { name: 'Capital One Savor',            last4: '2905', closing_day: 19, payment_due_day: 13, current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
        { name: 'Discover Chrome',              last4: '8885', closing_day: 17, payment_due_day: 14, current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
        { name: 'Capital One Quicksilver',      last4: '2214', closing_day: 27, payment_due_day: 21, current_balance: 0, minimum_payment: 0, credit_limit: 0, active: true, updated_at: now },
      ]
      for (const card of initial) {
        await tx.table('credit_cards').add(card)
      }
    })
  }
}

export const db = new CoolingDB()