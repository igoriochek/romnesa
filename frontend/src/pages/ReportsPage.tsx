import { useEffect, useState, type ReactNode } from 'react'
import {
  getBatchReport, getBatches, getRawMaterials, getUsageReport, traceBatch, traceLWeek, errText, isShortage,
  type MaterialBatch, type MaterialUsage, type RawMaterial, type ReportFilter, type TraceBatchResult, type TraceLWeekResult,
} from '../api'
import { Badge, Card, Err, Field, btnCls, fmtDate, fmtEur, fmtKg, fmtUnitEur, inputCls } from '../ui'

const REPORTS = {
  batches: 'Partijų ataskaita',
  balances: 'Likučių ataskaita',
  usage: 'Sunaudojimo ataskaita',
  trace: 'Atsekamumo ataskaita',
} as const
type ReportId = keyof typeof REPORTS

type UsageRow = MaterialUsage & { unit_cost_eur: number | null; value_eur: number | null }

interface Column<T> { header: string; render: (r: T) => ReactNode; num?: boolean }

const th = 'border border-stone-300 bg-stone-100 px-2 py-1 text-left font-semibold'
const td = 'border border-stone-300 px-2 py-1'

/** Ataskaitos lentelė su rėmeliais (gerai atrodo ir popieriuje) ir sumų eilute. */
function ReportTable<T>({ cols, rows, total, rowKey }: {
  cols: Column<T>[]; rows: T[]; total?: (ReactNode | null)[]; rowKey: (r: T) => string | number
}) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-stone-400">Pagal pasirinktus filtrus duomenų nėra</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>{cols.map((c) => <th key={c.header} className={`${th} ${c.num ? 'text-right' : ''}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {cols.map((c) => <td key={c.header} className={`${td} ${c.num ? 'text-right tabular-nums' : ''}`}>{c.render(r)}</td>)}
            </tr>
          ))}
          {total && (
            <tr className="font-semibold">
              {total.map((t, i) => <td key={i} className={`${td} ${cols[i]?.num ? 'text-right tabular-nums' : ''}`}>{t}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const sum = <T,>(rows: T[], f: (r: T) => number | null | undefined) => rows.reduce((s, r) => s + Number(f(r) ?? 0), 0)

function BatchesReport({ rows, balances }: { rows: MaterialBatch[]; balances: boolean }) {
  const cols: Column<MaterialBatch>[] = [
    { header: 'Žaliava', render: (b) => b.raw_material?.name },
    { header: 'Partijos Nr.', render: (b) => b.batch_number },
    { header: 'Gauta', render: (b) => fmtDate(b.received_date) },
    { header: 'Tiekėjas', render: (b) => b.supplier ?? '—' },
    { header: 'Gauta kg', num: true, render: (b) => fmtKg(b.qty_received_kg) },
    { header: '€/kg', num: true, render: (b) => fmtUnitEur(b.unit_cost_eur) },
    { header: 'Vertė €', num: true, render: (b) => fmtEur(b.total_cost_eur) },
    { header: 'Sunaudota kg', num: true, render: (b) => fmtKg(b.used_kg) },
    { header: 'Perduota / nurašyta kg', num: true, render: (b) => fmtKg(b.outflow_kg) },
    { header: 'Likutis kg', num: true, render: (b) => fmtKg(b.balance_kg) },
    { header: 'Likučio vertė €', num: true, render: (b) => fmtEur(b.balance_value_eur) },
    { header: 'Galioja iki', render: (b) => fmtDate(b.expiry_date) },
    { header: 'Liko d.', num: true, render: (b) => ((b.days_to_expiry ?? 0) < 0 ? <b className="text-red-700">{b.days_to_expiry}</b> : b.days_to_expiry) },
  ]
  const shown = balances ? cols.filter((c) => !['Tiekėjas', 'Vertė €', 'Sunaudota kg', 'Perduota / nurašyta kg'].includes(c.header)) : cols
  const totals: Record<string, ReactNode> = {
    'Žaliava': 'Iš viso',
    'Gauta kg': fmtKg(sum(rows, (b) => b.qty_received_kg)),
    'Vertė €': fmtEur(sum(rows, (b) => b.total_cost_eur)),
    'Sunaudota kg': fmtKg(sum(rows, (b) => b.used_kg)),
    'Perduota / nurašyta kg': fmtKg(sum(rows, (b) => b.outflow_kg)),
    'Likutis kg': fmtKg(sum(rows, (b) => b.balance_kg)),
    'Likučio vertė €': fmtEur(sum(rows, (b) => b.balance_value_eur)),
  }
  return <ReportTable cols={shown} rows={rows} rowKey={(b) => b.id} total={shown.map((c) => totals[c.header] ?? null)} />
}

function UsageReport({ rows }: { rows: UsageRow[] }) {
  // Suvestinė pagal žaliavą - po detalizacija
  const byMaterial = Object.values(rows.reduce<Record<string, { name: string; kg: number; eur: number }>>((acc, u) => {
    const name = u.raw_material?.name ?? '—'
    acc[name] ??= { name, kg: 0, eur: 0 }
    acc[name].kg += Number(u.qty_kg)
    acc[name].eur += Number(u.value_eur ?? 0)
    return acc
  }, {})).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="grid gap-4">
      <ReportTable<UsageRow>
        cols={[
          { header: 'Gamybos data', render: (u) => fmtDate(u.production?.production_date) },
          { header: 'Gamybos Nr.', render: (u) => u.production_id },
          { header: 'Gaminys', render: (u) => u.production?.production_product?.name },
          { header: 'L savaitė', render: (u) => u.production?.l_week?.code },
          { header: 'Žaliava', render: (u) => u.raw_material?.name },
          { header: 'Partija', render: (u) => u.material_batch?.batch_number ?? (isShortage(u) ? <Badge tone="red">TRŪKSTA</Badge> : 'be partijos') },
          { header: 'Kg', num: true, render: (u) => fmtKg(u.qty_kg) },
          { header: '€/kg', num: true, render: (u) => fmtUnitEur(u.unit_cost_eur) },
          { header: 'Vertė €', num: true, render: (u) => fmtEur(u.value_eur) },
        ]}
        rows={rows}
        rowKey={(u) => u.id}
        total={['Iš viso', null, null, null, null, null, fmtKg(sum(rows, (u) => u.qty_kg)), null, fmtEur(sum(rows, (u) => u.value_eur))]}
      />
      {byMaterial.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Suvestinė pagal žaliavas</h3>
          <ReportTable<{ name: string; kg: number; eur: number }>
            cols={[
              { header: 'Žaliava', render: (m) => m.name },
              { header: 'Sunaudota kg', num: true, render: (m) => fmtKg(m.kg) },
              { header: 'Vertė €', num: true, render: (m) => fmtEur(m.eur) },
            ]}
            rows={byMaterial}
            rowKey={(m) => m.name}
          />
        </div>
      )}
    </div>
  )
}

function TraceReport({ lw, batch }: { lw: TraceLWeekResult | null; batch: TraceBatchResult | null }) {
  const mvCols: Column<TraceLWeekResult['movements'][number]>[] = [
    { header: 'Data', render: (m) => fmtDate(m.movement_date) },
    { header: 'Tipas', render: (m) => ({ pack_in: 'Fasavimas', move: 'Perkėlimas', ship_out: 'Išvežimas' } as Record<string, string>)[m.movement_type] ?? m.movement_type },
    { header: 'Produktas', render: (m) => m.packed_product?.name },
    { header: 'Iš', render: (m) => m.warehouse_from?.name ?? '—' },
    { header: 'Į', render: (m) => m.warehouse_to?.name ?? m.shop?.name ?? '—' },
    { header: 'Vnt.', num: true, render: (m) => m.qty_units },
    { header: 'Kg', num: true, render: (m) => fmtKg(m.qty_kg) },
  ]

  if (lw) return (
    <div className="grid gap-4">
      <p className="text-sm">L savaitė <b>{lw.l_week.code}</b> → gamybos → panaudotos žaliavų partijos → produkto judėjimai.</p>
      <ReportTable<MaterialUsage>
        cols={[
          { header: 'Gamybos Nr.', render: (u) => u.production_id },
          { header: 'Gaminys', render: (u) => u.production?.production_product?.name },
          { header: 'Žaliava', render: (u) => u.raw_material?.name },
          { header: 'Partija', render: (u) => u.material_batch?.batch_number ?? (isShortage(u) ? 'TRŪKSTA' : 'be partijos') },
          { header: 'Gauta', render: (u) => fmtDate(u.material_batch?.received_date) },
          { header: 'Galioja iki', render: (u) => fmtDate(u.material_batch?.expiry_date) },
          { header: 'Tiekėjas', render: (u) => u.material_batch?.supplier ?? '—' },
          { header: 'Kg', num: true, render: (u) => fmtKg(u.qty_kg) },
        ]}
        rows={lw.materials}
        rowKey={(u) => u.id}
      />
      <h3 className="text-sm font-semibold">Produkto judėjimai</h3>
      <ReportTable cols={mvCols} rows={lw.movements} rowKey={(m) => m.id} />
    </div>
  )

  if (batch) return (
    <div className="grid gap-4">
      <p className="text-sm">
        Partija <b>{batch.batch.batch_number}</b> · {batch.batch.raw_material?.name} · gauta {fmtDate(batch.batch.received_date)}{' '}
        {fmtKg(batch.batch.qty_received_kg)} kg · galioja iki {fmtDate(batch.batch.expiry_date)} · likutis {fmtKg(batch.batch.balance_kg)} kg
      </p>
      <ReportTable<MaterialUsage>
        cols={[
          { header: 'Gamybos data', render: (u) => fmtDate(u.production?.production_date) },
          { header: 'Gamybos Nr.', render: (u) => u.production_id },
          { header: 'Gaminys', render: (u) => u.production?.production_product?.name },
          { header: 'L savaitė', render: (u) => u.production?.l_week?.code },
          { header: 'Kg', num: true, render: (u) => fmtKg(u.qty_kg) },
        ]}
        rows={batch.usages}
        rowKey={(u) => u.id}
        total={['Iš viso', null, null, null, fmtKg(sum(batch.usages, (u) => u.qty_kg))]}
      />
      <h3 className="text-sm font-semibold">Susijusių L savaičių produkto judėjimai</h3>
      <ReportTable cols={mvCols} rows={batch.movements} rowKey={(m) => m.id} />
    </div>
  )

  return null
}

export default function ReportsPage() {
  const [type, setType] = useState<ReportId>('batches')
  const [filter, setFilter] = useState({ from: '', to: '', raw_material_id: '' })
  const [trace, setTrace] = useState({ mode: 'lweek' as 'lweek' | 'batch', code: '', batchId: '' })
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [allBatches, setAllBatches] = useState<MaterialBatch[]>([])
  const [batchRows, setBatchRows] = useState<MaterialBatch[] | null>(null)
  const [usageRows, setUsageRows] = useState<UsageRow[] | null>(null)
  const [lw, setLw] = useState<TraceLWeekResult | null>(null)
  const [tb, setTb] = useState<TraceBatchResult | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getRawMaterials().then((r) => setMaterials(r.data.data))
    getBatches().then((r) => setAllBatches(r.data.data))
  }, [])

  const reset = () => { setBatchRows(null); setUsageRows(null); setLw(null); setTb(null); setGeneratedAt(null) }

  const generate = async () => {
    setBusy(true); setErr(null); reset()
    const params: ReportFilter = {
      ...(filter.from && { from: filter.from }),
      ...(filter.to && { to: filter.to }),
      ...(filter.raw_material_id && { raw_material_id: +filter.raw_material_id }),
    }
    try {
      if (type === 'batches') setBatchRows((await getBatchReport(params)).data)
      if (type === 'balances') setBatchRows((await getBatchReport({ raw_material_id: params.raw_material_id, only_balance: 1 })).data)
      if (type === 'usage') setUsageRows((await getUsageReport(params)).data)
      if (type === 'trace') {
        if (trace.mode === 'lweek') setLw((await traceLWeek(trace.code.trim())).data)
        else setTb((await traceBatch(+trace.batchId)).data)
      }
      setGeneratedAt(new Date())
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const materialName = materials.find((m) => String(m.id) === filter.raw_material_id)?.name
  const period = type === 'balances' || type === 'trace'
    ? null
    : filter.from || filter.to ? `${filter.from || '…'} – ${filter.to || '…'}` : 'visas laikotarpis'
  const canGenerate = type !== 'trace' || (trace.mode === 'lweek' ? trace.code.trim() !== '' : trace.batchId !== '')

  return (
    <div className="grid gap-6">
      <Card title="Ataskaitos" noPrint>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Ataskaita">
            <select className={inputCls} value={type} onChange={(e) => { setType(e.target.value as ReportId); reset() }}>
              {Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {type === 'trace' ? (
            <>
              <Field label="Kryptis">
                <select className={inputCls} value={trace.mode} onChange={(e) => setTrace({ ...trace, mode: e.target.value as 'lweek' | 'batch' })}>
                  <option value="lweek">Pagal L savaitę</option>
                  <option value="batch">Pagal žaliavos partiją</option>
                </select>
              </Field>
              {trace.mode === 'lweek' ? (
                <Field label="L savaitės kodas"><input className={inputCls} value={trace.code} onChange={(e) => setTrace({ ...trace, code: e.target.value })} placeholder="L406" /></Field>
              ) : (
                <Field label="Partija">
                  <select className={inputCls} value={trace.batchId} onChange={(e) => setTrace({ ...trace, batchId: e.target.value })}>
                    <option value="">— pasirinkite —</option>
                    {allBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_number} · {b.raw_material?.name}</option>)}
                  </select>
                </Field>
              )}
            </>
          ) : (
            <>
              {type !== 'balances' && (
                <>
                  <Field label={type === 'usage' ? 'Gamyba nuo' : 'Gauta nuo'}><input type="date" className={inputCls} value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></Field>
                  <Field label="iki"><input type="date" className={inputCls} value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></Field>
                </>
              )}
              <Field label="Žaliava">
                <select className={inputCls} value={filter.raw_material_id} onChange={(e) => setFilter({ ...filter, raw_material_id: e.target.value })}>
                  <option value="">Visos</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </>
          )}
          <button className={btnCls} onClick={generate} disabled={busy || !canGenerate}>{busy ? 'Formuojama…' : 'Formuoti'}</button>
        </div>
        <Err msg={err} />
        {generatedAt && <p className="mt-3 text-xs text-stone-500">Paruošta – spausdinkite arba eksportuokite PDF viršutinės juostos mygtukais.</p>}
      </Card>

      {generatedAt && (
        <section className="rounded-xl bg-white p-6 text-black shadow-sm ring-1 ring-stone-200">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-300 pb-2">
            <div>
              <p className="text-xs text-stone-600">UAB „Romnesa" · Šakočių gamyba</p>
              <h2 className="text-lg font-bold">{REPORTS[type]}</h2>
            </div>
            <div className="text-right text-xs text-stone-600">
              {period && <p>Laikotarpis: {period}</p>}
              {type !== 'trace' && <p>Žaliava: {materialName ?? 'visos'}</p>}
              {type === 'balances' && <p>Likučiai {generatedAt.toLocaleDateString('lt-LT')} dienai</p>}
              <p>Suformuota {generatedAt.toLocaleString('lt-LT')}</p>
            </div>
          </div>
          {batchRows && <BatchesReport rows={batchRows} balances={type === 'balances'} />}
          {usageRows && <UsageReport rows={usageRows} />}
          {type === 'trace' && <TraceReport lw={lw} batch={tb} />}
        </section>
      )}
    </div>
  )
}
