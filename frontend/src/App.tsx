import { useEffect, useState, type ReactNode } from 'react'
import {
  getHealth,
  getPackedProducts,
  getRawMaterials,
  getShops,
  getWarehouses,
  type HealthResponse,
  type PackedProduct,
  type RawMaterial,
  type Shop,
  type Warehouse,
} from './api'

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [packedProducts, setPackedProducts] = useState<PackedProduct[]>([])

  useEffect(() => {
    getHealth()
      .then((res) => setHealth(res.data))
      .catch(() => setError('Nepavyko prisijungti prie API (http://localhost:8000)'))

    Promise.all([getRawMaterials(), getWarehouses(), getShops(), getPackedProducts()])
      .then(([rm, wh, sh, pp]) => {
        setRawMaterials(rm.data.data)
        setWarehouses(wh.data.data)
        setShops(sh.data.data)
        setPackedProducts(pp.data.data)
      })
      .catch(() => setError('Nepavyko užkrauti duomenų iš API'))
  }, [])

  const connected = health !== null && error === null

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-amber-900 text-amber-50 px-6 py-5 shadow">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            UAB Romnesa — Šakočių apskaita
          </h1>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              connected ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'
            }`}
          >
            {connected ? `API prisijungta (${health.app})` : error ?? 'Jungiamasi…'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid gap-6 md:grid-cols-2">
        <Card title="Žaliavos" count={rawMaterials.length}>
          {rawMaterials.map((m) => (
            <li key={m.id} className="flex justify-between border-b border-stone-100 py-1.5 last:border-0">
              <span>{m.name}</span>
              <span className="text-stone-400 text-sm">{m.unit}{!m.requires_batch && ' · be partijos'}</span>
            </li>
          ))}
        </Card>

        <Card title="Fasavimo rūšys" count={packedProducts.length}>
          {packedProducts.map((p) => (
            <li key={p.id} className="flex justify-between border-b border-stone-100 py-1.5 last:border-0">
              <span>{p.name}</span>
            </li>
          ))}
        </Card>

        <Card title="Sandėliai" count={warehouses.length}>
          {warehouses.map((w) => (
            <li key={w.id} className="py-1.5 border-b border-stone-100 last:border-0">{w.name}</li>
          ))}
        </Card>

        <Card title="Parduotuvės" count={shops.length}>
          {shops.map((s) => (
            <li key={s.id} className="py-1.5 border-b border-stone-100 last:border-0">{s.name}</li>
          ))}
        </Card>
      </main>
    </div>
  )
}

function Card({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-900">
          {count}
        </span>
      </div>
      <ul className="text-sm">{children}</ul>
    </section>
  )
}

export default App
