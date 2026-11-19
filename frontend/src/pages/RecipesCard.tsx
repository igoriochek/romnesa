import { useState } from 'react'
import {
  createRecipe, deleteRecord, updateRecipe, errText,
  type ProductionProduct, type RawMaterial, type Recipe, type RecipeInput,
} from '../api'
import { ActionBtn, DragHandle, useDragSort } from '../editable'
import { Badge, Card, Err, Icon, addBtnCls, fmtDate, fmtKg, inputCls, todayIso } from '../ui'

interface Line { key: number; raw_material_id: string; qty: string }
interface Draft {
  id: number | null                  // null - nauja (arba kopija)
  production_product_id: string
  version: string
  valid_from: string
  valid_to: string
  change_reason: string
  lines: Line[]
  used: number                       // kiek gamybų jau pagal ją pagaminta
}

let seq = 1
const line = (raw_material_id = '', qty = ''): Line => ({ key: seq++, raw_material_id, qty })

const nextVersion = (recipes: Recipe[], productId: string) =>
  String(Math.max(0, ...recipes.filter((r) => String(r.production_product_id) === productId).map((r) => r.version)) + 1)

/** Receptūrų sąrašas: peržiūra, redagavimas, kopijavimas į naują versiją, trynimas ir naujos įvedimas. */
export default function RecipesCard({ recipes, products, materials, reload }: {
  recipes: Recipe[]; products: ProductionProduct[]; materials: RawMaterial[]; reload: () => Promise<void>
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fromRecipe = (r: Recipe, copy: boolean): Draft => ({
    id: copy ? null : r.id,
    production_product_id: String(r.production_product_id),
    version: copy ? nextVersion(recipes, String(r.production_product_id)) : String(r.version),
    valid_from: copy ? todayIso() : fmtDate(r.valid_from),
    valid_to: copy || !r.valid_to ? '' : fmtDate(r.valid_to),
    change_reason: copy ? '' : r.change_reason ?? '',
    lines: (r.items ?? []).map((i) => line(String(i.raw_material_id), String(Number(i.qty_kg_per_kg)))),
    used: copy ? 0 : r.productions_count ?? 0,
  })

  const addNew = () => {
    const pid = String(products[0]?.id ?? '')
    setErr(null)
    setDraft({ id: null, production_product_id: pid, version: nextVersion(recipes, pid), valid_from: todayIso(), valid_to: '', change_reason: '', lines: [line()], used: 0 })
  }

  const save = async () => {
    if (!draft) return
    const lines = draft.lines.filter((l) => l.raw_material_id || l.qty)
    if (!lines.length || lines.some((l) => !l.raw_material_id || !(Number(l.qty) > 0))) {
      setErr('Kiekvienai eilutei pasirinkite žaliavą ir įveskite kiekį (> 0).'); return
    }
    const data: RecipeInput = {
      production_product_id: +draft.production_product_id,
      version: draft.version ? +draft.version : null,
      valid_from: draft.valid_from,
      valid_to: draft.valid_to || null,
      change_reason: draft.change_reason || null,
      items: lines.map((l) => ({ raw_material_id: +l.raw_material_id, qty_kg_per_kg: +l.qty })),
    }
    setBusy(true); setErr(null)
    try {
      if (draft.id) await updateRecipe(draft.id, data); else await createRecipe(data)
      setDraft(null)
      await reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const remove = async (r: Recipe) => {
    if (!window.confirm(`Ištrinti receptūrą „${r.production_product?.name} v${r.version}“?`)) return
    setErr(null)
    try { await deleteRecord('recipes', r.id); await reload() } catch (e) { setErr(errText(e)) }
  }

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Card title={<>Receptūros <Badge tone="amber">{recipes.length}</Badge></>} icon="list"
      actions={<button type="button" className={`no-print ${addBtnCls}`} onClick={addNew} disabled={!!draft}><Icon name="plus" /> Pridėti receptūrą</button>}>
      <Err msg={err} />
      <div className="mt-2 space-y-3">
        {draft && draft.id === null && (
          <Editor draft={draft} setDraft={setDraft} products={products} materials={materials} recipes={recipes} busy={busy} onSave={save} onCancel={() => { setDraft(null); setErr(null) }} />
        )}
        {recipes.map((r) => draft?.id === r.id
          ? <Editor key={r.id} draft={draft} setDraft={setDraft} products={products} materials={materials} recipes={recipes} busy={busy} onSave={save} onCancel={() => { setDraft(null); setErr(null) }} />
          : (
            <div key={r.id} className="rounded-xl border border-stone-200">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => toggle(r.id)}>
                  <b className="text-base">{r.production_product?.name ?? `#${r.production_product_id}`}</b>
                  <Badge tone="green">v{r.version}</Badge>
                  <span className="truncate text-xs text-stone-500">
                    nuo {fmtDate(r.valid_from)}{r.valid_to ? ` iki ${fmtDate(r.valid_to)}` : ''}
                    {r.productions_count ? ` · gamybų: ${r.productions_count}` : ''}
                  </span>
                </button>
                <span className="no-print flex items-center gap-1 text-sm">
                  <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-green-800 hover:bg-green-50 disabled:opacity-40"
                    disabled={!!draft} onClick={() => { setErr(null); setDraft(fromRecipe(r, false)) }}><Icon name="edit" /> Redaguoti</button>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
                    disabled={!!draft} onClick={() => { setErr(null); setDraft(fromRecipe(r, true)) }}><Icon name="copy" /> Kopijuoti</button>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-red-600 hover:bg-red-50"
                    onClick={() => remove(r)}><Icon name="trash" /> Ištrinti</button>
                  <ActionBtn icon={open.has(r.id) ? 'up' : 'chevron'} title={open.has(r.id) ? 'Suskleisti' : 'Išskleisti'} tone="stone" onClick={() => toggle(r.id)} />
                </span>
              </div>
              {open.has(r.id) && (
                <ul className="grid gap-x-8 border-t border-stone-100 px-4 py-2 text-sm text-stone-700 sm:grid-cols-2">
                  {r.items?.map((i) => (
                    <li key={i.id} className="flex justify-between py-0.5">
                      <span>{i.raw_material?.name}</span>
                      <span className="tabular-nums">{fmtKg(i.qty_kg_per_kg)} kg/kg</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
      </div>
    </Card>
  )
}

function Editor({ draft, setDraft, products, materials, recipes, busy, onSave, onCancel }: {
  draft: Draft; setDraft: (d: Draft) => void; products: ProductionProduct[]; materials: RawMaterial[]; recipes: Recipe[]
  busy: boolean; onSave: () => void; onCancel: () => void
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const setLine = (key: number, patch: Partial<Line>) => set({ lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) })
  const drag = useDragSort(draft.lines, (lines) => set({ lines }))
  const versions = [...new Set([
    ...recipes.filter((r) => String(r.production_product_id) === draft.production_product_id && r.id !== draft.id).map((r) => r.version),
    +draft.version || 1, +nextVersion(recipes, draft.production_product_id),
  ])].sort((a, b) => a - b)
  const taken = (v: number) => recipes.some((r) => String(r.production_product_id) === draft.production_product_id && r.version === v && r.id !== draft.id)
  const total = draft.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)

  return (
    <div className="rounded-xl border-2 border-green-700/70 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-3">
        <select className={`${inputCls} max-w-64 font-semibold`} value={draft.production_product_id}
          onChange={(e) => set({ production_product_id: e.target.value, version: draft.id ? draft.version : nextVersion(recipes, e.target.value) })}>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">Versija:
          <select className={`${inputCls} w-20`} value={draft.version} onChange={(e) => set({ version: e.target.value })}>
            {versions.map((v) => <option key={v} value={v} disabled={taken(v)}>v{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">Galioja nuo
          <input type="date" className={`${inputCls} w-40`} value={draft.valid_from} onChange={(e) => set({ valid_from: e.target.value })} required />
        </label>
        <label className="flex items-center gap-2 text-sm">iki
          <input type="date" className={`${inputCls} w-40`} value={draft.valid_to} onChange={(e) => set({ valid_to: e.target.value })} />
        </label>
        <span className="ml-auto flex gap-2">
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-green-700 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
            onClick={onSave} disabled={busy}><Icon name="save" /> {busy ? 'Saugoma…' : 'Išsaugoti'}</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            onClick={onCancel}><Icon name="x" /> Atšaukti</button>
        </span>
      </div>
      {draft.used > 0 && (
        <p className="mx-4 mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Pagal šią receptūrą jau užregistruota gamybų: <b>{draft.used}</b>. Jų sunaudojimas nepasikeis – pakeitimai galios naujoms gamyboms.
          Jei keičiasi sudėtis nuo tam tikros datos, geriau „Kopijuoti“ į naują versiją.
        </p>
      )}
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="bg-[#f3e9da]">
            <th className="w-10" />
            <th className="px-2 py-2 text-left font-semibold">Žaliava</th>
            <th className="w-44 px-2 py-2 text-center font-semibold">Kiekis (kg/kg)</th>
            <th className="w-14" />
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((l, i) => {
            const dr = drag.row(i)
            return (
              <tr key={l.key} {...dr} className={`border-b border-stone-100 ${dr.className}`}>
                <td className="pl-3"><DragHandle {...drag.handle(i)} /></td>
                <td className="px-2 py-1.5">
                  <select className={inputCls} value={l.raw_material_id} onChange={(e) => setLine(l.key, { raw_material_id: e.target.value })}>
                    <option value="">— pasirinkite žaliavą —</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id} disabled={draft.lines.some((o) => o.key !== l.key && o.raw_material_id === String(m.id))}>{m.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.001" min="0" className={`${inputCls} text-center tabular-nums`} value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                </td>
                <td className="text-center">
                  <ActionBtn icon="trash" title="Pašalinti eilutę" tone="red" onClick={() => set({ lines: draft.lines.filter((o) => o.key !== l.key) })} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" className={addBtnCls} onClick={() => set({ lines: [...draft.lines, line()] })}>
          <Icon name="plus" /> Pridėti žaliavą į receptūrą
        </button>
        <input className={`${inputCls} max-w-sm`} placeholder="Keitimo priežastis (neprivaloma)" value={draft.change_reason}
          onChange={(e) => set({ change_reason: e.target.value })} />
        <span className="text-xs text-stone-500">Iš viso: <b className="tabular-nums">{fmtKg(total)}</b> kg žaliavų 1 kg gaminio</span>
      </div>
    </div>
  )
}
