import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  createPackagingBatch, createPacking, createTransportNorm, deleteRecord, getLWeeks, getPackagingBatches, getPackagingMaterials, getPackagingStock,
  getPackings, getPackingSpecs, getProductionProducts, getShops, getTransportNorms, getWarehouses, reorderTransportNorms, savePackingSpecs,
  toggleLock, updatePackagingBatch, updateTransportNorm, errText,
  type LWeek, type PackagingBatch, type PackagingMaterial, type PackagingStockRow, type PackedProductSpec, type Packing,
  type ProductionProduct, type Shop, type TransportNorm, type Warehouse,
} from '../api'
import { ActionBtn, DragHandle, EditableTable, useDragSort } from '../editable'
import { printElement } from '../print'
import {
  Badge, Card, Err, Field, Icon, LWeekBadge, addBtnCls, fmtDate, fmtEur, fmtKg, fmtUnitEur, ghostBtnCls, inputCls, todayIso,
  type IconName,
} from '../ui'

type View = 'register' | 'receipts' | 'summary' | 'stock' | 'specs' | 'transport' | 'calc'

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'register', label: 'Pakuotų produktų registravimas', icon: 'box' },
  { id: 'receipts', label: 'Pakuočių gavimas', icon: 'truck' },
  { id: 'summary', label: 'Pakuočių suvestinė', icon: 'chart' },
  { id: 'stock', label: 'Pakuočių likučiai', icon: 'layers' },
  { id: 'specs', label: 'Pakavimo specifikacijos', icon: 'gear' },
  { id: 'transport', label: 'Transportinė pakuotė', icon: 'route' },
  { id: 'calc', label: 'Pakuočių poreikio skaičiuoklė', icon: 'list' },
]

/** Transportinė norma: pirkėjo norma, o jei jos nėra - bendra (be pirkėjo). */
const findNorm = (norms: TransportNorm[], packedId: string | number, shopId: string | number) =>
  norms.find((n) => String(n.packed_product_id) === String(packedId) && shopId !== '' && String(n.shop_id) === String(shopId))
  ?? norms.find((n) => String(n.packed_product_id) === String(packedId) && n.shop_id == null)

const boxesFor = (n: TransportNorm | undefined, units: number) =>
  n?.units_per_box && units > 0 ? Math.ceil(units / Number(n.units_per_box)) : null

const unitLabel = (u?: string) => (u === 'vnt' || !u ? 'vnt.' : u)
const qtyFmt = (n: number | null | undefined, unit?: string) =>
  n == null ? '—' : `${Number(n).toLocaleString('lt-LT', { maximumFractionDigits: 3 })} ${unitLabel(unit)}`
const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Vieneto svoris iš fasavimo rūšies: svorio ribų vidurkis arba skaičius pavadinime („0,32kg“, „Depo 1 kg“, „Sviestinis 0,5“). */
function defaultWeight(p?: PackedProductSpec): string {
  if (!p) return ''
  if (p.weight_from_kg != null && p.weight_to_kg != null && Number(p.weight_to_kg) - Number(p.weight_from_kg) <= 0.25) {
    return String(r3((Number(p.weight_from_kg) + Number(p.weight_to_kg)) / 2))
  }
  const m = p.name.match(/(\d+(?:[.,]\d+)?)\s*kg/i) ?? p.name.match(/(\d+[.,]\d+)\s*$/)
  return m ? String(Number(m[1].replace(',', '.'))) : ''
}

export default function PackagingPage() {
  const [view, setView] = useState<View>('register')
  const [specs, setSpecs] = useState<PackedProductSpec[]>([])
  const [materials, setMaterials] = useState<PackagingMaterial[]>([])
  const [batches, setBatches] = useState<PackagingBatch[]>([])
  const [packings, setPackings] = useState<Packing[]>([])
  const [products, setProducts] = useState<ProductionProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [norms, setNorms] = useState<TransportNorm[]>([])
  const [err, setErr] = useState<string | null>(null)

  const loadNorms = () => getTransportNorms().then((r) => setNorms(r.data))
  const loadSpecs = () => getPackingSpecs().then((r) => setSpecs(r.data))
  const loadBatches = () => getPackagingBatches().then((r) => setBatches(r.data))
  const loadPackings = () => getPackings().then((r) => setPackings(r.data))

  useEffect(() => {
    Promise.all([loadSpecs(), loadBatches(), loadPackings(), loadNorms(),
      getShops().then((r) => setShops(r.data.data)),
      getPackagingMaterials().then((r) => setMaterials(r.data.data)),
      getProductionProducts().then((r) => setProducts(r.data.data)),
      getLWeeks().then((r) => setLweeks([...r.data.data].sort((a, b) => b.year - a.year || b.week_number - a.week_number))),
      getWarehouses().then((r) => setWarehouses(r.data.data)),
    ]).catch(() => setErr('Nepavyko užkrauti pakavimo duomenų'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr] print-grid-1">
      <aside className="no-print self-start overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-200">
        <div className="flex items-center gap-3 bg-[#7a3410] px-4 py-3 text-lg font-bold text-white">
          <Icon name="box" className="h-6 w-6" /> Pakavimas
        </div>
        <nav className="grid gap-1 p-2">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] ${view === v.id ? 'bg-green-100 font-semibold text-green-900' : 'text-stone-700 hover:bg-stone-50'}`}>
              <span className={view === v.id ? 'text-green-700' : 'text-amber-800'}><Icon name={v.icon} className="h-5 w-5" /></span>
              {v.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="grid min-w-0 content-start gap-6">
        <Err msg={err} />
        {view === 'register' && (
          <>
            <RegisterPacking specs={specs} products={products} lweeks={lweeks} warehouses={warehouses} batches={batches} materials={materials}
              shops={shops} norms={norms}
              onSaved={() => Promise.all([loadBatches(), loadPackings()]).then(() => undefined)} />
            <PackingList packings={packings} products={products} reload={() => Promise.all([loadPackings(), loadBatches()]).then(() => undefined)}
              tabs={<BottomTabs setView={setView} />} />
          </>
        )}
        {view === 'summary' && (
          <PackingList packings={packings} products={products} reload={() => Promise.all([loadPackings(), loadBatches()]).then(() => undefined)} withTotals />
        )}
        {view === 'receipts' && <Receipts batches={batches} materials={materials} reload={loadBatches} />}
        {view === 'stock' && <Stock batchesVersion={batches} />}
        {view === 'specs' && <Specs specs={specs} materials={materials} reload={loadSpecs} />}
        {view === 'transport' && <TransportNorms norms={norms} setNorms={setNorms} specs={specs} shops={shops} materials={materials} reload={loadNorms} />}
        {view === 'calc' && <Calculator specs={specs} norms={norms} materials={materials} />}
      </div>
    </div>
  )
}

function BottomTabs({ setView }: { setView: (v: View) => void }) {
  return (
    <span className="no-print flex flex-wrap gap-1">
      {VIEWS.filter((v) => v.id !== 'register').map((v) => (
        <button key={v.id} type="button" onClick={() => setView(v.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-amber-50">
          <span className="text-amber-800"><Icon name={v.icon} /></span>{v.label}
        </button>
      ))}
    </span>
  )
}

// ======================= Registravimas =======================

interface UsageLine { key: number; packaging_material_id: string; packaging_batch_id: string; qty: string; norm: number | null }
let seq = 1

/** Kiek kokios medžiagos reikia: norma 1 vnt. (null - transportinė, skaičiuojama dėžėmis) ir kiekis. */
interface Need { materialId: number; norm: number | null; qty: number }

/**
 * Poreikis pakavimui: prekinė pakuotė pagal specifikaciją (perpakuojant - tik tai, ko šaltinyje dar nėra,
 * pvz. Šakotis 1kg -> dėžutėje: tik dėžutė) + transportinės dėžės ir perdengimai.
 */
function needsFor(product: PackedProductSpec | undefined, source: PackedProductSpec | undefined, units: number, norm: TransportNorm | undefined, boxes: number): Need[] {
  if (!product || !(units > 0)) return []
  const out: Need[] = []
  for (const s of product.specs) {
    const have = Number(source?.specs.find((x) => x.packaging_material_id === s.packaging_material_id)?.qty_per_unit ?? 0)
    const per = r3(Number(s.qty_per_unit) - have)
    if (per > 0) out.push({ materialId: s.packaging_material_id, norm: per, qty: r3(per * units) })
  }
  if (norm && boxes > 0) {
    out.push({ materialId: norm.box_material_id, norm: null, qty: boxes })
    if (norm.overlay_material_id && Number(norm.overlays_per_box) > 0) {
      out.push({ materialId: norm.overlay_material_id, norm: null, qty: r3(boxes * Number(norm.overlays_per_box)) })
    }
  }
  return out
}

/** FIFO planas: kiekvienai medžiagai - seniausios partijos su likučiu; ko neužtenka - eilutė be partijos. */
function buildPlan(needs: Need[], batches: PackagingBatch[]): UsageLine[] {
  const out: UsageLine[] = []
  for (const n of needs) {
    let need = n.qty
    const avail = batches
      .filter((b) => b.packaging_material_id === n.materialId && b.balance > 0 && !b.is_locked)
      .sort((a, b) => a.received_date.localeCompare(b.received_date) || a.id - b.id)
    for (const b of avail) {
      if (need <= 0) break
      const take = r3(Math.min(need, Number(b.balance)))
      out.push({ key: seq++, packaging_material_id: String(n.materialId), packaging_batch_id: String(b.id), qty: String(take), norm: n.norm })
      need = r3(need - take)
    }
    if (need > 0 || !avail.length) {
      out.push({ key: seq++, packaging_material_id: String(n.materialId), packaging_batch_id: '', qty: String(need), norm: n.norm })
    }
  }
  return out
}

function RegisterPacking({ specs, products, lweeks, warehouses, batches, materials, shops, norms, onSaved }: {
  specs: PackedProductSpec[]; products: ProductionProduct[]; lweeks: LWeek[]; warehouses: Warehouse[]
  batches: PackagingBatch[]; materials: PackagingMaterial[]; shops: Shop[]; norms: TransportNorm[]; onSaved: () => Promise<void>
}) {
  const emptyForm = () => ({
    packing_date: todayIso(), l_week_id: '', production_product_id: '', packed_product_id: '',
    unit_weight_kg: '', qty_units: '', warehouse_id: String(warehouses.find((w) => /fasavim/i.test(w.name))?.id ?? warehouses[0]?.id ?? ''), notes: '',
    shop_id: '', boxes: '', repack: false, source_packed_product_id: '', source_warehouse_id: '',
  })
  const [f, setF] = useState(emptyForm)
  const [lines, setLines] = useState<UsageLine[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // sandėlis numatytas, kai jų sąrašas užsikrauna
  useEffect(() => { if (!f.warehouse_id && warehouses.length) setF((x) => ({ ...x, warehouse_id: emptyForm().warehouse_id })) }, [warehouses]) // eslint-disable-line react-hooks/exhaustive-deps

  const product = specs.find((p) => String(p.id) === f.packed_product_id)
  const units = Number(f.qty_units) || 0
  const weight = Number(String(f.unit_weight_kg).replace(',', '.')) || 0
  const totalKg = r3(units * weight)
  const packedOptions = specs.filter((p) => p.is_active !== false && (!f.production_product_id || String(p.production_product_id) === f.production_product_id))

  const source = f.repack ? specs.find((p) => String(p.id) === f.source_packed_product_id) : undefined
  const norm = findNorm(norms, f.packed_product_id, f.shop_id)
  const boxes = Number(f.boxes) || 0
  const needs = needsFor(product, source, units, norm, boxes)

  /** Formos pakeitimas + medžiagų planas iš naujo (dėžių sk. - pagal talpą, jei ji žinoma). */
  const change = (patch: Partial<ReturnType<typeof emptyForm>>) => {
    const nf = { ...f, ...patch }
    const p = specs.find((s) => String(s.id) === nf.packed_product_id)
    const u = Number(nf.qty_units) || 0
    const n = findNorm(norms, nf.packed_product_id, nf.shop_id)
    if (!('boxes' in patch)) {
      const auto = boxesFor(n, u)
      nf.boxes = auto != null ? String(auto) : n ? nf.boxes : ''
    }
    const src = nf.repack ? specs.find((s) => String(s.id) === nf.source_packed_product_id) : undefined
    setF(nf)
    setLines(buildPlan(needsFor(p, src, u, n, Number(nf.boxes) || 0), batches))
  }

  const batchById = useMemo(() => new Map(batches.map((b) => [String(b.id), b])), [batches])
  const matById = useMemo(() => new Map(materials.map((m) => [String(m.id), m])), [materials])
  const lineCost = (l: UsageLine) => {
    const b = batchById.get(l.packaging_batch_id)
    return b?.unit_cost_eur == null ? null : r3(Number(b.unit_cost_eur) * (Number(l.qty) || 0))
  }
  const priced = lines.filter((l) => lineCost(l) != null)
  const totalCost = Math.round(priced.reduce((s, l) => s + (lineCost(l) ?? 0), 0) * 100) / 100
  const costComplete = lines.length > 0 && priced.length === lines.length
  const perUnit = units > 0 && priced.length ? totalCost / units : null

  // ar sunaudota pagal normą (kiekvienai medžiagai suma = poreikis)
  const normOk = !!product && units > 0 && needs.every((n) => {
    const used = lines.filter((l) => l.packaging_material_id === String(n.materialId)).reduce((t, l) => t + (Number(l.qty) || 0), 0)
    return Math.abs(used - n.qty) < 0.0005
  }) && lines.every((l) => needs.some((n) => String(n.materialId) === l.packaging_material_id))

  const setLine = (key: number, patch: Partial<UsageLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const drag = useDragSort(lines, setLines)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null); setOk(null)
    if (lines.some((l) => !l.packaging_material_id || !(Number(l.qty) > 0))) { setErr('Kiekvienai medžiagai nurodykite kiekį (> 0) arba pašalinkite eilutę.'); return }
    if (f.repack && (!f.source_packed_product_id || !f.source_warehouse_id)) { setErr('Perpakuojant nurodykite, iš kokios fasavimo rūšies ir sandėlio.'); return }
    setBusy(true)
    try {
      const r = await createPacking({
        packing_date: f.packing_date, l_week_id: +f.l_week_id, packed_product_id: +f.packed_product_id,
        unit_weight_kg: weight, qty_units: units, warehouse_id: +f.warehouse_id, notes: f.notes || null,
        shop_id: f.shop_id ? +f.shop_id : null, boxes: f.boxes === '' ? null : boxes,
        source_packed_product_id: f.repack ? +f.source_packed_product_id : null,
        source_warehouse_id: f.repack ? +f.source_warehouse_id : null,
        usages: lines.map((l) => ({ packaging_material_id: +l.packaging_material_id, packaging_batch_id: l.packaging_batch_id ? +l.packaging_batch_id : null, qty: +l.qty })),
      })
      setOk(`Užregistruota: ${r.data.packed_product?.name} · ${r.data.qty_units} vnt. (${fmtKg(r.data.qty_kg)} kg) – produktas papildytas į sandėlį.`
        + (r.data.source_packed_product ? ` Iš sandėlio išimta ${r.data.qty_units} vnt. „${r.data.source_packed_product.name}“.` : ''))
      setF({ ...emptyForm(), l_week_id: f.l_week_id, production_product_id: f.production_product_id, warehouse_id: f.warehouse_id, shop_id: f.shop_id })
      setLines([])
      await onSaved()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const reset = () => { setF(emptyForm()); setLines([]); setErr(null); setOk(null) }
  const req = <span className="text-red-600"> *</span>
  const row = (label: ReactNode, control: ReactNode) => (
    <label className="grid grid-cols-[150px_1fr] items-center gap-2 text-sm">
      <span className="font-medium text-stone-700">{label}</span>{control}
    </label>
  )

  return (
    <form onSubmit={submit} className="grid gap-6">
      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <Card title="Pakuotų šakočių registravimas" icon="box" noPrint>
          <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            <div className="grid content-start gap-3">
              {row(<>Data{req}</>, <input type="date" className={inputCls} value={f.packing_date} onChange={(e) => setF({ ...f, packing_date: e.target.value })} required />)}
              {row(<>Gamybos partija (L){req}</>, (
                <select className={inputCls} value={f.l_week_id} onChange={(e) => setF({ ...f, l_week_id: e.target.value })} required>
                  <option value="">— pasirinkite —</option>
                  {lweeks.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
                </select>
              ))}
              {row(<>Produktas{req}</>, (
                <select className={inputCls} value={f.production_product_id}
                  onChange={(e) => change({ production_product_id: e.target.value, packed_product_id: '' })}>
                  <option value="">Visi</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ))}
              {row(<>Fasavimo rūšis{req}</>, (
                <select className={inputCls} value={f.packed_product_id} required
                  onChange={(e) => {
                    const p = specs.find((s) => String(s.id) === e.target.value)
                    change({ packed_product_id: e.target.value, unit_weight_kg: defaultWeight(p), production_product_id: p ? String(p.production_product_id) : f.production_product_id })
                  }}>
                  <option value="">— pasirinkite —</option>
                  {packedOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ))}
              {row('Pirkėjas', (
                <select className={inputCls} value={f.shop_id} onChange={(e) => change({ shop_id: e.target.value })}>
                  <option value="">— nenurodytas —</option>
                  {shops.filter((s) => s.is_active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ))}
              <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <input type="checkbox" className="h-4 w-4 accent-green-700" checked={f.repack}
                  onChange={(e) => change({ repack: e.target.checked, source_warehouse_id: f.source_warehouse_id || f.warehouse_id })} />
                Perpakavimas iš jau supakuotų (pvz. Šakotis 1kg → dėžutėje)
              </label>
              {f.repack && (
                <>
                  {row(<>Iš fasavimo rūšies{req}</>, (
                    <select className={inputCls} value={f.source_packed_product_id} onChange={(e) => change({ source_packed_product_id: e.target.value })}>
                      <option value="">— pasirinkite —</option>
                      {specs.filter((p) => String(p.id) !== f.packed_product_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ))}
                  {row(<>Iš sandėlio{req}</>, (
                    <select className={inputCls} value={f.source_warehouse_id} onChange={(e) => change({ source_warehouse_id: e.target.value })}>
                      {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  ))}
                </>
              )}
            </div>
            <div className="grid content-start gap-3">
              {row(<>Svoris (vnt.), kg{req}</>, <input type="number" step="0.001" min="0.001" className={inputCls} value={f.unit_weight_kg} onChange={(e) => setF({ ...f, unit_weight_kg: e.target.value })} required />)}
              {row(<>Supakuotas kiekis, vnt.{req}</>, (
                <input type="number" step="1" min="1" className={inputCls} value={f.qty_units} required
                  onChange={(e) => change({ qty_units: e.target.value })} />
              ))}
              {row('Transportinių dėžių', (
                <span className="flex items-center gap-2">
                  <input type="number" step="1" min="0" className={`${inputCls} w-24`} value={f.boxes} disabled={!norm}
                    onChange={(e) => change({ boxes: e.target.value })} placeholder={norm ? 'įveskite' : '—'} />
                  <span className="text-xs text-stone-500">
                    {norm
                      ? `${norm.box_material?.name ?? ''}${norm.units_per_box ? ` · po ${Number(norm.units_per_box)} vnt.` : ''}${norm.overlay_material_id ? ` · +${Number(norm.overlays_per_box)} perd.` : ''}${norm.notes ? ` · ${norm.notes}` : ''}`
                      : f.packed_product_id ? 'normos nėra' : ''}
                  </span>
                </span>
              ))}
              {row('Iš viso svoris', <input className={`${inputCls} bg-stone-100`} value={totalKg ? `${fmtKg(totalKg)} kg` : ''} disabled />)}
              {row(<>Į sandėlį{req}</>, (
                <select className={inputCls} value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })} required>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              ))}
              {row('Pastaba', <input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="—" />)}
            </div>
          </div>
        </Card>

        <Card title="Pakavimo specifikacija" icon="box" noPrint>
          {product ? (
            <div className="flex gap-4">
              <div className="grid flex-1 content-start gap-3 text-sm">
                <p className="rounded-lg bg-stone-50 px-3 py-2 font-semibold">{product.name}{weight ? ` (${fmtKg(weight)} kg)` : ''}</p>
                {units > 0 && (normOk
                  ? <p className="flex items-center gap-1.5 text-green-700"><Icon name="check" /> Pagal normą</p>
                  : <p className="flex items-center gap-1.5 text-amber-700"><Icon name="info" /> Nukrypimas nuo normos</p>)}
                <ul className="text-stone-600">
                  {product.specs.length ? product.specs.map((s) => (
                    <li key={s.id} className="flex justify-between gap-3"><span>{s.packaging_material?.name}</span><span className="tabular-nums">{qtyFmt(s.qty_per_unit, s.packaging_material?.unit)}</span></li>
                  )) : <li className="text-amber-700">Specifikacija neužpildyta</li>}
                </ul>
                {source && <p className="text-xs text-stone-500">Perpakuojant iš „{source.name}“ – naudojama tik tai, ko ten dar nėra.</p>}
                {norm ? (
                  <p className="border-t border-stone-100 pt-2 text-stone-600">
                    <b>Transportinė:</b> {norm.box_material?.name}
                    {norm.units_per_box ? `, ${Number(norm.units_per_box)} vnt./dėžę` : ', talpa pagal svorį'}
                    {norm.overlay_material && `, ${norm.overlay_material.name} × ${Number(norm.overlays_per_box)}`}
                    {norm.shop ? ` (${norm.shop.name})` : ' (bendra)'}
                  </p>
                ) : f.shop_id && <p className="border-t border-stone-100 pt-2 text-xs text-amber-700">Šiam pirkėjui transportinės pakuotės normos nėra („Transportinė pakuotė“).</p>}
                <p className="flex items-baseline justify-between gap-3 border-t border-stone-100 pt-2 whitespace-nowrap">
                  <span>Pakavimo savikaina (1 vnt.)</span>
                  <b className="text-lg tabular-nums">{perUnit == null ? '—' : `${costComplete ? '' : '≈ '}${fmtUnitEur(perUnit)} €`}</b>
                </p>
              </div>
              <div className="hidden h-32 w-28 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 sm:flex">
                <Icon name="box" className="h-16 w-16" />
              </div>
            </div>
          ) : <p className="py-6 text-center text-sm text-stone-400">Pasirinkite fasavimo rūšį – čia matysite jos pakavimo normas.</p>}
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_380px]">
        <Card title="Sunaudotos pakavimo medžiagos" icon="layers" noPrint>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f3e9da] text-stone-800">
                  <th className="w-8" />
                  <th className="px-2 py-2 text-left font-semibold">Pakuotės medžiaga</th>
                  <th className="px-2 py-2 font-semibold">Partija</th>
                  <th className="px-2 py-2 text-right font-semibold">Likutis</th>
                  <th className="px-2 py-2 text-right font-semibold">Norma (1 vnt.)</th>
                  <th className="px-2 py-2 font-semibold">Sunaudota</th>
                  <th className="px-2 py-2 text-right font-semibold">Kaina, €/vnt.</th>
                  <th className="px-2 py-2 text-right font-semibold">Suma, €</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const b = batchById.get(l.packaging_batch_id)
                  const m = matById.get(l.packaging_material_id)
                  const options = batches.filter((x) => String(x.packaging_material_id) === l.packaging_material_id && !x.is_locked && (x.balance > 0 || String(x.id) === l.packaging_batch_id))
                  const over = b && Number(l.qty) > Number(b.balance)
                  const dr = drag.row(i)
                  return (
                    <tr key={l.key} {...dr} className={`border-b border-stone-100 ${dr.className}`}>
                      <td className="pl-1"><DragHandle {...drag.handle(i)} /></td>
                      <td className="px-2 py-1.5">
                        <select className={`${inputCls} min-w-52`} value={l.packaging_material_id}
                          onChange={(e) => setLine(l.key, { packaging_material_id: e.target.value, packaging_batch_id: '', norm: needs.find((n) => String(n.materialId) === e.target.value)?.norm ?? null })}>
                          <option value="">— pasirinkite —</option>
                          {materials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select className={`${inputCls} min-w-32 ${!l.packaging_batch_id ? 'border-amber-400 text-amber-800' : ''}`} value={l.packaging_batch_id}
                          onChange={(e) => setLine(l.key, { packaging_batch_id: e.target.value })}>
                          <option value="">be partijos</option>
                          {options.map((x) => <option key={x.id} value={x.id}>{x.batch_number}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{b ? qtyFmt(b.balance, m?.unit) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{l.norm == null ? '—' : qtyFmt(l.norm, m?.unit)}</td>
                      <td className="px-2 py-1.5">
                        <input type="number" step="0.001" min="0" className={`${inputCls} w-28 text-right tabular-nums ${over ? 'border-red-500 text-red-700' : ''}`}
                          value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} title={over ? 'Viršija partijos likutį' : undefined} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{b?.unit_cost_eur == null ? '—' : fmtUnitEur(b.unit_cost_eur)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtEur(lineCost(l))}</td>
                      <td className="text-center"><ActionBtn icon="trash" title="Pašalinti" tone="red" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></td>
                    </tr>
                  )
                })}
                {!lines.length && (
                  <tr><td colSpan={9} className="py-5 text-center text-stone-400">Pasirinkus fasavimo rūšį ir kiekį medžiagos užpildomos pagal specifikaciją (FIFO partijos).</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#fbf7f2] px-3 py-2.5">
            <button type="button" className={addBtnCls}
              onClick={() => setLines((ls) => [...ls, { key: seq++, packaging_material_id: '', packaging_batch_id: '', qty: '', norm: null }])}>
              <Icon name="plus" /> Pridėti pakavimo medžiagą
            </button>
            <span className="flex items-center gap-3 text-sm font-semibold">
              Iš viso pakavimo savikaina:
              <span className="rounded-lg border-2 border-green-700 bg-green-50 px-4 py-1 text-base tabular-nums text-green-900">
                {lines.length && !costComplete ? '≈ ' : ''}{fmtEur(totalCost)} €
              </span>
            </span>
          </div>
          {lines.some((l) => !l.packaging_batch_id) && (
            <p className="mt-2 text-xs text-amber-800">Eilutės „be partijos“ – medžiagos likutis neužregistruotas (įveskite „Pakuočių gavimą“) arba jo neužtenka; jų kaina neįskaičiuojama.</p>
          )}
        </Card>

        <div className="grid content-start gap-3">
          <Card title="Suvestinė" icon="chart" noPrint>
            <table className="w-full text-sm">
              <tbody>
                {([
                  ['factory', 'Produktas', products.find((p) => String(p.id) === String(product?.production_product_id))?.name ?? '—'],
                  ['box', 'Fasavimo rūšis', product?.name ?? '—'],
                  ['tag', 'Partija (L)', lweeks.find((w) => String(w.id) === f.l_week_id)?.code ?? '—'],
                  ['doc', 'Svoris (vnt.)', weight ? `${fmtKg(weight)} kg` : '—'],
                  ['layers', 'Kiekis', units ? `${units} vnt.` : '—'],
                  ['truck', 'Pirkėjas', shops.find((s) => String(s.id) === f.shop_id)?.name ?? '—'],
                  ['box', 'Transportinių dėžių', boxes ? String(boxes) : '—'],
                  ['chart', 'Iš viso svoris', totalKg ? `${fmtKg(totalKg)} kg` : '—'],
                  ['tag', 'Pakavimo savikaina (1 vnt.)', perUnit == null ? '—' : `${fmtUnitEur(perUnit)} €`],
                ] as [IconName, string, string][]).map(([icon, k, v]) => (
                  <tr key={k} className="border-b border-stone-100">
                    <td className="w-7 py-1.5 text-amber-800"><Icon name={icon} /></td>
                    <td className="py-1.5 text-stone-700">{k}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
                  </tr>
                ))}
                <tr className="bg-green-50">
                  <td className="py-2 pl-1 text-green-700"><Icon name="layers" /></td>
                  <td className="py-2 font-bold">Iš viso pakavimas</td>
                  <td className="py-2 pr-1 text-right text-lg font-bold tabular-nums">{fmtEur(totalCost)} €</td>
                </tr>
              </tbody>
            </table>
          </Card>
          <div className="no-print grid grid-cols-[1fr_auto] gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-50" disabled={busy}>
              <Icon name="save" className="h-5 w-5" /> {busy ? 'Saugoma…' : 'Registruoti pakavimą'}
            </button>
            <button type="button" className={ghostBtnCls} onClick={reset}><Icon name="x" /> Atšaukti</button>
          </div>
          <Err msg={err} />
          {ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{ok}</p>}
        </div>
      </div>
    </form>
  )
}

// ======================= Pakavimų sąrašas (suvestinė) =======================

type Period = 'month' | 'prev' | 'year' | 'all'
const periodRange = (p: Period): [string, string] | null => {
  const d = new Date()
  const iso = (x: Date) => x.toLocaleDateString('sv-SE')
  if (p === 'month') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  if (p === 'prev') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))]
  if (p === 'year') return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`]
  return null
}

function PackingList({ packings, products, reload, tabs, withTotals }: {
  packings: Packing[]; products: ProductionProduct[]; reload: () => Promise<void>; tabs?: ReactNode; withTotals?: boolean
}) {
  const [period, setPeriod] = useState<Period>(withTotals ? 'month' : 'all')
  const [productId, setProductId] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const range = periodRange(period)
  const rows = packings.filter((p) => {
    const d = fmtDate(p.packing_date)
    if (range && (d < range[0] || d > range[1])) return false
    if (productId && String(p.packed_product?.production_product_id) !== productId) return false
    const s = q.trim().toLowerCase()
    return !s || `${p.l_week?.code} ${p.packed_product?.name} ${p.packed_product?.production_product?.name} ${p.shop?.name ?? ''}`.toLowerCase().includes(s)
  })

  const doLock = async (p: Packing) => { setErr(null); try { await toggleLock('packings', p.id); await reload() } catch (e) { setErr(errText(e)) } }
  const doDelete = async (p: Packing) => {
    if (!window.confirm(`Ištrinti pakavimą #${p.id}? Pakavimo medžiagos grįš į likutį, o supakuotas produktas bus išimtas iš sandėlio.`)) return
    setErr(null)
    try { await deleteRecord('packings', p.id); await reload() } catch (e) { setErr(errText(e)) }
  }

  // suvestinė pagal fasavimo rūšį
  const byPacked = Object.values(rows.reduce<Record<string, { name: string; product: string; units: number; kg: number; cost: number; complete: boolean; n: number }>>((acc, p) => {
    const k = String(p.packed_product_id)
    const a = acc[k] ??= { name: p.packed_product?.name ?? '—', product: p.packed_product?.production_product?.name ?? '—', units: 0, kg: 0, cost: 0, complete: true, n: 0 }
    a.units += p.qty_units; a.kg += Number(p.qty_kg); a.cost += Number(p.cost_eur); a.complete &&= p.cost_complete; a.n++
    return acc
  }, {}))
  const tot = rows.reduce((s, p) => ({ units: s.units + p.qty_units, kg: s.kg + Number(p.qty_kg), cost: s.cost + Number(p.cost_eur) }), { units: 0, kg: 0, cost: 0 })

  const th = 'border-b border-stone-200 px-2.5 py-2 text-center font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-2'
  return (
    <Card title="Pakuočių suvestinė" icon="chart"
      actions={
        <span className="no-print flex flex-wrap items-center gap-3 text-sm">
          {tabs}
          <label className="flex items-center gap-2">Laikotarpis:
            <select className={`${inputCls} w-36`} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="month">Šis mėnuo</option><option value="prev">Praėjęs mėnuo</option>
              <option value="year">Šie metai</option><option value="all">Visi</option>
            </select>
          </label>
          <label className="flex items-center gap-2">Produktas:
            <select className={`${inputCls} w-44`} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Visi</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <span className="relative">
            <input className={`${inputCls} w-40 pr-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Paieška" />
            <span className="pointer-events-none absolute top-2 right-2 text-stone-400"><Icon name="search" /></span>
          </span>
        </span>
      }>
      <Err msg={err} />
      <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-100 text-stone-700">
              <th className={th}>Data</th><th className={th}>Partija (L)</th><th className={th}>Produktas</th><th className={th}>Fasavimo rūšis</th>
              <th className={th}>Svoris (vnt.)</th><th className={th}>Kiekis, vnt.</th><th className={th}>Iš viso svoris, kg</th>
              <th className={th}>Pakavimo savikaina, €/vnt.</th><th className={th}>Iš viso, €</th><th className={`${th} no-print`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr className={`border-t border-stone-200 hover:bg-amber-50/40 ${open === p.id ? 'bg-green-50' : ''}`}>
                  <td className={td}>{fmtDate(p.packing_date)}</td>
                  <td className={`${td} text-center`}><LWeekBadge code={p.l_week?.code} /></td>
                  <td className={td}>{p.packed_product?.production_product?.name}</td>
                  <td className={td}>
                    {p.packed_product?.name}
                    {(p.shop || p.boxes != null || p.source_packed_product) && (
                      <span className="block text-xs text-stone-500">
                        {[p.shop?.name, p.boxes != null ? `${p.boxes} dėž.` : null, p.source_packed_product ? `perpakuota iš „${p.source_packed_product.name}“` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtKg(p.unit_weight_kg)}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.qty_units}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtKg(p.qty_kg)}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.cost_complete ? '' : '≈ '}{fmtUnitEur(p.cost_per_unit_eur)}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{p.cost_complete ? '' : '≈ '}{fmtEur(p.cost_eur)}</td>
                  <td className={`${td} no-print whitespace-nowrap text-right`}>
                    {p.is_locked && <Badge tone="green">Įspajamota</Badge>}
                    <ActionBtn icon={open === p.id ? 'up' : 'chevron'} title="Medžiagos" tone="stone" onClick={() => setOpen(open === p.id ? null : p.id)} />
                    <ActionBtn icon={p.is_locked ? 'unlock' : 'lock'} title={p.is_locked ? 'Atrakinti' : 'Įspajamoti (užrakinti)'} tone="stone" onClick={() => doLock(p)} />
                    {!p.is_locked && <ActionBtn icon="trash" title="Ištrinti" tone="red" onClick={() => doDelete(p)} />}
                  </td>
                </tr>
                {open === p.id && (
                  <tr className="bg-stone-50">
                    <td colSpan={10} className="px-6 py-2">
                      <table className="w-full text-xs">
                        <thead><tr className="text-stone-500"><th className="text-left">Medžiaga</th><th className="text-left">Partija</th><th className="text-right">Kiekis</th><th className="text-right">Kaina</th><th className="text-right">Suma €</th></tr></thead>
                        <tbody>
                          {p.usages.map((u) => (
                            <tr key={u.id}>
                              <td>{u.packaging_material?.name}</td>
                              <td>{u.packaging_batch?.batch_number ?? <span className="text-amber-700">be partijos</span>}</td>
                              <td className="text-right tabular-nums">{qtyFmt(u.qty, u.packaging_material?.unit)}</td>
                              <td className="text-right tabular-nums">{fmtUnitEur(u.unit_cost_eur)}</td>
                              <td className="text-right tabular-nums">{fmtEur(u.cost_eur)}</td>
                            </tr>
                          ))}
                          {!p.usages.length && <tr><td colSpan={5} className="text-stone-400">Medžiagos nenurodytos</td></tr>}
                        </tbody>
                      </table>
                      {p.notes && <p className="mt-1 text-xs text-stone-500">Pastaba: {p.notes}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={10} className="py-5 text-center text-stone-400">Nėra pakavimų pasirinktam laikotarpiui</td></tr>}
            {rows.length > 0 && (
              <tr className="border-t-2 border-stone-300 font-semibold">
                <td className={td} colSpan={5}>Iš viso ({rows.length})</td>
                <td className={`${td} text-right tabular-nums`}>{tot.units}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtKg(tot.kg)}</td>
                <td className={`${td} text-right tabular-nums`}>{tot.units ? fmtUnitEur(tot.cost / tot.units) : '—'}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtEur(tot.cost)}</td>
                <td className="no-print" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {withTotals && byPacked.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Pagal fasavimo rūšį</h3>
          <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
            <table className="w-full text-sm">
              <thead><tr className="bg-stone-100 text-stone-700">
                <th className={th}>Produktas</th><th className={th}>Fasavimo rūšis</th><th className={th}>Pakavimų</th><th className={th}>Vnt.</th>
                <th className={th}>Kg</th><th className={th}>Pakavimo savikaina, €/vnt.</th><th className={th}>Iš viso, €</th>
              </tr></thead>
              <tbody>
                {byPacked.sort((a, b) => a.product.localeCompare(b.product) || a.name.localeCompare(b.name)).map((a) => (
                  <tr key={a.name} className="border-t border-stone-200">
                    <td className={td}>{a.product}</td><td className={td}>{a.name}</td>
                    <td className={`${td} text-right`}>{a.n}</td><td className={`${td} text-right tabular-nums`}>{a.units}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtKg(a.kg)}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.complete ? '' : '≈ '}{a.units ? fmtUnitEur(a.cost / a.units) : '—'}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.complete ? '' : '≈ '}{fmtEur(a.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-2 text-xs text-stone-500">„≈“ – dalis medžiagų be partijos ar be kainos, jų vertė neįskaičiuota.</p>
    </Card>
  )
}

// ======================= Pakuočių gavimas =======================

function Receipts({ batches, materials, reload }: { batches: PackagingBatch[]; materials: PackagingMaterial[]; reload: () => Promise<void> }) {
  const empty = { id: 0, received_date: todayIso(), packaging_material_id: '', batch_number: '', qty_received: '', unit_cost_eur: '', total_eur: '', supplier: '', invoice_number: '', notes: '' }
  const [f, setF] = useState(empty)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mat, setMat] = useState('')

  const unit = materials.find((m) => String(m.id) === f.packaging_material_id)?.unit
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const data = {
      received_date: f.received_date, packaging_material_id: +f.packaging_material_id, batch_number: f.batch_number.trim(),
      qty_received: +f.qty_received, unit_cost_eur: f.unit_cost_eur === '' ? null : +f.unit_cost_eur,
      supplier: f.supplier || null, invoice_number: f.invoice_number || null, notes: f.notes || null,
    }
    try {
      if (f.id) await updatePackagingBatch(f.id, data); else await createPackagingBatch(data)
      setF({ ...empty, received_date: f.received_date, supplier: f.supplier, invoice_number: f.invoice_number })
      await reload()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  const edit = (b: PackagingBatch) => setF({
    id: b.id, received_date: fmtDate(b.received_date), packaging_material_id: String(b.packaging_material_id), batch_number: b.batch_number,
    qty_received: String(Number(b.qty_received)), unit_cost_eur: b.unit_cost_eur == null ? '' : String(Number(b.unit_cost_eur)), total_eur: '',
    supplier: b.supplier ?? '', invoice_number: b.invoice_number ?? '', notes: b.notes ?? '',
  })
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload() } catch (e) { setErr(errText(e)) } }

  const rows = batches.filter((b) => !mat || String(b.packaging_material_id) === mat)
  const th = 'border-b border-stone-200 px-2.5 py-2 text-center font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-2'

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card title="Pakuočių gavimas" icon="truck"
        actions={
          <select className={`${inputCls} no-print w-60`} value={mat} onChange={(e) => setMat(e.target.value)}>
            <option value="">Visos medžiagos</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        }>
        <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-stone-100 text-stone-700">
              <th className={th}>Gauta</th><th className={th}>Medžiaga</th><th className={th}>Partija</th><th className={th}>Gauta</th>
              <th className={th}>Kaina, €/vnt.</th><th className={th}>Tiekėjas</th><th className={th}>Sąskaitos Nr.</th>
              <th className={th}>Sunaudota</th><th className={th}>Likutis</th><th className={th}>Likučio vertė, €</th><th className={`${th} no-print`} />
            </tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className={`border-t border-stone-200 ${f.id === b.id ? 'bg-amber-50' : ''}`}>
                  <td className={td}>{fmtDate(b.received_date)}</td>
                  <td className={td}>{b.packaging_material?.name}</td>
                  <td className={`${td} font-medium`}>{b.batch_number}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{qtyFmt(b.qty_received, b.packaging_material?.unit)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtUnitEur(b.unit_cost_eur)}</td>
                  <td className={td}>{b.supplier ?? '—'}</td>
                  <td className={`${td} font-semibold`}>{b.invoice_number ?? '—'}</td>
                  <td className={`${td} text-right tabular-nums`}>{qtyFmt(b.used, b.packaging_material?.unit)}</td>
                  <td className={`${td} text-right font-semibold tabular-nums ${b.balance <= 0 ? 'text-stone-400' : ''}`}>{qtyFmt(b.balance, b.packaging_material?.unit)}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtEur(b.balance_value_eur)}</td>
                  <td className={`${td} no-print whitespace-nowrap text-right`}>
                    {b.is_locked && <Badge tone="green">Įspajamota</Badge>}
                    {!b.is_locked && <ActionBtn icon="edit" title="Redaguoti" tone="green" onClick={() => edit(b)} />}
                    <button type="button" className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => act(() => toggleLock('packaging-batches', b.id))}>{b.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                    {!b.is_locked && <ActionBtn icon="trash" title="Ištrinti" tone="red" onClick={() => window.confirm(`Ištrinti partiją ${b.batch_number}?`) && act(() => deleteRecord('packaging-batches', b.id))} />}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={11} className="py-5 text-center text-stone-400">Pakuočių gavimų dar nėra</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={f.id ? `Taisyti partiją ${f.batch_number}` : 'Registruoti pakuočių gavimą'} icon="truck" noPrint>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Gavimo data" required><input type="date" className={inputCls} value={f.received_date} onChange={(e) => setF({ ...f, received_date: e.target.value })} required /></Field>
          <Field label="Pakavimo medžiaga" required>
            <select className={inputCls} value={f.packaging_material_id} onChange={(e) => setF({ ...f, packaging_material_id: e.target.value })} required>
              <option value="">— pasirinkite —</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Partijos Nr." required><input className={inputCls} value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} placeholder="pvz. M-1126" required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Kiekis, ${unitLabel(unit)}`} required>
              <input type="number" step="0.001" min="0.001" className={inputCls} value={f.qty_received} required
                onChange={(e) => setF({ ...f, qty_received: e.target.value, unit_cost_eur: f.total_eur && +e.target.value > 0 ? String(Math.round((+f.total_eur / +e.target.value) * 10000) / 10000) : f.unit_cost_eur })} />
            </Field>
            <Field label={`Kaina, €/${unitLabel(unit)}`}>
              <input type="number" step="0.0001" min="0" className={inputCls} value={f.unit_cost_eur} onChange={(e) => setF({ ...f, unit_cost_eur: e.target.value, total_eur: '' })} />
            </Field>
          </div>
          <Field label="arba suma pagal sąskaitą, €">
            <input type="number" step="0.01" min="0" className={inputCls} value={f.total_eur}
              onChange={(e) => setF({ ...f, total_eur: e.target.value, unit_cost_eur: +f.qty_received > 0 && e.target.value !== '' ? String(Math.round((+e.target.value / +f.qty_received) * 10000) / 10000) : f.unit_cost_eur })} />
          </Field>
          <Field label="Tiekėjas"><input className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Sąskaitos Nr."><input className={inputCls} value={f.invoice_number} onChange={(e) => setF({ ...f, invoice_number: e.target.value })} /></Field>
          <Field label="Pastaba"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50" disabled={busy}>{busy ? 'Saugoma…' : f.id ? 'Išsaugoti' : 'Registruoti'}</button>
            {f.id ? <button type="button" className={ghostBtnCls} onClick={() => setF(empty)}>Atšaukti</button> : <span />}
          </div>
          <Err msg={err} />
        </form>
      </Card>
    </div>
  )
}

// ======================= Likučiai =======================

function Stock({ batchesVersion }: { batchesVersion: unknown }) {
  const [rows, setRows] = useState<PackagingStockRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { getPackagingStock().then((r) => setRows(r.data)).catch((e) => setErr(errText(e))) }, [batchesVersion])

  const th = 'border-b border-stone-200 px-2.5 py-2 text-center font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-2'
  const value = rows.reduce((s, r) => s + (r.balance_value_eur ?? 0), 0)
  return (
    <Card title="Pakuočių likučiai" icon="layers">
      <Err msg={err} />
      <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
        <table className="w-full text-sm">
          <thead><tr className="bg-stone-100 text-stone-700">
            <th className={th}>Pakavimo medžiaga</th><th className={th}>Partijų</th><th className={th}>Gauta</th><th className={th}>Sunaudota</th>
            <th className={th}>Likutis</th><th className={th}>Likučio vertė, €</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.packaging_material_id} className={`border-t border-stone-200 ${r.batches && r.balance <= 0 ? 'bg-red-50' : ''}`}>
                <td className={td}>{r.name}{!r.is_active && <span className="ml-2"><Badge>neaktyvi</Badge></span>}</td>
                <td className={`${td} text-right`}>{r.batches}</td>
                <td className={`${td} text-right tabular-nums`}>{qtyFmt(r.received, r.unit)}</td>
                <td className={`${td} text-right tabular-nums`}>{qtyFmt(r.used, r.unit)}</td>
                <td className={`${td} text-right font-semibold tabular-nums ${r.balance <= 0 ? 'text-red-700' : ''}`}>{qtyFmt(r.balance, r.unit)}</td>
                <td className={`${td} text-right tabular-nums`}>{r.value_complete || r.balance_value_eur == null ? '' : '≈ '}{fmtEur(r.balance_value_eur)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-300 font-semibold">
              <td className={td} colSpan={5}>Iš viso likučio vertė</td>
              <td className={`${td} text-right tabular-nums`}>{fmtEur(value)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Likutis = gauta (pakuočių gavimai) − sunaudota pakuojant. Raudonai – medžiaga baigėsi.</p>
    </Card>
  )
}

// ======================= Specifikacijos =======================

interface SpecLine { key: number; packaging_material_id: string; qty: string }

function Specs({ specs, materials, reload }: { specs: PackedProductSpec[]; materials: PackagingMaterial[]; reload: () => Promise<void> }) {
  const [sel, setSel] = useState<number | null>(null)
  const [lines, setLines] = useState<SpecLine[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = specs.find((p) => p.id === sel)
  const drag = useDragSort(lines, setLines)

  const pick = (p: PackedProductSpec) => {
    setSel(p.id); setErr(null); setOk(false)
    setLines(p.specs.map((s) => ({ key: seq++, packaging_material_id: String(s.packaging_material_id), qty: String(Number(s.qty_per_unit)) })))
  }
  useEffect(() => { if (sel === null && specs.length) pick(specs[0]) }, [specs]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!current) return
    if (lines.some((l) => !l.packaging_material_id || !(Number(l.qty) > 0))) { setErr('Kiekvienai eilutei pasirinkite medžiagą ir kiekį (> 0).'); return }
    setBusy(true); setErr(null); setOk(false)
    try {
      await savePackingSpecs(current.id, lines.map((l) => ({ packaging_material_id: +l.packaging_material_id, qty_per_unit: +l.qty })))
      await reload(); setOk(true)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const setLine = (key: number, patch: Partial<SpecLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card title="Fasavimo rūšys" icon="box">
        <ul className="grid gap-1 text-sm">
          {specs.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => pick(p)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left ${sel === p.id ? 'bg-green-100 font-semibold text-green-900' : 'hover:bg-stone-50'}`}>
                <span>{p.name}<span className="ml-2 text-xs font-normal text-stone-500">{p.production_product?.name}</span></span>
                {p.specs.length ? <Badge tone="green">{p.specs.length}</Badge> : <Badge tone="amber">nėra</Badge>}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500">Naujas fasavimo rūšis galima pridėti skiltyje „Klasifikatoriai“.</p>
      </Card>

      <Card title={current ? `Pakavimo specifikacija: ${current.name}` : 'Pakavimo specifikacija'} icon="gear"
        actions={current && (
          <button type="button" className="no-print inline-flex items-center gap-1.5 rounded-lg border border-green-700 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
            onClick={save} disabled={busy}><Icon name="save" /> {busy ? 'Saugoma…' : 'Išsaugoti'}</button>
        )}>
        {current ? (
          <>
            <p className="mb-3 text-sm text-stone-600">Kiek kiekvienos medžiagos sunaudojama <b>1 supakuotam vnt.</b> Pakuojant kiekiai paskaičiuojami automatiškai (norma × vnt.).</p>
            <table className="w-full text-sm">
              <thead><tr className="bg-[#f3e9da]">
                <th className="w-8" /><th className="px-2 py-2 text-left font-semibold">Pakavimo medžiaga</th>
                <th className="w-48 px-2 py-2 text-center font-semibold">Norma 1 vnt.</th><th className="w-12" />
              </tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const dr = drag.row(i)
                  const unit = materials.find((m) => String(m.id) === l.packaging_material_id)?.unit
                  return (
                    <tr key={l.key} {...dr} className={`border-b border-stone-100 ${dr.className}`}>
                      <td className="pl-1"><DragHandle {...drag.handle(i)} /></td>
                      <td className="px-2 py-1.5">
                        <select className={inputCls} value={l.packaging_material_id} onChange={(e) => setLine(l.key, { packaging_material_id: e.target.value })}>
                          <option value="">— pasirinkite —</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id} disabled={lines.some((o) => o.key !== l.key && o.packaging_material_id === String(m.id))}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <input type="number" step="0.0001" min="0" className={`${inputCls} text-center tabular-nums`} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                          <span className="w-8 text-stone-500">{unitLabel(unit)}</span>
                        </span>
                      </td>
                      <td className="text-center"><ActionBtn icon="trash" title="Pašalinti" tone="red" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></td>
                    </tr>
                  )
                })}
                {!lines.length && <tr><td colSpan={4} className="py-4 text-center text-stone-400">Medžiagų nėra – pridėkite.</td></tr>}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" className={addBtnCls} onClick={() => setLines((ls) => [...ls, { key: seq++, packaging_material_id: '', qty: '1' }])}>
                <Icon name="plus" /> Pridėti medžiagą
              </button>
              {ok && <span className="text-sm text-green-700">Išsaugota</span>}
            </div>
            <Err msg={err} />
            <p className="mt-3 text-xs text-stone-500">Rafija – metrais (35 cm = 0,35 m). Transportinės dėžės ir perdengimai nustatomi pagal pirkėją skiltyje „Transportinė pakuotė“.</p>
          </>
        ) : <p className="py-6 text-center text-sm text-stone-400">Pasirinkite fasavimo rūšį</p>}
      </Card>
    </div>
  )
}

// ======================= Transportinė pakuotė (normos pagal pirkėją) =======================

function TransportNorms({ norms, setNorms, specs, shops, materials, reload }: {
  norms: TransportNorm[]; setNorms: (n: TransportNorm[]) => void; specs: PackedProductSpec[]; shops: Shop[]
  materials: PackagingMaterial[]; reload: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const boxes = materials.filter((m) => m.kind === 'box')
  const overlays = materials.filter((m) => m.kind === 'overlay')
  const guard = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await reload() } catch (e) { setErr(errText(e)); throw e }
  }
  const payload = (d: Record<string, string>) => ({
    packed_product_id: +d.packed_product_id, shop_id: d.shop_id ? +d.shop_id : null, box_material_id: +d.box_material_id,
    units_per_box: d.units_per_box === '' ? null : +d.units_per_box,
    overlay_material_id: d.overlay_material_id ? +d.overlay_material_id : null,
    overlays_per_box: d.overlay_material_id ? (d.overlays_per_box === '' ? 1 : +d.overlays_per_box) : 0,
    notes: d.notes.trim() || null,
  })
  const rows = norms.filter((n) => !filter || String(n.shop_id ?? '') === filter)

  return (
    <Card title="Transportinė pakuotė pagal pirkėją" icon="route"
      actions={
        <span className="no-print flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-48`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Visi pirkėjai</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className={addBtnCls} onClick={() => setAdding(true)}><Icon name="plus" /> Pridėti normą</button>
        </span>
      }>
      <p className="mb-3 text-sm text-stone-600">
        Į kokią dėžę ir po kiek vienetų pakuojama kiekvienam pirkėjui, kiek perdengimų dedama į dėžę.
        Eilutė be pirkėjo – bendra norma. Pakuojant dėžių skaičius = vnt. ÷ talpa (apvalinama į viršų); kai talpa „pagal svorį“ – įvedama ranka.
      </p>
      <Err msg={err} />
      <EditableTable<TransportNorm>
        rows={rows}
        cols={[
          { key: 'packed_product_id', label: 'Fasavimo rūšis', type: 'select', required: true,
            options: [{ value: '', label: '— pasirinkite —' }, ...specs.map((p) => ({ value: String(p.id), label: p.name }))], value: (r) => String(r.packed_product_id) },
          { key: 'shop_id', label: 'Pirkėjas', type: 'select', width: 'w-40',
            options: [{ value: '', label: '— bendra —' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))], value: (r) => (r.shop_id == null ? '' : String(r.shop_id)) },
          { key: 'box_material_id', label: 'Transportinė dėžė', type: 'select', required: true,
            options: [{ value: '', label: '— pasirinkite —' }, ...boxes.map((m) => ({ value: String(m.id), label: m.name }))], value: (r) => String(r.box_material_id) },
          { key: 'units_per_box', label: 'Talpa, vnt./dėžę', type: 'number', width: 'w-28', step: '1', placeholder: 'pagal svorį',
            value: (r) => (r.units_per_box == null ? '' : String(Number(r.units_per_box))) },
          { key: 'overlay_material_id', label: 'Perdengimas', type: 'select',
            options: [{ value: '', label: '— nereikia —' }, ...overlays.map((m) => ({ value: String(m.id), label: m.name }))], value: (r) => (r.overlay_material_id == null ? '' : String(r.overlay_material_id)) },
          { key: 'overlays_per_box', label: 'Perd./dėžę', type: 'number', width: 'w-24', step: '1', value: (r) => (r.overlay_material_id ? String(Number(r.overlays_per_box)) : '') },
          { key: 'notes', label: 'Pastaba', placeholder: 'pvz. pagal svorį 6–8 vnt.', value: (r) => r.notes ?? '' },
        ]}
        onCreate={(d) => guard(() => createTransportNorm(payload(d)))}
        onUpdate={(r, d) => guard(() => updateTransportNorm(r.id, payload(d)))}
        onDelete={(r) => guard(() => deleteRecord('transport-norms', r.id))}
        onReorder={(next) => {
          if (filter) return // tvarka keičiama tik matant visą sąrašą
          setNorms(next)
          reorderTransportNorms(next.map((n) => n.id)).catch((e) => { setErr(errText(e)); reload() })
        }}
        adding={adding}
        onAddDone={() => setAdding(false)}
        deleteLabel={(r) => `${r.packed_product?.name ?? ''} – ${r.shop?.name ?? 'bendra'}`}
      />
    </Card>
  )
}

// ======================= Pakuočių poreikio skaičiuoklė (Excel „Skaičiavimas“) =======================

interface CalcRow { key: string; packed: PackedProductSpec; norm?: TransportNorm }

function Calculator({ specs, norms, materials }: { specs: PackedProductSpec[]; norms: TransportNorm[]; materials: PackagingMaterial[] }) {
  const [qty, setQty] = useState<Record<string, string>>({})
  const [manualBoxes, setManualBoxes] = useState<Record<string, string>>({})
  const [stock, setStock] = useState<PackagingStockRow[]>([])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { getPackagingStock().then((r) => setStock(r.data)).catch(() => undefined) }, [])

  // eilutės: kiekviena transportinė norma (rūšis + pirkėjas) + rūšys be jokios normos
  const rows: CalcRow[] = [
    ...norms.flatMap((n) => {
      const p = specs.find((s) => s.id === n.packed_product_id)
      return p ? [{ key: `n${n.id}`, packed: p, norm: n }] : []
    }),
    ...specs.filter((p) => p.is_active !== false && p.specs.length && !norms.some((n) => n.packed_product_id === p.id))
      .map((p) => ({ key: `p${p.id}`, packed: p })),
  ]

  const totals = new Map<number, number>()
  const add = (id: number, q: number) => totals.set(id, r3((totals.get(id) ?? 0) + q))
  let missingCap = 0
  const lines = rows.map((r) => {
    const units = Number(qty[r.key]) || 0
    const auto = boxesFor(r.norm, units)
    const bx = auto ?? (Number(manualBoxes[r.key]) || 0)
    if (units > 0) {
      r.packed.specs.forEach((s) => add(s.packaging_material_id, Number(s.qty_per_unit) * units))
      if (r.norm && bx > 0) {
        add(r.norm.box_material_id, bx)
        if (r.norm.overlay_material_id) add(r.norm.overlay_material_id, bx * Number(r.norm.overlays_per_box))
      }
      if (r.norm && auto == null && !bx) missingCap++
    }
    return { ...r, units, auto, bx }
  })
  const matRows = materials.filter((m) => (totals.get(m.id) ?? 0) > 0).map((m) => {
    const need = totals.get(m.id) ?? 0
    const have = stock.find((s) => s.packaging_material_id === m.id)?.balance ?? 0
    return { m, need, packs: m.pack_qty ? Math.ceil(need / Number(m.pack_qty)) : null, have, short: r3(Math.max(0, need - have)) }
  })

  const th = 'border-b border-stone-200 px-2.5 py-2 text-center font-semibold whitespace-nowrap'
  const td = 'px-2.5 py-1.5'
  return (
    <div ref={ref} className="grid gap-6">
      <Card title="Pakuočių poreikio skaičiuoklė" icon="list"
        actions={
          <span className="no-print flex gap-2">
            <button type="button" className={ghostBtnCls} onClick={() => { setQty({}); setManualBoxes({}) }}><Icon name="x" /> Išvalyti</button>
            <button type="button" className={ghostBtnCls} onClick={() => ref.current && printElement(ref.current, 'Pakuočių poreikis')}><Icon name="printer" /> Spausdinti</button>
          </span>
        }>
        <p className="mb-3 text-sm text-stone-600">Įrašykite, kiek vienetų planuojate supakuoti – apačioje matysite, kiek kokių pakuočių reikės ir ar užteks likučio.</p>
        <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-stone-100 text-stone-700">
              <th className={th}>Fasavimo rūšis</th><th className={th}>Pirkėjas</th><th className={th}>Kiekis, vnt.</th>
              <th className={th}>Transportinė dėžė</th><th className={th}>Dėžių</th><th className={th}>Perdengimų</th>
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className={`border-t border-stone-200 ${l.units > 0 ? 'bg-green-50/40' : ''}`}>
                  <td className={td}>{l.packed.name}</td>
                  <td className={td}>{l.norm ? (l.norm.shop?.name ?? 'bendra') : <span className="text-stone-400">—</span>}</td>
                  <td className={`${td} w-28`}>
                    <input type="number" min="0" step="1" className={`${inputCls} text-right tabular-nums`} value={qty[l.key] ?? ''}
                      onChange={(e) => setQty({ ...qty, [l.key]: e.target.value })} />
                  </td>
                  <td className={`${td} text-stone-600`}>
                    {l.norm ? `${l.norm.box_material?.name ?? ''}${l.norm.units_per_box ? ` (po ${Number(l.norm.units_per_box)})` : ''}` : '—'}
                    {l.norm?.notes && <span className="block text-xs text-stone-400">{l.norm.notes}</span>}
                  </td>
                  <td className={`${td} w-24 text-right tabular-nums`}>
                    {!l.norm ? '—' : l.norm.units_per_box ? (l.auto ?? '—') : (
                      <input type="number" min="0" step="1" placeholder="įveskite"
                        className={`${inputCls} text-right ${l.units > 0 && !l.bx ? 'border-amber-400' : ''}`}
                        value={manualBoxes[l.key] ?? ''} onChange={(e) => setManualBoxes({ ...manualBoxes, [l.key]: e.target.value })} />
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{l.norm?.overlay_material_id && l.bx && l.units > 0 ? r3(l.bx * Number(l.norm.overlays_per_box)) : '—'}</td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={6} className="py-5 text-center text-stone-400">Nėra specifikacijų</td></tr>}
            </tbody>
          </table>
        </div>
        {missingCap > 0 && <p className="mt-2 text-xs text-amber-800">Kai talpa „pagal svorį“ – dėžių skaičių įveskite ranka (pažymėta geltonai).</p>}
      </Card>

      <Card title="Reikės pakuočių" icon="layers">
        <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-stone-100 text-stone-700">
              <th className={th}>Pakavimo medžiaga</th><th className={th}>Reikės</th><th className={th}>Pakuočių / ritinių</th>
              <th className={th}>Likutis</th><th className={th}>Trūksta</th>
            </tr></thead>
            <tbody>
              {matRows.map(({ m, need, packs, have, short }) => (
                <tr key={m.id} className={`border-t border-stone-200 ${short > 0 ? 'bg-red-50' : ''}`}>
                  <td className={td}>{m.name}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{qtyFmt(need, m.unit)}</td>
                  <td className={`${td} text-right tabular-nums`}>{packs == null ? '—' : `${packs} po ${qtyFmt(m.pack_qty, m.unit)}`}</td>
                  <td className={`${td} text-right tabular-nums`}>{qtyFmt(have, m.unit)}</td>
                  <td className={`${td} text-right font-semibold tabular-nums ${short > 0 ? 'text-red-700' : 'text-green-700'}`}>{short > 0 ? qtyFmt(short, m.unit) : 'užtenka'}</td>
                </tr>
              ))}
              {!matRows.length && <tr><td colSpan={5} className="py-5 text-center text-stone-400">Įveskite kiekius viršuje</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
