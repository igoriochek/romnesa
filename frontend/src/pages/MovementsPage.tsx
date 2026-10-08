import { useEffect, useState, type FormEvent } from 'react'
import {
  createMovement, deleteRecord, getLWeeks, getMovements, getPackedProducts, getShops,
  getWarehouses, toggleLock, errText,
  type LWeek, type PackedProduct, type ProductMovement, type Shop, type Warehouse,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls, todayIso } from '../ui'

const TYPES: Record<ProductMovement['movement_type'], string> = {
  pack_in: 'Fasavimo papildymas',
  move: 'Vidinis judėjimas',
  ship_out: 'Išvežimas į parduotuvę',
}

const TYPE_TONE: Record<string, 'green' | 'amber' | 'stone'> = {
  pack_in: 'green', move: 'amber', ship_out: 'stone',
}

export default function MovementsPage() {
  const [rows, setRows] = useState<ProductMovement[]>([])
  const [packed, setPacked] = useState<PackedProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    movement_date: todayIso(),
    movement_type: 'pack_in', l_week_id: '', packed_product_id: '',
    qty_units: '', qty_kg: '', warehouse_from_id: '', warehouse_to_id: '',
    shop_id: '', document_number: '', notes: '',
  })

  const load = (type = filter) =>
    getMovements(type || undefined).then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getPackedProducts().then((r) => setPacked(r.data.data))
    getLWeeks().then((r) => setLweeks(r.data.data))
    getWarehouses().then((r) => setWarehouses(r.data.data))
    getShops().then((r) => setShops(r.data.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await createMovement({
        ...f,
        l_week_id: +f.l_week_id,
        packed_product_id: +f.packed_product_id,
        qty_units: +f.qty_units,
        qty_kg: +f.qty_kg,
        // Paslėpti (kitam tipui skirti) laukai nesiunčiami
        warehouse_from_id: f.movement_type !== 'pack_in' && f.warehouse_from_id ? +f.warehouse_from_id : null,
        warehouse_to_id: f.movement_type !== 'ship_out' && f.warehouse_to_id ? +f.warehouse_to_id : null,
        shop_id: f.movement_type === 'ship_out' && f.shop_id ? +f.shop_id : null,
      })
      setF({ ...f, qty_units: '', qty_kg: '', document_number: '', notes: '' })
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const doLock = async (m: ProductMovement) => {
    try { await toggleLock('product-movements', m.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (m: ProductMovement) => {
    if (!window.confirm(`Trinti judėjimą #${m.id}?`)) return
    try { await deleteRecord('product-movements', m.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const dest = (m: ProductMovement) =>
    m.movement_type === 'pack_in' ? m.warehouse_to?.name
      : m.movement_type === 'move' ? `${m.warehouse_from?.name} → ${m.warehouse_to?.name}`
      : `${m.warehouse_from?.name} → ${m.shop?.name}`

  const set = (k: string, v: string) => setF({ ...f, [k]: v })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card
        title="Judėjimų žurnalas"
        actions={
          <select
            className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); load(e.target.value) }}
          >
            <option value="">Visi tipai</option>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        }
      >
        <Table
          cols={[
            { header: 'Data', render: (m) => fmtDate(m.movement_date) },
            { header: 'Tipas', render: (m) => <Badge tone={TYPE_TONE[m.movement_type]}>{TYPES[m.movement_type]}</Badge> },
            { header: 'Produktas', render: (m) => m.packed_product?.name },
            { header: 'L', render: (m) => m.l_week?.code },
            { header: 'Vnt', align: 'right', render: (m) => m.qty_units },
            { header: 'Kg', align: 'right', render: (m) => fmtKg(m.qty_kg) },
            { header: 'Maršrutas', render: dest },
            { header: 'Dok.', render: (m) => m.document_number ?? '—' },
            { header: '', render: (m) => (
              <span className="flex justify-end gap-1 whitespace-nowrap">
                {m.is_locked && <Badge tone="green">Įspajamota</Badge>}
                <button className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => doLock(m)}>{m.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                <button className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => doDelete(m)}>trinti</button>
              </span>
            ) },
          ]}
          rows={rows}
        />
      </Card>

      <Card title="Registruoti judėjimą">
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Data"><input type="date" className={inputCls} value={f.movement_date} onChange={(e) => set('movement_date', e.target.value)} required /></Field>
          <Field label="Tipas">
            <select className={inputCls} value={f.movement_type} onChange={(e) => set('movement_type', e.target.value)}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Fasavimo rūšis">
            <select className={inputCls} value={f.packed_product_id} onChange={(e) => set('packed_product_id', e.target.value)} required>
              <option value="">— pasirinkite —</option>
              {packed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="L savaitė">
            <select className={inputCls} value={f.l_week_id} onChange={(e) => set('l_week_id', e.target.value)} required>
              <option value="">— pasirinkite —</option>
              {lweeks.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vnt."><input type="number" min="1" className={inputCls} value={f.qty_units} onChange={(e) => set('qty_units', e.target.value)} required /></Field>
            <Field label="Kg"><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_kg} onChange={(e) => set('qty_kg', e.target.value)} required /></Field>
          </div>
          {f.movement_type !== 'pack_in' && (
            <Field label="Iš sandėlio">
              <select className={inputCls} value={f.warehouse_from_id} onChange={(e) => set('warehouse_from_id', e.target.value)} required>
                <option value="">— pasirinkite —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          {f.movement_type !== 'ship_out' && (
            <Field label="Į sandėlį">
              <select className={inputCls} value={f.warehouse_to_id} onChange={(e) => set('warehouse_to_id', e.target.value)} required>
                <option value="">— pasirinkite —</option>
                {warehouses.filter((w) => f.movement_type === 'pack_in' || String(w.id) !== f.warehouse_from_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          {f.movement_type === 'ship_out' && (
            <Field label="Parduotuvė">
              <select className={inputCls} value={f.shop_id} onChange={(e) => set('shop_id', e.target.value)} required>
                <option value="">— pasirinkite —</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Dok. Nr."><input className={inputCls} value={f.document_number} onChange={(e) => set('document_number', e.target.value)} /></Field>
          <button className={btnCls} disabled={busy}>{busy ? 'Saugoma…' : 'Registruoti'}</button>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}
