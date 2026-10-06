import { useEffect, useState } from 'react'
import { getHealth, type HealthResponse } from './api'
import Dashboard from './pages/Dashboard'
import BatchesPage from './pages/BatchesPage'
import ProductionsPage from './pages/ProductionsPage'
import MovementsPage from './pages/MovementsPage'
import OutflowsPage from './pages/OutflowsPage'
import TraceabilityPage from './pages/TraceabilityPage'
import ClassifiersPage from './pages/ClassifiersPage'
import HistoryPage from './pages/HistoryPage'
import WarehouseStockCard from './pages/StockPage'

const TABS = [
  { id: 'dash', label: 'Suvestinė' },
  { id: 'batches', label: 'Partijos' },
  { id: 'production', label: 'Gamyba' },
  { id: 'movements', label: 'Judėjimai' },
  { id: 'outflows', label: 'Perdavimai' },
  { id: 'trace', label: 'Atsekamumas' },
  { id: 'stock', label: 'Likučiai' },
  { id: 'history', label: 'Istorija' },
  { id: 'classifiers', label: 'Klasifikatoriai' },
] as const

type TabId = (typeof TABS)[number]['id']

function App() {
  const [tab, setTab] = useState<TabId>('dash')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((res) => setHealth(res.data))
      .catch(() => setError('Nepavyko prisijungti prie API (http://localhost:8080)'))
  }, [])

  const connected = health !== null && error === null

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-amber-900 px-6 py-4 text-amber-50 shadow">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">UAB Romnesa — Šakočių apskaita</h1>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              connected ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'
            }`}
          >
            {connected ? 'API prisijungta' : error ?? 'Jungiamasi…'}
          </span>
        </div>
      </header>

      <nav className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-amber-700 text-amber-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {tab === 'dash' && <Dashboard />}
        {tab === 'batches' && <BatchesPage />}
        {tab === 'production' && <ProductionsPage />}
        {tab === 'movements' && <MovementsPage />}
        {tab === 'outflows' && <OutflowsPage />}
        {tab === 'trace' && <TraceabilityPage />}
        {tab === 'stock' && <WarehouseStockCard />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'classifiers' && <ClassifiersPage />}
      </main>
    </div>
  )
}

export default App
