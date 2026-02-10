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
  Warranty,
  QuickQuote
  
} from './types'

export interface SyncQueueItem {
  id?: number
  timestamp: number
  status: 'pending' | 'synced' | 'failed'
  retries: number
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
  quick_quotes!: Dexie.Table<QuickQuote, number>

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

    // Version 8 - Add client_photos for before/after photos
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

    // Version 9 - Add client_documents for contracts, permits, etc.
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

    // Version 10 - Add client_locations and bitacora
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

    // Version 11 - receipt_photos field in events (non-indexed, stored as array in record)
    // No schema change needed - receipt_photos is a non-indexed field stored directly in the event record
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
    // Version 12 - Warranties
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
  }
}


export const db = new CoolingDB()