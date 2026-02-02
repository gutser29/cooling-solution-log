'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import type { Note } from '@/lib/types'

interface NotesPageProps {
  onNavigate: (page: string) => void
}

export default function NotesPage({ onNavigate }: NotesPageProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadNotes = useCallback(async () => {
    const all = await db.notes.orderBy('updated_at').reverse().toArray()
    setNotes(all)
    setLoading(false)
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  const createNew = () => {
    setSelectedNote(null)
    setEditTitle('')
    setEditContent('')
    setEditing(true)
  }

  const openNote = (note: Note) => {
    setSelectedNote(note)
    setEditTitle(note.title || '')
    setEditContent(note.content)
    setEditing(false)
  }

  const startEdit = () => {
    if (!selectedNote) return
    setEditTitle(selectedNote.title || '')
    setEditContent(selectedNote.content)
    setEditing(true)
  }

  const saveNote = async () => {
    const now = Date.now()
    if (selectedNote?.id) {
      await db.notes.update(selectedNote.id, {
        title: editTitle.trim() || undefined,
        content: editContent.trim(),
        updated_at: now
      })
    } else {
      const id = await db.notes.add({
        timestamp: now,
        title: editTitle.trim() || undefined,
        content: editContent.trim(),
        updated_at: now
      })
      setSelectedNote({ id: id as number, timestamp: now, title: editTitle.trim(), content: editContent.trim(), updated_at: now })
    }
    setEditing(false)
    loadNotes()
  }

  const deleteNote = async () => {
    if (!selectedNote?.id) return
    if (!confirm('¿Borrar esta nota?')) return
    await db.notes.delete(selectedNote.id)
    setSelectedNote(null)
    setEditing(false)
    loadNotes()
  }

  const fmtDate = (ts: number) => {
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('es-PR', { month: 'short', day: 'numeric' })
  }

  const filtered = notes.filter(n => {
    if (!search) return true
    const s = search.toLowerCase()
    return (n.title || '').toLowerCase().includes(s) || n.content.toLowerCase().includes(s)
  })

  // ========== EDIT/CREATE VIEW ==========
  if (editing) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100 flex flex-col">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditing(false); if (!selectedNote) { setSelectedNote(null) } }} className="text-lg">←</button>
            <h1 className="text-xl font-bold">{selectedNote ? '✏️ Editar' : '📝 Nueva Nota'}</h1>
          </div>
          <div className="flex gap-2">
            {selectedNote && (
              <button onClick={deleteNote} className="bg-red-500/30 rounded-lg px-3 py-1.5 text-sm font-medium">🗑️</button>
            )}
            <button onClick={saveNote} disabled={!editContent.trim()} className="bg-green-500 rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">💾 Guardar</button>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto flex-1 flex flex-col gap-3">
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600"
          />
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            placeholder="Escribe tu nota aquí..."
            className="flex-1 w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-gray-600"
            style={{ minHeight: '300px' }}
            autoFocus
          />
        </div>
      </div>
    )
  }

  // ========== DETAIL VIEW ==========
  if (selectedNote) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-gray-100">
        <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedNote(null)} className="text-lg">←</button>
            <h1 className="text-xl font-bold truncate">{selectedNote.title || 'Nota'}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={deleteNote} className="bg-red-500/30 rounded-lg px-3 py-1.5 text-sm font-medium">🗑️</button>
            <button onClick={startEdit} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">✏️ Editar</button>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto">
          <p className="text-xs text-gray-500 mb-4">{new Date(selectedNote.updated_at).toLocaleString('es-PR')}</p>
          <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">{selectedNote.content}</div>
          </div>
        </div>
      </div>
    )
  }

  // ========== LIST VIEW ==========
  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📝 Notas</h1>
        </div>
        <button onClick={createNew} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">+ Nueva</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {notes.length > 5 && (
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar notas..."
            className="w-full bg-[#111a2e] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
          />
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-gray-500">{search ? 'No se encontraron notas' : 'Sin notas aún'}</p>
            <p className="text-gray-600 text-sm mt-1">Crea una nota o dile al chat &quot;anota que...&quot;</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => (
              <button
                key={n.id}
                onClick={() => openNote(n)}
                className="w-full bg-[#111a2e] rounded-xl p-4 border border-white/5 text-left hover:bg-[#1a2332] transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-200 truncate">{n.title || 'Sin título'}</p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                  </div>
                  <span className="text-xs text-gray-600 ml-3 flex-shrink-0">{fmtDate(n.updated_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}