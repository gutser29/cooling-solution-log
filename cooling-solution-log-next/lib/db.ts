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
  JobTemplate
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

    // Version 6 - Batch 3: Invoices & Quotes
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

    // Version 7 - Job Templates
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
  }
}

export const db = new CoolingDB()