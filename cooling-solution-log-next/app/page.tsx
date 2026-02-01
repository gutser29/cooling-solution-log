'use client'

import { useState } from 'react'
import ChatCapture from '@/components/ChatCapture'
import CapturePage from '@/components/CapturePage'
import AskPage from '@/components/AskPage'
import HistoryPage from '@/components/HistoryPage'

type Page = 'chat' | 'capture' | 'ask' | 'history'

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>('chat')

  return (
    <div className="min-h-screen bg-gray-100">
      {currentPage === 'chat' && <ChatCapture />}
      {currentPage === 'capture' && <CapturePage />}
      {currentPage === 'ask' && <AskPage />}
      {currentPage === 'history' && <HistoryPage />}

      {currentPage !== 'chat' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t">
          <div className="flex max-w-2xl mx-auto">
            <button onClick={() => setCurrentPage('chat')} className="flex-1 py-3">💬</button>
            <button onClick={() => setCurrentPage('capture')} className="flex-1 py-3">📝</button>
            <button onClick={() => setCurrentPage('ask')} className="flex-1 py-3">🔍</button>
            <button onClick={() => setCurrentPage('history')} className="flex-1 py-3">📊</button>
          </div>
        </nav>
      )}
    </div>
  )
}
