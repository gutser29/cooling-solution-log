import Dexie, { type Table } from 'dexie'
import type { EventRecord } from './types'

export class CoolingDB extends Dexie {
  events!: Table<EventRecord, number>

  constructor() {
    super('CoolingSolutionDB')

    this.version(1).stores({
      // ++id = autoincrement
      events: '++id,timestamp,type,status,category,amount,vendor,payment_method,client,note,raw_text',
    })

    this.events = this.table('events')
  }
}

export const db = new CoolingDB()
