import { useEffect, useState, type FormEvent } from 'react'
import {
  createBatch, deleteRecord, getBatch, getBatches, getRawMaterials, toggleLock, errText,
  type MaterialBatch, type RawMaterial,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls, todayIso } from '../ui'

/** Partijos istorija: gavimas, sunaudojimai, perdavimai -> likutis po kiekvieno įrašo. */
function BatchHistory({ batch }: { batch: MaterialBatch }) {
  const events = [
    ...(batch.usages ?? []).map((u) => ({
      key: `u${u.id}`, date: u.production?.production_date ?? '', qty: -Number(u.qty_kg),
      text: `Gamyba #${u.production_id} · ${u.production?.production_product?.name ?? ''} · ${u.production?.l_week?.code ?? ''}`,
    })),
    ...(batch.outflows ?? []).map((o) => ({
      key: `o${o.id}`, date: o.outflow_date, qty: -Number(o.qty_kg),
      text: `${o.outflow_type === 'transfer' ? 'Perdavimas' : 'Nurašymas'}${o.destination ? ` · ${o.destination}` : ''}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const received = Number(batch.qty_received_kg)
  const rows = events.reduce<(typeof events[number] & { left: number })[]>((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1].left : received
    return [...acc, { ...e, left: Math.round((prev + e.qty) * 1000) / 1000 }]
  }, [])

  return (
    <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
      <b>Partijos {batch.batch_number} istorija</b>
      <table className="mt-1 w-full">
        <tbody>
          <tr>
            <td className="py-0.5 pr-2">{fmtDate(batch.received_date)}</td>
            <td>Gauta{batch.supplier ? ` · ${batch.supplier}` : ''}</td>
            <td className="text-right tabular-nums text-green-700">+{fmtKg(batch.qty_received_kg)}</td>
            <td className="w-24 text-right tabular-nums">{fmtKg(received)}</td>
          </tr>
          {rows.map((e) => (
            <tr key={e.key}>
              <td className="py-0.5 pr-2">{fmtDate(e.date)}</td>
              <td>{e.text}</td>
              <td className="text-right tabular-nums text-red-700">{fmtKg(e.qty)}</td>
              <td className="text-right tabular-nums">{fmtKg(e.left)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-right font-medium">Likutis: {fmtKg(batch.balance_kg)} kg</p>
    </div>
  )
}

export default function BatchesPage() {
  const [rows, setRows] = useState<MaterialBatch[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<MaterialBatch | null>(null)
  const [f, setF] = useState({
    received_date: todayIso(),
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

  const doLock = async (b: MaterialBatch) => {
    try { await toggleLock('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const toggleHistory = async (b: MaterialBatch) => {
    if (detail?.id === b.id) { setDetail(null); return }
    try { setDetail((await getBatch(b.id)).data) } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (b: MaterialBatch) => {
    if (!window.confirm(`Trinti partiją ${b.batch_number}?`)) return
    try { await deleteRecord('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="Žaliavų partijos">
        <Table
          cols={[
            { header: 'Partija', render: (b) => b.batch_number },
            { header: 'Žaliava', render: (b) => b.raw_material?.name },
            { header: 'Gauta kg', align: 'right', render: (b) => fmtKg(b.qty_received_kg) },
            { header: 'Sunaudota', align: 'right', render: (b) => fmtKg(b.used_kg) },
            { header: 'Perduota', align: 'right', render: (b) => fmtKg(b.outflow_kg) },
            { header: 'Likutis', align: 'right', render: (b) => <b>{fmtKg(b.balance_kg)}</b> },
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
                <button className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => toggleHistory(b)}>istorija</button>
                <button className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => doLock(b)}>{b.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                <button className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => doDelete(b)}>trinti</button>
              </span>
            ) },
          ]}
          rows={rows}
        />
        {detail && <BatchHistory batch={detail} />}
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
