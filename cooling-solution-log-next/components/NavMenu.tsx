'use client'

interface Props {
  onNavigate: (page: string) => void
  onClose: () => void
}

const NAV_ITEMS = [
  { page: 'chat',        icon: '💬', label: 'Chat IA' },
  { page: 'dashboard',   icon: '📊', label: 'Dashboard' },
  { page: 'clients',     icon: '👥', label: 'Clientes' },
  { page: 'jobs',        icon: '🔧', label: 'Trabajos' },
  { page: 'invoices',    icon: '📄', label: 'Facturas' },
  { page: 'templates',   icon: '📋', label: 'Templates' },
  { page: 'expenses',    icon: '💵', label: 'Gastos' },
  { page: 'receipts',    icon: '🧾', label: 'Recibos' },
  { page: 'calendar',    icon: '📅', label: 'Calendario' },
  { page: 'bitacora',    icon: '📒', label: 'Bitácora' },
  { page: 'contracts',   icon: '📋', label: 'Contratos' },
  { page: 'inventory',   icon: '📦', label: 'Inventario' },
  { page: 'maintenance', icon: '🛠️', label: 'Mantenimiento Preventivo' },
  { page: 'employees',   icon: '👷', label: 'Empleados (480.6B)' },
  { page: 'warranties',  icon: '🛡️', label: 'Garantías' },
  { page: 'bank',        icon: '🏦', label: 'Estados de Cuenta' },
  { page: 'catalog',     icon: '🔧', label: 'Catálogo HVAC' },
  { page: 'reports',     icon: '📊', label: 'Reportes' },
  { page: 'notes',       icon: '📝', label: 'Notas' },
  { page: 'search',      icon: '🔍', label: 'Buscar' },
  { page: 'history',     icon: '📜', label: 'Historial' },
]

export default function NavMenu({ onNavigate, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed top-16 right-4 bg-[#111a2e] rounded-xl shadow-2xl z-50 w-60 border border-white/10 max-h-[80vh] overflow-y-auto">
        {NAV_ITEMS.map(({ page, icon, label }) => (
          <button
            key={page}
            onClick={() => { onClose(); onNavigate(page) }}
            className="block w-full text-left px-4 py-3 text-gray-200 hover:bg-white/10 border-b border-white/5 text-sm"
          >
            {icon} {label}
          </button>
        ))}
      </div>
    </>
  )
}
