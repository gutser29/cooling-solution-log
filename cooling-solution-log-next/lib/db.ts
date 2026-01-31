import Dexie from 'dexie'
import type { EventRecord } from './types'

export class CoolingDB extends Dexie {
  events!: Dexie.Table<EventRecord, number>

  constructor() {
    super('CoolingSolutionDB')
    
    this.version(1).stores({
      events: '++id,timestamp,type,status,category,amount,vendor,payment_method,client'
    })
    
    this.version(2).stores({
      events: '++id,timestamp,type,status,subtype,category,amount,vendor,payment_method,client'
    })
  }
}

export const db = new CoolingDB()