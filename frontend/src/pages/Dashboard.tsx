import { useEffect, useState } from 'react'
import { getDashboard, type DashboardData } from '../api'
import { Badge, Card, Err, Table, fmtKg } from '../ui'

const REFRESH_MS = 30_000 // suvestinė skaičiuojama realiu laiku - atnaujinama automatiškai

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      getDashboard().then((r) => { setData(r.data); setErr(null) }).catch(() => setErr('Nepavyko užkrauti suvestinės'))
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [])

  if (err && !data) return <Err msg={err} />
  if (!data) return <p className="py-8 text-center text-stone-400">Kraunama…</p>

  const kpis = [
    { label: 'Pagaminta iš viso', value: `${fmtKg(data.produced_kg)} kg` },
    { label: 'Gamybų', value: data.productions },
    { label: 'Aktyvios partijos', value: data.batches_active },
    { label: 'Pasibaigusios su likučiu', value: data.batches_expired },
    { label: 'Išvežta parduotuvėms', value: `${fmtKg(data.shipped_kg)} kg` },
  ]

  return (
    <div className="grid gap-6">
      <p className="text-right text-xs text-stone-400">
        Atnaujinta {new Date(data.updated_at).toLocaleTimeString('lt-LT')} · kas {REFRESH_MS / 1000} s
        {err && <span className="text-red-600"> · {err}</span>}
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <p className="text-xs text-stone-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      <Card title="Žaliavos: gauta / sunaudota / perduota / likutis (kg)">
        <Table
          cols={[
            { header: 'Žaliava', render: (m) => m.raw_material },
            { header: 'Gauta', align: 'right', render: (m) => fmtKg(m.received_kg) },
            { header: 'Sunaudota', align: 'right', render: (m) => fmtKg(m.used_kg) },
            { header: 'Perduota', align: 'right', render: (m) => fmtKg(m.outflow_kg) },
            { header: 'Likutis', align: 'right', render: (m) => <b>{fmtKg(m.balance_kg)}</b> },
            { header: 'Pasibaigęs likutis', align: 'right', render: (m) => (
                m.expired_kg > 0.001 ? <Badge tone="red">{fmtKg(m.expired_kg)}</Badge> : '—'
              ) },
          ]}
          rows={data.materials}
          empty="Partijų dar nėra"
        />
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Greitai baigsis galiojimas (≤14 d.)">
          <Table
            cols={[
              { header: 'Partija', render: (b) => b.batch_number },
              { header: 'Žaliava', render: (b) => b.raw_material?.name },
              { header: 'Likutis kg', align: 'right', render: (b) => fmtKg(b.balance_kg) },
              { header: 'Liko d.', align: 'right', render: (b) => (
                  <Badge tone={(b.days_to_expiry ?? 0) < 0 ? 'red' : (b.days_to_expiry ?? 0) <= 7 ? 'amber' : 'green'}>
                    {b.days_to_expiry}
                  </Badge>
                ) },
            ]}
            rows={data.expiring_soon}
            empty="Nėra artėjančių galiojimo pabaigai"
          />
        </Card>

        <Card title="Partijų trūkumai (TRŪKSTA)">
          <Table
            cols={[
              { header: 'Gamyba', render: (u) => `#${u.production_id} · ${u.production?.l_week?.code ?? '—'}` },
              { header: 'Žaliava', render: (u) => u.raw_material?.name },
              { header: 'Trūksta kg', align: 'right', render: (u) => fmtKg(u.qty_kg) },
            ]}
            rows={data.shortages}
            empty="Visų žaliavų užtenka"
          />
        </Card>
      </div>
    </div>
  )
}
