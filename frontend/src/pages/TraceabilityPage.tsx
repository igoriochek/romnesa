import { useState } from 'react'
import { getBatches, traceBatch, traceLWeek, errText, type MaterialBatch, type TraceBatchResult, type TraceLWeekResult } from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls } from '../ui'
import { useEffect } from 'react'

export default function TraceabilityPage() {
  const [mode, setMode] = useState<'lweek' | 'batch'>('lweek')
  const [code, setCode] = useState('')
  const [batches, setBatches] = useState<MaterialBatch[]>([])
  const [batchId, setBatchId] = useState('')
  const [lRes, setLRes] = useState<TraceLWeekResult | null>(null)
  const [bRes, setBRes] = useState<TraceBatchResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getBatches().then((r) => setBatches(r.data.data)) }, [])

  const search = async () => {
    setBusy(true); setErr(null); setLRes(null); setBRes(null)
    try {
      if (mode === 'lweek') setLRes((await traceLWeek(code)).data)
      else setBRes((await traceBatch(+batchId)).data)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const mvCols = [
    { header: 'Data', render: (m: { movement_date: string; movement_type: string; packed_product?: { name: string }; shop?: { name: string } | null; warehouse_from?: { name: string } | null; warehouse_to?: { name: string } | null; qty_units: number; qty_kg: number }) => fmtDate(m.movement_date) },
    { header: 'Tipas', render: (m: { movement_type: string }) => <Badge>{m.movement_type}</Badge> },
    { header: 'Produktas', render: (m: { packed_product?: { name: string } }) => m.packed_product?.name },
    { header: 'Iš', render: (m: { warehouse_from?: { name: string } | null }) => m.warehouse_from?.name ?? '—' },
    { header: 'Į', render: (m: { warehouse_to?: { name: string } | null; shop?: { name: string } | null }) => m.warehouse_to?.name ?? m.shop?.name ?? '—' },
    { header: 'Kg', align: 'right' as const, render: (m: { qty_kg: number }) => fmtKg(m.qty_kg) },
  ]

  return (
    <div className="grid gap-6">
      <Card title="Atsekamumo paieška">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kryptis">
            <select className={inputCls} value={mode} onChange={(e) => { setMode(e.target.value as 'lweek' | 'batch'); setLRes(null); setBRes(null) }}>
              <option value="lweek">L savaitė → žaliavų partijos ir judėjimai</option>
              <option value="batch">Žaliavos partija → kur panaudota</option>
            </select>
          </Field>
          {mode === 'lweek' ? (
            <Field label="L savaitės kodas">
              <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="L406" required />
            </Field>
          ) : (
            <Field label="Partija">
              <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
                <option value="">— pasirinkite —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_number} · {b.raw_material?.name}</option>)}
              </select>
            </Field>
          )}
          <button className={btnCls} onClick={search} disabled={busy || (mode === 'lweek' ? !code : !batchId)}>
            {busy ? 'Ieškoma…' : 'Ieškoti'}
          </button>
        </div>
        <Err msg={err} />
      </Card>

      {lRes && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title={`L savaitė ${lRes.l_week.code} – panaudotos žaliavos`}>
            <Table
              cols={[
                { header: 'Žaliava', render: (u) => u.raw_material?.name },
                { header: 'Partija', render: (u) => u.material_batch?.batch_number ?? <Badge tone="red">TRŪKSTA</Badge> },
                { header: 'Kg', align: 'right', render: (u) => fmtKg(u.qty_kg) },
                { header: 'Gamyba', render: (u) => `#${u.production_id}` },
              ]}
              rows={lRes.materials}
              empty="Šiai L savaitei nėra sunaudojimų"
            />
          </Card>
          <Card title={`L savaitė ${lRes.l_week.code} – produkto judėjimai`}>
            <Table cols={mvCols} rows={lRes.movements} empty="Nėra judėjimų" />
          </Card>
        </div>
      )}

      {bRes && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title={`Partija ${bRes.batch.batch_number} – panaudota gamyboje`}>
            <p className="mb-3 text-sm text-stone-500">
              {bRes.batch.raw_material?.name} · likutis {fmtKg(bRes.batch.balance_kg)} kg
            </p>
            <Table
              cols={[
                { header: 'Gamyba', render: (u) => `#${u.production_id} · ${u.production?.production_product?.name}` },
                { header: 'L savaitė', render: (u) => <Badge tone="amber">{u.production?.l_week?.code}</Badge> },
                { header: 'Kg', align: 'right', render: (u) => fmtKg(u.qty_kg) },
              ]}
              rows={bRes.usages}
              empty="Ši partija dar nepanaudota"
            />
          </Card>
          <Card title="Susijusių L savaičių produkto judėjimai">
            <Table cols={mvCols} rows={bRes.movements} empty="Nėra judėjimų" />
          </Card>
        </div>
      )}
    </div>
  )
}
