import { useEffect, useState, type FormEvent } from 'react'
import { createOutflow, getBatches, getOutflows, errText, type MaterialBatch, type MaterialOutflow } from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls } from '../ui'

export default function OutflowsPage() {
  const [rows, setRows] = useState<MaterialOutflow[]>([])
  const [batches, setBatches] = useState<MaterialBatch[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    outflow_date: new Date().toISOString().slice(0, 10),
    material_batch_id: '', qty_kg: '', outflow_type: 'transfer',
    destination: '', document_number: '', notes: '',
  })

  const load = () => getOutflows().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getBatches().then((r) => setBatches(r.data.data.filter((b) => (b.balance_kg ?? 0) > 0)))
  }, [])

  const selected = batches.find((b) => String(b.id) === f.material_batch_id)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await createOutflow({ ...f, material_batch_id: +f.material_batch_id, qty_kg: +f.qty_kg })
      setF({ ...f, qty_kg: '', document_number: '', notes: '' })
      await load()
      const r = await getBatches()
      setBatches(r.data.data.filter((b) => (b.balance_kg ?? 0) > 0))
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Žaliavų perdavimai / nurašymai">
        <Table
          cols={[
            { header: 'Data', render: (o) => fmtDate(o.outflow_date) },
            { header: 'Tipas', render: (o) => (
                <Badge tone={o.outflow_type === 'transfer' ? 'amber' : 'red'}>
                  {o.outflow_type === 'transfer' ? 'Perdavimas' : 'Nurašymas'}
                </Badge>
              ) },
            { header: 'Partija', render: (o) => o.material_batch?.batch_number },
            { header: 'Žaliava', render: (o) => o.material_batch?.raw_material?.name },
            { header: 'Kg', align: 'right', render: (o) => fmtKg(o.qty_kg) },
            { header: 'Kam / priežastis', render: (o) => o.destination ?? '—' },
            { header: 'Dok.', render: (o) => o.document_number ?? '—' },
          ]}
          rows={rows}
        />
      </Card>

      <Card title="Registruoti perdavimą">
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Data"><input type="date" className={inputCls} value={f.outflow_date} onChange={(e) => setF({ ...f, outflow_date: e.target.value })} required /></Field>
          <Field label="Partija">
            <select className={inputCls} value={f.material_batch_id} onChange={(e) => setF({ ...f, material_batch_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_number} · {b.raw_material?.name} · liko {fmtKg(b.balance_kg)} kg
                </option>
              ))}
            </select>
          </Field>
          {selected && <p className="text-xs text-stone-500">Likučio limitas: {fmtKg(selected.balance_kg)} kg</p>}
          <Field label="Kiekis, kg"><input type="number" step="0.001" min="0.001" max={selected?.balance_kg} className={inputCls} value={f.qty_kg} onChange={(e) => setF({ ...f, qty_kg: e.target.value })} required /></Field>
          <Field label="Tipas">
            <select className={inputCls} value={f.outflow_type} onChange={(e) => setF({ ...f, outflow_type: e.target.value })}>
              <option value="transfer">Perdavimas kitam cechui</option>
              <option value="writeoff">Nurašymas</option>
            </select>
          </Field>
          <Field label="Kam / priežastis"><input className={inputCls} value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="Cechas arba priežastis" /></Field>
          <Field label="Dok. Nr."><input className={inputCls} value={f.document_number} onChange={(e) => setF({ ...f, document_number: e.target.value })} /></Field>
          <button className={btnCls} disabled={busy}>{busy ? 'Saugoma…' : 'Registruoti'}</button>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}
