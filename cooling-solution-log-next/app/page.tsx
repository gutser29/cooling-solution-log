'use client'

import { useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import NavMenu from '@/components/NavMenu'
import ChatCapture from '@/components/ChatCapture'
import Dashboard from '@/components/Dashboard'
import ClientsPage from '@/components/ClientsPage'
import CalendarPage from '@/components/CalendarPage'
import NotesPage from '@/components/NotesPage'
import InvoicesPage from '@/components/InvoicesPage'
import JobTemplatesPage from '@/components/JobTemplatesPage'
import ExpensesPage from '@/components/ExpensesPage'
import HistoryPage from '@/components/HistoryPage'
import SearchPage from '@/components/SearchPage'
import ReceiptsPage from '@/components/ReceiptsPage'
import BitacoraPage from '@/components/BitacoraPage'
import ReportsPage from '@/components/ReportsPage'
import WarrantyPage from '@/components/WarrantyPage'
import BankStatementsPage from '@/components/BankStatementsPage'
import ProductCatalogPage from '@/components/ProductCatalogPage'
import MaintenancePage from '@/components/MaintenancePage'
import EmployeesPage from '@/components/EmployeesPage'
import JobsPage from '@/components/JobsPage'
import ContractsPage from '@/components/ContractsPage'
import InventoryPage from '@/components/InventoryPage'
export default function Home() {
  const [currentPage, setCurrentPage] = useState('chat')
  const [showMenu, setShowMenu] = useState(false)

  const navigate = (page: string) => setCurrentPage(page)

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />
      case 'clients': return <ClientsPage onNavigate={navigate} />
      case 'calendar': return <CalendarPage onNavigate={navigate} />
      case 'notes': return <NotesPage onNavigate={navigate} />
      case 'invoices': return <InvoicesPage onNavigate={navigate} />
      case 'templates': return <JobTemplatesPage onNavigate={navigate} />
      case 'expenses': return <ExpensesPage onNavigate={navigate} />
      case 'history': return <HistoryPage onNavigate={navigate} />
      case 'search': return <SearchPage onNavigate={navigate} />
      case 'receipts': return <ReceiptsPage onNavigate={navigate} />
      case 'bitacora': return <BitacoraPage onNavigate={navigate} />
      case 'reports': return <ReportsPage onNavigate={navigate} />
      case 'warranties':return <WarrantyPage onNavigate={setCurrentPage} />
      case 'bank': return <BankStatementsPage onNavigate={setCurrentPage} />
      case 'catalog': return <ProductCatalogPage onNavigate={navigate} />
      case 'maintenance': return <MaintenancePage onNavigate={navigate} />
      case 'employees': return <EmployeesPage onNavigate={navigate} />
      case 'jobs': return <JobsPage onNavigate={navigate} />
      case 'contracts': return <ContractsPage onNavigate={navigate} />
      case 'inventory': return <InventoryPage onNavigate={navigate} />
      default: return <ChatCapture onNavigate={navigate} />
    }
  }

  const isChat = currentPage === 'chat'

  return (
    <AuthGuard>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
        {!isChat && (
          <div style={{ flexShrink: 0, height: 48 }}
            className="bg-[#0b1220] border-b border-white/5 flex items-center justify-between px-4 z-40"
          >
            <span className="text-xs text-gray-500 uppercase tracking-widest">Cooling Solution</span>
            <button
              onClick={() => setShowMenu(s => !s)}
              className="w-10 h-10 flex items-center justify-center text-2xl text-white/70 hover:text-white transition-colors"
              aria-label="Menú"
            >
              {showMenu ? '✕' : '☰'}
            </button>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          {renderPage()}
        </div>
      </div>
      {showMenu && <NavMenu onNavigate={navigate} onClose={() => setShowMenu(false)} />}
    </AuthGuard>
  )
}