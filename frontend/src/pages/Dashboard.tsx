import { useEffect, useState } from 'react'
import { getDashboard, type DashboardData } from '../api'
import { Badge, Card, Err, Table, fmtKg } from '../ui'

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getDashboard().then((r) => setData(r.data)).catch(() => setErr('Nepavyko užkrauti suvestinės'))
  }, [])

  if (err) return <Err msg={err} />
  if (!data) return <p className="py-8 text-center text-stone-400">Kraunama…</p>

  const kpis = [
    { label: 'Pagaminta iš viso', value: `${fmtKg(data.produced_kg)} kg` },
    { label: 'Gamybų', value: data.productions },
    { label: 'Aktyvios partijos', value: data.batches_active },
    { label: 'Išvežta parduotuvėms', value: `${fmtKg(data.shipped_kg)} kg` },
  ]

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <p className="text-xs text-stone-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

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
