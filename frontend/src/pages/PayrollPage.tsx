import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  approveWorkPeriod, deleteWorkEntry, deleteWorkOperation, deleteWorker, deleteWorkRate, errText, getLWeeks, getProductionProducts,
  getWorkEntries, getWorkers, getWorkOperations, getWorkRates, getWorkSummary, lockWorkEntry, saveWorkEntry, saveWorker,
  saveWorkOperation, saveWorkRate,
  type LWeek, type ProductionProduct, type WorkEntry, type Worker, type WorkOperation, type WorkRate, type Workshop, type WorkStage,
  type WorkSummaryRow,
} from '../api'
import {
  Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtEur, fmtHours, fmtKg, fmtUnitEur, ghostBtnCls, inputCls, todayIso,
} from '../ui'

const WORKSHOPS: { id: Workshop; label: string }[] = [
  { id: 'sakociai', label: 'Šakočių cechas' },
  { id: 'kulinarija', label: 'Kulinarinis cechas' },
]
const STAGES: Record<WorkStage, string> = {
  eggs: 'Kiaušinių mušimas', mixing: 'Tešlos maišymas', baking: 'Kepimas / gamyba',
  packing: 'Fasavimas', barcoding: 'Barkodavimas', other: 'Kita',
}
const UNITS: Record<string, string> = { val: 'val.', vnt: 'vnt.', kg: 'kg', m: 'm', t: 't' }
const VIEWS = [
  { id: 'entries', label: 'Darbo lapai' },
  { id: 'summary', label: 'Suvestinė' },
  { id: 'rates', label: 'Įkainiai' },
  { id: 'setup', label: 'Darbuotojai ir darbai' },
] as const
type View = (typeof VIEWS)[number]['id']

const monthBounds = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return { from: `${m}-01`, to: `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}` }
}
const qtyText = (e: WorkEntry) =>
  e.operation?.pay_basis === 'hours' ? `${fmtHours(e.hours)} val.` : e.operation?.unit === 'vnt' ? `${fmtHours(e.qty)} vnt.` : `${fmtKg(e.qty)} ${UNITS[e.operation?.unit ?? 'kg']}`

/** Darbo lapo detalės žmogui suprantamai. */
function detailsText(e: WorkEntry): string {
  const d = e.details ?? {}
  const parts: string[] = []
  if (d.mass_kg != null) parts.push(`${d.buckets_full ?? 0} kib.${d.partial_kg ? ` + ${fmtKg(d.partial_kg)} kg` : ''} = ${fmtKg(d.mass_kg)} kg masės, vid. ${fmtKg(d.egg_avg_g)} g/vnt.`)
  if (d.mixes != null) parts.push(`${fmtKg(d.mixes)} maiš. × ${fmtKg(d.kg_per_mix)} kg`)
  if (d.start && d.end) parts.push(`${d.start}–${d.end}${d.break_min ? `, pertrauka ${d.break_min} min.` : ''}`)
  if (e.operation?.pay_basis === 'qty' && e.hours) parts.push(`dirbta ${fmtHours(e.hours)} val.`)
  if (d.defect_kg) parts.push(`iš jų 2 rūšis (brokas) ${fmtKg(d.defect_kg)} kg${d.rate_2nd_applied != null ? ` po ${fmtUnitEur(d.rate_2nd_applied)} €` : ''}`)
  if (d.units != null) parts.push(`${d.units} vnt.`)
  if (d.destination) parts.push(d.destination)
  if (d.document) parts.push(`dok. ${d.document}`)
  return parts.join('; ')
}

export default function PayrollPage() {
  const [view, setView] = useState<View>('entries')
  const [workshop, setWorkshop] = useState<Workshop>('sakociai')
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [workers, setWorkers] = useState<Worker[]>([])
  const [ops, setOps] = useState<WorkOperation[]>([])
  const [rates, setRates] = useState<WorkRate[]>([])
  const [products, setProducts] = useState<ProductionProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [err, setErr] = useState<string | null>(null)

  const loadSetup = () => Promise.all([getWorkers(), getWorkOperations(), getWorkRates()])
    .then(([w, o, r]) => { setWorkers(w.data); setOps(o.data); setRates(r.data) })
    .catch((e) => setErr(errText(e)))

  useEffect(() => {
    loadSetup()
    getProductionProducts().then((r) => setProducts(r.data.data))
    getLWeeks().then((r) => setLweeks(r.data.data))
  }, [])

  const wsWorkers = workers.filter((w) => w.workshop === workshop)
  const wsOps = ops.filter((o) => o.workshop === workshop)

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-stone-200">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${view === v.id ? 'bg-amber-100 font-semibold text-stone-900' : 'text-stone-600 hover:bg-stone-50'}`}>
              {v.label}
            </button>
          ))}
        </div>
        <Field label="Cechas">
          <select className={inputCls} value={workshop} onChange={(e) => setWorkshop(e.target.value as Workshop)}>
            {WORKSHOPS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </Field>
        {(view === 'entries' || view === 'summary') && (
          <Field label="Mėnuo">
            <input type="month" className={inputCls} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </Field>
        )}
      </div>
      <Err msg={err} />

      {view === 'entries' && <EntriesView workshop={workshop} month={month} workers={wsWorkers} ops={wsOps} products={products} lweeks={lweeks} />}
      {view === 'summary' && <SummaryView workshop={workshop} month={month} />}
      {view === 'rates' && <RatesView rates={rates.filter((r) => wsOps.some((o) => o.id === r.work_operation_id))} ops={wsOps} workers={wsWorkers} reload={loadSetup} />}
      {view === 'setup' && <SetupView workshop={workshop} workers={wsWorkers} ops={wsOps} reload={loadSetup} />}
    </div>
  )
}

// ================= Darbo lapai =================

const emptyEntry = () => ({
  id: 0, work_date: todayIso(), worker_id: '', work_operation_id: '', production_product_id: '', l_week_id: '', shift: '',
  qty: '', hours: '', notes: '',
  buckets_full: '', partial_kg: '', eggs_count: '', mixes: '', kg_per_mix: '', start: '', end: '', break_min: '',
  units: '', document: '', destination: '', defect_kg: '',
})

function EntriesView({ workshop, month, workers, ops, products, lweeks }: {
  workshop: Workshop; month: string; workers: Worker[]; ops: WorkOperation[]; products: ProductionProduct[]; lweeks: LWeek[]
}) {
  const [rows, setRows] = useState<WorkEntry[]>([])
  const [workerFilter, setWorkerFilter] = useState('')
  const [f, setF] = useState(emptyEntry())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { from, to } = monthBounds(month)

  const load = () => getWorkEntries({ from, to, workshop, worker_id: workerFilter ? +workerFilter : undefined })
    .then((r) => setRows(r.data)).catch((e) => setErr(errText(e)))
  useEffect(() => { load() }, [workshop, month, workerFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const op = ops.find((o) => String(o.id) === f.work_operation_id)
  const set = (patch: Partial<ReturnType<typeof emptyEntry>>) => setF({ ...f, ...patch })

  // gyvai rodomi skaičiavimai darbo lape
  const eggMass = op?.stage === 'eggs' ? (+f.buckets_full || 0) * (op.norm_kg ?? 11) + (+f.partial_kg || 0) : 0
  const mixKg = op?.stage === 'mixing' ? (+f.mixes || 0) * (+f.kg_per_mix || op.norm_kg || 17.5) : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!op) return
    setBusy(true); setErr(null)
    const n = (v: string) => (v === '' ? undefined : +v)
    const details = {
      buckets_full: n(f.buckets_full), partial_kg: n(f.partial_kg), eggs_count: n(f.eggs_count),
      mixes: n(f.mixes), kg_per_mix: n(f.kg_per_mix),
      start: f.start || undefined, end: f.end || undefined, break_min: n(f.break_min),
      units: n(f.units), document: f.document || undefined, destination: f.destination || undefined,
      defect_kg: n(f.defect_kg),
    }
    try {
      await saveWorkEntry({
        work_date: f.work_date, worker_id: +f.worker_id, work_operation_id: op.id,
        production_product_id: n(f.production_product_id) ?? null, l_week_id: n(f.l_week_id) ?? null, shift: f.shift || null,
        qty: n(f.qty) ?? null, hours: n(f.hours) ?? null, notes: f.notes || null,
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined)),
      }, f.id || undefined)
      // paliekama data, darbuotojas ir darbas - patogu vesti kelis įrašus iš eilės
      setF({ ...emptyEntry(), work_date: f.work_date, worker_id: f.worker_id, work_operation_id: f.work_operation_id, kg_per_mix: f.kg_per_mix })
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const edit = (e: WorkEntry) => {
    const d = e.details ?? {}
    const s = (v: unknown) => (v == null ? '' : String(v))
    setF({
      id: e.id, work_date: e.work_date, worker_id: s(e.worker_id), work_operation_id: s(e.work_operation_id),
      production_product_id: s(e.production_product_id), l_week_id: s(e.l_week_id), shift: s(e.shift),
      qty: e.operation?.stage === 'eggs' || e.operation?.stage === 'mixing' ? '' : s(e.qty),
      hours: d.start ? '' : s(e.hours), notes: s(e.notes),
      buckets_full: s(d.buckets_full), partial_kg: s(d.partial_kg), eggs_count: s(d.eggs_count), mixes: s(d.mixes), kg_per_mix: s(d.kg_per_mix),
      start: s(d.start), end: s(d.end), break_min: s(d.break_min), units: s(d.units), document: s(d.document), destination: s(d.destination),
      defect_kg: s(d.defect_kg),
    })
  }

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await load() } catch (e) { setErr(errText(e)) }
  }

  const approveAll = () => act(async () => {
    if (!window.confirm(`Patvirtinti visus ${month} mėn. įrašus, kurie turi įkainį ir neturi įspėjimų? Patvirtinus įkainis ir suma užfiksuojami.`)) return
    const r = (await approveWorkPeriod({ from, to, workshop })).data
    window.alert(`Patvirtinta: ${r.approved}. Praleista (yra įspėjimų arba nėra įkainio): ${r.skipped}.`)
  })

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0)
  const warnCount = rows.filter((r) => r.warnings.length).length

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px] print-grid-1">
      <Card title={`Darbo lapai · ${month}`} icon="list"
        actions={
          <span className="no-print flex flex-wrap items-center gap-2">
            <select className={inputCls} value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)}>
              <option value="">Visi darbuotojai</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button type="button" className={ghostBtnCls} onClick={approveAll}>Patvirtinti mėnesį</button>
          </span>
        }>
        <p className="mb-2 text-sm text-stone-600">
          Preliminarus atlygis: <b>{fmtEur(total)} €</b> · įrašų {rows.length}
          {warnCount > 0 && <span className="text-red-700"> · su įspėjimais {warnCount}</span>}
        </p>
        <Table
          rows={rows}
          empty="Šio mėnesio įrašų nėra"
          rowClass={(r) => (r.warnings.length ? 'bg-red-50/60' : f.id === r.id ? 'bg-amber-50' : '')}
          cols={[
            { header: 'Data', render: (r) => fmtDate(r.work_date) },
            { header: 'Darbuotojas', render: (r) => r.worker?.name },
            { header: 'Darbas', render: (r) => <>{r.operation?.name}{r.production_product && <span className="text-stone-500"> · {r.production_product.name}</span>}{r.l_week && <span className="text-stone-500"> · {r.l_week.code}</span>}{r.shift && <span className="text-stone-500"> · pam. {r.shift}</span>}</> },
            { header: 'Apmokama', align: 'right', render: qtyText },
            { header: 'Darbo lapo duomenys', render: (r) => <span className="text-xs text-stone-600">{detailsText(r)}{r.notes ? ` ${r.notes}` : ''}</span> },
            { header: 'Įkainis', align: 'right', render: (r) => fmtUnitEur(r.rate_applied) },
            { header: 'Suma, €', align: 'right', render: (r) => <b>{fmtEur(r.amount)}</b> },
            { header: 'Būsena', align: 'center', render: (r) => (
              <span className="grid justify-items-center gap-1">
                {r.is_locked ? <Badge tone="green">Patvirtinta</Badge> : <Badge>Įvesta</Badge>}
                {r.warnings.map((w) => <span key={w} className="text-xs text-red-700">{w}</span>)}
              </span>
            ) },
            { header: 'Veiksmai', align: 'center', render: (r) => (
              <span className="no-print flex justify-center gap-3 whitespace-nowrap text-sm">
                {!r.is_locked && <button className="text-stone-700 hover:underline" onClick={() => edit(r)}>Taisyti</button>}
                <button className={r.is_locked ? 'text-blue-600 hover:underline' : 'text-stone-700 hover:underline'} onClick={() => act(() => lockWorkEntry(r.id))}>
                  {r.is_locked ? 'Atšaukti' : 'Patvirtinti'}
                </button>
                {!r.is_locked && <button className="text-red-600 hover:underline" onClick={() => window.confirm('Ištrinti įrašą?') && act(() => deleteWorkEntry(r.id))}>Trinti</button>}
              </span>
            ) },
          ]}
        />
      </Card>

      <Card title={f.id ? 'Taisyti darbo įrašą' : 'Naujas darbo įrašas'} icon="doc" noPrint>
        {!workers.length || !ops.length ? (
          <p className="text-sm text-stone-600">Pirmiausia skiltyje „Darbuotojai ir darbai“ įveskite darbuotojus.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data" required><input type="date" className={inputCls} value={f.work_date} onChange={(e) => set({ work_date: e.target.value })} required /></Field>
              <Field label="Pamaina"><input className={inputCls} maxLength={20} value={f.shift} onChange={(e) => set({ shift: e.target.value })} /></Field>
            </div>
            <Field label="Darbuotojas" required>
              <select className={inputCls} value={f.worker_id} onChange={(e) => set({ worker_id: e.target.value })} required>
                <option value="">— pasirinkite —</option>
                {workers.filter((w) => w.is_active || String(w.id) === f.worker_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Darbas" required>
              <select className={inputCls} value={f.work_operation_id} onChange={(e) => set({ work_operation_id: e.target.value })} required>
                <option value="">— pasirinkite —</option>
                {ops.filter((o) => o.is_active || String(o.id) === f.work_operation_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>

            {op && (op.stage === 'mixing' || op.stage === 'baking') && workshop === 'sakociai' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Šakočio rūšis">
                  <select className={inputCls} value={f.production_product_id} onChange={(e) => set({ production_product_id: e.target.value })}>
                    <option value="">—</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="L. savaitė">
                  <select className={inputCls} value={f.l_week_id} onChange={(e) => set({ l_week_id: e.target.value })}>
                    <option value="">—</option>
                    {lweeks.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {op?.stage === 'eggs' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Pilni kibirėliai (po ${fmtKg(op.norm_kg ?? 11)} kg)`}><input type="number" min="0" step="1" className={inputCls} value={f.buckets_full} onChange={(e) => set({ buckets_full: e.target.value })} /></Field>
                  <Field label="Nepilno kibirėlio masė, kg"><input type="number" min="0" step="0.001" className={inputCls} value={f.partial_kg} onChange={(e) => set({ partial_kg: e.target.value })} /></Field>
                </div>
                <Field label="Sumušta kiaušinių, vnt. (apmokama)" required><input type="number" min="1" step="1" className={inputCls} value={f.eggs_count} onChange={(e) => set({ eggs_count: e.target.value })} required /></Field>
                {eggMass > 0 && (
                  <p className="rounded-md bg-stone-50 px-2 py-1 text-sm">
                    Kiaušinių masė <b>{fmtKg(eggMass)} kg</b>
                    {+f.eggs_count > 0 && <> · vidutinis kiaušinis <b>{fmtKg((eggMass / +f.eggs_count) * 1000)} g</b></>}
                  </p>
                )}
              </>
            )}

            {op?.stage === 'mixing' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Maišymų skaičius" required><input type="number" min="0" step="0.5" className={inputCls} value={f.mixes} onChange={(e) => set({ mixes: e.target.value })} required /></Field>
                  <Field label="Vieno maišymo kg"><input type="number" min="0" step="0.001" className={inputCls} placeholder={String(op.norm_kg ?? 17.5)} value={f.kg_per_mix} onChange={(e) => set({ kg_per_mix: e.target.value })} /></Field>
                </div>
                {mixKg > 0 && <p className="rounded-md bg-stone-50 px-2 py-1 text-sm">Sumaišyta žalios tešlos <b>{fmtKg(mixKg)} kg</b> (apmokama)</p>}
              </>
            )}

            {op?.pay_basis === 'hours' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Pradžia"><input type="time" className={inputCls} value={f.start} onChange={(e) => set({ start: e.target.value })} /></Field>
                  <Field label="Pabaiga"><input type="time" className={inputCls} value={f.end} onChange={(e) => set({ end: e.target.value })} /></Field>
                  <Field label="Pertrauka, min."><input type="number" min="0" step="1" className={inputCls} value={f.break_min} onChange={(e) => set({ break_min: e.target.value })} /></Field>
                </div>
                <Field label="arba apmokamos valandos"><input type="number" min="0" step="0.25" className={inputCls} value={f.hours} disabled={!!(f.start && f.end)} onChange={(e) => set({ hours: e.target.value })} /></Field>
              </>
            )}

            {op && op.pay_basis === 'qty' && op.stage !== 'eggs' && op.stage !== 'mixing' && (
              <Field label={`Įskaitomas kiekis, ${UNITS[op.unit]}`} required>
                <input type="number" min="0" step="0.001" className={inputCls} value={f.qty} onChange={(e) => set({ qty: e.target.value })} required />
              </Field>
            )}

            {op?.stage === 'baking' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dirbta valandų"><input type="number" min="0" max="24" step="0.25" className={inputCls} value={f.hours} onChange={(e) => set({ hours: e.target.value })} /></Field>
                <Field label="Iš jų brokas (2 rūšis), kg"><input type="number" min="0" step="0.001" className={inputCls} value={f.defect_kg} onChange={(e) => set({ defect_kg: e.target.value })} /></Field>
              </div>
            )}

            {op?.stage === 'barcoding' && (
              <>
                <Field label="Subarkoduota, vnt."><input type="number" min="0" step="1" className={inputCls} value={f.units} onChange={(e) => set({ units: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Parduotuvė / atkrovimas"><input className={inputCls} maxLength={150} value={f.destination} onChange={(e) => set({ destination: e.target.value })} /></Field>
                  <Field label="Važtaraštis / užsakymas"><input className={inputCls} maxLength={50} value={f.document} onChange={(e) => set({ document: e.target.value })} /></Field>
                </div>
              </>
            )}

            <Field label="Pastabos"><input className={inputCls} maxLength={255} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <button className={btnCls} disabled={busy}>{busy ? 'Saugoma…' : f.id ? 'Išsaugoti' : 'Įrašyti'}</button>
              {f.id > 0 && <button type="button" className={ghostBtnCls} onClick={() => setF(emptyEntry())}>Atšaukti</button>}
            </div>
            <Err msg={err} />
          </form>
        )}
      </Card>
    </div>
  )
}

// ================= Suvestinė =================

function SummaryView({ workshop, month }: { workshop: Workshop; month: string }) {
  const [rows, setRows] = useState<WorkSummaryRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    getWorkSummary({ ...monthBounds(month), workshop }).then((r) => setRows(r.data)).catch((e) => setErr(errText(e)))
  }, [workshop, month])

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const unapproved = rows.reduce((s, r) => s + r.unapproved, 0)

  return (
    <Card title={`DU suvestinė · ${WORKSHOPS.find((w) => w.id === workshop)?.label} · ${month}`} icon="chart">
      <p className="mb-3 text-sm text-stone-600">
        Preliminarus atlygis pagal darbo lapus: <b>{fmtEur(total)} €</b>
        {unapproved > 0 && <span className="text-amber-800"> · nepatvirtintų įrašų {unapproved} (suma pagal dabar galiojantį įkainį)</span>}
      </p>
      <Err msg={err} />
      {!rows.length ? <p className="py-4 text-center text-sm text-stone-400">Šio mėnesio įrašų nėra</p> : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-100 text-stone-700">
                <th className="px-2.5 py-2 text-left">Darbuotojas</th>
                <th className="px-2.5 py-2 text-left">Darbas</th>
                <th className="px-2.5 py-2 text-right">Kiekis</th>
                <th className="px-2.5 py-2 text-right">Valandos</th>
                <th className="px-2.5 py-2 text-right">Suma, €</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.worker.id}>
                  {r.operations.map((o, i) => (
                    <tr key={`${r.worker.id}-${o.name}`} className="border-t border-stone-100">
                      <td className="px-2.5 py-1.5">{i === 0 && <><b>{r.worker.name}</b>{r.worker.position && <span className="text-stone-500"> · {r.worker.position}</span>}</>}</td>
                      <td className="px-2.5 py-1.5">{o.name}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{o.basis === 'qty' ? `${o.unit === 'vnt' ? fmtHours(o.qty) : fmtKg(o.qty)} ${UNITS[o.unit]}` : ''}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{o.basis === 'hours' ? fmtHours(o.hours) : ''}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtEur(o.amount)}</td>
                    </tr>
                  ))}
                  <tr key={`${r.worker.id}-total`} className="border-t border-stone-200 bg-[#fbf7f2] font-semibold">
                    <td className="px-2.5 py-1.5" colSpan={2}>
                      Iš viso: {r.worker.name}
                      {r.unapproved > 0 && <span className="ml-2 font-normal text-amber-800">nepatvirtinta {r.unapproved}</span>}
                      {r.warnings > 0 && <span className="ml-2 font-normal text-red-700">įspėjimų {r.warnings}</span>}
                    </td>
                    <td />
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{r.hours ? fmtHours(r.hours) : ''}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtEur(r.amount)}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="border-t-2 border-stone-300 bg-amber-50 font-bold">
                <td className="px-2.5 py-2" colSpan={4}>Cechas iš viso</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{fmtEur(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Tai preliminarus atlygis pagal cecho darbo lapus. Priemokos, naktinis / viršvalandinis darbas ir mokesčiai skaičiuojami darbo užmokesčio apskaitos programoje.
      </p>
    </Card>
  )
}

// ================= Įkainiai =================

const emptyRate = () => ({ id: 0, work_operation_id: '', worker_id: '', rate: '', rate_2nd: '', valid_from: todayIso(), valid_to: '', notes: '' })

function RatesView({ rates, ops, workers, reload }: { rates: WorkRate[]; ops: WorkOperation[]; workers: Worker[]; reload: () => Promise<unknown> }) {
  const [f, setF] = useState(emptyRate())
  const [err, setErr] = useState<string | null>(null)
  const op = ops.find((o) => String(o.id) === f.work_operation_id)
  const today = todayIso()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      await saveWorkRate({
        work_operation_id: +f.work_operation_id, worker_id: f.worker_id ? +f.worker_id : null, rate: +f.rate,
        rate_2nd: op?.stage === 'baking' && f.rate_2nd !== '' ? +f.rate_2nd : null,
        valid_from: f.valid_from, valid_to: f.valid_to || null, notes: f.notes || null,
      }, f.id || undefined)
      setF(emptyRate())
      await reload()
    } catch (e2) { setErr(errText(e2)) }
  }

  const sorted = useMemo(() => [...rates].sort((a, b) =>
    ops.findIndex((o) => o.id === a.work_operation_id) - ops.findIndex((o) => o.id === b.work_operation_id) || b.valid_from.localeCompare(a.valid_from)), [rates, ops])
  const missing = ops.filter((o) => o.is_active && !rates.some((r) => r.work_operation_id === o.id && r.valid_from <= today && (!r.valid_to || r.valid_to >= today)))

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px] print-grid-1">
      <Card title="Įkainiai" icon="chart">
        <p className="mb-2 text-sm text-stone-600">
          Pakeitus įkainį, sukurkite naują su „Galioja nuo“ data, o senajam nurodykite „Galioja iki“. Jau patvirtintų darbo lapų sumos nesikeičia.
        </p>
        {missing.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Šiandien negalioja joks įkainis: {missing.map((o) => o.name).join(', ')}</p>
        )}
        <Table
          rows={sorted}
          empty="Įkainių dar nėra"
          cols={[
            { header: 'Darbas', render: (r) => r.operation?.name },
            { header: 'Kam', render: (r) => r.worker?.name ?? 'Visiems' },
            { header: 'Įkainis, €', align: 'right', render: (r) => <b>{fmtUnitEur(r.rate)}</b> },
            { header: '2 rūšis (brokas), €', align: 'right', render: (r) => (r.rate_2nd != null ? fmtUnitEur(r.rate_2nd) : '') },
            { header: 'Už', render: (r) => UNITS[r.operation?.unit ?? 'kg'] },
            { header: 'Galioja', render: (r) => `${fmtDate(r.valid_from)} – ${r.valid_to ? fmtDate(r.valid_to) : '…'}` },
            { header: 'Pastabos', render: (r) => r.notes ?? '' },
            { header: 'Veiksmai', align: 'center', render: (r) => (
              <span className="no-print flex justify-center gap-3 text-sm">
                <button className="text-stone-700 hover:underline" onClick={() => setF({
                  id: r.id, work_operation_id: String(r.work_operation_id), worker_id: r.worker_id ? String(r.worker_id) : '',
                  rate: String(r.rate), rate_2nd: r.rate_2nd != null ? String(r.rate_2nd) : '', valid_from: r.valid_from, valid_to: r.valid_to ?? '', notes: r.notes ?? '',
                })}>Taisyti</button>
                <button className="text-red-600 hover:underline" onClick={async () => {
                  if (!window.confirm('Ištrinti įkainį? Patvirtintų įrašų sumos nesikeis.')) return
                  try { await deleteWorkRate(r.id); await reload() } catch (e) { setErr(errText(e)) }
                }}>Trinti</button>
              </span>
            ) },
          ]}
        />
      </Card>
      <Card title={f.id ? 'Taisyti įkainį' : 'Naujas įkainis'} icon="doc" noPrint>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Darbas" required>
            <select className={inputCls} value={f.work_operation_id} onChange={(e) => setF({ ...f, work_operation_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {ops.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Darbuotojas (tuščia – visiems)">
            <select className={inputCls} value={f.worker_id} onChange={(e) => setF({ ...f, worker_id: e.target.value })}>
              <option value="">Visiems</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label={`Įkainis, € už ${op ? UNITS[op.unit] : 'vienetą'}`} required>
            <input type="number" min="0" step="0.0001" className={inputCls} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} required />
          </Field>
          {op?.stage === 'baking' && (
            <Field label={`2 rūšies (broko) įkainis, € už ${UNITS[op.unit]}`}>
              <input type="number" min="0" step="0.0001" className={inputCls} value={f.rate_2nd} onChange={(e) => setF({ ...f, rate_2nd: e.target.value })} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Galioja nuo" required><input type="date" className={inputCls} value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} required /></Field>
            <Field label="Galioja iki"><input type="date" className={inputCls} value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} /></Field>
          </div>
          <Field label="Pastabos"><input className={inputCls} maxLength={255} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="flex gap-2">
            <button className={btnCls}>{f.id ? 'Išsaugoti' : 'Pridėti'}</button>
            {f.id > 0 && <button type="button" className={ghostBtnCls} onClick={() => setF(emptyRate())}>Atšaukti</button>}
          </div>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}

// ================= Darbuotojai ir darbai =================

function SetupView({ workshop, workers, ops, reload }: { workshop: Workshop; workers: Worker[]; ops: WorkOperation[]; reload: () => Promise<unknown> }) {
  const [w, setW] = useState({ id: 0, name: '', position: '', is_active: true })
  const [o, setO] = useState({ id: 0, name: '', stage: 'other' as WorkStage, pay_basis: 'hours' as 'hours' | 'qty', unit: 'val' as WorkOperation['unit'], norm_kg: '', is_active: true })
  const [err, setErr] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setErr(null)
    try { await fn(); after(); await reload() } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Darbuotojai" icon="user">
        <Table
          rows={workers}
          empty="Darbuotojų dar nėra"
          rowClass={(r) => (r.is_active ? '' : 'text-stone-400')}
          cols={[
            { header: 'Vardas, pavardė', render: (r) => r.name },
            { header: 'Pareigos', render: (r) => r.position ?? '' },
            { header: 'Būsena', align: 'center', render: (r) => (r.is_active ? <Badge tone="green">Dirba</Badge> : <Badge>Nebedirba</Badge>) },
            { header: 'Veiksmai', align: 'center', render: (r) => (
              <span className="no-print flex justify-center gap-3 text-sm">
                <button className="text-stone-700 hover:underline" onClick={() => setW({ id: r.id, name: r.name, position: r.position ?? '', is_active: r.is_active })}>Taisyti</button>
                <button className="text-red-600 hover:underline" onClick={() => window.confirm(`Ištrinti ${r.name}?`) && run(() => deleteWorker(r.id), () => {})}>Trinti</button>
              </span>
            ) },
          ]}
        />
        <form className="no-print mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end" onSubmit={(e) => {
          e.preventDefault()
          run(() => saveWorker({ name: w.name, position: w.position || null, workshop, is_active: w.is_active }, w.id || undefined),
            () => setW({ id: 0, name: '', position: '', is_active: true }))
        }}>
          <Field label="Vardas, pavardė" required><input className={inputCls} maxLength={100} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} required /></Field>
          <Field label="Pareigos"><input className={inputCls} maxLength={100} value={w.position} onChange={(e) => setW({ ...w, position: e.target.value })} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={w.is_active} onChange={(e) => setW({ ...w, is_active: e.target.checked })} /> Dirba</label>
          <button className={btnCls}>{w.id ? 'Išsaugoti' : 'Pridėti'}</button>
        </form>
      </Card>

      <Card title="Darbai ir apmokėjimo pagrindas" icon="factory">
        <Table
          rows={ops}
          rowClass={(r) => (r.is_active ? '' : 'text-stone-400')}
          cols={[
            { header: 'Darbas', render: (r) => r.name },
            { header: 'Etapas', render: (r) => STAGES[r.stage] },
            { header: 'Apmokama', render: (r) => (r.pay_basis === 'hours' ? 'Valandinis' : `Pagal kiekį, ${UNITS[r.unit]}`) },
            { header: 'Norma, kg', align: 'right', render: (r) => (r.norm_kg ? fmtKg(r.norm_kg) : '') },
            { header: 'Veiksmai', align: 'center', render: (r) => (
              <span className="no-print flex justify-center gap-3 text-sm">
                <button className="text-stone-700 hover:underline" onClick={() => setO({ id: r.id, name: r.name, stage: r.stage, pay_basis: r.pay_basis, unit: r.unit, norm_kg: r.norm_kg ? String(r.norm_kg) : '', is_active: r.is_active })}>Taisyti</button>
                <button className="text-red-600 hover:underline" onClick={() => window.confirm(`Ištrinti „${r.name}“?`) && run(() => deleteWorkOperation(r.id), () => {})}>Trinti</button>
              </span>
            ) },
          ]}
        />
        <form className="no-print mt-3 grid gap-3 md:grid-cols-2" onSubmit={(e) => {
          e.preventDefault()
          run(() => saveWorkOperation({ workshop, name: o.name, stage: o.stage, pay_basis: o.pay_basis, unit: o.unit, norm_kg: o.norm_kg ? +o.norm_kg : null, is_active: o.is_active }, o.id || undefined),
            () => setO({ id: 0, name: '', stage: 'other', pay_basis: 'hours', unit: 'val', norm_kg: '', is_active: true }))
        }}>
          <Field label="Pavadinimas" required><input className={inputCls} maxLength={100} value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} required /></Field>
          <Field label="Etapas">
            <select className={inputCls} value={o.stage} onChange={(e) => setO({ ...o, stage: e.target.value as WorkStage })}>
              {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Apmokėjimas">
            <select className={inputCls} value={o.pay_basis} onChange={(e) => {
              const pb = e.target.value as 'hours' | 'qty'
              setO({ ...o, pay_basis: pb, unit: pb === 'hours' ? 'val' : o.unit === 'val' ? 'kg' : o.unit })
            }}>
              <option value="hours">Valandinis</option>
              <option value="qty">Pagal kiekį</option>
            </select>
          </Field>
          {o.pay_basis === 'qty' && (
            <Field label="Matas">
              <select className={inputCls} value={o.unit} onChange={(e) => setO({ ...o, unit: e.target.value as WorkOperation['unit'] })}>
                <option value="kg">kg</option><option value="vnt">vnt.</option><option value="m">m</option><option value="t">t</option>
              </select>
            </Field>
          )}
          {(o.stage === 'eggs' || o.stage === 'mixing') && (
            <Field label={o.stage === 'eggs' ? 'Kibirėlio masė, kg' : 'Vieno maišymo kg'}>
              <input type="number" min="0" step="0.001" className={inputCls} value={o.norm_kg} onChange={(e) => setO({ ...o, norm_kg: e.target.value })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.is_active} onChange={(e) => setO({ ...o, is_active: e.target.checked })} /> Aktyvus</label>
          <div className="flex gap-2 md:col-span-2">
            <button className={btnCls}>{o.id ? 'Išsaugoti' : 'Pridėti darbą'}</button>
            {o.id > 0 && <button type="button" className={ghostBtnCls} onClick={() => setO({ id: 0, name: '', stage: 'other', pay_basis: 'hours', unit: 'val', norm_kg: '', is_active: true })}>Atšaukti</button>}
          </div>
        </form>
        <Err msg={err} />
      </Card>
    </div>
  )
}
