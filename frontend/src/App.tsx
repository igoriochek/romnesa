import { useEffect, useState } from 'react'
import { api, AUTH_EXPIRED_EVENT, PASSWORD_CHANGE_EVENT, getHealth, getMe, getToken, logout, type HealthResponse, type User } from './api'
import { PRINT_AREA_ID, exportPdf, printPage } from './print'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import BatchesPage from './pages/BatchesPage'
import ProductionsPage from './pages/ProductionsPage'
import MovementsPage from './pages/MovementsPage'
import OutflowsPage from './pages/OutflowsPage'
import TraceabilityPage from './pages/TraceabilityPage'
import ClassifiersPage from './pages/ClassifiersPage'
import HistoryPage from './pages/HistoryPage'
import WarehouseStockCard from './pages/StockPage'
import ReportsPage from './pages/ReportsPage'
import WriteoffActsPage from './pages/WriteoffActsPage'
import ChangePasswordForm from './pages/ChangePasswordForm'

const TABS = [
  { id: 'dash', label: 'Suvestinė' },
  { id: 'batches', label: 'Partijos' },
  { id: 'production', label: 'Gamyba' },
  { id: 'movements', label: 'Judėjimai' },
  { id: 'outflows', label: 'Perdavimai' },
  { id: 'acts', label: 'Nurašymo aktai' },
  { id: 'trace', label: 'Atsekamumas' },
  { id: 'stock', label: 'Likučiai' },
  { id: 'reports', label: 'Ataskaitos' },
  { id: 'history', label: 'Istorija' },
  { id: 'classifiers', label: 'Klasifikatoriai' },
] as const

type TabId = (typeof TABS)[number]['id']

const topBtn = 'rounded-lg bg-amber-50/10 px-3 py-1 text-sm font-medium text-amber-50 hover:bg-amber-50/20 disabled:opacity-50'

function App() {
  // undefined = tikrinama, null = neprisijungta
  const [user, setUser] = useState<User | null | undefined>(getToken() ? undefined : null)

  useEffect(() => {
    if (getToken()) getMe().then((res) => setUser(res.data), () => setUser(null))
    const expired = () => setUser(null)
    // serveris atsisakė vykdyti, kol nepakeistas numatytasis slaptažodis
    const mustChange = () => setUser((u) => (u ? { ...u, must_change_password: true } : u))
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    window.addEventListener(PASSWORD_CHANGE_EVENT, mustChange)
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
      window.removeEventListener(PASSWORD_CHANGE_EVENT, mustChange)
    }
  }, [])

  if (user === undefined) return <div className="min-h-screen bg-stone-100" />
  if (user === null) return <LoginPage onLogin={setUser} />

  const doLogout = () => logout().finally(() => setUser(null))

  if (user.must_change_password) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-100 px-4">
        <ChangePasswordForm forced onDone={setUser} />
        <button className="text-sm text-stone-500 hover:text-stone-800" onClick={doLogout}>Atsijungti</button>
      </div>
    )
  }

  return <Shell user={user} onUser={setUser} onLogout={doLogout} />
}

function Shell({ user, onUser, onLogout }: { user: User; onUser: (u: User) => void; onLogout: () => void }) {
  const [tab, setTab] = useState<TabId>('dash')
  const [pwOpen, setPwOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? ''

  const doPdf = async () => {
    setPdfBusy(true)
    try { await exportPdf(`Romnesa_${tabLabel.replace(/s+/g, '_')}_${new Date().toLocaleDateString('sv-SE')}`) }
    catch { window.alert('Nepavyko sukurti PDF. Bandykite „Spausdinti“ → „Išsaugoti kaip PDF“.') }
    finally { setPdfBusy(false) }
  }
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((res) => setHealth(res.data))
      .catch(() => setError(`Nepavyko prisijungti prie API (${api.defaults.baseURL})`))
  }, [])

  const connected = health !== null && error === null

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-amber-900 px-6 py-4 text-amber-50 shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">UAB Romnesa — Šakočių apskaita</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                connected ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'
              }`}
            >
              {connected ? 'API prisijungta' : error ?? 'Jungiamasi…'}
            </span>
            <button onClick={printPage} className={topBtn}>Spausdinti</button>
            <button onClick={doPdf} disabled={pdfBusy} className={topBtn}>{pdfBusy ? 'Ruošiama…' : 'Eksportuoti PDF'}</button>
            <span className="text-sm text-amber-100">{user.name}</span>
            <button onClick={() => setPwOpen(true)} className={topBtn} title="Keisti slaptažodį">Slaptažodis</button>
            <button onClick={onLogout} className={topBtn}>
              Atsijungti
            </button>
          </div>
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

      <main id={PRINT_AREA_ID} className="mx-auto max-w-7xl px-6 py-8">
        {tab !== 'acts' && tab !== 'reports' && (
          <div className="print-only mb-4 border-b border-stone-300 pb-2">
            <p className="text-xs text-stone-600">UAB „Romnesa“ · Šakočių apskaita</p>
            <h2 className="text-lg font-bold">{tabLabel}</h2>
            <p className="text-xs text-stone-600">Spausdinta {new Date().toLocaleString('lt-LT')} · {user.name}</p>
          </div>
        )}
        {tab === 'dash' && <Dashboard />}
        {tab === 'batches' && <BatchesPage />}
        {tab === 'production' && <ProductionsPage />}
        {tab === 'movements' && <MovementsPage />}
        {tab === 'outflows' && <OutflowsPage />}
        {tab === 'acts' && <WriteoffActsPage />}
        {tab === 'trace' && <TraceabilityPage />}
        {tab === 'stock' && <WarehouseStockCard />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'classifiers' && <ClassifiersPage />}
      </main>

      {pwOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setPwOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ChangePasswordForm onDone={(u) => { onUser(u); setPwOpen(false); window.alert('Slaptažodis pakeistas.') }} onCancel={() => setPwOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
