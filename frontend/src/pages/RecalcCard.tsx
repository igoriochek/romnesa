import { useEffect, useState } from 'react'
import { getRawMaterials, recalculateProductions, errText, type ProductionProduct, type RawMaterial, type RecalcResult } from '../api'
import { Card, Err, Field, btnCls, fmtKg, ghostBtnCls, inputCls } from '../ui'

/**
 * „TRŪKSTA“ taisymas: pataisius partijas ar receptūras sunaudojimą galima perskaičiuoti.
 * Pirmiausia rodoma peržiūra (niekas nekeičiama), tada - „Taikyti“.
 */
export default function RecalcCard({ products, onDone }: { products: ProductionProduct[]; onDone: () => Promise<unknown> | void }) {
  const [open, setOpen] = useState(false)
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [f, setF] = useState({ mode: 'shortages' as 'shortages' | 'full', from: '', to: '', production_product_id: '', raw_material_id: '' })
  const [res, setRes] = useState<RecalcResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open && !materials.length) getRawMaterials().then((r) => setMaterials(r.data.data)) }, [open, materials.length])

  const run = async (dry: boolean) => {
    if (!dry && !window.confirm(f.mode === 'full'
      ? 'Pasirinktų neįspajamotų gamybų sunaudojimas bus sukurtas iš naujo pagal galiojančias receptūras (FIFO). Rankiniu būdu parinktos partijos bus pakeistos. Tęsti?'
      : 'TRŪKSTA eilutės bus padengtos iš turimų partijų (FIFO). Tęsti?')) return
    setBusy(true); setErr(null)
    try {
      const r = (await recalculateProductions({
        mode: f.mode, dry_run: dry, from: f.from || undefined, to: f.to || undefined,
        production_product_id: f.production_product_id ? +f.production_product_id : undefined,
        raw_material_id: f.mode === 'shortages' && f.raw_material_id ? +f.raw_material_id : undefined,
      })).data
      setRes(r)
      if (!dry) await onDone()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const names = res ? [...new Set([...Object.keys(res.before), ...Object.keys(res.after)])].sort() : []
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setRes(null) }

  return (
    <Card title="Sunaudojimo perskaičiavimas (TRŪKSTA)" icon="gear" noPrint
      actions={<button type="button" className={ghostBtnCls} onClick={() => setOpen(!open)}>{open ? 'Suskleisti' : 'Atidaryti'}</button>}>
      {!open ? (
        <p className="text-sm text-stone-600">Įvedus trūkstamą partiją, pataisius gavimo datą ar receptūrą – gamybų sunaudojimą galima perskaičiuoti čia.</p>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Kas perskaičiuojama">
              <select className={inputCls} value={f.mode} onChange={(e) => set({ mode: e.target.value as 'shortages' | 'full' })}>
                <option value="shortages">Tik TRŪKSTA eilutės (padengti iš partijų)</option>
                <option value="full">Visas sunaudojimas pagal receptūrą</option>
              </select>
            </Field>
            <Field label="Gamybinė rūšis">
              <select className={inputCls} value={f.production_product_id} onChange={(e) => set({ production_product_id: e.target.value })}>
                <option value="">Visos</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Gamyba nuo"><input type="date" className={inputCls} value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
            <Field label="Gamyba iki"><input type="date" className={inputCls} value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
            {f.mode === 'shortages' && (
              <Field label="Žaliava">
                <select className={inputCls} value={f.raw_material_id} onChange={(e) => set({ raw_material_id: e.target.value })}>
                  <option value="">Visos</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          {f.mode === 'full' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Naudokite pataisius receptūrą: neįspajamotų gamybų sunaudojimas bus sukurtas iš naujo pagal tą dieną galiojančią receptūrą.
              Įspajamotos gamybos nekeičiamos.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghostBtnCls} disabled={busy} onClick={() => run(true)}>{busy ? 'Skaičiuojama…' : 'Peržiūrėti'}</button>
            <button type="button" className={btnCls} disabled={busy || !res?.dry_run} onClick={() => run(false)}
              title={res?.dry_run ? undefined : 'Pirmiausia peržiūrėkite'}>Taikyti</button>
          </div>
          <Err msg={err} />
          {res && (
            <div className="rounded-lg ring-1 ring-stone-200">
              <p className={`px-3 py-2 text-sm font-medium ${res.dry_run ? 'bg-stone-50' : 'bg-green-50 text-green-800'}`}>
                {res.dry_run ? 'Peržiūra (niekas nepakeista)' : 'Pritaikyta'} · gamybų: {res.productions}
                {res.no_recipe.length > 0 && ` · be galiojančios receptūros (nekeista): ${res.no_recipe.map((id) => `#${id}`).join(', ')}`}
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
              {Object.keys(res.after).length > 0 && (
                <p className="px-3 py-2 text-xs text-stone-500">Likęs trūkumas – tą dieną nebuvo gautos (arba jau galiojimas pasibaigęs) partijos su likučiu. Patikrinkite partijų gavimo datas ir kiekius arba receptūros normą.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
