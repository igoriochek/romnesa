import { useEffect, useState, type FormEvent } from 'react'
import {
  createRecipeAdjustment, deleteRecipeAdjustment, errText, getAdjustmentContext, getRawMaterials, getRecipeAdjustments,
  lockRecipeAdjustment, recalculateProductions, updateRecipeAdjustment,
  type AdjustmentContext, type ProductionProduct, type RawMaterial, type RecalcResult, type RecipeAdjustment,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtKg, fmtNorm, fmtPct, ghostBtnCls, inputCls } from '../ui'

// Praėjęs mėnuo: kepti kiekiai suvedami už praėjusį mėnesį
const prevMonth = () => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('sv-SE').slice(0, 7)
}
const monthBounds = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(y, mo, 0).getDate()
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` }
}

// korekcijos laikotarpis = visas mėnuo
const period = (m: string) => { const b = monthBounds(m); return { valid_from: b.from, valid_to: b.to } }

const emptyForm = (month: string, productId = '') => ({
  id: 0, production_product_id: productId, raw_material_id: '', ...period(month), qty_kg_per_kg: '', reason: '',
})

/**
 * Mėnesio sunaudojimo korekcijos („individuali kortelė“).
 * Pagrindinė receptūra lieka nepakitusi; korekcija keičia žaliavos normą tik savo laikotarpio gamyboms,
 * todėl spalio korekcija lapkričio skaičiavimų nepakeičia.
 */
export default function AdjustmentsCard({ products, onApplied }: { products: ProductionProduct[]; onApplied: () => Promise<unknown> | void }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(prevMonth())
  const [productId, setProductId] = useState('')
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [rows, setRows] = useState<RecipeAdjustment[]>([])
  const [f, setF] = useState(emptyForm(prevMonth()))
  const [ctx, setCtx] = useState<AdjustmentContext | null>(null)
  const [fact, setFact] = useState('')
  const [res, setRes] = useState<RecalcResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { from, to } = monthBounds(month)

  const load = () => getRecipeAdjustments({ from, to, production_product_id: productId ? +productId : undefined }).then((r) => setRows(r.data))

  useEffect(() => { if (open && !materials.length) getRawMaterials().then((r) => setMaterials(r.data.data)) }, [open, materials.length])
  useEffect(() => { if (open) load().catch((e) => setErr(errText(e))) }, [open, month, productId]) // eslint-disable-line react-hooks/exhaustive-deps

  // pasirinkus rūšį, žaliavą ir laikotarpį - kiek pagaminta, kokia norma ir kiek trūksta
  useEffect(() => {
    setCtx(null)
    if (!f.production_product_id || !f.raw_material_id || !f.valid_from || !f.valid_to) return
    getAdjustmentContext({ production_product_id: +f.production_product_id, raw_material_id: +f.raw_material_id, from: f.valid_from, to: f.valid_to })
      .then((r) => setCtx(r.data), () => setCtx(null))
  }, [f.production_product_id, f.raw_material_id, f.valid_from, f.valid_to])

  const changeMonth = (m: string) => {
    if (!m) return
    setMonth(m)
    setRes(null)
    if (!f.id) setF({ ...f, ...period(m) })
  }

  const suggested = ctx && ctx.produced_kg > 0 && +fact > 0 ? Math.round((+fact / ctx.produced_kg) * 1e6) / 1e6 : null
  const base = ctx?.base_qty_kg_per_kg ?? null
  const change = (norm: number | null, b: number | null) => (norm != null && b ? ((norm - b) / b) * 100 : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const data = {
      production_product_id: +f.production_product_id, raw_material_id: +f.raw_material_id,
      valid_from: f.valid_from, valid_to: f.valid_to, qty_kg_per_kg: +f.qty_kg_per_kg, reason: f.reason || null,
    }
    try {
      if (f.id) await updateRecipeAdjustment(f.id, data)
      else await createRecipeAdjustment(data)
      setF(emptyForm(month, f.production_product_id)); setFact('')
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const edit = (a: RecipeAdjustment) => {
    setF({
      id: a.id, production_product_id: String(a.production_product_id), raw_material_id: String(a.raw_material_id),
      valid_from: a.valid_from, valid_to: a.valid_to, qty_kg_per_kg: String(a.qty_kg_per_kg), reason: a.reason ?? '',
    })
    setFact('')
  }

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await load() } catch (e) { setErr(errText(e)) }
  }

  // Pritaikymas = viso sunaudojimo perskaičiavimas tik šio mėnesio neįspajamotoms gamyboms
  const apply = async (dry: boolean) => {
    if (!dry && !window.confirm(`${month} mėn. neįspajamotų gamybų sunaudojimas bus perskaičiuotas pagal receptūrą su šio mėnesio korekcijomis (FIFO). Kiti mėnesiai nekeičiami. Tęsti?`)) return
    setBusy(true); setErr(null)
    try {
      const r = (await recalculateProductions({ mode: 'full', dry_run: dry, from, to, production_product_id: productId ? +productId : undefined })).data
      setRes(r)
      if (!dry) await onApplied()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const names = res ? [...new Set([...Object.keys(res.before), ...Object.keys(res.after)])].sort() : []

  return (
    <Card title="Mėnesio sunaudojimo korekcijos" icon="leaf" noPrint
      actions={<button type="button" className={ghostBtnCls} onClick={() => setOpen(!open)}>{open ? 'Suskleisti' : 'Atidaryti'}</button>}>
      {!open ? (
        <p className="text-sm text-stone-600">
          Pagrindinė receptūra lieka nepakitusi. Čia mėnesio pabaigoje galima pakoreguoti konkrečios žaliavos normą tik to mėnesio gamyboms –
          kitų mėnesių skaičiavimai nesikeičia.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Mėnuo (pagal gamybos datą)">
              <input type="month" className={inputCls} value={month} onChange={(e) => changeMonth(e.target.value)} />
            </Field>
            <Field label="Gamybinė rūšis">
              <select className={inputCls} value={productId} onChange={(e) => { setProductId(e.target.value); setRes(null) }}>
                <option value="">Visos</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>

          <Table
            empty={`${month} mėn. korekcijų nėra – skaičiuojama pagal pagrindinę receptūrą`}
            rows={rows}
            cols={[
              { header: 'Rūšis', render: (a) => a.production_product?.name },
              { header: 'Žaliava', render: (a) => a.raw_material?.name },
              { header: 'Laikotarpis', render: (a) => `${fmtDate(a.valid_from)} – ${fmtDate(a.valid_to)}` },
              { header: 'Receptūroje, kg/kg', align: 'right', render: (a) => fmtNorm(a.base_qty_kg_per_kg) },
              { header: 'Korekcija, kg/kg', align: 'right', render: (a) => <b>{fmtNorm(a.qty_kg_per_kg)}</b> },
              { header: 'Pokytis, %', align: 'right', render: (a) => {
                const c = change(a.qty_kg_per_kg, a.base_qty_kg_per_kg)
                return c == null ? '—' : `${c > 0 ? '+' : ''}${fmtPct(c)}`
              } },
              { header: 'Priežastis', render: (a) => a.reason ?? '' },
              { header: 'Būsena', align: 'center', render: (a) => (a.is_locked ? <Badge tone="green">Įspajamota</Badge> : <Badge>Taisoma</Badge>) },
              { header: 'Veiksmai', align: 'center', render: (a) => (
                <span className="flex justify-center gap-3 whitespace-nowrap text-sm">
                  {!a.is_locked && <button className="text-stone-700 hover:underline" onClick={() => edit(a)}>Taisyti</button>}
                  <button className={a.is_locked ? 'text-blue-600 hover:underline' : 'text-stone-700 hover:underline'} onClick={() => act(() => lockRecipeAdjustment(a.id))}>
                    {a.is_locked ? 'Atrakinti' : 'Įspajamoti'}
                  </button>
                  {!a.is_locked && (
                    <button className="text-red-600 hover:underline" onClick={() => window.confirm('Ištrinti korekciją?') && act(() => deleteRecipeAdjustment(a.id))}>Trinti</button>
                  )}
                </span>
              ) },
            ]}
          />

          <form onSubmit={submit} className="grid gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
            <p className="text-sm font-semibold">{f.id ? 'Taisyti korekciją' : 'Nauja korekcija'}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Gamybinė rūšis" required>
                <select className={inputCls} value={f.production_product_id} onChange={(e) => setF({ ...f, production_product_id: e.target.value })} required>
                  <option value="">— pasirinkite —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Žaliava" required>
                <select className={inputCls} value={f.raw_material_id} onChange={(e) => setF({ ...f, raw_material_id: e.target.value })} required>
                  <option value="">— pasirinkite —</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Galioja nuo" required><input type="date" className={inputCls} value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} required /></Field>
              <Field label="Galioja iki" required><input type="date" className={inputCls} value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} required /></Field>
            </div>

            {ctx && (
              <div className="grid gap-1 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-stone-200">
                <span>Pagaminta per laikotarpį: <b>{fmtKg(ctx.produced_kg)} kg</b> ({ctx.productions} gamyb.{ctx.locked > 0 && `, iš jų ${ctx.locked} įspajamotos – jų korekcija nepakeis`})</span>
                <span>Pagrindinės receptūros{ctx.recipe_version ? ` (v${ctx.recipe_version})` : ''} norma: <b>{fmtNorm(base)} kg/kg</b></span>
                <span>Dabar nurašyta: <b>{fmtKg(ctx.used_kg)} kg</b>{ctx.shortage_kg > 0 && <>, iš jų <b className="text-red-700">TRŪKSTA {fmtKg(ctx.shortage_kg)} kg</b></>}</span>
                <div className="mt-1 flex flex-wrap items-end gap-2">
                  <Field label="Faktiškai sunaudota per laikotarpį, kg">
                    <input type="number" step="0.001" min="0" className={inputCls} value={fact} onChange={(e) => setFact(e.target.value)} />
                  </Field>
                  {suggested != null && (
                    <button type="button" className={ghostBtnCls} onClick={() => setF({ ...f, qty_kg_per_kg: String(suggested) })}>
                      Naudoti normą {fmtNorm(suggested)} kg/kg
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nauja norma, kg / 1 kg produkcijos" required>
                <input type="number" step="0.000001" min="0" className={inputCls} value={f.qty_kg_per_kg} onChange={(e) => setF({ ...f, qty_kg_per_kg: e.target.value })} required />
              </Field>
              <Field label="Priežastis">
                <input className={inputCls} maxLength={255} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="pvz. inventorizacija – trūksta ciberžolės" />
              </Field>
            </div>
            {f.qty_kg_per_kg !== '' && base != null && (
              <p className="text-xs text-stone-600">
                Pokytis nuo receptūros: {(() => { const c = change(+f.qty_kg_per_kg, base); return c == null ? '—' : `${c > 0 ? '+' : ''}${fmtPct(c)} %` })()}
                {ctx && ctx.produced_kg > 0 && ` · bus nurašyta ≈ ${fmtKg(+f.qty_kg_per_kg * ctx.produced_kg)} kg`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} disabled={busy}>{f.id ? 'Išsaugoti pakeitimą' : 'Pridėti korekciją'}</button>
              {f.id > 0 && <button type="button" className={ghostBtnCls} onClick={() => setF(emptyForm(month, f.production_product_id))}>Atšaukti</button>}
            </div>
          </form>

          <div className="grid gap-2">
            <p className="text-sm text-stone-600">
              Išsaugota korekcija pritaikoma perskaičiavus <b>{month}</b> mėn. sunaudojimą{productId ? ' pasirinktai rūšiai' : ''}. Įspajamotos gamybos nekeičiamos.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ghostBtnCls} disabled={busy} onClick={() => apply(true)}>{busy ? 'Skaičiuojama…' : 'Peržiūrėti poveikį'}</button>
              <button type="button" className={btnCls} disabled={busy || !res?.dry_run} onClick={() => apply(false)}
                title={res?.dry_run ? undefined : 'Pirmiausia peržiūrėkite'}>Pritaikyti mėnesiui</button>
            </div>
          </div>
          <Err msg={err} />
          {res && (
            <div className="rounded-lg ring-1 ring-stone-200">
              <p className={`px-3 py-2 text-sm font-medium ${res.dry_run ? 'bg-stone-50' : 'bg-green-50 text-green-800'}`}>
                {res.dry_run ? 'Peržiūra (niekas nepakeista)' : 'Pritaikyta'} · gamybų: {res.productions}
              </p>
              <table className="w-full text-sm">
                <thead><tr className="bg-[#f3e9da]"><th className="px-3 py-1.5 text-left">Žaliava</th><th className="px-3 py-1.5 text-right">TRŪKSTA prieš, kg</th><th className="px-3 py-1.5 text-right">TRŪKSTA po, kg</th></tr></thead>
                <tbody>
                  {names.map((n) => (
                    <tr key={n} className="border-t border-stone-100">
                      <td className="px-3 py-1.5">{n}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtKg(res.before[n] ?? 0)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${(res.after[n] ?? 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmtKg(res.after[n] ?? 0)}</td>
                    </tr>
                  ))}
                  {!names.length && <tr><td colSpan={3} className="px-3 py-3 text-center text-green-700">Trūkumų nėra</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
