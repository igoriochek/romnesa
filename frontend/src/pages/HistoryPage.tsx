import { useEffect, useState } from 'react'
import { getHistory, type AuditRow, type Paginated } from '../api'
import { Badge, Card, Err, Table } from '../ui'

const ACTIONS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'stone' }> = {
  created: { label: 'Sukurta', tone: 'green' },
  updated: { label: 'Pakeista', tone: 'amber' },
  deleted: { label: 'Ištrinta', tone: 'red' },
  locked: { label: 'Užrakinta', tone: 'stone' },
  unlocked: { label: 'Atrakinta', tone: 'stone' },
}

const fmtTime = (iso: string) => iso.slice(0, 16).replace('T', ' ')

const KEY_FIELDS = ['batch_number', 'qty_received_kg', 'qty_produced_kg', 'qty_units', 'qty_kg', 'material_batch_id', 'production_id', 'name', 'code', 'movement_type', 'outflow_type']

const summary = (data: Record<string, unknown>) =>
  Object.entries(data)
    .filter(([k, v]) => KEY_FIELDS.includes(k) && v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ')

function changesText(r: AuditRow): string {
  if (!r.payload) return ''
  if (r.action === 'updated') {
    // _old - buvusios reikšmės (seni įrašai jų neturi - rodomi tik laukai)
    const old = (r.payload._old ?? {}) as Record<string, unknown>
    return Object.entries(r.payload)
      .filter(([k]) => !['updated_at', '_old'].includes(k))
      .map(([k, v]) => (k in old ? `${k}: ${old[k] ?? '—'} → ${v ?? '—'}` : k))
      .join(', ')
  }
  if (r.action === 'created') return summary(r.payload)
  if (r.action === 'deleted') return summary((r.payload.deleted ?? {}) as Record<string, unknown>)
  return ''
}

export default function HistoryPage() {
  const [page, setPage] = useState<Paginated<AuditRow> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [p, setP] = useState(1)

  const load = () =>
    getHistory({ entity: filter || undefined, page: p })
      .then((r) => setPage(r.data))
      .catch(() => setErr('Nepavyko užkrauti istorijos'))

  useEffect(() => { load() }, [filter, p])

  return (
    <Card
      title="Registracijų istorija"
      actions={
        <select className="rounded-lg border border-stone-300 px-2 py-1 text-sm" value={filter} onChange={(e) => { setP(1); setFilter(e.target.value) }}>
          <option value="">Viskas</option>
          <option value="MaterialBatch">Partijos</option>
          <option value="Production">Gamyba</option>
          <option value="MaterialUsage">Sunaudojimai</option>
          <option value="MaterialOutflow">Perdavimai</option>
          <option value="ProductMovement">Judėjimai</option>
          <option value="Recipe">Receptūros</option>
          <option value="RecipeItem">Receptūrų eilutės</option>
          <option value="RawMaterial">Žaliavos</option>
          <option value="ProductionProduct">Gamybinės rūšys</option>
          <option value="PackedProduct">Fasavimo rūšys</option>
          <option value="Warehouse">Sandėliai</option>
          <option value="Shop">Parduotuvės</option>
          <option value="LWeek">L savaitės</option>
        </select>
      }
    >
      <Err msg={err} />
      <Table
        cols={[
          { header: 'Laikas', render: (r) => fmtTime(r.created_at) },
          { header: 'Veiksmas', render: (r) => <Badge tone={ACTIONS[r.action]?.tone ?? 'stone'}>{ACTIONS[r.action]?.label ?? r.action}</Badge> },
          { header: 'Įrašas', render: (r) => r.label ?? `${r.entity_type.split('\\').pop()} #${r.entity_id}` },
          { header: 'Duomenys', render: (r) => <span className="text-xs text-stone-500">{changesText(r)}</span> },
          { header: 'Vartotojas', render: (r) => r.user?.name ?? '—' },
        ]}
        rows={page?.data ?? []}
        empty="Istorija tuščia"
      />
      {page && page.last_page > 1 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={p <= 1} onClick={() => setP(p - 1)}>←</button>
          <span>{p} / {page.last_page}</span>
          <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={p >= page.last_page} onClick={() => setP(p + 1)}>→</button>
        </div>
      )}
    </Card>
  )
}
