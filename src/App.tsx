import { useState } from 'react'
import CapturePage from './pages/CapturePage'
import AskPage from './pages/AskPage'
import HistoryPage from './pages/HistoryPage'

type Page = 'capture' | 'ask' | 'history'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('capture')

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Content */}
      <div className="max-w-2xl mx-auto">
        {currentPage === 'capture' && <CapturePage />}
        {currentPage === 'ask' && <AskPage />}
        {currentPage === 'history' && <HistoryPage />}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => setCurrentPage('capture')}
            className={`flex-1 py-3 text-center font-medium ${
              currentPage === 'capture'
                ? 'text-blue-600 border-t-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            📝 Captura
          </button>
          <button
            onClick={() => setCurrentPage('ask')}
            className={`flex-1 py-3 text-center font-medium ${
              currentPage === 'ask'
                ? 'text-blue-600 border-t-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            💬 Consultas
          </button>
          <button
            onClick={() => setCurrentPage('history')}
            className={`flex-1 py-3 text-center font-medium ${
              currentPage === 'history'
                ? 'text-blue-600 border-t-2 border-blue-600'
                : 'text-gray-600'
            }`}
          >
            📊 Historial
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App