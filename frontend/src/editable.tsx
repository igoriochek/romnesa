import { useState, type ReactNode } from 'react'
import { Icon, inputCls } from './ui'

// ---- Eilučių tempimas pele (už ⠿ rankenėlės) ----

/**
 * Tempimas pele sąrašo tvarkai keisti. Eilutė tempiama tik už rankenėlės,
 * kad laukuose būtų galima žymėti tekstą.
 */
export function useDragSort<T>(items: T[], onReorder: (items: T[]) => void) {
  const [armed, setArmed] = useState<number | null>(null)   // eilutė, kurios rankenėlė paspausta
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const handle = (i: number) => ({
    onMouseDown: () => setArmed(i),
    onMouseUp: () => setArmed(null),
    onTouchStart: () => setArmed(i),
  })

  const row = (i: number) => ({
    draggable: armed === i,
    onDragStart: (e: React.DragEvent) => { setFrom(i); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e: React.DragEvent) => { if (from !== null) { e.preventDefault(); setOver(i) } },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (from !== null && from !== i) {
        const next = [...items]
        const [moved] = next.splice(from, 1)
        next.splice(i, 0, moved)
        onReorder(next)
      }
      setFrom(null); setOver(null); setArmed(null)
    },
    onDragEnd: () => { setFrom(null); setOver(null); setArmed(null) },
    className: over === i && from !== null && from !== i ? 'outline-2 -outline-offset-2 outline-dashed outline-green-600' : from === i ? 'opacity-40' : '',
  })

  return { handle, row }
}

export function DragHandle(props: { onMouseDown: () => void; onMouseUp: () => void; onTouchStart: () => void }) {
  return (
    <span {...props} title="Tempkite, kad pakeistumėte tvarką" className="no-print inline-flex cursor-grab items-center text-stone-500 active:cursor-grabbing">
      <Icon name="grip" className="h-5 w-5" />
    </span>
  )
}

/** Mažas ikonos mygtukas eilutės veiksmams (redaguoti / išsaugoti / atšaukti / trinti). */
export function ActionBtn({ icon, title, onClick, tone, disabled }: {
  icon: 'edit' | 'trash' | 'check' | 'x' | 'copy' | 'up' | 'chevron' | 'lock' | 'unlock'
  title: string; onClick: () => void; tone: 'green' | 'red' | 'stone'; disabled?: boolean
}) {
  const cls = { green: 'text-green-700 hover:bg-green-50', red: 'text-red-600 hover:bg-red-50', stone: 'text-stone-600 hover:bg-stone-100' }[tone]
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`no-print rounded-md p-1.5 disabled:opacity-40 ${cls}`}>
      <Icon name={icon} className="h-5 w-5" />
    </button>
  )
}

// ---- Redaguojama klasifikatoriaus lentelė ----

export interface EditCol<T> {
  key: string
  label: ReactNode
  type?: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  width?: string                     // pvz. 'w-24'
  placeholder?: string
  step?: string
  required?: boolean
  value: (row: T) => string          // reikšmė formai
}

type Draft = Record<string, string>

/**
 * Klasifikatoriaus sąrašas: ⠿ tempimas, laukai, ✎ redaguoti (→ ✓ išsaugoti / ✕ atšaukti), 🗑 trinti.
 * Nauja eilutė pridedama viršuje ir iškart atidaroma redagavimui.
 */
export function EditableTable<T extends { id: number }>({ rows, cols, onCreate, onUpdate, onDelete, onReorder, adding, onAddDone, deleteLabel }: {
  rows: T[]
  cols: EditCol<T>[]
  onCreate: (d: Draft) => Promise<void>
  onUpdate: (row: T, d: Draft) => Promise<void>
  onDelete: (row: T) => Promise<void>
  onReorder: (rows: T[]) => void
  adding: boolean                    // tėvinis „+ Pridėti“ mygtukas
  onAddDone: () => void
  deleteLabel: (row: T) => string
}) {
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [busy, setBusy] = useState(false)
  const drag = useDragSort(rows, onReorder)

  const empty = (): Draft => Object.fromEntries(cols.map((c) => [c.key, c.type === 'select' ? (c.options?.[0]?.value ?? '') : '']))
  const [newDraft, setNewDraft] = useState<Draft>(empty)

  const startEdit = (r: T) => { setEditId(r.id); setDraft(Object.fromEntries(cols.map((c) => [c.key, c.value(r)]))) }
  const valid = (d: Draft) => cols.every((c) => !c.required || d[c.key]?.trim())

  // klaidą parodo tėvinis komponentas (jis ją ir išmeta) - čia tik neuždarom redagavimo
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } catch { /* rodoma virš lentelės */ } finally { setBusy(false) } }

  const field = (c: EditCol<T>, d: Draft, set: (d: Draft) => void, disabled: boolean) => {
    const common = { disabled, className: `${inputCls} ${disabled ? '!bg-white !text-stone-900' : 'bg-amber-50/40'}` }
    if (c.type === 'select') return (
      <select {...common} value={d[c.key]} onChange={(e) => set({ ...d, [c.key]: e.target.value })}>
        {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
    return (
      <input {...common} type={c.type === 'number' ? 'number' : 'text'} step={c.step} min={c.type === 'number' ? 0 : undefined}
        value={d[c.key]} placeholder={disabled ? '' : c.placeholder}
        onChange={(e) => set({ ...d, [c.key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { if (editId !== null) setEditId(null); else onAddDone() }
        }} />
    )
  }

  const th = 'px-2 py-2 text-left text-sm font-semibold text-stone-800'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f3e9da]">
            <th className="w-8" />
            {cols.map((c) => <th key={c.key} className={`${th} ${c.width ?? ''}`}>{c.label}</th>)}
            <th className={`${th} no-print w-24 text-center`}>Veiksmai</th>
          </tr>
        </thead>
        <tbody>
          {adding && (
            <tr className="border-b border-stone-100 bg-green-50/50">
              <td />
              {cols.map((c) => <td key={c.key} className="px-2 py-1.5">{field(c, newDraft, setNewDraft, false)}</td>)}
              <td className="px-1 text-center whitespace-nowrap">
                <ActionBtn icon="check" title="Išsaugoti" tone="green" disabled={busy || !valid(newDraft)}
                  onClick={() => run(async () => { await onCreate(newDraft); setNewDraft(empty()); onAddDone() })} />
                <ActionBtn icon="x" title="Atšaukti" tone="stone" onClick={() => { setNewDraft(empty()); onAddDone() }} />
              </td>
            </tr>
          )}
          {rows.map((r, i) => {
            const editing = editId === r.id
            const d = editing ? draft : Object.fromEntries(cols.map((c) => [c.key, c.value(r)]))
            const dr = drag.row(i)
            return (
              <tr key={r.id} {...dr} className={`border-b border-stone-100 last:border-0 ${editing ? 'bg-amber-50/60' : ''} ${dr.className}`}>
                <td className="pl-1"><DragHandle {...drag.handle(i)} /></td>
                {cols.map((c) => <td key={c.key} className="px-2 py-1.5">{field(c, d, setDraft, !editing)}</td>)}
                <td className="px-1 text-center whitespace-nowrap">
                  {editing ? (
                    <>
                      <ActionBtn icon="check" title="Išsaugoti" tone="green" disabled={busy || !valid(draft)}
                        onClick={() => run(async () => { await onUpdate(r, draft); setEditId(null) })} />
                      <ActionBtn icon="x" title="Atšaukti" tone="stone" onClick={() => setEditId(null)} />
                    </>
                  ) : (
                    <>
                      <ActionBtn icon="edit" title="Redaguoti" tone="green" onClick={() => startEdit(r)} />
                      <ActionBtn icon="trash" title="Ištrinti" tone="red" disabled={busy}
                        onClick={() => { if (window.confirm(`Ištrinti „${deleteLabel(r)}“?`)) run(() => onDelete(r)) }} />
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && !adding && <p className="py-4 text-center text-sm text-stone-400">Nėra įrašų</p>}
    </div>
  )
}
