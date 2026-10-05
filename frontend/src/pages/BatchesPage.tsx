import { useEffect, useState, type FormEvent } from 'react'
import {
  createBatch, getBatches, getRawMaterials, errText,
  type MaterialBatch, type RawMaterial,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls } from '../ui'

export default function BatchesPage() {
  const [rows, setRows] = useState<MaterialBatch[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    received_date: new Date().toISOString().slice(0, 10),
    raw_material_id: '', batch_number: '', qty_received_kg: '',
    supplier: '', invoice_number: '', expiry_date: '', notes: '',
  })

  const load = () => getBatches().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getRawMaterials().then((r) => setMaterials(r.data.data))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await createBatch({ ...f, raw_material_id: +f.raw_material_id, qty_received_kg: +f.qty_received_kg })
      setF({ ...f, batch_number: '', qty_received_kg: '', invoice_number: '', notes: '' })
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Žaliavų partijos">
        <Table
          cols={[
            { header: 'Partija', render: (b) => b.batch_number },
            { header: 'Žaliava', render: (b) => b.raw_material?.name },
            { header: 'Gauta kg', align: 'right', render: (b) => fmtKg(b.qty_received_kg) },
            { header: 'Likutis kg', align: 'right', render: (b) => <b>{fmtKg(b.balance_kg)}</b> },
            { header: 'Galioja iki', render: (b) => fmtDate(b.expiry_date) },
            { header: 'D.', align: 'right', render: (b) => (
                <Badge tone={(b.days_to_expiry ?? 0) < 0 ? 'red' : (b.days_to_expiry ?? 0) <= 14 ? 'amber' : 'green'}>
                  {b.days_to_expiry}
                </Badge>
              ) },
            { header: 'Tiekėjas', render: (b) => b.supplier ?? '—' },
          ]}
          rows={rows}
        />
      </Card>

      <Card title="Registruoti gavimą">
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Gavimo data"><input type="date" className={inputCls} value={f.received_date} onChange={(e) => setF({ ...f, received_date: e.target.value })} required /></Field>
          <Field label="Žaliava">
            <select className={inputCls} value={f.raw_material_id} onChange={(e) => setF({ ...f, raw_material_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Partijos Nr."><input className={inputCls} value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} placeholder="Mil0630" required /></Field>
          <Field label="Kiekis, kg"><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_received_kg} onChange={(e) => setF({ ...f, qty_received_kg: e.target.value })} required /></Field>
          <Field label="Galioja iki"><input type="date" className={inputCls} value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} required /></Field>
          <Field label="Tiekėjas"><input className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Sąsk. Nr."><input className={inputCls} value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>
          <button className={btnCls} disabled={busy}>{busy ? 'Saugoma…' : 'Registruoti'}</button>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}
