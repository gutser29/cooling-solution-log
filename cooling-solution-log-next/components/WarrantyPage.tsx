'use client';
import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import ConfirmDialog from './ConfirmDialog';

interface Warranty {
  id?: number;
  equipment_type: string;
  brand: string;
  model_number?: string;
  serial_number?: string;
  vendor: string;
  vendor_phone?: string;
  vendor_invoice?: string;
  client_name: string;
  client_id?: number;
  location?: string;
  purchase_date: number;
  warranty_months: number;
  expiration_date: number;
  cost?: number;
  receipt_photos?: string[];
  notes?: string;
  status: 'active' | 'expired' | 'claimed' | 'void';
  claim_date?: number;
  claim_notes?: string;
  replacement_warranty_id?: number;
  created_at: number;
  updated_at?: number;
}

interface WarrantyPageProps {
  onNavigate?: (page: string) => void;
}

type ViewMode = 'list' | 'detail' | 'create' | 'edit' | 'claim';
type FilterStatus = 'all' | 'active' | 'expiring' | 'expired' | 'claimed';

const EQUIPMENT_TYPES = [
  'Fan Motor', 'Compresor', 'Condensador', 'Evaporador', 'Contactor',
  'Capacitor', 'Termostato', 'Board/Tarjeta', 'Válvula de Expansión',
  'Relay', 'Transformer', 'Coil', 'Blower Motor', 'Scroll Compressor',
  'Mini Split', 'Unidad Paquete', 'Condensing Unit', 'Air Handler',
  'Otro'
];

const COMMON_VENDORS = [
  'Steffan Motors', 'Johnstone Supply', 'Gemaire', 'Ferguson',
  'Carrier Enterprise', 'Home Depot', 'Lowe\'s', 'Otro'
];

export default function WarrantyPage({ onNavigate }: WarrantyPageProps) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoViewer, setPhotoViewer] = useState<{ show: boolean; photos: string[]; index: number }>({ show: false, photos: [], index: 0 });
  const [confirmAction, setConfirmAction] = useState<{ show: boolean; title: string; message: string; action: () => void }>({ show: false, title: '', message: '', action: () => {} });

  // Form state
  const [formEquipType, setFormEquipType] = useState('');
  const [formEquipCustom, setFormEquipCustom] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formSerial, setFormSerial] = useState('');
  const [formVendor, setFormVendor] = useState('');
  const [formVendorCustom, setFormVendorCustom] = useState('');
  const [formVendorPhone, setFormVendorPhone] = useState('');
  const [formVendorInvoice, setFormVendorInvoice] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState('');
  const [formWarrantyMonths, setFormWarrantyMonths] = useState('12');
  const [formCost, setFormCost] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [formClaimNotes, setFormClaimNotes] = useState('');

  // Clients for picker
  const [clients, setClients] = useState<any[]>([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadWarranties(); loadClients(); }, []);

  const loadWarranties = async () => {
    try {
      const all = await db.table('warranties').toArray();
      // Auto-update expired warranties
      const now = Date.now();
      for (const w of all) {
        if (w.status === 'active' && w.expiration_date < now) {
          w.status = 'expired';
          await db.table('warranties').put(w);
        }
      }
      setWarranties(all.sort((a: Warranty, b: Warranty) => b.purchase_date - a.purchase_date));
    } catch (e) { console.error('Error loading warranties:', e); }
    finally { setLoading(false); }
  };

  const loadClients = async () => {
    try {
      const all = await db.clients.toArray();
      setClients(all.filter((c: any) => c.active));
    } catch { setClients([]); }
  };

  const resetForm = () => {
    setFormEquipType(''); setFormEquipCustom(''); setFormBrand(''); setFormModel('');
    setFormSerial(''); setFormVendor(''); setFormVendorCustom(''); setFormVendorPhone('');
    setFormVendorInvoice(''); setFormClientName(''); setFormLocation('');
    setFormPurchaseDate(''); setFormWarrantyMonths('12'); setFormCost('');
    setFormNotes(''); setFormPhotos([]); setFormClaimNotes('');
  };

  const startCreate = () => { resetForm(); setViewMode('create'); };

  const startEdit = (w: Warranty) => {
    setFormEquipType(EQUIPMENT_TYPES.includes(w.equipment_type) ? w.equipment_type : 'Otro');
    setFormEquipCustom(EQUIPMENT_TYPES.includes(w.equipment_type) ? '' : w.equipment_type);
    setFormBrand(w.brand || '');
    setFormModel(w.model_number || '');
    setFormSerial(w.serial_number || '');
    setFormVendor(COMMON_VENDORS.includes(w.vendor) ? w.vendor : 'Otro');
    setFormVendorCustom(COMMON_VENDORS.includes(w.vendor) ? '' : w.vendor);
    setFormVendorPhone(w.vendor_phone || '');
    setFormVendorInvoice(w.vendor_invoice || '');
    setFormClientName(w.client_name || '');
    setFormLocation(w.location || '');
    setFormPurchaseDate(new Date(w.purchase_date).toISOString().split('T')[0]);
    setFormWarrantyMonths(String(w.warranty_months));
    setFormCost(w.cost ? String(w.cost) : '');
    setFormNotes(w.notes || '');
    setFormPhotos(w.receipt_photos || []);
    setSelected(w);
    setViewMode('edit');
  };

  const startClaim = (w: Warranty) => {
    setFormClaimNotes('');
    setSelected(w);
    setViewMode('claim');
  };

  const handleSave = async () => {
    const equipType = formEquipType === 'Otro' ? formEquipCustom : formEquipType;
    const vendor = formVendor === 'Otro' ? formVendorCustom : formVendor;
    if (!equipType || !vendor || !formClientName || !formPurchaseDate || !formBrand) {
      alert('Completa los campos requeridos: equipo, marca, vendor, cliente y fecha de compra');
      return;
    }

    const purchaseDate = new Date(formPurchaseDate + 'T12:00:00').getTime();
    const months = parseInt(formWarrantyMonths) || 12;
    const expDate = new Date(purchaseDate);
    expDate.setMonth(expDate.getMonth() + months);
    const now = Date.now();

    const warranty: any = {
      equipment_type: equipType,
      brand: formBrand,
      model_number: formModel || undefined,
      serial_number: formSerial || undefined,
      vendor,
      vendor_phone: formVendorPhone || undefined,
      vendor_invoice: formVendorInvoice || undefined,
      client_name: formClientName,
      location: formLocation || undefined,
      purchase_date: purchaseDate,
      warranty_months: months,
      expiration_date: expDate.getTime(),
      cost: formCost ? parseFloat(formCost) : undefined,
      receipt_photos: formPhotos.length > 0 ? formPhotos : undefined,
      notes: formNotes || undefined,
      status: expDate.getTime() < now ? 'expired' : 'active',
      updated_at: now,
    };

    try {
      if (viewMode === 'edit' && selected?.id) {
        warranty.id = selected.id;
        warranty.created_at = selected.created_at;
        warranty.claim_date = selected.claim_date;
        warranty.claim_notes = selected.claim_notes;
        if (selected.status === 'claimed') warranty.status = 'claimed';
        await db.table('warranties').put(warranty);
      } else {
        warranty.created_at = now;
        await db.table('warranties').add(warranty);
      }
      resetForm();
      setViewMode('list');
      loadWarranties();
    } catch (e) { console.error('Save warranty error:', e); alert('Error guardando garantía'); }
  };

  const handleClaim = async () => {
    if (!selected?.id) return;
    try {
      const now = Date.now();
      await db.table('warranties').update(selected.id, {
        status: 'claimed',
        claim_date: now,
        claim_notes: formClaimNotes || undefined,
        updated_at: now,
      });
      setViewMode('list');
      setSelected(null);
      loadWarranties();
    } catch (e) { console.error('Claim error:', e); }
  };

  const handleVoid = (w: Warranty) => {
    setConfirmAction({
      show: true,
      title: 'Anular garantía',
      message: `¿Anular la garantía de ${w.equipment_type} (${w.brand}) para ${w.client_name}?`,
      action: async () => {
        if (!w.id) return;
        await db.table('warranties').update(w.id, { status: 'void', updated_at: Date.now() });
        setConfirmAction({ show: false, title: '', message: '', action: () => {} });
        setViewMode('list'); setSelected(null); loadWarranties();
      }
    });
  };

  const handleDelete = (w: Warranty) => {
    setConfirmAction({
      show: true,
      title: 'Eliminar garantía',
      message: `¿Eliminar permanentemente la garantía de ${w.equipment_type} para ${w.client_name}?`,
      action: async () => {
        if (!w.id) return;
        await db.table('warranties').delete(w.id);
        setConfirmAction({ show: false, title: '', message: '', action: () => {} });
        setViewMode('list'); setSelected(null); loadWarranties();
      }
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const b64 = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f);
      });
      // Compress
      const compressed = await new Promise<string>(res => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > 1024) { height = (height * 1024) / width; width = 1024; }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          res(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = b64;
      });
      setFormPhotos(prev => [...prev, compressed]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ====== HELPERS ======
  const now = Date.now();
  const THIRTY_DAYS = 30 * 86400000;

  const getDaysLeft = (w: Warranty) => Math.ceil((w.expiration_date - now) / 86400000);

  const getStatusInfo = (w: Warranty) => {
    if (w.status === 'claimed') return { label: '📋 Reclamada', color: 'text-blue-400', bg: 'bg-blue-900/50' };
    if (w.status === 'void') return { label: '❌ Anulada', color: 'text-gray-500', bg: 'bg-gray-800' };
    if (w.status === 'expired' || w.expiration_date < now) return { label: '🔴 Vencida', color: 'text-red-400', bg: 'bg-red-900/50' };
    if (w.expiration_date - now <= THIRTY_DAYS) return { label: `⚠️ ${getDaysLeft(w)}d`, color: 'text-yellow-400', bg: 'bg-yellow-900/50' };
    return { label: `✅ ${getDaysLeft(w)}d`, color: 'text-green-400', bg: 'bg-green-900/50' };
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'short', day: 'numeric' });
  const formatCurrency = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  // ====== FILTERS ======
  const filtered = warranties.filter(w => {
    if (filter === 'active') return w.status === 'active' && w.expiration_date - now > THIRTY_DAYS;
    if (filter === 'expiring') return w.status === 'active' && w.expiration_date - now <= THIRTY_DAYS && w.expiration_date > now;
    if (filter === 'expired') return w.status === 'expired' || (w.status === 'active' && w.expiration_date < now);
    if (filter === 'claimed') return w.status === 'claimed';
    return w.status !== 'void';
  }).filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.equipment_type.toLowerCase().includes(q) ||
      w.brand.toLowerCase().includes(q) ||
      w.vendor.toLowerCase().includes(q) ||
      w.client_name.toLowerCase().includes(q) ||
      w.location?.toLowerCase().includes(q) ||
      w.serial_number?.toLowerCase().includes(q) ||
      w.model_number?.toLowerCase().includes(q);
  });

  const counts = {
    all: warranties.filter(w => w.status !== 'void').length,
    active: warranties.filter(w => w.status === 'active' && w.expiration_date - now > THIRTY_DAYS).length,
    expiring: warranties.filter(w => w.status === 'active' && w.expiration_date - now <= THIRTY_DAYS && w.expiration_date > now).length,
    expired: warranties.filter(w => w.status === 'expired' || (w.status === 'active' && w.expiration_date < now)).length,
    claimed: warranties.filter(w => w.status === 'claimed').length,
  };

  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true;
    const q = clientSearch.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || c.phone?.includes(q);
  });

  // ====== RENDER ======
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1220] text-white">
        <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1220] text-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (viewMode === 'detail' || viewMode === 'claim') { setViewMode('list'); setSelected(null); }
            else if (viewMode === 'create' || viewMode === 'edit') { setViewMode(selected ? 'detail' : 'list'); }
            else onNavigate?.('dashboard');
          }} className="text-lg">←</button>
          <h1 className="text-xl font-bold">🛡️ Garantías</h1>
        </div>
        {viewMode === 'list' && (
          <button onClick={startCreate} className="bg-white/20 rounded-lg px-3 py-1.5 text-sm font-medium">+ Nueva</button>
        )}
      </div>

      <div className="p-4 max-w-2xl mx-auto">

        {/* ====== LIST VIEW ====== */}
        {viewMode === 'list' && (
          <>
            {/* Search */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍 Buscar por equipo, marca, cliente, vendor, serial..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#111a2e] border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {([
                { key: 'all', label: 'Todas', count: counts.all },
                { key: 'active', label: '✅ Activas', count: counts.active },
                { key: 'expiring', label: '⚠️ Por Vencer', count: counts.expiring },
                { key: 'expired', label: '🔴 Vencidas', count: counts.expired },
                { key: 'claimed', label: '📋 Reclamadas', count: counts.claimed },
              ] as { key: FilterStatus; label: string; count: number }[]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 ${
                    filter === f.key ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'
                  }`}
                >
                  {f.label} {f.count > 0 ? `(${f.count})` : ''}
                </button>
              ))}
            </div>

            {/* Stats summary */}
            {counts.expiring > 0 && (
              <div className="mb-3 bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-3">
                <p className="text-sm text-yellow-400 font-medium">⚠️ {counts.expiring} garantía{counts.expiring > 1 ? 's' : ''} vence{counts.expiring > 1 ? 'n' : ''} en los próximos 30 días</p>
              </div>
            )}

            {/* List */}
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🛡️</p>
                <p className="text-gray-500">{search ? 'No se encontraron resultados' : 'No hay garantías registradas'}</p>
                <p className="text-gray-600 text-sm mt-1">Toca "+ Nueva" o díselo a la AI en el chat</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(w => {
                  const status = getStatusInfo(w);
                  return (
                    <button
                      key={w.id}
                      onClick={() => { setSelected(w); setViewMode('detail'); }}
                      className="w-full text-left bg-[#111a2e] rounded-xl p-4 border border-white/5 hover:bg-[#1a2332] transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-200 truncate">{w.equipment_type}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                          </div>
                          <p className="text-xs text-gray-400">{w.brand}{w.model_number ? ` — ${w.model_number}` : ''}</p>
                          <p className="text-xs text-gray-500 mt-1">👤 {w.client_name}{w.location ? ` • 📍 ${w.location}` : ''}</p>
                          <p className="text-xs text-gray-600 mt-0.5">🏪 {w.vendor} • {formatDate(w.purchase_date)}</p>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          {w.cost && <p className="text-sm font-medium text-gray-300">{formatCurrency(w.cost)}</p>}
                          {w.receipt_photos && w.receipt_photos.length > 0 && <p className="text-[10px] text-gray-500 mt-0.5">📷 {w.receipt_photos.length}</p>}
                          <span className="text-gray-600 text-lg">›</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ====== DETAIL VIEW ====== */}
        {viewMode === 'detail' && selected && (() => {
          const status = getStatusInfo(selected);
          const daysLeft = getDaysLeft(selected);
          return (
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`rounded-xl p-4 ${status.bg} border border-white/5`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className={`text-lg font-bold ${status.color}`}>{status.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selected.status === 'claimed' ? `Reclamada el ${formatDate(selected.claim_date!)}` :
                       selected.status === 'expired' || daysLeft < 0 ? `Venció el ${formatDate(selected.expiration_date)}` :
                       `Vence el ${formatDate(selected.expiration_date)} (${daysLeft} días)`}
                    </p>
                  </div>
                  {selected.status === 'active' && (
                    <button onClick={() => startClaim(selected)} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                      📋 Reclamar
                    </button>
                  )}
                </div>
              </div>

              {/* Equipment info */}
              <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">🔧 Equipo</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Tipo</p><p className="text-gray-300">{selected.equipment_type}</p></div>
                  <div><p className="text-xs text-gray-500">Marca</p><p className="text-gray-300">{selected.brand}</p></div>
                  {selected.model_number && <div><p className="text-xs text-gray-500">Modelo</p><p className="text-gray-300">{selected.model_number}</p></div>}
                  {selected.serial_number && <div><p className="text-xs text-gray-500">Serial</p><p className="text-gray-300 font-mono text-xs">{selected.serial_number}</p></div>}
                </div>
              </div>

              {/* Purchase info */}
              <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">🏪 Compra</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Vendor</p><p className="text-gray-300">{selected.vendor}</p></div>
                  {selected.vendor_phone && <div><p className="text-xs text-gray-500">Teléfono</p><a href={`tel:${selected.vendor_phone}`} className="text-blue-400">{selected.vendor_phone}</a></div>}
                  <div><p className="text-xs text-gray-500">Fecha de compra</p><p className="text-gray-300">{formatDate(selected.purchase_date)}</p></div>
                  <div><p className="text-xs text-gray-500">Garantía</p><p className="text-gray-300">{selected.warranty_months} meses</p></div>
                  {selected.vendor_invoice && <div><p className="text-xs text-gray-500"># Factura</p><p className="text-gray-300 font-mono text-xs">{selected.vendor_invoice}</p></div>}
                  {selected.cost && <div><p className="text-xs text-gray-500">Costo</p><p className="text-gray-300 font-medium">{formatCurrency(selected.cost)}</p></div>}
                </div>
              </div>

              {/* Client info */}
              <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">👤 Cliente / Ubicación</h3>
                <p className="text-sm text-gray-300">{selected.client_name}</p>
                {selected.location && <p className="text-xs text-gray-500 mt-1">📍 {selected.location}</p>}
              </div>

              {/* Claim info */}
              {selected.status === 'claimed' && (
                <div className="bg-blue-900/20 rounded-xl p-4 border border-blue-700/30">
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">📋 Reclamación</h3>
                  <p className="text-xs text-gray-400">Fecha: {formatDate(selected.claim_date!)}</p>
                  {selected.claim_notes && <p className="text-sm text-gray-300 mt-2">{selected.claim_notes}</p>}
                </div>
              )}

              {/* Notes */}
              {selected.notes && (
                <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">📝 Notas</h3>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}

              {/* Photos */}
              {selected.receipt_photos && selected.receipt_photos.length > 0 && (
                <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">📷 Recibos / Fotos ({selected.receipt_photos.length})</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selected.receipt_photos.map((p, i) => (
                      <img
                        key={i}
                        src={p}
                        alt=""
                        onClick={() => setPhotoViewer({ show: true, photos: selected.receipt_photos!, index: i })}
                        className="w-24 h-24 object-cover rounded-lg border border-white/10 cursor-pointer flex-shrink-0 hover:opacity-80"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pb-6">
                <button onClick={() => startEdit(selected)} className="flex-1 bg-[#111a2e] border border-white/10 text-gray-300 py-2.5 rounded-xl text-sm">✏️ Editar</button>
                {selected.status === 'active' && (
                  <button onClick={() => startClaim(selected)} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">📋 Reclamar</button>
                )}
                <button onClick={() => handleVoid(selected)} className="bg-[#111a2e] border border-white/10 text-gray-500 py-2.5 px-4 rounded-xl text-sm">🚫</button>
                <button onClick={() => handleDelete(selected)} className="bg-[#111a2e] border border-red-900/30 text-red-400 py-2.5 px-4 rounded-xl text-sm">🗑️</button>
              </div>
            </div>
          );
        })()}

        {/* ====== CREATE / EDIT FORM ====== */}
        {(viewMode === 'create' || viewMode === 'edit') && (
          <div className="space-y-4 pb-6">
            <h2 className="text-lg font-semibold text-gray-200">{viewMode === 'create' ? 'Nueva Garantía' : 'Editar Garantía'}</h2>

            {/* Equipment Type */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">🔧 Tipo de equipo *</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {EQUIPMENT_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setFormEquipType(t)}
                    className={`text-xs px-2.5 py-1 rounded-full ${formEquipType === t ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {formEquipType === 'Otro' && (
                <input value={formEquipCustom} onChange={e => setFormEquipCustom(e.target.value)}
                  placeholder="Especifica el tipo de equipo"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              )}
            </div>

            {/* Brand & Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Marca *</p>
                <input value={formBrand} onChange={e => setFormBrand(e.target.value)} placeholder="Ej: Carrier, Emerson"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Modelo</p>
                <input value={formModel} onChange={e => setFormModel(e.target.value)} placeholder="# Modelo"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              </div>
            </div>

            {/* Serial */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Serial #</p>
              <input value={formSerial} onChange={e => setFormSerial(e.target.value)} placeholder="Número de serial"
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
            </div>

            {/* Vendor */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">🏪 Vendor / Suplidor *</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_VENDORS.map(v => (
                  <button
                    key={v}
                    onClick={() => setFormVendor(v)}
                    className={`text-xs px-2.5 py-1 rounded-full ${formVendor === v ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {formVendor === 'Otro' && (
                <input value={formVendorCustom} onChange={e => setFormVendorCustom(e.target.value)}
                  placeholder="Nombre del vendor"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              )}
            </div>

            {/* Vendor details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1.5">📞 Tel. Vendor</p>
                <input value={formVendorPhone} onChange={e => setFormVendorPhone(e.target.value)} placeholder="787-xxx-xxxx" type="tel"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5"># Factura</p>
                <input value={formVendorInvoice} onChange={e => setFormVendorInvoice(e.target.value)} placeholder="# factura/recibo"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
              </div>
            </div>

            {/* Client */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">👤 Cliente *</p>
              <div className="flex gap-2">
                <input value={formClientName} onChange={e => setFormClientName(e.target.value)} placeholder="Nombre del cliente"
                  className="flex-1 bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
                <button onClick={() => setShowClientPicker(!showClientPicker)} className="bg-[#111a2e] border border-white/10 rounded-lg px-3 text-sm text-gray-400">
                  📋
                </button>
              </div>
              {showClientPicker && (
                <div className="mt-2 bg-[#111a2e] border border-white/10 rounded-lg max-h-40 overflow-y-auto">
                  <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar cliente..."
                    className="w-full bg-[#0b1220] border-b border-white/10 px-3 py-2 text-sm placeholder-gray-600 focus:outline-none" />
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => {
                      setFormClientName(`${c.first_name} ${c.last_name}`);
                      setShowClientPicker(false); setClientSearch('');
                    }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 border-b border-white/5">
                      {c.first_name} {c.last_name} {c.phone && <span className="text-gray-500 text-xs ml-2">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Location */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">📍 Ubicación / Sucursal</p>
              <input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Ej: Farmacia Caridad #40, Bayamón"
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
            </div>

            {/* Date & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1.5">📅 Fecha de compra *</p>
                <input type="date" value={formPurchaseDate} onChange={e => setFormPurchaseDate(e.target.value)}
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300" />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">🛡️ Garantía (meses)</p>
                <div className="flex gap-1.5">
                  {['6', '12', '24', '36', '60'].map(m => (
                    <button key={m} onClick={() => setFormWarrantyMonths(m)}
                      className={`text-xs px-2 py-1.5 rounded-lg flex-1 ${formWarrantyMonths === m ? 'bg-blue-600 text-white' : 'bg-[#111a2e] text-gray-400 border border-white/10'}`}>
                      {m === '60' ? '5a' : m === '36' ? '3a' : m === '24' ? '2a' : m === '12' ? '1a' : '6m'}
                    </button>
                  ))}
                </div>
                <input type="number" value={formWarrantyMonths} onChange={e => setFormWarrantyMonths(e.target.value)} placeholder="Meses"
                  className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300 mt-1.5" />
              </div>
            </div>

            {/* Cost */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">💰 Costo</p>
              <input type="number" step="0.01" value={formCost} onChange={e => setFormCost(e.target.value)} placeholder="0.00"
                className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600" />
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">📝 Notas</p>
              <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas adicionales..."
                rows={3} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            {/* Photos */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">📷 Fotos de recibo</p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
              <div className="flex gap-2 flex-wrap">
                {formPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="" className="w-20 h-20 object-cover rounded-lg border border-white/10" />
                    <button onClick={() => setFormPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 bg-[#111a2e] border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center text-2xl text-gray-600 hover:border-blue-500/50">+</button>
              </div>
            </div>

            {/* Save/Cancel buttons */}
            <div className="flex gap-2 pt-2">
              <button onClick={() => { resetForm(); setViewMode(selected ? 'detail' : 'list'); }}
                className="flex-1 bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleSave}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">💾 Guardar</button>
            </div>
          </div>
        )}

        {/* ====== CLAIM VIEW ====== */}
        {viewMode === 'claim' && selected && (
          <div className="space-y-4 pb-6">
            <h2 className="text-lg font-semibold text-gray-200">📋 Reclamar Garantía</h2>

            <div className="bg-[#111a2e] rounded-xl p-4 border border-white/5">
              <p className="text-sm text-gray-300 font-medium">{selected.equipment_type} — {selected.brand}</p>
              <p className="text-xs text-gray-500 mt-1">{selected.client_name} • {selected.vendor}</p>
              <p className="text-xs text-gray-500">Comprado: {formatDate(selected.purchase_date)} • Vence: {formatDate(selected.expiration_date)}</p>
              {selected.serial_number && <p className="text-xs text-gray-500 font-mono mt-1">Serial: {selected.serial_number}</p>}
              {selected.vendor_phone && <p className="text-xs mt-2">📞 Vendor: <a href={`tel:${selected.vendor_phone}`} className="text-blue-400">{selected.vendor_phone}</a></p>}
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1.5">Notas de reclamación</p>
              <textarea value={formClaimNotes} onChange={e => setFormClaimNotes(e.target.value)}
                placeholder="Describe el problema: qué falló, síntomas, cuándo empezó..."
                rows={5} className="w-full bg-[#0b1220] border border-white/10 rounded-lg px-3 py-2 text-sm placeholder-gray-600 resize-y focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setViewMode('detail'); setFormClaimNotes(''); }}
                className="flex-1 bg-gray-700 text-gray-300 py-2.5 rounded-xl text-sm">Cancelar</button>
              <button onClick={handleClaim}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">✅ Confirmar Reclamación</button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Viewer Modal */}
      {photoViewer.show && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center" onClick={() => setPhotoViewer({ show: false, photos: [], index: 0 })}>
          <button className="absolute top-4 right-4 text-white text-2xl z-10">✕</button>
          <img src={photoViewer.photos[photoViewer.index]} alt="" className="max-w-[95vw] max-h-[85vh] object-contain" onClick={e => e.stopPropagation()} />
          {photoViewer.photos.length > 1 && (
            <div className="flex gap-4 mt-4">
              <button onClick={e => { e.stopPropagation(); setPhotoViewer(prev => ({ ...prev, index: Math.max(0, prev.index - 1) })); }}
                className="text-white text-2xl px-4">‹</button>
              <span className="text-gray-400 text-sm">{photoViewer.index + 1} / {photoViewer.photos.length}</span>
              <button onClick={e => { e.stopPropagation(); setPhotoViewer(prev => ({ ...prev, index: Math.min(prev.photos.length - 1, prev.index + 1) })); }}
                className="text-white text-2xl px-4">›</button>
            </div>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction.show && (
        <ConfirmDialog
          show={confirmAction.show}
          title={confirmAction.title}
          message={confirmAction.message}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction({ show: false, title: '', message: '', action: () => {} })}
        />
      )}
    </div>
  );
}