import { useEffect, useState, type FormEvent } from 'react'
import {
  createWriteoffAct, deleteRecord, getOutflows, getWriteoffAct, getWriteoffActs, toggleLock, errText,
  WRITEOFF_REASONS, type MaterialOutflow, type WriteoffAct,
} from '../api'
import { Badge, Card, Err, Field, Table, btnCls, fmtDate, fmtEur, fmtKg, fmtUnitEur, inputCls, smallBtnCls, todayIso } from '../ui'

const th = 'border border-stone-400 px-2 py-1 text-left font-semibold'
const td = 'border border-stone-400 px-2 py-1'
const tdNum = `${td} text-right tabular-nums`

/** Spausdinamas žaliavų nurašymo aktas (viršutinė juosta: Spausdinti / Eksportuoti PDF). */
function ActDocument({ act }: { act: WriteoffAct }) {
  const lines = act.outflows ?? []
  return (
    <section className="rounded-xl bg-white p-8 text-sm text-black shadow-sm ring-1 ring-stone-200">
      <div className="flex justify-between">
        <div>
          <p className="font-semibold">UAB „Romnesa"</p>
          <p className="text-stone-600">Šakočių gamyba</p>
        </div>
        <div className="text-right">
          <p>TVIRTINU</p>
          <p className="mt-6">______________________</p>
          <p className="text-xs text-stone-600">{act.approved_by ?? '(vadovas)'}</p>
        </div>
      </div>

      <h2 className="mt-6 text-center text-lg font-bold tracking-wide">ŽALIAVŲ NURAŠYMO AKTAS Nr. {act.act_number}</h2>
      <p className="text-center">{fmtDate(act.act_date)}</p>

      <p className="mt-4">
        Komisija / atsakingas asmuo patikrino žemiau nurodytas žaliavų partijas ir nustatė, kad jos netinkamos naudoti gamyboje.
        Nurodyti kiekiai nurašomi iš partijų likučių.
      </p>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="bg-stone-100">
            <th className={th}>Eil.</th>
            <th className={th}>Žaliava</th>
            <th className={th}>Partijos Nr.</th>
            <th className={th}>Gauta</th>
            <th className={th}>Galioja iki</th>
            <th className={th}>Nurašymo data</th>
            <th className={th}>Priežastis</th>
            <th className={`${th} text-right`}>Kiekis, kg</th>
            <th className={`${th} text-right`}>Kaina, €/kg</th>
            <th className={`${th} text-right`}>Vertė, €</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((o, i) => (
            <tr key={o.id}>
              <td className={td}>{i + 1}</td>
              <td className={td}>{o.material_batch?.raw_material?.name}</td>
              <td className={td}>{o.material_batch?.batch_number}</td>
              <td className={td}>{fmtDate(o.material_batch?.received_date)}</td>
              <td className={td}>{fmtDate(o.material_batch?.expiry_date)}</td>
              <td className={td}>{fmtDate(o.outflow_date)}</td>
              <td className={td}>
                {o.reason ? WRITEOFF_REASONS[o.reason] : '—'}
                {o.destination ? ` – ${o.destination}` : ''}
              </td>
              <td className={tdNum}>{fmtKg(o.qty_kg)}</td>
              <td className={tdNum}>{fmtUnitEur(o.material_batch?.unit_cost_eur)}</td>
              <td className={tdNum}>{fmtEur(o.value_eur)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={td} colSpan={7}>Iš viso</td>
            <td className={tdNum}>{fmtKg(act.total_kg)}</td>
            <td className={td} />
            <td className={tdNum}>{fmtEur(act.total_value_eur)}{!act.value_complete && ' *'}</td>
          </tr>
        </tbody>
      </table>
      {!act.value_complete && <p className="mt-1 text-xs text-stone-600">* Dalies partijų savikaina nenurodyta – vertė neįskaičiuota.</p>}
      {act.notes && <p className="mt-3"><b>Pastabos:</b> {act.notes}</p>}

      <div className="mt-12 grid grid-cols-2 gap-12">
        <div>
          <p>Sudarė:</p>
          <p className="mt-8 border-t border-stone-500 pt-1 text-xs text-stone-600">{act.compiled_by ?? ''} (vardas, pavardė, parašas)</p>
        </div>
        <div>
          <p>Patvirtino:</p>
          <p className="mt-8 border-t border-stone-500 pt-1 text-xs text-stone-600">{act.approved_by ?? ''} (vardas, pavardė, parašas)</p>
        </div>
      </div>
    </section>
  )
}

export default function WriteoffActsPage() {
  const [acts, setActs] = useState<WriteoffAct[]>([])
  const [free, setFree] = useState<MaterialOutflow[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<WriteoffAct | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ act_date: todayIso(), act_number: '', compiled_by: '', approved_by: '', notes: '' })

  const load = async () => {
    try {
      const [a, o] = await Promise.all([getWriteoffActs(), getOutflows({ type: 'writeoff', unassigned: 1 })])
      setActs(a.data)
      setFree(o.data.data)
    } catch { setErr('Nepavyko užkrauti') }
  }

  useEffect(() => { load() }, [])

  const togglePick = (id: number) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await createWriteoffAct({ ...f, outflow_ids: [...picked] })
      setPicked(new Set())
      setF({ ...f, act_number: '', notes: '' })
      setOpen(res.data)
      await load()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const openAct = async (a: WriteoffAct) => {
    if (open?.id === a.id) { setOpen(null); return }
    try { setOpen((await getWriteoffAct(a.id)).data) } catch (e) { setErr(errText(e)) }
  }

  const doLock = async (a: WriteoffAct) => {
    try { await toggleLock('writeoff-acts', a.id); await load() } catch (e) { setErr(errText(e)) }
  }

  const doDelete = async (a: WriteoffAct) => {
    if (!window.confirm(`Pašalinti aktą ${a.act_number}? Nurašymai liks, tik bus atsieti nuo akto.`)) return
    try {
      await deleteRecord('writeoff-acts', a.id)
      if (open?.id === a.id) setOpen(null)
      await load()
    } catch (e) { setErr(errText(e)) }
  }

  const pickedRows = free.filter((o) => picked.has(o.id))

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px] no-print">
        <Card title="Nurašymo aktai">
          <Table
            cols={[
              { header: 'Nr.', render: (a) => <b>{a.act_number}</b> },
              { header: 'Data', render: (a) => fmtDate(a.act_date) },
              { header: 'Eilučių', align: 'right', render: (a) => a.lines },
              { header: 'Kg', align: 'right', render: (a) => fmtKg(a.total_kg) },
              { header: 'Vertė €', align: 'right', render: (a) => `${fmtEur(a.total_value_eur)}${a.value_complete ? '' : ' *'}` },
              { header: 'Sudarė', render: (a) => a.compiled_by ?? '—' },
              { header: '', render: (a) => (
                <span className="flex justify-end gap-1 whitespace-nowrap">
                  {a.is_locked && <Badge tone="green">Įspajamotas</Badge>}
                  <button className={smallBtnCls} onClick={() => openAct(a)}>{open?.id === a.id ? 'uždaryti' : 'atidaryti'}</button>
                  <button className={smallBtnCls} onClick={() => doLock(a)}>{a.is_locked ? 'atrakinti' : 'įspajamoti'}</button>
                  <button className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => doDelete(a)}>trinti</button>
                </span>
              ) },
            ]}
            rows={acts}
            empty="Aktų dar nėra"
          />

          <h3 className="mt-6 mb-2 font-semibold">Nurašymai be akto – pažymėkite įtraukiamus</h3>
          <Table
            cols={[
              { header: '', render: (o) => <input type="checkbox" checked={picked.has(o.id)} onChange={() => togglePick(o.id)} aria-label={`Įtraukti #${o.id}`} /> },
              { header: 'Data', render: (o) => fmtDate(o.outflow_date) },
              { header: 'Partija', render: (o) => o.material_batch?.batch_number },
              { header: 'Žaliava', render: (o) => o.material_batch?.raw_material?.name },
              { header: 'Kg', align: 'right', render: (o) => fmtKg(o.qty_kg) },
              { header: 'Vertė €', align: 'right', render: (o) => fmtEur(o.value_eur) },
              { header: 'Priežastis', render: (o) => (o.reason ? WRITEOFF_REASONS[o.reason] : <Badge tone="amber">nenurodyta</Badge>) },
            ]}
            rows={free}
            empty="Visi nurašymai jau įtraukti į aktus. Naujus nurašymus registruokite skiltyje „Perdavimai“."
          />
        </Card>

        <Card title="Formuoti nurašymo aktą">
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Akto data"><input type="date" className={inputCls} value={f.act_date} onChange={(e) => setF({ ...f, act_date: e.target.value })} required /></Field>
            <Field label="Akto Nr. (tuščias – automatiškai NA-metai-eil.)"><input className={inputCls} value={f.act_number} onChange={(e) => setF({ ...f, act_number: e.target.value })} /></Field>
            <Field label="Sudarė"><input className={inputCls} value={f.compiled_by} onChange={(e) => setF({ ...f, compiled_by: e.target.value })} placeholder="prisijungęs vartotojas" /></Field>
            <Field label="Patvirtino"><input className={inputCls} value={f.approved_by} onChange={(e) => setF({ ...f, approved_by: e.target.value })} /></Field>
            <Field label="Pastabos"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <p className="text-sm text-stone-600">
              Pažymėta: <b>{pickedRows.length}</b> · {fmtKg(pickedRows.reduce((s, o) => s + Number(o.qty_kg), 0))} kg ·{' '}
              {fmtEur(pickedRows.reduce((s, o) => s + Number(o.value_eur ?? 0), 0))} €
            </p>
            <button className={btnCls} disabled={busy || picked.size === 0}>{busy ? 'Formuojama…' : 'Formuoti aktą'}</button>
            <Err msg={err} />
          </form>
        </Card>
      </div>

      {open ? (
        <>
          <p className="no-print text-sm text-stone-500">Aktą atsispausdinkite arba išsaugokite PDF viršutinės juostos mygtukais.</p>
          <ActDocument act={open} />
        </>
      ) : (
        <p className="print-only text-sm">Pasirinkite aktą, kurį norite spausdinti.</p>
      )}
    </div>
  )
}
