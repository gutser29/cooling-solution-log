'use client'

import { useState } from 'react'
import { db } from '@/lib/db'

export default function PhotoUpload({ onClose }: { onClose: () => void }) {
  const [photo, setPhoto] = useState<string>('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!photo || !amount) {
      alert('Foto y monto requeridos')
      return
    }

    await db.events.add({
      timestamp: Date.now(),
      type: 'expense',
      status: 'completed',
      category: category || 'Recibo',
      amount: parseFloat(amount),
      note: description,
      photo: photo,
      raw_text: `Recibo: ${description}`
    })

    alert('✅ Recibo guardado')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 dark:text-white">📷 Subir Recibo</h2>
        
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="mb-4 w-full"
        />

        {photo && (
          <img src={photo} alt="Preview" className="w-full mb-4 rounded" />
        )}

        <input
          type="text"
          placeholder="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border rounded p-2 mb-2 dark:bg-gray-700 dark:text-white"
        />

        <input
          type="text"
          placeholder="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border rounded p-2 mb-2 dark:bg-gray-700 dark:text-white"
        />

        <input
          type="number"
          placeholder="Monto"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border rounded p-2 mb-4 dark:bg-gray-700 dark:text-white"
        />

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-500 text-white py-2 rounded"
          >
            Guardar
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 dark:bg-gray-600 py-2 rounded dark:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}