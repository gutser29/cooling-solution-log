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
      {currentPage === 'chat' && (
        <ChatCapture onNavigate={(page: string) => setCurrentPage(page as Page)} />
      )}

      {currentPage === 'capture' && (
        <div className="relative">
          <button
            onClick={() => setCurrentPage('chat')}
            className="absolute top-4 left-4 bg-blue-500 text-white px-4 py-2 rounded-full z-10"
          >
            ← Chat
          </button>
          <CapturePage />
        </div>
      )}

      {currentPage === 'ask' && (
        <div className="relative">
          <button
            onClick={() => setCurrentPage('chat')}
            className="absolute top-4 left-4 bg-blue-500 text-white px-4 py-2 rounded-full z-10"
          >
            ← Chat
          </button>
          <AskPage />
        </div>
      )}

      {currentPage === 'history' && (
        <div className="relative">
          <button
            onClick={() => setCurrentPage('chat')}
            className="absolute top-4 left-4 bg-blue-500 text-white px-4 py-2 rounded-full z-10"
          >
            ← Chat
          </button>
          <HistoryPage />
        </div>
      )}
    </div>
  )
}

