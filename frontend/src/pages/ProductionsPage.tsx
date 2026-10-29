import { useEffect, useState, type FormEvent } from 'react'
import {
  createProduction, deleteRecord, getLWeeks, getProductionProducts, getProductions,
  getProduction, getProductInfo, previewProduction, toggleLock, errText, isShortage,
  type CostMaterial, type LWeek, type MaterialUsage, type Production, type ProductInfo, type ProductionPreview, type ProductionProduct,
} from '../api'
import {
  Badge, Card, Err, Field, Icon, InfoRows, LWeekBadge, Table, btnCls, fmtDate, fmtEur, fmtKg, fmtPct, fmtUnitEur, inputCls,
  outlineBtnCls, todayIso,
} from '../ui'

/** Redaguojamas nurašymo planas: žaliava -> partijos su kiekiais (pradžioje - FIFO pasiūlymas). */
type PlanRow = { batchId: string; qty: string }
type EditablePlan = Record<number, PlanRow[]>

const fifoPlan = (p: ProductionPreview): EditablePlan =>
  Object.fromEntries(p.plan.filter((r) => r.raw_material.requires_batch).map((r) => [
    r.raw_material.id,
    r.take.filter((t) => t.batch).map((t) => ({ batchId: String(t.batch!.id), qty: String(t.qty_kg) })),
  ]))

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Savikaina: „≈" - dalis įvertinta pagal paskutinę žinomą žaliavos kainą (partijai kaina dar neįvesta),
 * „—" - kuriai nors žaliavai kaina neįvesta niekada (apskaičiuoti negalima).
 */
const costText = (text: string, complete?: boolean) => {
  if (text === '—') return <span title="Kai kurioms žaliavoms kaina dar neįvesta – įveskite partijų kainas">—</span>
  return complete === false
    ? <span title="Dalis savikainos įvertinta pagal paskutinę žinomą žaliavos kainą (partijai kaina neįvesta)">≈ {text}</span>
    : <span>{text}</span>
}
const pct = (share?: number) => (share == null ? '—' : `${fmtPct(share * 100)} %`)

// Žaliavų grupių fonai ir partijų taškų spalvos (kaip makete) - kartojasi ratu
const GROUP_BG = ['bg-sky-50', 'bg-green-50', 'bg-amber-50', 'bg-pink-50', 'bg-violet-50', 'bg-teal-50']
const DOTS = ['bg-blue-600', 'bg-red-500', 'bg-purple-600', 'bg-green-600', 'bg-orange-500', 'bg-teal-600', 'bg-amber-900']

const th = 'border-r border-stone-200 px-3 py-2 text-center font-semibold last:border-r-0'
const tdNum = 'px-3 py-1 text-right tabular-nums'

/**
 * Sunaudotos žaliavos pagal gamybą: kiekviena žaliava atskiru bloku, joje - kiekviena partija atskirai
 * (kiek kg, galioja iki, kaina, suma), dešinėje žaliavos suma, apačioje IŠ VISO.
 */
function UsageBreakdown({ usages, costs }: { usages: MaterialUsage[]; costs?: CostMaterial[] }) {
  const groups = Object.values(usages.reduce<Record<number, MaterialUsage[]>>((acc, u) => {
    (acc[u.raw_material_id] ??= []).push(u)
    return acc
  }, {}))
  const price = (u: MaterialUsage) => (u.material_batch?.unit_cost_eur == null ? null : Number(u.material_batch.unit_cost_eur))
  const value = (u: MaterialUsage) => { const p = price(u); return p == null ? null : Number(u.qty_kg) * p }
  const totalKg = usages.reduce((s, u) => s + Number(u.qty_kg), 0)
  const costOf = (rm: number) => costs?.find((c) => c.raw_material_id === rm)
  const totalEur = costs
    ? (costs.some((c) => c.missing_price) ? null : costs.reduce((s, c) => s + (c.cost_eur ?? 0), 0))
    : usages.reduce((s, u) => s + (value(u) ?? 0), 0)
  const totalEstimated = costs?.some((c) => c.estimated) ?? false

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-100 text-stone-700">
            <th className={th}>Žaliava</th>
            <th className={th}>Iš viso, kg</th>
            <th className={th}>Partijų detalizacija</th>
            <th className={th}>Kaina, €/kg</th>
            <th className={th}>Suma, €</th>
            <th className={th}>Žaliavos suma, €</th>
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const kg = g.reduce((s, u) => s + Number(u.qty_kg), 0)
          const c = costOf(g[0].raw_material_id)
          const eur = c ? c.cost_eur : g.reduce((s, u) => s + (value(u) ?? 0), 0)
          const missing = g.some(isShortage)
          const unpriced = c ? c.estimated : g.some((u) => u.material_batch && price(u) == null)
          const bg = GROUP_BG[gi % GROUP_BG.length]
          return (
            <tbody key={g[0].raw_material_id} className={`${bg} border-t-4 border-white`}>
              {g.map((u, i) => (
                <tr key={u.id}>
                  {i === 0 && (
                    <>
                      <td rowSpan={g.length} className="px-3 py-2 align-middle">
                        <p className="font-semibold">{u.raw_material?.name}</p>
                        {u.raw_material?.code && <p className="text-xs text-stone-500">{u.raw_material.code}</p>}
                        {missing && <Badge tone="red">TRŪKSTA</Badge>}
                        {!u.raw_material?.requires_batch && <p className="text-xs text-stone-500">be partijos</p>}
                      </td>
                      <td rowSpan={g.length} className="px-3 py-2 text-center text-base font-bold tabular-nums">{fmtKg(kg)}</td>
                    </>
                  )}
                  <td className="px-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${u.material_batch ? DOTS[i % DOTS.length] : 'bg-stone-300'}`} />
                      <span className="min-w-24">
                        {u.material_batch
                          ? `Partija ${u.material_batch.batch_number}`
                          : isShortage(u) ? <Badge tone="red">TRŪKSTA</Badge> : 'be partijos'}
                      </span>
                      {u.material_batch && <span className="text-xs text-stone-500">(galioja iki {fmtDate(u.material_batch.expiry_date)})</span>}
                      <span className="ml-auto pl-4 tabular-nums">{fmtKg(u.qty_kg)} kg</span>
                    </div>
                  </td>
                  <td className={tdNum}>{fmtUnitEur(price(u))}</td>
                  <td className={tdNum}>{fmtEur(value(u))}</td>
                  {i === 0 && (
                    <td rowSpan={g.length} className="px-3 py-2 text-center text-base font-bold tabular-nums">
                      {costText(fmtEur(eur), !unpriced)}
                      {c?.share_pct != null && <p className="text-xs font-normal text-stone-500">{fmtPct(c.share_pct)} %</p>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )
        })}
        <tfoot>
          <tr className="border-t border-stone-300 bg-stone-100 font-bold">
            <td className="px-3 py-2">IŠ VISO</td>
            <td className="px-3 py-2 text-center tabular-nums">{fmtKg(totalKg)}</td>
            <td colSpan={3} />
            <td className="px-3 py-2 text-center tabular-nums">{costText(fmtEur(totalEur), !totalEstimated)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function ProductionsPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [products, setProducts] = useState<ProductionProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Production | null>(null)
  const [preview, setPreview] = useState<ProductionPreview | null>(null)
  const [info, setInfo] = useState<ProductInfo | null>(null)
  const [plan, setPlan] = useState<EditablePlan>({})
  const [edited, setEdited] = useState(false)
  const [f, setF] = useState({
    production_date: todayIso(),
    production_product_id: '', qty_produced_kg: '', l_week_id: '', notes: '',
  })

  // žurnalas rodomas po 50 (naujausios pirmos), „Rodyti daugiau" - dar 50
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const load = (n = limit) => getProductions(n)
    .then((r) => { setRows(r.data.data); setTotal(r.data.total); return r.data.data })
    .catch(() => { setErr('Nepavyko užkrauti'); return [] })
  const showMore = () => { const n = limit + 50; setLimit(n); load(n) }

  const openDetail = async (id: number) => {
    try { setDetail((await getProduction(id)).data) } catch (e) { setErr(errText(e)) }
  }

  useEffect(() => {
    // iškart parodom naujausios gamybos sunaudojimą
    load().then((list) => { if (list.length) openDetail(list[0].id) })
    getProductionProducts().then((r) => setProducts(r.data.data))
    getLWeeks().then((r) => setLweeks(r.data.data))
  }, [])

  // Pasirinkus gamybinę rūšį - iškart visa jos informacija (receptūra, fasavimo rūšys, paskutinės gamybos)
  const loadInfo = () => {
    if (!f.production_product_id) { setInfo(null); return }
    getProductInfo(+f.production_product_id, {
      production_date: f.production_date,
      l_week_id: f.l_week_id ? +f.l_week_id : undefined,
    }).then((r) => setInfo(r.data)).catch(() => setInfo(null))
  }

  useEffect(loadInfo, [f.production_product_id, f.production_date, f.l_week_id])

  // FIFO peržiūra: iš kurių partijų nurašys, kol registruojam
  useEffect(() => {
    if (!f.production_product_id || !f.qty_produced_kg || !f.l_week_id || +f.qty_produced_kg <= 0) {
      setPreview(null)
      return
    }
    // cancelled - pavėlavęs ankstesnio kiekio atsakymas neperrašo naujesnio plano
    let cancelled = false
    const t = setTimeout(() => {
      previewProduction({
        production_date: f.production_date,
        production_product_id: +f.production_product_id,
        qty_produced_kg: +f.qty_produced_kg,
        l_week_id: +f.l_week_id,
      }).then((r) => {
        if (cancelled) return
        setPreview(r.data); setPlan(fifoPlan(r.data)); setEdited(false)
      }).catch(() => { if (!cancelled) setPreview(null) })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [f.production_date, f.production_product_id, f.qty_produced_kg, f.l_week_id])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await createProduction({
        ...f,
        production_product_id: +f.production_product_id,
        qty_produced_kg: +f.qty_produced_kg,
        l_week_id: +f.l_week_id,
        // tik jei planas pakeistas rankiniu būdu - kitaip serveris pats paskirsto FIFO
        allocations: edited
          ? Object.entries(plan).flatMap(([rm, rows]) => rows
              .filter((r) => r.batchId && +r.qty > 0)
              .map((r) => ({ raw_material_id: +rm, material_batch_id: +r.batchId, qty_kg: +r.qty })))
          : undefined,
      })
      const missing = res.data.usages?.filter(isShortage)
      if (missing?.length) {
        setErr(`Dėmesio: trūko partijų – ${missing.map((m) => `${m.raw_material?.name} ${fmtKg(m.qty_kg)} kg`).join(', ')}`)
      }
      setF({ ...f, qty_produced_kg: '', notes: '' })
      setPreview(null); setPlan({}); setEdited(false)
      await load()
      openDetail(res.data.id)
      loadInfo() // atnaujina rūšies paskutines gamybas
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const doLock = async (p: Production) => {
    try {
      await toggleLock('productions', p.id)
      await load()
      if (detail?.id === p.id) openDetail(p.id)
    } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (p: Production) => {
    if (!window.confirm(`Trinti gamybą #${p.id}? Partijos bus atlaisvintos.`)) return
    try {
      await deleteRecord('productions', p.id)
      if (detail?.id === p.id) setDetail(null)
      await load()
    } catch (e) { setErr(errText(e)) }
  }

  const toggleDetail = (p: Production) => (detail?.id === p.id ? setDetail(null) : openDetail(p.id))

  const usedKg = detail?.usages?.reduce((s, u) => s + Number(u.qty_kg), 0) ?? 0

  // ---- Plano redagavimas ----
  const setPlanRows = (rm: number, rows: PlanRow[]) => { setPlan({ ...plan, [rm]: rows }); setEdited(true) }
  const assigned = (rm: number) => round3((plan[rm] ?? []).reduce((s, r) => s + (+r.qty || 0), 0))
  // per daug paskirta žaliavai arba partijai - registruoti neleidžiama
  const planErrors = preview?.plan.flatMap((row) => {
    if (!row.raw_material.requires_batch) return []
    const rm = row.raw_material.id
    const errs: string[] = []
    if (assigned(rm) > row.needed_kg + 0.0005) errs.push(`${row.raw_material.name}: paskirta daugiau nei reikia`)
    const perBatch: Record<string, number> = {}
    for (const r of plan[rm] ?? []) perBatch[r.batchId] = round3((perBatch[r.batchId] ?? 0) + (+r.qty || 0))
    for (const [id, qty] of Object.entries(perBatch)) {
      const b = row.options.find((o) => String(o.id) === id)
      if (b && qty > Number(b.balance_kg) + 0.0005) errs.push(`${row.raw_material.name}: partijoje ${b.batch_number} liko tik ${fmtKg(b.balance_kg)} kg`)
    }
    return errs
  }) ?? []

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px] print-grid-1">
      <div className="grid min-w-0 content-start gap-6">
        <Card title="Gamybos žurnalas" icon="factory">
          <Table
            cols={[
              { header: 'Data', render: (p) => fmtDate(p.production_date) },
              { header: 'Rūšis', render: (p) => p.production_product?.name },
              { header: 'Kiekis, kg', align: 'center', render: (p) => fmtKg(p.qty_produced_kg) },
              { header: 'L. savaitė', align: 'center', render: (p) => <LWeekBadge code={p.l_week?.code} /> },
              { header: 'Savikaina, €', align: 'right', render: (p) => costText(fmtEur(p.cost_eur), p.cost_complete) },
              { header: '€/kg', align: 'right', render: (p) => costText(fmtUnitEur(p.cost_per_kg_eur), p.cost_complete) },
              { header: 'Būsena', align: 'center', render: (p) => p.is_locked ? <Badge tone="green">Įspajamota</Badge> : <Badge>Dokumentas</Badge> },
              { header: ' ', align: 'center', render: (p) => (
                <button className={`no-print ${outlineBtnCls} ${detail?.id === p.id ? 'bg-amber-100' : ''}`} onClick={() => toggleDetail(p)}>Detalės</button>
              ) },
              { header: 'Veiksmai', align: 'center', render: (p) => (
                <span className="no-print flex justify-center gap-4 whitespace-nowrap text-sm">
                  <button className={p.is_locked ? 'text-blue-600 hover:underline' : 'text-stone-700 hover:underline'} onClick={() => doLock(p)}>
                    {p.is_locked ? 'Atrakinti' : 'Įspajamoti'}
                  </button>
                  <button className="text-red-600 hover:underline" onClick={() => doDelete(p)}>Trinti</button>
                </span>
              ) },
            ]}
            rows={rows}
            rowClass={(p) => (detail?.id === p.id ? 'bg-amber-50' : '')}
          />
          {total > rows.length && (
            <div className="no-print mt-3 flex items-center justify-center gap-3 text-sm text-stone-500">
              Rodoma {rows.length} iš {total}
              <button type="button" className={outlineBtnCls} onClick={showMore}>Rodyti daugiau</button>
            </div>
          )}
        </Card>

        {detail?.usages && (
          <Card title={`Sunaudota žaliavų (gamyba # ${detail.id})`} icon="leaf"
            actions={<span className="text-sm text-stone-500">{detail.production_product?.name} · {fmtDate(detail.production_date)}</span>}>
            {detail.usages.length
              ? <UsageBreakdown usages={detail.usages} costs={detail.cost_materials} />
              : <p className="py-4 text-center text-sm text-stone-400">Žaliavų sunaudojimas neužfiksuotas</p>}
          </Card>
        )}
      </div>

      <div className="grid content-start gap-6">
        <Card title="Registruoti gamybą" icon="gear" noPrint>
          <p className="mb-3 text-sm text-stone-600">Žaliavų sunaudojimas bus paskaičiuotas automatiškai pagal galiojančią receptūrą (FIFO).</p>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Data"><input type="date" className={inputCls} value={f.production_date} onChange={(e) => setF({ ...f, production_date: e.target.value })} required /></Field>
            <Field label="Gamybinė rūšis">
              <select className={inputCls} value={f.production_product_id} onChange={(e) => setF({ ...f, production_product_id: e.target.value })} required>
                <option value="">— pasirinkite —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Kiekis, kg"><input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_produced_kg} onChange={(e) => setF({ ...f, qty_produced_kg: e.target.value })} required /></Field>
            <Field label="L. savaitė">
              <select className={inputCls} value={f.l_week_id} onChange={(e) => setF({ ...f, l_week_id: e.target.value })} required>
                <option value="">— pasirinkite —</option>
                {lweeks.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </Field>
            <Field label="Pastabos"><textarea rows={3} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <button className={btnCls} disabled={busy || planErrors.length > 0}>{busy ? 'Saugoma…' : 'Registruoti'}</button>
            {planErrors.length > 0 && <Err msg={`Pataisykite planą: ${planErrors.join('; ')}`} />}
            <Err msg={err} />
          </form>
        </Card>

        {preview && (
          <Card
            title={`Nurašymo planas (receptūra v${preview.recipe.version})`}
            icon="list"
            noPrint
            actions={edited && (
              <button type="button" className="text-sm text-amber-800 hover:underline" onClick={() => { setPlan(fifoPlan(preview)); setEdited(false) }}>
                Atkurti FIFO
              </button>
            )}
          >
            {preview.recipe_cost && (
              <p className="mb-2 flex justify-between rounded-md bg-stone-50 px-2 py-1 text-sm" title="Receptūros normos × paskutinės žinomos žaliavų kainos">
                <span>Numatoma žaliavų savikaina</span>
                <span className="font-semibold tabular-nums">
                  {preview.recipe_cost.complete ? '≈ ' : '≥ '}{fmtEur(preview.recipe_cost.cost_per_kg_eur * +f.qty_produced_kg)} € ({fmtUnitEur(preview.recipe_cost.cost_per_kg_eur)} €/kg)
                </span>
              </p>
            )}
            <p className="mb-2 text-xs text-stone-500">
              Pasiūlyta pagal FIFO (seniausia tinkama partija pirma). Partiją ar kiekį galima pakeisti, pvz. pagal tai, kas fiziškai paimta.
            </p>
            <ul className="space-y-2 text-sm">
              {preview.plan.map((row, i) => {
                const rm = row.raw_material.id
                const rows = plan[rm] ?? []
                const missing = round3(row.needed_kg - assigned(rm))
                const unused = row.options.filter((o) => !rows.some((r) => r.batchId === String(o.id)))
                return (
                  <li key={rm} className={`rounded-md px-2 py-1.5 ${GROUP_BG[i % GROUP_BG.length]}`}>
                    <div className="flex justify-between font-semibold">
                      <span>{row.raw_material.name}</span>
                      <span className="tabular-nums">{fmtKg(row.needed_kg)} kg</span>
                    </div>
                    {!row.raw_material.requires_batch ? (
                      <p className="text-xs text-stone-500">Išimtis – partija nereikalinga, fiksuojamas tik kiekis</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {rows.map((r, j) => {
                          const b = row.options.find((o) => String(o.id) === r.batchId)
                          return (
                            <div key={j} className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[j % DOTS.length]}`} />
                              <select
                                className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs"
                                value={r.batchId}
                                onChange={(e) => setPlanRows(rm, rows.map((x, k) => (k === j ? { ...x, batchId: e.target.value } : x)))}
                              >
                                {row.options.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.batch_number} · liko {fmtKg(o.balance_kg)} kg · iki {fmtDate(o.expiry_date)}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number" step="0.001" min="0"
                                className="w-20 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums"
                                value={r.qty}
                                title={b ? `Partijoje liko ${fmtKg(b.balance_kg)} kg` : undefined}
                                onChange={(e) => setPlanRows(rm, rows.map((x, k) => (k === j ? { ...x, qty: e.target.value } : x)))}
                              />
                              <span className="text-xs">kg</span>
                              <button type="button" title="Pašalinti" className="text-stone-400 hover:text-red-600" onClick={() => setPlanRows(rm, rows.filter((_, k) => k !== j))}>
                                <Icon name="trash" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          {unused.length > 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-0.5 text-xs hover:bg-stone-50"
                              onClick={() => setPlanRows(rm, [...rows, {
                                batchId: String(unused[0].id),
                                qty: String(round3(Math.max(0, Math.min(missing, Number(unused[0].balance_kg))))),
                              }])}
                            >
                              <Icon name="plus" className="h-3 w-3" /> Pridėti partiją
                            </button>
                          ) : <span className="text-xs text-stone-400">{row.options.length ? 'Visos tinkamos partijos panaudotos' : 'Tinkamų partijų nėra'}</span>}
                          {missing > 0.0005 && <Badge tone="red">TRŪKSTA {fmtKg(missing)} kg</Badge>}
                          {missing < -0.0005 && <Badge tone="red">Viršija {fmtKg(-missing)} kg</Badge>}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {info && !preview && (
          <Card title={info.product.name} icon="box" noPrint>
            {info.recipe ? (
              <>
                <p className="mb-1 text-xs text-stone-500">
                  Receptūra v{info.recipe.version} · galioja nuo {fmtDate(info.recipe.valid_from)} · kg žaliavos / 1 kg produkto
                </p>
                <ul className="text-sm">
                  {info.recipe.items?.map((i) => {
                    const rc = info.recipe_cost?.items.find((x) => x.raw_material_id === i.raw_material_id)
                    return (
                      <li key={i.id} className="flex justify-between gap-2">
                        <span>{i.raw_material?.name}{i.raw_material?.requires_batch === false && <span className="text-stone-400"> (be partijos)</span>}</span>
                        <span className="tabular-nums">
                          {fmtKg(i.qty_kg_per_kg)}
                          {rc && <span className="ml-2 inline-block w-20 text-right text-xs text-stone-500">{rc.cost_per_kg_eur == null ? 'be kainos' : `${fmtUnitEur(rc.cost_per_kg_eur)} €`}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {info.recipe_cost && (
                  <p className="mt-1 flex justify-between border-t border-stone-200 pt-1 text-sm font-semibold"
                    title="Pagal receptūros normas ir paskutines žinomas žaliavų kainas">
                    <span>Receptūrinė savikaina, €/kg</span>
                    <span className="tabular-nums">{info.recipe_cost.complete ? '' : '≥ '}{fmtUnitEur(info.recipe_cost.cost_per_kg_eur)}</span>
                  </p>
                )}
                {info.recipe_cost && !info.recipe_cost.complete && (
                  <p className="text-xs text-stone-500">„≥“ – kai kurioms žaliavoms kaina dar neįvesta, suma nepilna.</p>
                )}
              </>
            ) : (
              <Err msg="Nėra galiojančios receptūros šiai datai" />
            )}
            <p className="mt-3 text-xs font-medium text-stone-500">Fasavimo rūšys</p>
            <ul className="text-sm">
              {info.product.packed_products.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-stone-400">{p.weight_from_kg != null ? `${fmtKg(p.weight_from_kg)}–${fmtKg(p.weight_to_kg)} kg` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-medium text-stone-500">Pagaminta iš viso: {fmtKg(info.produced_kg)} kg · paskutinės gamybos</p>
            <ul className="text-sm">
              {info.recent.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{fmtDate(p.production_date)} · {p.l_week?.code}</span>
                  <span className="tabular-nums">{fmtKg(p.qty_produced_kg)} kg</span>
                </li>
              ))}
              {info.recent.length === 0 && <li className="text-stone-400">Dar negaminta</li>}
            </ul>
            <p className="mt-3 text-xs text-stone-500">Įveskite kiekį ir L savaitę – bus parodyta, iš kurių partijų nurašoma.</p>
          </Card>
        )}

        {detail && (
          <>
            <Card title="Informacija" icon="info">
              <InfoRows rows={[
                ['Produkto savikaina, €/kg', costText(fmtUnitEur(detail.cost_per_kg_eur), detail.cost_complete)],
                ['Panaudotų žaliavų suma, €', costText(fmtEur(detail.cost_eur), detail.cost_complete)],
                ...(detail.cost_complete ? [] : [
                  ['– pagal partijų kainas, €', fmtEur(detail.cost_actual_eur)],
                  ['– įvertinta (partijai kaina neįvesta), €', fmtEur(detail.cost_estimated_eur)],
                ] as [string, string][]),
                ['Įkainota partijų kainomis', pct(detail.priced_share)],
                ['Pagamintas kiekis, kg', fmtKg(detail.qty_produced_kg)],
                ['Žaliavų sunaudojimas, kg', fmtKg(usedKg)],
                ['Išeiga, %', usedKg > 0 ? fmtPct((Number(detail.qty_produced_kg) / usedKg) * 100) : '—'],
              ]} />
            </Card>

            <Card title="Gamybos kortelė" icon="doc">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><p className="text-xs text-stone-500">Gaminys</p><p className="font-medium">{detail.production_product?.name}</p></div>
                <div><p className="text-xs text-stone-500">L. savaitė</p><LWeekBadge code={detail.l_week?.code} /></div>
                <div><p className="text-xs text-stone-500">Kiekis, kg</p><p className="font-medium tabular-nums">{fmtKg(detail.qty_produced_kg)}</p></div>
                <div><p className="text-xs text-stone-500">Data</p><p className="font-medium">{fmtDate(detail.production_date)}</p></div>
                <div><p className="text-xs text-stone-500">Gamybos Nr.</p><p className="font-medium">{detail.id}</p></div>
                <div><p className="text-xs text-stone-500">Būsena</p>{detail.is_locked ? <Badge tone="green">Įspajamota</Badge> : <Badge>Dokumentas</Badge>}</div>
                {detail.notes && <div className="col-span-2"><p className="text-xs text-stone-500">Pastabos</p><p>{detail.notes}</p></div>}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
