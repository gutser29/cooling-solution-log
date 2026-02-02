'use client'

import { useState } from 'react'
import ChatCapture from '@/components/ChatCapture'
import Dashboard from '@/components/Dashboard'
import SearchPage from '@/components/SearchPage'
import HistoryPage from '@/components/HistoryPage'
import ClientsPage from '@/components/ClientsPage'
import NotesPage from '@/components/NotesPage'
import CalendarPage from '@/components/CalendarPage'

export default function Home() {
  const [currentPage, setCurrentPage] = useState('dashboard')

  const navigate = (page: string) => {
    setCurrentPage(page)
  }

  switch (currentPage) {
    case 'dashboard':
      return <Dashboard onNavigate={navigate} />
    case 'chat':
    case 'capture':
      return <ChatCapture onNavigate={navigate} />
    case 'search':
    case 'ask':
      return <SearchPage onNavigate={navigate} />
    case 'history':
      return <HistoryPage onNavigate={navigate} />
    case 'clients':
      return <ClientsPage onNavigate={navigate} />
    case 'notes':
      return <NotesPage onNavigate={navigate} />
    case 'calendar':
      return <CalendarPage onNavigate={navigate} />
    default:
      return <Dashboard onNavigate={navigate} />
  }
}
