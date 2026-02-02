'use client'

import { useState } from 'react'
import ChatCapture from '@/components/ChatCapture'
import Dashboard from '@/components/Dashboard'
import SearchPage from '@/components/SearchPage'
import HistoryPage from '@/components/HistoryPage'

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

    default:
      return <Dashboard onNavigate={navigate} />
  }
}
