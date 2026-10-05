import { useEffect, useState, type FormEvent } from 'react'
import {
  createProduction, getLWeeks, getProductionProducts, getProductions, errText,
  type LWeek, type Production, type ProductionProduct,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls } from '../ui'

export default function ProductionsPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [products, setProducts] = useState<ProductionProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    production_date: new Date().toISOString().slice(0, 10),
    production_product_id: '', qty_produced_kg: '', l_week_id: '', notes: '',
  })

  const load = () => getProductions().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getProductionProducts().then((r) => setProducts(r.data.data))
    getLWeeks().then((r) => setLweeks(r.data.data))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await createProduction({
        ...f,
        production_product_id: +f.production_product_id,
        qty_produced_kg: +f.qty_produced_kg,
        l_week_id: +f.l_week_id,
      })
      const missing = res.data.usages?.filter((u) => u.material_batch_id === null)
      if (missing?.length) {
        setErr(`Dėmesio: trūko partijų – ${missing.map((m) => `${m.raw_material?.name} ${fmtKg(m.qty_kg)} kg`).join(', ')}`)
      }
      setF({ ...f, qty_produced_kg: '', notes: '' })
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Gamybos žurnalas">
        <Table
          cols={[
            { header: 'Data', render: (p) => fmtDate(p.production_date) },
            { header: 'Rūšis', render: (p) => p.production_product?.name },
            { header: 'Kiekis kg', align: 'right', render: (p) => fmtKg(p.qty_produced_kg) },
            { header: 'L savaitė', render: (p) => <Badge tone="amber">{p.l_week?.code}</Badge> },
            { header: 'Receptūra', render: (p) => (p.recipe_id ? `v${p.recipe_id}` : '—') },
            { header: 'Pastabos', render: (p) => p.notes ?? '—' },
          ]}
          rows={rows}
        />
      </Card>

      <Card title="Registruoti gamybą">
        <p className="mb-3 text-xs text-stone-500">Žaliavų sunaudojimas bus paskaičiuotas automatiškai pagal galiojančią receptūrą (FIFO).</p>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Data"><input type="date" className={inputCls} value={f.production_date} onChange={(e) => setF({ ...f, production_date: e.target.value })} required /></Field>
          <Field label="Gamybinė rūšis">
            <select className={inputCls} value={f.production_product_id} onChange={(e) => setF({ ...f, production_product_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Kiekis, kg"><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_produced_kg} onChange={(e) => setF({ ...f, qty_produced_kg: e.target.value })} required /></Field>
          <Field label="L savaitė">
            <select className={inputCls} value={f.l_week_id} onChange={(e) => setF({ ...f, l_week_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {lweeks.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
            </select>
          </Field>
          <Field label="Pastabos"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <button className={btnCls} disabled={busy}>{busy ? 'Saugoma…' : 'Registruoti'}</button>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}
