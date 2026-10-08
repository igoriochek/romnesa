import { useEffect, useState, type FormEvent } from 'react'
import {
  createProduction, deleteRecord, getLWeeks, getProductionProducts, getProductions,
  getProduction, getProductInfo, previewProduction, toggleLock, errText, isShortage,
  type LWeek, type Production, type ProductInfo, type ProductionPreview, type ProductionProduct,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, inputCls, todayIso } from '../ui'

export default function ProductionsPage() {
  const [rows, setRows] = useState<Production[]>([])
  const [products, setProducts] = useState<ProductionProduct[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Production | null>(null)
  const [preview, setPreview] = useState<ProductionPreview | null>(null)
  const [info, setInfo] = useState<ProductInfo | null>(null)
  const [f, setF] = useState({
    production_date: todayIso(),
    production_product_id: '', qty_produced_kg: '', l_week_id: '', notes: '',
  })

  const load = () => getProductions().then((r) => setRows(r.data.data)).catch(() => setErr('Nepavyko užkrauti'))

  useEffect(() => {
    load()
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
    const t = setTimeout(() => {
      previewProduction({
        production_date: f.production_date,
        production_product_id: +f.production_product_id,
        qty_produced_kg: +f.qty_produced_kg,
        l_week_id: +f.l_week_id,
      }).then((r) => setPreview(r.data)).catch(() => setPreview(null))
    }, 350)
    return () => clearTimeout(t)
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
      })
      const missing = res.data.usages?.filter(isShortage)
      if (missing?.length) {
        setErr(`Dėmesio: trūko partijų – ${missing.map((m) => `${m.raw_material?.name} ${fmtKg(m.qty_kg)} kg`).join(', ')}`)
      }
      setF({ ...f, qty_produced_kg: '', notes: '' })
      setPreview(null)
      await load()
      loadInfo() // atnaujina rūšies paskutines gamybas
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const doLock = async (p: Production) => {
    try { await toggleLock('productions', p.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (p: Production) => {
    if (!window.confirm(`Trinti gamybą #${p.id}? Partijos bus atlaisvintos.`)) return
    try { await deleteRecord('productions', p.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const toggleDetail = async (p: Production) => {
    if (expandedId === p.id) { setExpandedId(null); setDetail(null); return }
    setExpandedId(p.id); setDetail(null)
    try {
      setDetail((await getProduction(p.id)).data)
    } catch (e) { setErr(errText(e)) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card title="Gamybos žurnalas">
        <Table
          cols={[
            { header: 'Data', render: (p) => fmtDate(p.production_date) },
            { header: 'Rūšis', render: (p) => p.production_product?.name },
            { header: 'Kiekis kg', align: 'right', render: (p) => fmtKg(p.qty_produced_kg) },
            { header: 'L savaitė', render: (p) => <Badge tone="amber">{p.l_week?.code}</Badge> },
            { header: 'Būsena', render: (p) => p.is_locked ? <Badge tone="green">Įspajamota</Badge> : <Badge>Dokumentas</Badge> },
            { header: '', render: (p) => (
              <span className="flex justify-end gap-1 whitespace-nowrap">
                <button className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => toggleDetail(p)}>detalės</button>
                <button className="rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100" onClick={() => doLock(p)}>{p.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                <button className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => doDelete(p)}>trinti</button>
              </span>
            ) },
          ]}
          rows={rows}
        />
        {expandedId && detail && detail.usages && (
          <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
            <b>Sunaudota žaliavų (gamybą #{detail.id}):</b>
            <ul className="mt-1">
              {detail.usages.map((u) => (
                <li key={u.id} className="flex justify-between py-0.5">
                  <span>{u.raw_material?.name} ← {u.material_batch?.batch_number ?? (isShortage(u) ? <Badge tone="red">TRŪKSTA</Badge> : <Badge>be partijos</Badge>)}</span>
                  <span className="tabular-nums">{fmtKg(u.qty_kg)} kg</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-6 content-start">
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

        {info && !preview && (
          <Card title={info.product.name}>
            {info.recipe ? (
              <>
                <p className="mb-1 text-xs text-stone-500">
                  Receptūra v{info.recipe.version} · galioja nuo {fmtDate(info.recipe.valid_from)} · kg žaliavos / 1 kg produkto
                </p>
                <ul className="text-sm">
                  {info.recipe.items?.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <span>{i.raw_material?.name}{i.raw_material?.requires_batch === false && <span className="text-stone-400"> (be partijos)</span>}</span>
                      <span className="tabular-nums">{fmtKg(i.qty_kg_per_kg)}</span>
                    </li>
                  ))}
                </ul>
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

        {preview && (
          <Card title={`Receptūra v${preview.recipe.version} — nurašymo planas`}>
            {preview.shortage && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                Trūksta žaliavų — dalis bus su „TRŪKSTA" be partijos.
              </p>
            )}
            <ul className="space-y-2 text-sm">
              {preview.plan.map((row, i) => (
                <li key={i}>
                  <div className="flex justify-between font-medium">
                    <span>{row.raw_material.name}</span>
                    <span className="tabular-nums text-stone-500">{fmtKg(row.needed_kg)} kg</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {!row.raw_material.requires_batch && (
                      <li className="text-xs text-stone-500">Išimtis – partija nereikalinga, fiksuojamas tik kiekis</li>
                    )}
                    {row.take.map((t, j) => (
                      <li key={j} className="flex justify-between text-xs">
                        <span>
                          {t.batch
                            ? <>{t.batch.batch_number} <span className="text-stone-400">(liko {fmtKg(t.available_kg)})</span></>
                            : <Badge tone="red">TRŪKSTA</Badge>}
                        </span>
                        <span className="tabular-nums">{fmtKg(t.qty_kg)} kg</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
