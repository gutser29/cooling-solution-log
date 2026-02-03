'use client'

import { useState } from 'react'
import ChatCapture from '@/components/ChatCapture'
import Dashboard from '@/components/Dashboard'
import ClientsPage from '@/components/ClientsPage'
import CalendarPage from '@/components/CalendarPage'
import NotesPage from '@/components/NotesPage'
import InvoicesPage from '@/components/InvoicesPage'
import JobTemplatesPage from '@/components/JobTemplatesPage'

export default function Home() {
  const [currentPage, setCurrentPage] = useState('chat')

  const navigate = (page: string) => setCurrentPage(page)

  switch (currentPage) {
    case 'dashboard': return <Dashboard onNavigate={navigate} />
    case 'clients': return <ClientsPage onNavigate={navigate} />
    case 'calendar': return <CalendarPage onNavigate={navigate} />
    case 'notes': return <NotesPage onNavigate={navigate} />
    case 'invoices': return <InvoicesPage onNavigate={navigate} />
    case 'templates': return <JobTemplatesPage onNavigate={navigate} />
    default: return <ChatCapture onNavigate={navigate} />
  }
}
