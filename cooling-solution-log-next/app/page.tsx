'use client'

import { useState } from 'react'
import CapturePage from '@/components/CapturePage'
import AskPage from '@/components/AskPage'
import HistoryPage from '@/components/HistoryPage'

type Page = 'capture' | 'ask' | 'history'

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>('capture')

  return (
    <div style={{ paddingBottom: 60 }}>
      {currentPage === 'capture' && <CapturePage />}
      {currentPage === 'ask' && <AskPage />}
      {currentPage === 'history' && <HistoryPage />}

      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          borderTop: '1px solid #ccc',
          background: '#fff',
        }}
      >
        <button style={{ flex: 1 }} onClick={() => setCurrentPage('capture')}>
          📝 Captura
        </button>
        <button style={{ flex: 1 }} onClick={() => setCurrentPage('ask')}>
          🔍 Consultar
        </button>
        <button style={{ flex: 1 }} onClick={() => setCurrentPage('history')}>
          📊 Historial
        </button>
      </nav>
    </div>
  )
}
