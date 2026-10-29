import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  createBatch, deleteRecord, getBatch, getBatches, getRawMaterials, getWarehouses, toggleLock, updateBatch, errText,
  WRITEOFF_REASONS, type MaterialBatch, type RawMaterial, type Warehouse,
} from '../api'
import {
  Badge, Card, Err, Field, Icon, IconBtn, InfoRows, Table, fmtDate, fmtEur, fmtKg, fmtUnitEur,
  ghostBtnCls, greenBtnCls, inputCls, todayIso,
} from '../ui'
import { printElement } from '../print'

const thCls = 'border-r border-stone-200 px-2 py-1.5 text-center font-semibold last:border-r-0'
const tdNum = 'px-2 py-1 text-right tabular-nums'

const EGG_KG = 0.06 // vieno kiaušinio masė, kg

/** Kainos laukelis lentelėje: išsaugoma paspaudus Enter arba palikus laukelį. */
function PriceInput({ onSave }: { onSave: (value: string) => Promise<void> }) {
  const [v, setV] = useState('')
  const save = async () => { if (v.trim() !== '') { await onSave(v.replace(',', '.')); setV('') } }
  return (
    <input
      type="text" inputMode="decimal" placeholder="įvesti" title="Įveskite kainą €/kg ir paspauskite Enter"
      className="no-print w-20 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-right text-xs tabular-nums placeholder:text-amber-700/60"
      value={v} onChange={(e) => setV(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
    />
  )
}

// ---- Partijos būsena (stulpelis „Būsena“ ir filtras) ----
const STATUSES = {
  ok: { label: 'Tinka', tone: 'green' },
  low: { label: 'Mažai liko', tone: 'amber' },
  expiring: { label: 'Baigiasi', tone: 'amber' },
  expired: { label: 'Nebegalioja', tone: 'red' },
  empty: { label: 'Išnaudota', tone: 'stone' },
} as const
type Status = keyof typeof STATUSES

const LOW_SHARE = 0.2      // likę < 20 % gauto kiekio - „Mažai liko“
const EXPIRING_DAYS = 14

function batchStatus(b: MaterialBatch): Status {
  const left = Number(b.balance_kg ?? 0)
  if (left <= 0.0005) return 'empty'
  if ((b.days_to_expiry ?? 0) < 0) return 'expired'
  if ((b.days_to_expiry ?? 0) <= EXPIRING_DAYS) return 'expiring'
  if (left < Number(b.qty_received_kg) * LOW_SHARE) return 'low'
  return 'ok'
}

const StatusBadge = ({ b }: { b: MaterialBatch }) => {
  const s = STATUSES[batchStatus(b)]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

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
    <div className="text-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-stone-600">
          {batch.raw_material?.name} · gauta {fmtDate(batch.received_date)} {fmtKg(received)} kg
          {batch.supplier ? ` · ${batch.supplier}` : ''}
          {unit != null && ` · ${fmtUnitEur(unit)} €/kg, vertė ${fmtEur(batch.total_cost_eur)} €`}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-100 text-stone-700">
              <th className={thCls}>Data</th>
              <th className={thCls}>Įrašas</th>
              <th className={thCls}>Gamybos Nr.</th>
              <th className={thCls}>Gaminys / kam / priežastis</th>
              <th className={thCls}>L sav. / dok.</th>
              <th className={thCls}>Paimta, kg</th>
              <th className={thCls}>Suma, €</th>
              <th className={thCls}>Likutis po, kg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.key} className="border-t border-stone-200">
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

/** Partijos kortelė - šoninėje juostoje ir spausdinama atskirai (spausdintuvo ikona eilutėje). */
function BatchCard({ b }: { b: MaterialBatch }) {
  const cell = (label: string, value: ReactNode) => (
    <div>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      {cell('Žaliava', `${b.raw_material?.name ?? ''}${b.raw_material?.code ? ` (${b.raw_material.code})` : ''}`)}
      {cell('Partija', b.batch_number)}
      {cell('Gauta', fmtDate(b.received_date))}
      {cell('Galioja iki', fmtDate(b.expiry_date))}
      {cell('Pradinis kiekis, kg', fmtKg(b.qty_received_kg))}
      {cell('Sunaudota, kg', fmtKg(Number(b.used_kg ?? 0) + Number(b.outflow_kg ?? 0)))}
      {cell('Likutis, kg', fmtKg(b.balance_kg))}
      {cell('Kaina, €/kg', fmtUnitEur(b.unit_cost_eur))}
      {cell('Sandėlis', b.warehouse?.name ?? '—')}
      {cell('Tiekėjas', b.supplier ?? '—')}
      {cell('Dokumentas', b.invoice_number ?? '—')}
      {cell('Vertė, €', fmtEur(b.total_cost_eur))}
      {cell('Būsena', <StatusBadge b={b} />)}
    </div>
  )
}

/** Etiketė ant žaliavos pakuotės (spausdinama užregistravus gavimą, jei pažymėta). */
function BatchLabel({ b }: { b: MaterialBatch }) {
  return (
    <div style={{ width: '90mm' }} className="rounded border-2 border-black p-3 font-sans text-black">
      <p className="text-xs">UAB „Romnesa“ · žaliavos partija</p>
      <p className="text-xl font-bold">{b.raw_material?.name}</p>
      <p className="text-3xl font-black tracking-wide">{b.batch_number}</p>
      <table className="mt-2 w-full text-sm">
        <tbody>
          <tr><td>Gauta</td><td className="text-right font-semibold">{fmtDate(b.received_date)}</td></tr>
          <tr><td>Galioja iki</td><td className="text-right font-semibold">{fmtDate(b.expiry_date)}</td></tr>
          <tr><td>Kiekis</td><td className="text-right font-semibold">{fmtKg(b.qty_received_kg)} kg</td></tr>
          {b.warehouse && <tr><td>Sandėlis</td><td className="text-right">{b.warehouse.name}</td></tr>}
          {b.supplier && <tr><td>Tiekėjas</td><td className="text-right">{b.supplier}</td></tr>}
          {b.invoice_number && <tr><td>Dokumentas</td><td className="text-right">{b.invoice_number}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// funkcija, ne konstanta - kad data būtų šiandienos ir po vidurnakčio
const emptyForm = () => ({
  received_date: todayIso(),
  raw_material_id: '', warehouse_id: '', batch_number: '', qty_received_kg: '', unit_cost_eur: '',
  supplier: '', invoice_number: '', expiry_date: '', notes: '',
})
type FormState = ReturnType<typeof emptyForm>

const toForm = (b: MaterialBatch): FormState => ({
  received_date: b.received_date.slice(0, 10),
  raw_material_id: String(b.raw_material_id),
  warehouse_id: b.warehouse_id == null ? '' : String(b.warehouse_id),
  batch_number: b.batch_number,
  qty_received_kg: String(Number(b.qty_received_kg)),
  unit_cost_eur: b.unit_cost_eur == null ? '' : String(Number(b.unit_cost_eur)),
  supplier: b.supplier ?? '',
  invoice_number: b.invoice_number ?? '',
  expiry_date: b.expiry_date.slice(0, 10),
  notes: b.notes ?? '',
})

const filterCls = 'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-700 focus:outline-none'

export default function BatchesPage() {
  const [rows, setRows] = useState<MaterialBatch[]>([])
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<MaterialBatch | null>(null)
  const [editing, setEditing] = useState<MaterialBatch | null>(null)
  const [f, setF] = useState<FormState>(emptyForm)
  const [labels, setLabels] = useState<MaterialBatch[] | null>(null)
  const [withLabel, setWithLabel] = useState(false)
  const [printing, setPrinting] = useState<{ batch: MaterialBatch; what: 'card' | 'label' } | null>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState({ text: '', material: '', warehouse: '', status: '', onlyBalance: false, noPrice: false })
  const [sumInput, setSumInput] = useState<string | null>(null) // „Suma, €" įvedama ranka -> kaina = suma / kiekis
  const [eggs, setEggs] = useState({ units: '', unitPrice: '' })  // kiaušiniai: vnt. -> kg (0,06 kg/vnt.)

  const load = () => getBatches().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
    getRawMaterials().then((r) => setMaterials(r.data.data))
    getWarehouses().then((r) => setWarehouses(r.data.data))
  }, [])

  // Etiketės visoms rodomoms partijoms (filtruotam sąrašui)
  useEffect(() => {
    if (!labels || !labelsRef.current) return
    printElement(labelsRef.current, 'Žaliavų partijų etiketės')
    setLabels(null)
  }, [labels])

  // Kortelė / etiketė nupiešiama paslėptame bloke ir spausdinama atskirai
  useEffect(() => {
    if (!printing || !printRef.current) return
    printElement(printRef.current, `${printing.what === 'label' ? 'Etiketė' : 'Partijos kortelė'} ${printing.batch.batch_number}`)
    setPrinting(null)
  }, [printing])

  const shown = useMemo(() => {
    const text = q.text.trim().toLowerCase()
    return rows.filter((b) =>
      (!text || [b.batch_number, b.raw_material?.name, b.raw_material?.code, b.supplier, b.invoice_number].some((v) => v?.toLowerCase().includes(text)))
      && (!q.material || String(b.raw_material_id) === q.material)
      && (!q.warehouse || String(b.warehouse_id) === q.warehouse)
      && (!q.status || batchStatus(b) === q.status)
      && (!q.onlyBalance || Number(b.balance_kg ?? 0) > 0.0005)
      && (!q.noPrice || b.unit_cost_eur == null))
  }, [rows, q])

  const suppliers = useMemo(() => [...new Set(rows.map((b) => b.supplier).filter(Boolean))] as string[], [rows])
  const withBalance = shown.filter((b) => Number(b.balance_kg ?? 0) > 0.0005)
  // Kodo / sandėlio stulpeliai - tik kai bent viena partija juos turi (kitaip lentelė per plati)
  const hasCode = rows.some((b) => b.raw_material?.code)
  const hasWarehouse = rows.some((b) => b.warehouse_id != null)
  const sum = (list: MaterialBatch[], v: (b: MaterialBatch) => number | null | undefined) => list.reduce((s, b) => s + Number(v(b) ?? 0), 0)

  // Bendra vertė apskaičiuojama automatiškai: kiekis × kaina už 1 kg
  const totalValue = f.qty_received_kg !== '' && f.unit_cost_eur !== '' ? +f.qty_received_kg * +f.unit_cost_eur : null
  const isEggs = materials.find((m) => String(m.id) === f.raw_material_id)?.name === 'Kiaušiniai'
  const round4 = (n: number) => String(Math.round(n * 10000) / 10000)
  // Kiaušiniai iš tiekėjo - vienetais: kg = vnt. × 0,06; €/kg = €/vnt. ÷ 0,06 (aprašo 2.2 skyrius)
  const setEggField = (key: 'units' | 'unitPrice', v: string) => {
    const next = { ...eggs, [key]: v }
    setEggs(next)
    setF({
      ...f,
      ...(next.units !== '' && { qty_received_kg: String(Math.round(+next.units * EGG_KG * 1000) / 1000) }),
      ...(next.unitPrice !== '' && { unit_cost_eur: round4(+next.unitPrice / EGG_KG) }),
    })
  }
  const unpricedUsed = rows.filter((b) => b.unit_cost_eur == null && Number(b.used_kg ?? 0) > 0).length

  /** Greitas kainos įvedimas lentelėje (importuotoms / anksčiau be kainos registruotoms partijoms). */
  const savePrice = async (b: MaterialBatch, value: string) => {
    if (value.trim() === '' || !(+value >= 0)) return
    try { await updateBatch(b.id, { unit_cost_eur: +value }); await load() } catch (e) { setErr(errText(e)) }
  }
  const inUse = editing ? (Number(editing.used_kg ?? 0) + Number(editing.outflow_kg ?? 0)) > 0 : false

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const payload = {
      ...f, raw_material_id: +f.raw_material_id, qty_received_kg: +f.qty_received_kg,
      warehouse_id: f.warehouse_id === '' ? null : +f.warehouse_id,
      unit_cost_eur: f.unit_cost_eur === '' ? null : +f.unit_cost_eur,
      supplier: f.supplier || null, invoice_number: f.invoice_number || null, notes: f.notes || null,
    }
    try {
      if (editing) {
        await updateBatch(editing.id, payload)
        if (detail?.id === editing.id) setDetail((await getBatch(editing.id)).data)
        setEditing(null)
        setF(emptyForm())
      } else {
        const created = (await createBatch(payload)).data
        setF({ ...f, batch_number: '', qty_received_kg: '', unit_cost_eur: '', invoice_number: '', notes: '' })
        setEggs({ units: '', unitPrice: '' })
        if (withLabel) setPrinting({ batch: created, what: 'label' })
      }
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const startEdit = (b: MaterialBatch) => { setEditing(b); setF(toForm(b)); setEggs({ units: '', unitPrice: '' }); setErr(null) }
  const clearForm = () => { setEditing(null); setF(emptyForm()); setEggs({ units: '', unitPrice: '' }); setErr(null) }

  const doLock = async (b: MaterialBatch) => {
    try { await toggleLock('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const toggleDetail = async (b: MaterialBatch) => {
    if (detail?.id === b.id) { setDetail(null); return }
    try { setDetail((await getBatch(b.id)).data) } catch (e) { setErr(errText(e)) }
  }

  const printCard = async (b: MaterialBatch) => {
    try {
      const full = (await getBatch(b.id)).data
      setDetail(full)
      setPrinting({ batch: full, what: 'card' })
    } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (b: MaterialBatch) => {
    if (!window.confirm(`Trinti partiją ${b.batch_number}?`)) return
    try { await deleteRecord('material-batches', b.id); await load() } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px] print-grid-1">
      <div className="grid min-w-0 content-start gap-6">
        <Card
          title="Žaliavų partijos"
          icon="leaf"
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input className={`${filterCls} w-60 pl-8`} placeholder="Paieška pagal partiją, žaliavą, tiekėją…"
                  value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
              </div>
              <select className={filterCls} value={q.material} onChange={(e) => setQ({ ...q, material: e.target.value })}>
                <option value="">Visos žaliavos</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {warehouses.length > 0 && (
                <select className={filterCls} value={q.warehouse} onChange={(e) => setQ({ ...q, warehouse: e.target.value })}>
                  <option value="">Visi sandėliai</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
              <select className={filterCls} value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>
                <option value="">Visos partijos</option>
                {Object.entries(STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-amber-800" checked={q.onlyBalance} onChange={(e) => setQ({ ...q, onlyBalance: e.target.checked })} />
                Rodyti tik likučius &gt; 0
              </label>
              <label className="flex items-center gap-1.5 text-sm" title="Partijos, kurioms neįvesta kaina – savikaina jų daliai tik įvertinama">
                <input type="checkbox" className="h-4 w-4 accent-amber-800" checked={q.noPrice} onChange={(e) => setQ({ ...q, noPrice: e.target.checked })} />
                Be kainos{unpricedUsed > 0 && <Badge tone="amber">{unpricedUsed}</Badge>}
              </label>
              <button type="button" title="Spausdinti etiketes rodomoms partijoms" disabled={!shown.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
                onClick={() => setLabels(shown)}>
                <Icon name="tag" /> Etiketės
              </button>
            </div>
          }
        >
          <Table
            cols={[
              ...(hasCode ? [{ header: 'Kodas', render: (b: MaterialBatch) => b.raw_material?.code ?? '—' }] : []),
              { header: 'Žaliava', render: (b) => b.raw_material?.name },
              { header: 'Partija', render: (b) => <b>{b.batch_number}</b> },
              { header: 'Gav. data', align: 'center', render: (b) => <span className="whitespace-nowrap">{fmtDate(b.received_date)}</span> },
              { header: 'Galioja iki', align: 'center', render: (b) => <span className="whitespace-nowrap">{fmtDate(b.expiry_date)}</span> },
              { header: 'Kiekis, kg', align: 'right', render: (b) => fmtKg(b.qty_received_kg) },
              { header: 'Sunaudota, kg', align: 'right', render: (b) => (
                <span title={`Gamyboje ${fmtKg(b.used_kg)} kg, perduota / nurašyta ${fmtKg(b.outflow_kg)} kg`}>
                  {fmtKg(Number(b.used_kg ?? 0) + Number(b.outflow_kg ?? 0))}
                </span>
              ) },
              { header: 'Likutis, kg', align: 'right', render: (b) => <b>{fmtKg(b.balance_kg)}</b> },
              { header: 'Kaina, €/kg', align: 'right', render: (b) => (b.unit_cost_eur == null && !b.is_locked
                ? <PriceInput key={b.id} onSave={(v) => savePrice(b, v)} />
                : fmtUnitEur(b.unit_cost_eur)) },
              { header: 'Vertė, €', align: 'right', render: (b) => fmtEur(b.total_cost_eur) },
              ...(hasWarehouse ? [{ header: 'Sandėlis', render: (b: MaterialBatch) => b.warehouse?.name ?? '—' }] : []),
              { header: 'Būsena', align: 'center', render: (b) => (
                <span className="inline-flex items-center gap-1">
                  <StatusBadge b={b} />
                  {b.is_locked && <span title="Įspajamota" className="text-green-700"><Icon name="lock" className="h-3.5 w-3.5" /></span>}
                </span>
              ) },
              { header: 'Veiksmai', render: (b) => (
                <span className="no-print flex justify-center gap-0.5 whitespace-nowrap">
                  <IconBtn icon="eye" title="Sunaudojimo detalizacija" onClick={() => toggleDetail(b)} />
                  {!b.is_locked && <IconBtn icon="pencil" title="Redaguoti" onClick={() => startEdit(b)} />}
                  <IconBtn icon="printer" title="Spausdinti partijos kortelę" onClick={() => printCard(b)} />
                  <IconBtn icon={b.is_locked ? 'unlock' : 'lock'} title={b.is_locked ? 'Atrakinti' : 'Įspajamoti'} onClick={() => doLock(b)} />
                  {!b.is_locked && <IconBtn icon="trash" title="Trinti" tone="red" onClick={() => doDelete(b)} />}
                </span>
              ) },
            ]}
            rows={shown}
            rowClass={(b) => (detail?.id === b.id ? 'bg-amber-50' : '')}
            empty={rows.length ? 'Pagal filtrus partijų nėra' : 'Nėra duomenų'}
          />
        </Card>

        {detail && (
          <Card
            title={`Partijos ${detail.batch_number} sunaudojimas`}
            icon="gear"
            actions={<button className="no-print text-sm text-stone-500 hover:text-stone-800" onClick={() => setDetail(null)}>Uždaryti ✕</button>}
          >
            <BatchUsageDetail batch={detail} />
          </Card>
        )}
      </div>

      <div className="grid content-start gap-6">
        <Card title={editing ? `Redaguoti partiją ${editing.batch_number}` : 'Registruoti gavimą'} icon="truck" noPrint>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Gavimo data" required><input type="date" className={inputCls} value={f.received_date} onChange={(e) => setF({ ...f, received_date: e.target.value })} required /></Field>
            <Field label="Žaliava" required>
              <select className={inputCls} value={f.raw_material_id} onChange={(e) => setF({ ...f, raw_material_id: e.target.value })} required disabled={inUse}>
                <option value="">— pasirinkite —</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Partijos Nr." required><input className={inputCls} value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} placeholder="Mil0901" required /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Kiekis, kg" required><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_received_kg} onChange={(e) => setF({ ...f, qty_received_kg: e.target.value })} required /></Field>
              <Field label="Kaina, €/kg" required={!editing}><input type="number" step="0.0001" min="0" className={inputCls} value={f.unit_cost_eur} onChange={(e) => setF({ ...f, unit_cost_eur: e.target.value })} required={!editing} /></Field>
              <Field label="Suma, €">
                <input
                  type="text" inputMode="decimal" className={`${inputCls} tabular-nums`}
                  title="Apskaičiuojama automatiškai. Įvedus sumą iš sąskaitos – kaina už kg perskaičiuojama."
                  value={sumInput ?? (totalValue == null ? '' : fmtEur(totalValue))} placeholder="auto"
                  onChange={(e) => {
                    setSumInput(e.target.value)
                    const sumEur = +e.target.value.replace(/\s/g, '').replace(',', '.')
                    if (+f.qty_received_kg > 0 && sumEur >= 0) setF({ ...f, unit_cost_eur: round4(sumEur / +f.qty_received_kg) })
                  }}
                  onBlur={() => setSumInput(null)}
                />
              </Field>
            </div>
            {isEggs && (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-amber-50 p-2">
                <Field label="Kiaušinių, vnt."><input type="number" step="1" min="0" className={inputCls} value={eggs.units} onChange={(e) => setEggField('units', e.target.value)} /></Field>
                <Field label="Kaina, €/vnt."><input type="number" step="0.0001" min="0" className={inputCls} value={eggs.unitPrice} onChange={(e) => setEggField('unitPrice', e.target.value)} /></Field>
                <p className="col-span-2 text-xs text-stone-600">Perskaičiuojama į kg: 1 vnt. = 0,06 kg (kiekis ir €/kg užpildomi automatiškai).</p>
              </div>
            )}
            <Field label="Galioja iki" required><input type="date" className={inputCls} value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} required /></Field>
            <Field label="Sandėlis">
              <select className={inputCls} value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })}>
                <option value="">— nenurodyta —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Tiekėjas">
              <input className={inputCls} list="suppliers" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="Pasirinkite arba įveskite…" />
              <datalist id="suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Dokumentas"><input className={inputCls} value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} placeholder="Sąskaita Nr." /></Field>
            <Field label="Pastabos"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            {!editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-amber-800" checked={withLabel} onChange={(e) => setWithLabel(e.target.checked)} />
                Sukurti etiketę
              </label>
            )}
            {inUse && <p className="text-xs text-stone-500">Partija jau naudota – žaliavos keisti negalima, kiekis ne mažesnis už sunaudotą.</p>}
            <div className="grid grid-cols-2 gap-2">
              <button className={greenBtnCls} disabled={busy}><Icon name="save" />{busy ? 'Saugoma…' : 'Išsaugoti'}</button>
              <button type="button" className={ghostBtnCls} onClick={clearForm}><Icon name="trash" />{editing ? 'Atšaukti' : 'Išvalyti'}</button>
            </div>
            <Err msg={err} />
          </form>
        </Card>

        <Card title="Informacija" icon="info">
          <InfoRows rows={[
            ['Rodoma partijų', shown.length],
            ['Partijų su likučiu', withBalance.length],
            ['Likusių žaliavų kiekis, kg', fmtKg(sum(withBalance, (b) => b.balance_kg))],
            ['Likusių žaliavų vertė, €', fmtEur(sum(withBalance, (b) => b.balance_value_eur))],
            ['Nebegalioja (su likučiu)', withBalance.filter((b) => (b.days_to_expiry ?? 0) < 0).length],
          ]} />
        </Card>

        {detail && (
          <Card title="Partijos kortelė" icon="doc"
            actions={<button className="no-print text-stone-500 hover:text-stone-800" title="Spausdinti" onClick={() => setPrinting({ batch: detail, what: 'card' })}><Icon name="printer" /></button>}>
            <BatchCard b={detail} />
          </Card>
        )}
      </div>

      {/* Spausdinimui skirtas turinys (nerodomas ekrane) */}
      {labels && (
        <div className="hidden">
          <div ref={labelsRef} style={{ display: 'flex', flexWrap: 'wrap', gap: '6mm' }}>
            {labels.map((b) => <div key={b.id} style={{ breakInside: 'avoid' }}><BatchLabel b={b} /></div>)}
          </div>
        </div>
      )}
      {printing && (
        <div className="hidden">
          <div ref={printRef}>
            {printing.what === 'label' ? <BatchLabel b={printing.batch} /> : (
              <div className="text-black">
                <p className="text-xs text-stone-600">UAB „Romnesa“ · Šakočių apskaita · spausdinta {new Date().toLocaleString('lt-LT')}</p>
                <h1 className="mb-4 border-b border-stone-300 pb-2 text-xl font-bold">Partijos kortelė — {printing.batch.batch_number}</h1>
                <BatchCard b={printing.batch} />
                <h2 className="mt-6 mb-2 text-base font-semibold">Sunaudojimo detalizacija</h2>
                <BatchUsageDetail batch={printing.batch} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
