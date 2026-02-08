'use client'

import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/db'
import type { Client } from '@/lib/types'

interface ExpensesPageProps {
  onNavigate: (page: string) => void
}

const compressImage = (base64: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.src = base64
  })
}

export default function ExpensesPage({ onNavigate }: ExpensesPageProps) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Gasolina')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined)
  const [vendor, setVendor] = useState('')
  const [expenseType, setExpenseType] = useState<'business' | 'personal'>('business')
  const [notes, setNotes] = useState('')
  const [receiptPhotos, setReceiptPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const categories = ['Gasolina', 'Comida', 'Materiales', 'Herramientas', 'Peajes', 'Mantenimiento', 'Seguros', 'Nómina', 'Otros']
  
  const paymentMethods = [
    { value: 'cash', label: 'Efectivo' },
    { value: 'capital_one', label: 'Capital One' },
    { value: 'chase_visa', label: 'Chase Visa' },
    { value: 'ath_movil', label: 'ATH Móvil' },
    { value: 'sams_mastercard', label: "Sam's MC" },
    { value: 'paypal', label: 'PayPal' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'check', label: 'Cheque' }
  ]

  useEffect(() => {
    const loadClients = async () => {
      const cls = await db.clients.where('active').equals(1).toArray()
      setClients(cls)
    }
    loadClients()
  }, [])

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const compressed = await compressImage(b64)
      setReceiptPhotos(prev => [...prev, compressed])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (idx: number) => {
    setReceiptPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  const pickClient = (c: Client) => {
    setSelectedClientId(c.id)
    setSelectedClientName(`${c.first_name} ${c.last_name}`)
    setShowClientPicker(false)
    setClientSearch('')
  }

  const clearClient = () => {
    setSelectedClientId(undefined)
    setSelectedClientName('')
  }

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Ingresa un monto válido')
      return
    }

    setSaving(true)

    try {
      const now = Date.now()
      
      // Guardar evento con fotos incluidas directamente (NO duplicar en client_photos)
      await db.events.add({
        timestamp: now,
        type: 'expense',
        status: 'completed',
        subtype: category === 'Gasolina' ? 'gas' : category === 'Comida' ? 'food' : 'other',
        category,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        vehicle_id: vehicleId,
        vendor: vendor || undefined,
        note: notes || undefined,
        expense_type: expenseType,
        receipt_photos: receiptPhotos.length > 0 ? receiptPhotos : undefined,
        client_id: selectedClientId,
        client: selectedClientName || undefined
      })

      alert('✅ Gasto guardado' + (receiptPhotos.length > 0 ? ` con ${receiptPhotos.length} foto(s)` : ''))
      
      setAmount('')
      setCategory('Gasolina')
      setPaymentMethod('cash')
      setVehicleId(undefined)
      setVendor('')
      setNotes('')
      setExpenseType('business')
      setReceiptPhotos([])
      setSelectedClientId(undefined)
      setSelectedClientName('')
      
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('Error al guardar gasto')
    } finally {
      setSaving(false)
    }
  }

  // Show client picker for material categories
  const showClientOption = ['Materiales', 'Herramientas', 'Mantenimiento'].includes(category)

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('chat')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">💵 Añadir Gasto</h1>
        </div>
        <button onClick={() => onNavigate('chat')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">💬</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5 space-y-4">
          {/* Monto */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Monto *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg pl-8 pr-3 py-3 text-lg font-medium"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Categoría *</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Cliente (para materiales/herramientas) */}
          {showClientOption && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs text-gray-400">👤 Cliente (opcional)</label>
                {selectedClientName ? (
                  <button onClick={clearClient} className="text-xs text-red-400">✕ Quitar</button>
                ) : (
                  <button onClick={() => setShowClientPicker(!showClientPicker)} className="text-xs text-blue-400">
                    {showClientPicker ? 'Cerrar' : '📋 Elegir'}
                  </button>
                )}
              </div>
              {selectedClientName && (
                <div className="bg-[#0b1220] rounded-lg px-3 py-2 text-sm text-gray-300 border border-blue-800/30">
                  👤 {selectedClientName}
                </div>
              )}
              {showClientPicker && !selectedClientName && (
                <div className="bg-[#0b1220] rounded-lg p-3 border border-white/10">
                  <input
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {clients.filter(c => {
                      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
                      return !clientSearch || name.includes(clientSearch.toLowerCase())
                    }).map(c => (
                      <button key={c.id} onClick={() => pickClient(c)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-white/10 text-gray-300">
                        {c.first_name} {c.last_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Método de Pago */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Método de Pago *</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {paymentMethods.map(pm => (
                <option key={pm.value} value={pm.value}>{pm.label}</option>
              ))}
            </select>
          </div>

          {/* Vehículo (solo si es gasolina) */}
          {category === 'Gasolina' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Vehículo</label>
              <select
                value={vehicleId || ''}
                onChange={e => setVehicleId(e.target.value || undefined)}
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                <option value="van">🚐 Van/Camioneta</option>
                <option value="car">🚗 Carro</option>
                <option value="truck">🛻 Pickup/Truck</option>
              </select>
            </div>
          )}

          {/* Vendor */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Lugar/Proveedor</label>
            <input
              type="text"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Shell, Home Depot..."
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo *</label>
            <div className="flex gap-2">
              <button
                onClick={() => setExpenseType('business')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                  expenseType === 'business'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0b1220] border border-white/10 text-gray-400'
                }`}
              >
                💼 Negocio
              </button>
              <button
                onClick={() => setExpenseType('personal')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                  expenseType === 'personal'
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#0b1220] border border-white/10 text-gray-400'
                }`}
              >
                🏠 Personal
              </button>
            </div>
          </div>

          {/* Fotos de Recibos - soporta múltiples */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">📸 Foto(s) del Recibo (opcional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
            
            {receiptPhotos.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {receiptPhotos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img 
                        src={photo} 
                        alt={`Recibo ${idx + 1}`} 
                        className="w-full h-32 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                      >✕</button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-[#0b1220] border border-dashed border-white/20 rounded-lg py-3 text-center hover:bg-[#1a2332] transition-colors text-sm text-gray-400"
                >
                  + Agregar otra foto
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-[#0b1220] border border-dashed border-white/20 rounded-lg py-6 text-center hover:bg-[#1a2332] transition-colors"
              >
                <span className="text-2xl block mb-1">📷</span>
                <span className="text-sm text-gray-400">Toca para subir foto del recibo</span>
              </button>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm h-20"
              placeholder="Notas adicionales..."
            />
          </div>
        </div>

        {/* Botón Guardar */}
        <button
          onClick={handleSave}
          disabled={saving || !amount}
          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl py-4 text-lg font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '⏳ Guardando...' : `✅ Guardar Gasto${receiptPhotos.length > 0 ? ` (${receiptPhotos.length} foto${receiptPhotos.length > 1 ? 's' : ''})` : ''}`}
        </button>

        {/* Info */}
        <div className="bg-blue-900/20 border border-blue-900/50 rounded-xl p-3 text-sm text-blue-300">
          <p className="font-medium mb-1">💡 Tip</p>
          <p className="text-xs opacity-80">También puedes añadir gastos por voz en el Chat diciendo: &quot;gasté $40 en gasolina con capital one en la van&quot;</p>
        </div>
      </div>
    </div>
  )
}