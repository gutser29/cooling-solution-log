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

  useEffect(() => { loadEntries() }, []);

  const loadEntries = async () => {
    try {
      const all = await db.table('bitacora').orderBy('date').reverse().toArray();
      setEntries(all);
    } catch (e) { console.error('Error loading bitácora:', e) }
  };

  const handleSubmitEntry = async () => {
    if (!inputText.trim()) return;
    setLoading(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const todayStr = new Date().toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `MODO BITÁCORA — Procesa este texto como entrada de bitácora de trabajo. Fecha: ${todayStr} (${today}).

RESPONDE ÚNICAMENTE con SAVE_BITACORA: seguido del JSON. Nada más.

SAVE_BITACORA:{"date":"${today}","raw_text":"texto original","summary":"resumen organizado por AI","tags":["tag1","tag2"],"clients_mentioned":["Cliente 1"],"locations":["Lugar 1"],"equipment":["Equipo 1"],"jobs_count":N,"hours_estimated":N,"had_emergency":false,"highlights":["punto 1","punto 2"]}

Texto del usuario:
${inputText}` }
          ]
        }),
      });

      const data = await response.json();
      const text = data.text || '';

      // Extract SAVE_BITACORA JSON from response
      let bitacoraData = null;
      const match = text.match(/SAVE_BITACORA:\s*(\{[\s\S]*\})/i);
      if (match) {
        try {
          // Find the complete JSON object
          const jsonStart = match[1];
          let depth = 0, inStr = false, esc = false, end = 0;
          for (let i = 0; i < jsonStart.length; i++) {
            const c = jsonStart[i];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
          }
          bitacoraData = JSON.parse(jsonStart.substring(0, end));
        } catch (e) { console.error('JSON parse error:', e) }
      }

      if (bitacoraData) {
        const entry: BitacoraEntry = {
          date: bitacoraData.date || today,
          raw_text: inputText,
          summary: bitacoraData.summary || '',
          tags: bitacoraData.tags || [],
          clients_mentioned: bitacoraData.clients_mentioned || [],
          locations: bitacoraData.locations || [],
          equipment: bitacoraData.equipment || [],
          jobs_count: bitacoraData.jobs_count || 0,
          hours_estimated: bitacoraData.hours_estimated || 0,
          had_emergency: bitacoraData.had_emergency || false,
          highlights: bitacoraData.highlights || [],
          created_at: Date.now(),
        };

        // Check if entry for this date already exists
        const existing = await db.table('bitacora').where('date').equals(entry.date).first();
        if (existing) {
          entry.id = existing.id;
          entry.raw_text = existing.raw_text + '\n\n---\n\n' + inputText;
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

        setInputText('');
        setMode('list');
        loadEntries();
      } else {
        alert('Error: la AI no pudo procesar la entrada. Intenta de nuevo.');
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
      const context = allEntries.map(e => ({
        date: e.date, summary: e.summary, tags: e.tags,
        clients_mentioned: e.clients_mentioned, locations: e.locations,
        equipment: e.equipment, highlights: e.highlights,
        jobs_count: e.jobs_count, had_emergency: e.had_emergency,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `MODO BÚSQUEDA BITÁCORA — El usuario pregunta sobre su historial de trabajo. Responde BREVEMENTE basándote en los datos.

DATOS DE BITÁCORA:
${JSON.stringify(context)}

PREGUNTA: ${searchQuery}` }
          ]
        }),
      });

      const data = await response.json();
      setSearchResult(data.text || 'No encontré información sobre eso.');
    } catch (e) {
      setSearchResult('Error buscando en la bitácora.');
    } finally {
      setSearching(false);
    }
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
    } catch (e) { console.error('Error deleting:', e) }
  };

  const filteredEntries = selectedMonth
    ? entries.filter(e => e.date.startsWith(selectedMonth))
    : entries;

  const uniqueMonths = [...new Set(entries.map(e => e.date.substring(0, 7)))].sort().reverse();

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate?.('dashboard')} className="text-lg">←</button>
          <h1 className="text-xl font-bold">📒 Bitácora</h1>
        </div>
        <button onClick={() => setMode('entry')} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">
          + Dictar Día
        </button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Pregunta: ¿Qué hice el sábado? ¿Cuántas veces fui a Bayamón?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <div className="mt-2 bg-purple-900/30 border border-purple-700/30 rounded-lg p-3 text-sm whitespace-pre-wrap text-gray-200">
              {searchResult}
            </div>
          )}
        </div>

        {/* Entry Mode */}
        {mode === 'entry' && (
          <div className="mb-4 bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <h2 className="text-lg font-semibold text-gray-200 mb-2">Cuéntame tu día</h2>
            <p className="text-xs text-gray-500 mb-3">
              Escribe todo lo que hiciste hoy. La AI lo organiza automáticamente.
            </p>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Hoy fui a casa de María en Bayamón, le hice mantenimiento al mini split 12k BTU, cambié filtros... después fui a Home Depot a comprar materiales..."
              rows={8}
              className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setMode('list'); setInputText(''); }}
                className="flex-1 bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitEntry}
                disabled={loading || !inputText.trim()}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {loading ? '⏳ Procesando con AI...' : '💾 Guardar Entrada'}
              </button>
            </div>
          </div>
        )}

        {/* View Entry */}
        {mode === 'view' && selectedEntry && (
          <div className="mb-4 bg-[#111a2e] rounded-xl p-4 border border-white/5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-200">{formatDate(selectedEntry.date)}</h2>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedEntry.had_emergency && (
                    <span className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded-full">🚨 Emergencia</span>
                  )}
                  <span className="bg-blue-900/50 text-blue-400 text-xs px-2 py-0.5 rounded-full">
                    {selectedEntry.jobs_count} trabajo{selectedEntry.jobs_count !== 1 ? 's' : ''}
                  </span>
                  {selectedEntry.hours_estimated > 0 && (
                    <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                      ~{selectedEntry.hours_estimated}h
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => { setMode('list'); setSelectedEntry(null); }} className="text-gray-500 text-xl">✕</button>
            </div>

            {selectedEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {selectedEntry.tags.map((tag, i) => (
                  <span key={i} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">#{tag}</span>
                ))}
              </div>
            )}

            {selectedEntry.clients_mentioned.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-gray-500">👤 Clientes: </span>
                <span className="text-sm text-gray-300">{selectedEntry.clients_mentioned.join(', ')}</span>
              </div>
            )}

            {selectedEntry.locations.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-gray-500">📍 Ubicaciones: </span>
                <span className="text-sm text-gray-300">{selectedEntry.locations.join(', ')}</span>
              </div>
            )}

            {selectedEntry.equipment.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-gray-500">🔧 Equipos: </span>
                <span className="text-sm text-gray-300">{selectedEntry.equipment.join(', ')}</span>
              </div>
            )}

            {selectedEntry.highlights.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 block mb-1">⭐ Puntos importantes:</span>
                {selectedEntry.highlights.map((h, i) => (
                  <div key={i} className="text-sm text-yellow-400 ml-2">• {h}</div>
                ))}
              </div>
            )}

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{showRaw ? 'Texto original' : 'Resumen AI'}</span>
                <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-blue-400">
                  {showRaw ? 'Ver resumen' : 'Ver original'}
                </button>
              </div>
              <div className="bg-[#0b1220] rounded-lg p-3 text-sm whitespace-pre-wrap text-gray-300 border border-white/5">
                {showRaw ? selectedEntry.raw_text : selectedEntry.summary}
              </div>
            </div>

            <button
              onClick={() => setConfirmDelete({ show: true, entry: selectedEntry })}
              className="text-red-400 text-xs"
            >
              🗑️ Eliminar esta entrada
            </button>
          </div>
        )}

        {/* Month Filter */}
        {mode === 'list' && (
          <>
            {uniqueMonths.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                <button
                  onClick={() => setSelectedMonth('')}
                  className={`text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${!selectedMonth ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
                >
                  Todos
                </button>
                {uniqueMonths.map(month => (
                  <button
                    key={month}
                    onClick={() => setSelectedMonth(month)}
                    className={`text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${selectedMonth === month ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
                  >
                    {new Date(month + '-01').toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })}
                  </button>
                ))}
              </div>
            )}

            {filteredEntries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">📒</p>
                <p className="text-gray-500">No hay entradas en la bitácora</p>
                <p className="text-gray-600 text-sm mt-1">Toca "Dictar Día" para empezar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => { setSelectedEntry(entry); setMode('view'); setShowRaw(false); }}
                    className="w-full text-left bg-[#111a2e] rounded-xl p-4 border border-white/5 hover:bg-[#1a2332] transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-200">{formatDate(entry.date)}</div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {entry.summary.substring(0, 120)}...
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.had_emergency && (
                            <span className="bg-red-900/50 text-red-400 text-[10px] px-1.5 py-0.5 rounded-full">🚨</span>
                          )}
                          <span className="bg-blue-900/50 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full">
                            {entry.jobs_count} trabajo{entry.jobs_count !== 1 ? 's' : ''}
                          </span>
                          {entry.clients_mentioned.slice(0, 2).map((c, i) => (
                            <span key={i} className="bg-gray-800 text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">{c}</span>
                          ))}
                          {entry.clients_mentioned.length > 2 && (
                            <span className="text-gray-600 text-[10px]">+{entry.clients_mentioned.length - 2}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-gray-600 text-lg ml-2">›</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

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