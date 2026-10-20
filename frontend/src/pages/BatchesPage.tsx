import { useEffect, useState, type FormEvent } from 'react'
import {
  createBatch, deleteRecord, getBatch, getBatches, getRawMaterials, toggleLock, updateBatch, errText,
  WRITEOFF_REASONS, type MaterialBatch, type RawMaterial,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtEur, fmtKg, fmtUnitEur, inputCls, smallBtnCls, todayIso } from '../ui'

const thCls = 'px-2 py-1 font-medium'
const tdNum = 'px-2 py-1 text-right tabular-nums'

/**
 * Partijos sunaudojimo detalizacija: kokiam gaminiui, kurią dieną, kiek kg ir kokiam gamybos Nr.
 * (kiekviena gamybos eilutė iš šios partijos atskirai), perdavimai/nurašymai ir likutis po kiekvieno įrašo.
 */
function BatchUsageDetail({ batch }: { batch: MaterialBatch }) {
  const unit = batch.unit_cost_eur == null ? null : Number(batch.unit_cost_eur)
  const events = [
    ...(batch.usages ?? []).map((u) => ({
      key: `u${u.id}`, date: u.production?.production_date ?? '', qty: Number(u.qty_kg),
      kind: 'Gamyba', production: `Nr. ${u.production_id}`,
      product: u.production?.production_product?.name ?? '—', lweek: u.production?.l_week?.code ?? '—',
    })),
    ...(batch.outflows ?? []).map((o) => ({
      key: `o${o.id}`, date: o.outflow_date, qty: Number(o.qty_kg),
      kind: o.outflow_type === 'transfer' ? 'Perdavimas' : 'Nurašymas', production: '—',
      product: o.outflow_type === 'transfer'
        ? (o.destination ?? '—')
        : (o.reason ? WRITEOFF_REASONS[o.reason] : (o.destination ?? '—')),
      lweek: o.document_number ?? '—',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const received = Number(batch.qty_received_kg)
  const rows = events.reduce<(typeof events[number] & { left: number })[]>((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1].left : received
    return [...acc, { ...e, left: Math.round((prev - e.qty) * 1000) / 1000 }]
  }, [])
  const usedTotal = (batch.usages ?? []).reduce((s, u) => s + Number(u.qty_kg), 0)

  return (
    <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b>Partijos {batch.batch_number} sunaudojimo detalizacija</b>
        <span className="text-stone-500">
          {batch.raw_material?.name} · gauta {fmtDate(batch.received_date)} {fmtKg(received)} kg
          {batch.supplier ? ` · ${batch.supplier}` : ''}
          {unit != null && ` · ${fmtUnitEur(unit)} €/kg, vertė ${fmtEur(batch.total_cost_eur)} €`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className={thCls}>Data</th>
              <th className={thCls}>Įrašas</th>
              <th className={thCls}>Gamybos Nr.</th>
              <th className={thCls}>Gaminys / kam / priežastis</th>
              <th className={thCls}>L sav. / dok.</th>
              <th className={`${thCls} text-right`}>Kg</th>
              <th className={`${thCls} text-right`}>Vertė €</th>
              <th className={`${thCls} text-right`}>Likutis kg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.key} className="border-b border-stone-100">
                <td className="px-2 py-1">{fmtDate(e.date)}</td>
                <td className="px-2 py-1">{e.kind === 'Gamyba' ? e.kind : <Badge tone={e.kind === 'Nurašymas' ? 'red' : 'amber'}>{e.kind}</Badge>}</td>
                <td className="px-2 py-1">{e.production}</td>
                <td className="px-2 py-1">{e.product}</td>
                <td className="px-2 py-1">{e.lweek}</td>
                <td className={`${tdNum} text-red-700`}>−{fmtKg(e.qty)}</td>
                <td className={tdNum}>{unit == null ? '—' : fmtEur(e.qty * unit)}</td>
                <td className={tdNum}>{fmtKg(e.left)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-3 text-center text-stone-400">Partija dar nenaudota</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right font-medium">
        Sunaudota gamyboje: {fmtKg(usedTotal)} kg · Perduota / nurašyta: {fmtKg(batch.outflow_kg)} kg ·
        Likutis: {fmtKg(batch.balance_kg)} kg
        {batch.balance_value_eur != null && ` (${fmtEur(batch.balance_value_eur)} €)`}
      </p>
    </div>
  )
}

const emptyForm = {
  received_date: todayIso(),
  raw_material_id: '', batch_number: '', qty_received_kg: '', unit_cost_eur: '',
  supplier: '', invoice_number: '', expiry_date: '', notes: '',
}
type FormState = typeof emptyForm

const toForm = (b: MaterialBatch): FormState => ({
  received_date: b.received_date.slice(0, 10),
  raw_material_id: String(b.raw_material_id),
  batch_number: b.batch_number,
  qty_received_kg: String(Number(b.qty_received_kg)),
  unit_cost_eur: b.unit_cost_eur == null ? '' : String(Number(b.unit_cost_eur)),
  supplier: b.supplier ?? '',
  invoice_number: b.invoice_number ?? '',
  expiry_date: b.expiry_date.slice(0, 10),
  notes: b.notes ?? '',
})

export default function BatchesPage() {
  const [rows, setRows] = useState<MaterialBatch[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<MaterialBatch | null>(null)
  const [editing, setEditing] = useState<MaterialBatch | null>(null)
  const [f, setF] = useState<FormState>(emptyForm)

  const load = () => getBatches().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getRawMaterials().then((r) => setMaterials(r.data.data))
  }, [])

  // Bendra vertė apskaičiuojama automatiškai: kiekis × kaina už 1 kg
  const totalValue = f.qty_received_kg !== '' && f.unit_cost_eur !== '' ? +f.qty_received_kg * +f.unit_cost_eur : null
  const inUse = editing ? (Number(editing.used_kg ?? 0) + Number(editing.outflow_kg ?? 0)) > 0 : false

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const payload = {
      ...f, raw_material_id: +f.raw_material_id, qty_received_kg: +f.qty_received_kg,
      unit_cost_eur: f.unit_cost_eur === '' ? null : +f.unit_cost_eur,
      supplier: f.supplier || null, invoice_number: f.invoice_number || null, notes: f.notes || null,
    }
    try {
      if (editing) {
        await updateBatch(editing.id, payload)
        if (detail?.id === editing.id) setDetail((await getBatch(editing.id)).data)
        setEditing(null)
        setF(emptyForm)
      } else {
        await createBatch(payload)
        setF({ ...f, batch_number: '', qty_received_kg: '', unit_cost_eur: '', invoice_number: '', notes: '' })
      }
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const startEdit = (b: MaterialBatch) => { setEditing(b); setF(toForm(b)); setErr(null) }
  const cancelEdit = () => { setEditing(null); setF(emptyForm); setErr(null) }

  const doLock = async (b: MaterialBatch) => {
    try { await toggleLock('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const toggleDetail = async (b: MaterialBatch) => {
    if (detail?.id === b.id) { setDetail(null); return }
    try { setDetail((await getBatch(b.id)).data) } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (b: MaterialBatch) => {
    if (!window.confirm(`Trinti partiją ${b.batch_number}?`)) return
    try { await deleteRecord('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] print-grid-1">
      <Card title="Žaliavų partijos">
        <Table
          cols={[
            { header: 'Gauta', render: (b) => fmtDate(b.received_date) },
            { header: 'Partija', render: (b) => b.batch_number },
            { header: 'Žaliava', render: (b) => b.raw_material?.name },
            { header: 'Gauta kg', align: 'right', render: (b) => fmtKg(b.qty_received_kg) },
            { header: 'Kaina už 1 kg (€)', align: 'right', render: (b) => fmtUnitEur(b.unit_cost_eur) },
            { header: 'Bendra vertė (€)', align: 'right', render: (b) => fmtEur(b.total_cost_eur) },
            { header: 'Sunaudota', align: 'right', render: (b) => fmtKg(b.used_kg) },
            { header: 'Perduota', align: 'right', render: (b) => fmtKg(b.outflow_kg) },
            { header: 'Likutis', align: 'right', render: (b) => <b>{fmtKg(b.balance_kg)}</b> },
            { header: 'Likučio vertė €', align: 'right', render: (b) => fmtEur(b.balance_value_eur) },
            { header: 'Galioja iki', render: (b) => fmtDate(b.expiry_date) },
            { header: 'D.', align: 'right', render: (b) => (
                <Badge tone={(b.days_to_expiry ?? 0) < 0 ? 'red' : (b.days_to_expiry ?? 0) <= 14 ? 'amber' : 'green'}>
                  {b.days_to_expiry}
                </Badge>
              ) },
            { header: 'Tiekėjas', render: (b) => b.supplier ?? '—' },
            { header: '', render: (b) => (
              <span className="flex justify-end gap-1 whitespace-nowrap">
                {b.is_locked && <Badge tone="green">Užrakinta</Badge>}
                <button className={smallBtnCls} onClick={() => toggleDetail(b)}>sunaudojimas</button>
                {!b.is_locked && <button className={smallBtnCls} onClick={() => startEdit(b)}>redaguoti</button>}
                <button className={smallBtnCls} onClick={() => doLock(b)}>{b.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                <button className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => doDelete(b)}>trinti</button>
              </span>
            ) },
          ]}
          rows={rows}
        />
        {detail && <BatchUsageDetail batch={detail} />}
      </Card>

      <Card title={editing ? `Redaguoti partiją ${editing.batch_number}` : 'Registruoti gavimą'} noPrint>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Gavimo data"><input type="date" className={inputCls} value={f.received_date} onChange={(e) => setF({ ...f, received_date: e.target.value })} required /></Field>
          <Field label="Žaliava">
            <select className={inputCls} value={f.raw_material_id} onChange={(e) => setF({ ...f, raw_material_id: e.target.value })} required disabled={inUse}>
              <option value="">— pasirinkite —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Partijos Nr."><input className={inputCls} value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} placeholder="Mil0630" required /></Field>
          <Field label="Kiekis, kg"><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_received_kg} onChange={(e) => setF({ ...f, qty_received_kg: e.target.value })} required /></Field>
          <Field label="Kaina už 1 kg (€)"><input type="number" step="0.0001" min="0" className={inputCls} value={f.unit_cost_eur} onChange={(e) => setF({ ...f, unit_cost_eur: e.target.value })} /></Field>
          <Field label="Bendra vertė (€)">
            <input className={`${inputCls} bg-stone-50 tabular-nums`} value={totalValue == null ? '' : fmtEur(totalValue)} placeholder="apskaičiuojama automatiškai" readOnly tabIndex={-1} />
          </Field>
          <Field label="Galioja iki"><input type="date" className={inputCls} value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} required /></Field>
          <Field label="Tiekėjas"><input className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Sąsk. Nr."><input className={inputCls} value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>
          <Field label="Pastabos"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {inUse && <p className="text-xs text-stone-500">Partija jau naudota – žaliavos keisti negalima, kiekis ne mažesnis už sunaudotą.</p>}
          <div className="flex gap-2">
            <button className={`${btnCls} flex-1`} disabled={busy}>{busy ? 'Saugoma…' : editing ? 'Išsaugoti' : 'Registruoti'}</button>
            {editing && <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100" onClick={cancelEdit}>Atšaukti</button>}
          </div>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}
