import { useEffect, useState, type FormEvent } from 'react'
import {
  createClassifier, getLWeeks, getPackedProducts, getProductionProducts, getRawMaterials,
  getRecipes, getShops, getWarehouses, suggestPack, errText,
  type LWeek, type PackedProduct, type ProductionProduct, type RawMaterial, type Recipe, type Shop, type Warehouse,
} from '../api'
import { Badge, Card, Err, Field, btnCls, fmtKg, inputCls } from '../ui'

function AddRow({ onAdd, placeholder }: { onAdd: (name: string) => Promise<void>; placeholder: string }) {
  const [name, setName] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onAdd(name.trim())
    setName('')
  }
  return (
    <form onSubmit={submit} className="mt-2 flex gap-2">
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      <button className={btnCls}>+</button>
    </form>
  )
}

export default function ClassifiersPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [prods, setProds] = useState<ProductionProduct[]>([])
  const [packed, setPacked] = useState<PackedProduct[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [weight, setWeight] = useState('')
  const [suggested, setSuggested] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = () =>
    Promise.all([getRawMaterials(), getProductionProducts(), getPackedProducts(), getWarehouses(), getShops(), getLWeeks(), getRecipes()])
      .then(([m, pp, pk, w, s, lw, rc]) => {
        setMaterials(m.data.data); setProds(pp.data.data); setPacked(pk.data.data)
        setWarehouses(w.data.data); setShops(s.data.data); setLweeks(lw.data.data); setRecipes(rc.data)
      })
      .catch(() => setErr('Nepavyko užkrauti klasifikatorių'))

  useEffect(() => { load() }, [])

  const addClassifier = (resource: string) => async (name: string) => {
    setErr(null)
    try { await createClassifier(resource, { name }); await load() } catch (e) { setErr(errText(e)) }
  }

  const checkWeight = async (e: FormEvent) => {
    e.preventDefault()
    setSuggested(null)
    try {
      const r = await suggestPack(+weight)
      setSuggested(`Rūšis: ${r.data.name}`)
    } catch { setSuggested('Nerasta rūšis šiam svoriui') }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Err msg={err} />

      <Card title="Receptūros" actions={<Badge tone="amber">{recipes.length}</Badge>}>
        <div className="space-y-3">
          {recipes.map((r) => (
            <div key={r.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex items-center justify-between">
                <b>{r.production_product?.name ?? `#${r.production_product_id}`}</b>
                <Badge tone="green">v{r.version}</Badge>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 text-sm text-stone-600">
                {r.items?.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <span>{i.raw_material?.name}</span>
                    <span className="tabular-nums">{fmtKg(i.qty_kg_per_kg)} kg/kg</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6">
        <Card title="Fasavimo rūšies parinkimas pagal svorį">
          <form onSubmit={checkWeight} className="flex items-end gap-2">
            <Field label="Svoris, kg"><input type="number" step="0.01" min="0.01" className={inputCls} value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
            <button className={btnCls}>Rasti</button>
          </form>
          {suggested && <p className="mt-2 text-sm font-medium text-amber-900">{suggested}</p>}
        </Card>

        <Card title="Žaliavos" actions={<Badge>{materials.length}</Badge>}>
          <ul className="text-sm">
            {materials.map((m) => <li key={m.id} className="border-b border-stone-100 py-1 last:border-0">{m.name}</li>)}
          </ul>
          <AddRow onAdd={addClassifier('raw-materials')} placeholder="Nauja žaliava…" />
        </Card>

        <Card title="Parduotuvės" actions={<Badge>{shops.length}</Badge>}>
          <ul className="text-sm">
            {shops.map((s) => <li key={s.id} className="border-b border-stone-100 py-1 last:border-0">{s.name}</li>)}
          </ul>
          <AddRow onAdd={addClassifier('shops')} placeholder="Nauja parduotuvė…" />
        </Card>
      </div>

      <div className="grid gap-6">
        <Card title="Gamybinės rūšys" actions={<Badge>{prods.length}</Badge>}>
          <ul className="text-sm">
            {prods.map((p) => <li key={p.id} className="border-b border-stone-100 py-1 last:border-0">{p.name}</li>)}
          </ul>
        </Card>

        <Card title="Fasavimo rūšys" actions={<Badge>{packed.length}</Badge>}>
          <ul className="text-sm">
            {packed.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-stone-100 py-1 last:border-0">
                <span>{p.name}</span>
                <span className="text-stone-400">
                  {p.weight_from_kg != null ? `${fmtKg(p.weight_from_kg)}–${fmtKg(p.weight_to_kg)} kg` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sandėliai" actions={<Badge>{warehouses.length}</Badge>}>
          <ul className="text-sm">
            {warehouses.map((w) => <li key={w.id} className="border-b border-stone-100 py-1 last:border-0">{w.name}</li>)}
          </ul>
          <AddRow onAdd={addClassifier('warehouses')} placeholder="Naujas sandėlis…" />
        </Card>

        <Card title="L savaitės" actions={<Badge>{lweeks.length}</Badge>}>
          <p className="text-sm text-stone-600">{lweeks.map((w) => w.code).join(', ')}</p>
        </Card>
      </div>
    </div>
  )
}
