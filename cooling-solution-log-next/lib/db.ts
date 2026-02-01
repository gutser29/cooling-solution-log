import Dexie from 'dexie'
import type { 
  EventRecord, 
  Client, 
  Employee, 
  Job, 
  Vehicle, 
  RecurringContract 
} from './types'

export class CoolingDB extends Dexie {
  // Tablas
  events!: Dexie.Table<EventRecord, number>
  clients!: Dexie.Table<Client, number>
  employees!: Dexie.Table<Employee, number>
  jobs!: Dexie.Table<Job, number>
  vehicles!: Dexie.Table<Vehicle, number>
  contracts!: Dexie.Table<RecurringContract, number>

  constructor() {
    super('CoolingSolutionDB')
    
    // Version 1 - original (eventos)
    this.version(1).stores({
      events: '++id,timestamp,type,status,category,amount,vendor,payment_method,client'
    })
    
    // Version 2 - agregar subtype
    this.version(2).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,vendor,payment_method,client'
    })
    
    // Version 3 - tablas expandidas (NUEVA)
    this.version(3).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,client_id,employee_id,job_id,vehicle_id,payment_method',
      clients: '++id,first_name,last_name,phone,type,active,created_at',
      employees: '++id,first_name,last_name,active,created_at',
      jobs: '++id,client_id,date,status,payment_status,created_at',
      vehicles: '++id,name,active,created_at',
      contracts: '++id,client_id,status,next_service_due,created_at'
    })
  }
}

export const db = new CoolingDB()