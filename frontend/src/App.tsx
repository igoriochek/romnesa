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
import ReportsPage, { type ReportId, type ReportRequest } from './pages/ReportsPage'
import WriteoffActsPage from './pages/WriteoffActsPage'
import ChangePasswordForm from './pages/ChangePasswordForm'
import { Dropdown, type IconName } from './ui'

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

// Viršutinės juostos meniu ataskaitos - Ataskaitų skirtukas jas suformuoja ir iškart spausdina / eksportuoja
const MENU_REPORTS: { type: ReportId; label: string; icon: IconName }[] = [
  { type: 'batches', label: 'Partijų sąrašas / gavimo žurnalas', icon: 'doc' },
  { type: 'usage', label: 'Sunaudojimas', icon: 'doc' },
  { type: 'cost', label: 'Gaminių savikaina', icon: 'chart' },
  { type: 'balances', label: 'Likučiai', icon: 'doc' },
  { type: 'trace', label: 'Atsekamumas', icon: 'route' },
]

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

  if (user === undefined) return <div className="min-h-screen bg-[#f6f3ef]" />
  if (user === null) return <LoginPage onLogin={setUser} />

  const doLogout = () => logout().finally(() => setUser(null))

  if (user.must_change_password) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f6f3ef] px-4">
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
  const [reportReq, setReportReq] = useState<ReportRequest | null>(null)
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? ''

  const doPdf = async (label = tabLabel) => {
    setPdfBusy(true)
    try { await exportPdf(`Romnesa_${label.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('sv-SE')}`) }
    catch { window.alert('Nepavyko sukurti PDF. Bandykite „Spausdinti“ → „Išsaugoti kaip PDF“.') }
    finally { setPdfBusy(false) }
  }

  const openReport = (type: ReportId, action: 'print' | 'pdf') => {
    setTab('reports')
    setReportReq((r) => ({ type, action, n: (r?.n ?? 0) + 1 }))
  }

  const menu = (action: 'print' | 'pdf') => [
    { label: 'Šis puslapis', icon: (action === 'print' ? 'printer' : 'pdf') as IconName, onClick: () => (action === 'print' ? printPage() : doPdf()) },
    'sep' as const,
    ...MENU_REPORTS.map((r) => ({ label: `${r.label}${action === 'pdf' ? ' (PDF)' : ''}`, icon: r.icon, onClick: () => openReport(r.type, action) })),
  ]

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth()
      .then((res) => setHealth(res.data))
      .catch(() => setError(`Nepavyko prisijungti prie API (${api.defaults.baseURL})`))
  }, [])

  const connected = health !== null && error === null

  return (
    <div className="min-h-screen bg-[#f6f3ef] text-stone-800">
      <header className="bg-[#7a3410] px-6 py-2.5 text-white shadow">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            UAB „Romnesa“ — Šakočių apskaita
            <span
              title={connected ? 'API prisijungta' : error ?? 'Jungiamasi…'}
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-400' : error ? 'bg-red-400' : 'bg-amber-300'}`}
            />
            {error && <span className="text-sm font-normal text-red-100">{error}</span>}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown label="Spausdinti" icon="printer" items={menu('print')} />
            <Dropdown label={pdfBusy ? 'Ruošiama…' : 'Eksportuoti į PDF'} icon="pdf" items={menu('pdf')} disabled={pdfBusy} />
            <Dropdown label="Nustatymai" icon="gear" items={[
              { label: `${user.name} (${user.username})`, icon: 'user', onClick: () => setPwOpen(true) },
              'sep',
              { label: 'Keisti slaptažodį', icon: 'key', onClick: () => setPwOpen(true) },
              { label: 'Atsijungti', icon: 'logout', onClick: onLogout },
            ]} />
          </div>
        </div>
      </header>

      <nav className="border-b border-stone-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setReportReq(null) }}
              className={`border-b-[3px] px-5 py-3 text-[15px] whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-amber-800 bg-amber-100/70 font-semibold text-stone-900'
                  : 'border-transparent text-stone-700 hover:bg-stone-50 hover:text-stone-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main id={PRINT_AREA_ID} className="mx-auto max-w-[1600px] px-6 py-6">
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
        {tab === 'reports' && (
          <ReportsPage
            request={reportReq}
            // palaukiam, kol React nupieš ataskaitą, tada spausdinam / darom PDF
            onReady={(action, label) => setTimeout(() => (action === 'print' ? printPage() : doPdf(label)), 200)}
          />
        )}
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
