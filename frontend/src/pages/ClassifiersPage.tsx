import { useEffect, useState, type FormEvent } from 'react'
import {
  createClassifier, deleteRecord, getLWeeks, getPackagingMaterials, getPackedProducts, getProductionProducts, getRawMaterials,
  getRecipes, getShops, getWarehouses, reorderClassifier, suggestPack, updateClassifier, errText,
  type LWeek, type PackagingMaterial, type PackedProduct, type ProductionProduct, type RawMaterial, type Recipe, type Shop, type Warehouse,
} from '../api'
import { EditableTable, type EditCol } from '../editable'
import { Badge, Card, Err, Field, Icon, addBtnCls, btnCls, inputCls, type IconName } from '../ui'
import RecipesCard from './RecipesCard'

type Draft = Record<string, string>
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const str = (v: unknown) => (v == null ? '' : String(v))

/** Vienas klasifikatorius: sąrašas su redagavimu, trynimu, nauju įrašu ir tvarka (tempimas pele). */
function ClassifierCard<T extends { id: number; name: string }>({ resource, title, icon, addLabel, rows, setRows, cols, payload, reload }: {
  resource: string; title: string; icon: IconName; addLabel: string
  rows: T[]; setRows: (rows: T[]) => void
  cols: EditCol<T>[]
  payload: (d: Draft) => object
  reload: () => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const guard = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await reload() } catch (e) { setErr(errText(e)); throw e }
  }

  const reorder = (next: T[]) => {
    const prev = rows
    setRows(next)
    reorderClassifier(resource, next.map((r) => r.id)).catch((e) => { setRows(prev); setErr(errText(e)) })
  }

  return (
    <Card title={<>{title} <Badge>{rows.length}</Badge></>} icon={icon}
      actions={<button type="button" className={`no-print ${addBtnCls}`} onClick={() => setAdding(true)} disabled={adding}><Icon name="plus" /> {addLabel}</button>}>
      <Err msg={err} />
      <EditableTable<T>
        rows={rows}
        cols={cols}
        adding={adding}
        onAddDone={() => setAdding(false)}
        onCreate={(d) => guard(() => createClassifier(resource, payload(d)))}
        onUpdate={(r, d) => guard(() => updateClassifier(resource, r.id, payload(d)))}
        onDelete={(r) => guard(() => deleteRecord(resource, r.id))}
        onReorder={reorder}
        deleteLabel={(r) => r.name}
      />
    </Card>
  )
}

const nameCol = <T extends { name: string }>(placeholder: string): EditCol<T> =>
  ({ key: 'name', label: 'Pavadinimas', required: true, placeholder, value: (r) => r.name })

export default function ClassifiersPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [prods, setProds] = useState<ProductionProduct[]>([])
  const [packed, setPacked] = useState<PackedProduct[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [packaging, setPackaging] = useState<PackagingMaterial[]>([])
  const [lweeks, setLweeks] = useState<LWeek[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [weight, setWeight] = useState('')
  const [suggested, setSuggested] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = () =>
    Promise.all([getRawMaterials(), getProductionProducts(), getPackedProducts(), getWarehouses(), getShops(), getLWeeks(), getRecipes(), getPackagingMaterials()])
      .then(([m, pp, pk, w, s, lw, rc, pg]) => {
        setMaterials(m.data.data); setProds(pp.data.data); setPacked(pk.data.data)
        setWarehouses(w.data.data); setShops(s.data.data); setLweeks(lw.data.data); setRecipes(rc.data); setPackaging(pg.data.data)
      })
      .catch(() => setErr('Nepavyko užkrauti klasifikatorių'))

  useEffect(() => { load() }, [])

  const checkWeight = async (e: FormEvent) => {
    e.preventDefault()
    setSuggested(null)
    try {
      const r = await suggestPack(+weight)
      setSuggested(`Rūšis: ${r.data.name}`)
    } catch { setSuggested('Nerasta rūšis šiam svoriui') }
  }

  const prodOptions = prods.map((p) => ({ value: String(p.id), label: p.name }))

  return (
    <div className="grid gap-6">
      {err && <Err msg={err} />}

      <RecipesCard recipes={recipes} products={prods} materials={materials} reload={load} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="grid gap-6">
          <ClassifierCard<RawMaterial>
            resource="raw-materials" title="Žaliavos" icon="leaf" addLabel="Pridėti žaliavą"
            rows={materials} setRows={setMaterials} reload={load}
            cols={[
              { key: 'code', label: 'Kodas', width: 'w-28', placeholder: 'pvz. Mil', value: (r) => str(r.code) },
              nameCol('Nauja žaliava…'),
              { key: 'requires_batch', label: 'Partijos naudojimas', width: 'w-44', type: 'select',
                options: [{ value: '1', label: 'Su partija' }, { value: '0', label: 'Be partijos' }],
                value: (r) => (r.requires_batch ? '1' : '0') },
            ]}
            payload={(d) => ({ code: d.code.trim() || null, name: d.name.trim(), requires_batch: d.requires_batch === '1' })}
          />

          <ClassifierCard<Shop>
            resource="shops" title="Parduotuvės" icon="truck" addLabel="Pridėti parduotuvę"
            rows={shops} setRows={setShops} reload={load}
            cols={[nameCol('Nauja parduotuvė…')]}
            payload={(d) => ({ name: d.name.trim() })}
          />

          <ClassifierCard<PackagingMaterial>
            resource="packaging-materials" title="Pakavimo medžiagos" icon="box" addLabel="Pridėti medžiagą"
            rows={packaging} setRows={setPackaging} reload={load}
            cols={[
              nameCol('Nauja pakavimo medžiaga…'),
              { key: 'unit', label: 'Matas', width: 'w-28', type: 'select',
                options: [{ value: 'vnt', label: 'vnt.' }, { value: 'm', label: 'm' }, { value: 'kg', label: 'kg' }], value: (r) => r.unit },
              { key: 'kind', label: 'Rūšis', width: 'w-44', type: 'select',
                options: [{ value: 'item', label: 'Prekinė pakuotė' }, { value: 'box', label: 'Transportinė dėžė' }, { value: 'overlay', label: 'Perdengimas' }], value: (r) => r.kind ?? 'item' },
              { key: 'pack_qty', label: 'Pakuotėje', width: 'w-24', type: 'number', step: '0.001', placeholder: 'pvz. 200', value: (r) => (r.pack_qty == null ? '' : String(r.pack_qty)) },
            ]}
            payload={(d) => ({ name: d.name.trim(), unit: d.unit, kind: d.kind || 'item', pack_qty: d.pack_qty === '' ? null : +d.pack_qty })}
          />
        </div>

        <div className="grid gap-6">
          <ClassifierCard<ProductionProduct>
            resource="production-products" title="Gamybinės rūšys" icon="factory" addLabel="Pridėti rūšį"
            rows={prods} setRows={setProds} reload={load}
            cols={[nameCol('Nauja gamybinė rūšis…')]}
            payload={(d) => ({ name: d.name.trim() })}
          />

          <ClassifierCard<PackedProduct>
            resource="packed-products" title="Fasavimo rūšys" icon="box" addLabel="Pridėti fasavimo rūšį"
            rows={packed} setRows={setPacked} reload={load}
            cols={[
              nameCol('Nauja fasavimo rūšis…'),
              { key: 'production_product_id', label: 'Gaminys', width: 'w-44', type: 'select', options: prodOptions, value: (r) => String(r.production_product_id) },
              { key: 'weight_from_kg', label: <>Svoris nuo, kg</>, width: 'w-24', type: 'number', step: '0.01', value: (r) => str(r.weight_from_kg == null ? null : Number(r.weight_from_kg)) },
              { key: 'weight_to_kg', label: <>iki, kg</>, width: 'w-24', type: 'number', step: '0.01', value: (r) => str(r.weight_to_kg == null ? null : Number(r.weight_to_kg)) },
            ]}
            payload={(d) => ({
              name: d.name.trim(), production_product_id: +d.production_product_id,
              weight_from_kg: num(d.weight_from_kg), weight_to_kg: num(d.weight_to_kg),
            })}
          />

          <ClassifierCard<Warehouse>
            resource="warehouses" title="Sandėliai" icon="box" addLabel="Pridėti sandėlį"
            rows={warehouses} setRows={setWarehouses} reload={load}
            cols={[nameCol('Naujas sandėlis…')]}
            payload={(d) => ({ name: d.name.trim() })}
          />

          <Card title="Fasavimo rūšies parinkimas pagal svorį" icon="tag">
            <form onSubmit={checkWeight} className="flex items-end gap-2">
              <Field label="Svoris, kg"><input type="number" step="0.01" min="0.01" className={inputCls} value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
              <button className={btnCls}>Rasti</button>
            </form>
            {suggested && <p className="mt-2 text-sm font-medium text-amber-900">{suggested}</p>}
            <p className="mt-2 text-xs text-stone-500">Parenkama iš fasavimo rūšių, kurioms nurodytos svorio ribos.</p>
          </Card>

          <Card title={<>L savaitės <Badge>{lweeks.length}</Badge></>} icon="list">
            <p className="text-sm text-stone-600">{lweeks.map((w) => w.code).join(', ')}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
