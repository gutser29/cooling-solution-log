'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import type { BitacoraEntry } from '@/lib/types';
import ConfirmDialog from './ConfirmDialog';

interface BitacoraPageProps {
  onNavigate?: (page: string) => void;
}

export default function BitacoraPage({ onNavigate }: BitacoraPageProps) {
  const [entries, setEntries] = useState<BitacoraEntry[]>([]);
  const [mode, setMode] = useState<'list' | 'entry' | 'view'>('list');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BitacoraEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; entry: BitacoraEntry | null }>({ show: false, entry: null });

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const all = await db.table('bitacora').orderBy('date').reverse().toArray();
      setEntries(all);
    } catch (e) {
      console.error('Error loading bitácora:', e);
    }
  };

  const handleSubmitEntry = async () => {
    if (!inputText.trim()) return;
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: inputText,
          mode: 'bitacora_entry',
        }),
      });

      const data = await response.json();

      if (data.bitacora) {
        const today = new Date().toISOString().split('T')[0];
        const entry: BitacoraEntry = {
          date: data.bitacora.date || today,
          raw_text: inputText,
          summary: data.bitacora.summary || '',
          tags: data.bitacora.tags || [],
          clients_mentioned: data.bitacora.clients_mentioned || [],
          locations: data.bitacora.locations || [],
          equipment: data.bitacora.equipment || [],
          jobs_count: data.bitacora.jobs_count || 0,
          hours_estimated: data.bitacora.hours_estimated || 0,
          had_emergency: data.bitacora.had_emergency || false,
          highlights: data.bitacora.highlights || [],
          created_at: Date.now(),
        };

        // Check if entry for this date already exists
        const existing = await db.table('bitacora').where('date').equals(entry.date).first();
        if (existing) {
          // Append to existing entry
          entry.id = existing.id;
          entry.raw_text = existing.raw_text + '\n\n---\n\n' + inputText;
          entry.summary = data.bitacora.summary; // AI re-processes all
          entry.tags = [...new Set([...existing.tags, ...entry.tags])];
          entry.clients_mentioned = [...new Set([...existing.clients_mentioned, ...entry.clients_mentioned])];
          entry.locations = [...new Set([...existing.locations, ...entry.locations])];
          entry.equipment = [...new Set([...existing.equipment, ...entry.equipment])];
          entry.jobs_count = (existing.jobs_count || 0) + (entry.jobs_count || 0);
          entry.hours_estimated = (existing.hours_estimated || 0) + (entry.hours_estimated || 0);
          entry.had_emergency = existing.had_emergency || entry.had_emergency;
          entry.highlights = [...existing.highlights, ...entry.highlights];
          entry.updated_at = Date.now();
          entry.created_at = existing.created_at;
          await db.table('bitacora').put(entry);
        } else {
          await db.table('bitacora').add(entry);
        }

        // Link mentioned clients to client_photos/events if they exist in DB
        if (entry.clients_mentioned.length > 0) {
          for (const clientName of entry.clients_mentioned) {
            const client = await db.table('clients')
              .filter((c: any) =>
                `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientName.toLowerCase()) ||
                c.first_name?.toLowerCase().includes(clientName.toLowerCase())
              )
              .first();
            // Future: link bitacora entry to client record
          }
        }

        setInputText('');
        setMode('list');
        loadEntries();
      }
    } catch (e) {
      console.error('Error processing bitácora:', e);
      alert('Error procesando la entrada. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult('');

    try {
      const allEntries = await db.table('bitacora').toArray();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: searchQuery,
          mode: 'bitacora_search',
          context: JSON.stringify(allEntries.map(e => ({
            date: e.date,
            summary: e.summary,
            tags: e.tags,
            clients_mentioned: e.clients_mentioned,
            locations: e.locations,
            equipment: e.equipment,
            highlights: e.highlights,
            jobs_count: e.jobs_count,
            had_emergency: e.had_emergency,
          }))),
        }),
      });

      const data = await response.json();
      setSearchResult(data.reply || data.message || 'No encontré información sobre eso.');
    } catch (e) {
      setSearchResult('Error buscando en la bitácora.');
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteEntry = async (entry: BitacoraEntry) => {
    setConfirmDelete({ show: true, entry });
  };

  const confirmDeleteEntry = async () => {
    if (!confirmDelete.entry?.id) return;
    try {
      await db.table('bitacora').delete(confirmDelete.entry.id);
      setConfirmDelete({ show: false, entry: null });
      if (selectedEntry?.id === confirmDelete.entry.id) {
        setSelectedEntry(null);
        setMode('list');
      }
      loadEntries();
    } catch (e) {
      console.error('Error deleting:', e);
    }
  };

  const filteredEntries = selectedMonth
    ? entries.filter(e => e.date.startsWith(selectedMonth))
    : entries;

  const uniqueMonths = [...new Set(entries.map(e => e.date.substring(0, 7)))].sort().reverse();

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('es-PR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-cyan-400">📒 Bitácora de Trabajo</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('entry')}
            className="bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            + Dictar Día
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Pregunta: ¿Qué hice el sábado? ¿Cuántas veces fui a Bayamón?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {searching ? '...' : '🔍'}
          </button>
        </div>
        {searchResult && (
          <div className="mt-2 bg-purple-900/30 border border-purple-700 rounded-lg p-3 text-sm whitespace-pre-wrap">
            {searchResult}
          </div>
        )}
      </div>

      {/* Entry Mode */}
      {mode === 'entry' && (
        <div className="mb-4 bg-gray-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-cyan-300 mb-2">Cuéntame tu día</h2>
          <p className="text-xs text-gray-400 mb-3">
            Escribe o dicta todo lo que hiciste hoy. La AI lo organiza automáticamente.
          </p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Hoy fui a casa de María en Bayamón, le hice mantenimiento al mini split 12k BTU, cambié filtros... después fui a Home Depot a comprar materiales..."
            rows={8}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { setMode('list'); setInputText(''); }}
              className="flex-1 bg-gray-600 text-white py-2 rounded-lg text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmitEntry}
              disabled={loading || !inputText.trim()}
              className="flex-1 bg-cyan-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Procesando con AI...' : 'Guardar Entrada'}
            </button>
          </div>
        </div>
      )}

      {/* View Entry */}
      {mode === 'view' && selectedEntry && (
        <div className="mb-4 bg-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-lg font-semibold text-cyan-300">{formatDate(selectedEntry.date)}</h2>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedEntry.had_emergency && (
                  <span className="bg-red-600/30 text-red-300 text-xs px-2 py-0.5 rounded-full">🚨 Emergencia</span>
                )}
                <span className="bg-cyan-600/30 text-cyan-300 text-xs px-2 py-0.5 rounded-full">
                  {selectedEntry.jobs_count} trabajo{selectedEntry.jobs_count !== 1 ? 's' : ''}
                </span>
                {selectedEntry.hours_estimated > 0 && (
                  <span className="bg-green-600/30 text-green-300 text-xs px-2 py-0.5 rounded-full">
                    ~{selectedEntry.hours_estimated}h
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setMode('list'); setSelectedEntry(null); }}
              className="text-gray-400 text-xl"
            >
              ✕
            </button>
          </div>

          {/* Tags */}
          {selectedEntry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {selectedEntry.tags.map((tag, i) => (
                <span key={i} className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Clients */}
          {selectedEntry.clients_mentioned.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-gray-400">Clientes: </span>
              <span className="text-sm text-white">{selectedEntry.clients_mentioned.join(', ')}</span>
            </div>
          )}

          {/* Locations */}
          {selectedEntry.locations.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-gray-400">Ubicaciones: </span>
              <span className="text-sm text-white">{selectedEntry.locations.join(', ')}</span>
            </div>
          )}

          {/* Equipment */}
          {selectedEntry.equipment.length > 0 && (
            <div className="mb-2">
              <span className="text-xs text-gray-400">Equipos: </span>
              <span className="text-sm text-white">{selectedEntry.equipment.join(', ')}</span>
            </div>
          )}

          {/* Highlights */}
          {selectedEntry.highlights.length > 0 && (
            <div className="mb-3">
              <span className="text-xs text-gray-400 block mb-1">Puntos importantes:</span>
              {selectedEntry.highlights.map((h, i) => (
                <div key={i} className="text-sm text-yellow-300 ml-2">• {h}</div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{showRaw ? 'Texto original' : 'Resumen AI'}</span>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-xs text-cyan-400 underline"
              >
                {showRaw ? 'Ver resumen' : 'Ver original'}
              </button>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
              {showRaw ? selectedEntry.raw_text : selectedEntry.summary}
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={() => handleDeleteEntry(selectedEntry)}
            className="text-red-400 text-xs underline"
          >
            Eliminar esta entrada
          </button>
        </div>
      )}

      {/* Month Filter */}
      {mode === 'list' && (
        <>
          {uniqueMonths.length > 1 && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedMonth('')}
                className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                  !selectedMonth ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
              >
                Todos
              </button>
              {uniqueMonths.map(month => (
                <button
                  key={month}
                  onClick={() => setSelectedMonth(month)}
                  className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                    selectedMonth === month ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {new Date(month + '-01').toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })}
                </button>
              ))}
            </div>
          )}

          {/* Entries List */}
          {filteredEntries.length === 0 ? (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-4xl mb-3">📒</p>
              <p>No hay entradas en la bitácora</p>
              <p className="text-sm mt-1">Toca "Dictar Día" para empezar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => { setSelectedEntry(entry); setMode('view'); setShowRaw(false); }}
                  className="bg-gray-800 rounded-xl p-3 cursor-pointer active:bg-gray-700 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-cyan-300">{formatDate(entry.date)}</div>
                      <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {entry.summary.substring(0, 120)}...
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.had_emergency && (
                          <span className="bg-red-600/30 text-red-300 text-[10px] px-1.5 py-0.5 rounded-full">🚨</span>
                        )}
                        <span className="bg-cyan-600/30 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded-full">
                          {entry.jobs_count} trabajo{entry.jobs_count !== 1 ? 's' : ''}
                        </span>
                        {entry.clients_mentioned.slice(0, 2).map((c, i) => (
                          <span key={i} className="bg-gray-700 text-gray-300 text-[10px] px-1.5 py-0.5 rounded-full">
                            {c}
                          </span>
                        ))}
                        {entry.clients_mentioned.length > 2 && (
                          <span className="text-gray-500 text-[10px]">+{entry.clients_mentioned.length - 2}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-600 text-lg ml-2">›</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        show={confirmDelete.show}
        title="Eliminar entrada de bitácora"
        message={`¿Seguro que deseas borrar la entrada del ${confirmDelete.entry ? formatDate(confirmDelete.entry.date) : ''}?`}
        onConfirm={confirmDeleteEntry}
        onCancel={() => setConfirmDelete({ show: false, entry: null })}
      />
    </div>
  );
}