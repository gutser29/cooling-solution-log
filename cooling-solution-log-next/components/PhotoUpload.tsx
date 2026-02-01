'use client'

import { useState } from 'react'
import { db } from '@/lib/db'

export default function PhotoUpload({ onClose }: { onClose: () => void }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const base64Array: string[] = []

    for (const file of files) {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      base64Array.push(base64)
    }

    setPhotos(base64Array)
    analyzePhotos(base64Array)
  }

  const analyzePhotos = async (photoArray: string[]) => {
    setAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: photoArray })
      })
      const data = await response.json()
      setResult(data)
    } catch (e) {
      alert('Error analizando fotos')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSave = async () => {
    if (!result) return

    await db.events.add({
      timestamp: Date.now(),
      type: result.type || 'expense',
      status: 'completed',
      category: result.category,
      amount: result.amount,
      vendor: result.vendor,
      client: result.client,
      note: result.description,
      photo: photos.join('|||'),
      raw_text: JSON.stringify(result)
    })

    alert('✅ Guardado')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 dark:text-white">📷 Subir Fotos</h2>

        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="mb-4 w-full"
        />

        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {photos.map((p, i) => (
              <img key={i} src={p} alt={`Foto ${i + 1}`} className="w-full rounded" />
            ))}
          </div>
        )}

        {analyzing && <p className="text-center">🔍 Analizando...</p>}

        {result && (
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded mb-4">
            <p><strong>Categoría:</strong> {result.category}</p>
            <p><strong>Monto:</strong> ${result.amount}</p>
            <p><strong>Vendor:</strong> {result.vendor || 'N/A'}</p>
            <p><strong>Cliente:</strong> {result.client || 'N/A'}</p>
            {result.description && <p><strong>Nota:</strong> {result.description}</p>}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!result}
            className="flex-1 bg-blue-500 text-white py-2 rounded disabled:bg-gray-400"
          >
            Guardar
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-300 py-2 rounded">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
