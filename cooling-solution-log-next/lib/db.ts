import Dexie from 'dexie'
import type { 
  EventRecord, 
  Client, 
  Employee, 
  Job, 
  Vehicle, 
  RecurringContract,
  Note,
  Appointment,
  Reminder,
  Invoice,
  JobTemplate,
  ClientPhoto,
  ClientDocument,
  ClientLocation,
  BitacoraEntry,
  Warranty
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
  equipment!: Dexie.Table<any, number>
  maintenance_logs!: Dexie.Table<any, number>
  bank_accounts!: Dexie.Table<any, number>
  bank_statements!: Dexie.Table<any, number>
  bank_transactions!: Dexie.Table<any, number>
  vendor_aliases!: Dexie.Table<any, number>
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


bank_transactions: '++id,account,transaction_type,date,amount,description,match_status,match_event_id,session_id,created_at'
  
  

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
  }
}

export const db = new CoolingDB()