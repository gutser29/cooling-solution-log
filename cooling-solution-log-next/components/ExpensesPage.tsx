'use client'

import { useState } from 'react'
import { db } from '@/lib/db'

interface ExpensesPageProps {
  onNavigate: (page: string) => void
}

export default function ExpensesPage({ onNavigate }: ExpensesPageProps) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Gasolina')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined)
  const [vendor, setVendor] = useState('')
  const [expenseType, setExpenseType] = useState<'business' | 'personal'>('business')
  const [notes, setNotes] = useState('')

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

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Ingresa un monto válido')
      return
    }

    try {
      const now = Date.now()
      
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
        expense_type: expenseType
      })

      alert('✅ Gasto guardado')
      
      // Clear form
      setAmount('')
      setCategory('Gasolina')
      setPaymentMethod('cash')
      setVehicleId(undefined)
      setVendor('')
      setNotes('')
      setExpenseType('business')
      
    } catch (error) {
      console.error('Error saving expense:', error)
      alert('Error al guardar gasto')
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
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
          className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl py-4 text-lg font-bold shadow-lg"
        >
          ✅ Guardar Gasto
        </button>

        {/* Info */}
        <div className="bg-blue-900/20 border border-blue-900/50 rounded-xl p-3 text-sm text-blue-300">
          <p className="font-medium mb-1">💡 Tip</p>
          <p className="text-xs opacity-80">También puedes añadir gastos por voz diciendo: "gasté $40 en gasolina con capital one en la van"</p>
        </div>
      </div>
    </div>
  )
}