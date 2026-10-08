import type { ReactNode } from 'react'

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export interface Col<T> {
  header: string
  render: (row: T) => ReactNode
  align?: 'right'
}

export function Table<T extends { id: number | string }>({ cols, rows, empty = 'Nėra duomenų' }: {
  cols: Col<T>[]
  rows: T[]
  empty?: string
}) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-stone-400">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-stone-500">
            {cols.map((c) => (
              <th key={c.header} className={`px-2 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
              {cols.map((c) => (
                <td key={c.header} className={`px-2 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'green' | 'red' | 'amber' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-stone-500">{label}</span>
      {children}
    </label>
  )
}

export function Err({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>
}

export const btnCls =
  'rounded-lg bg-amber-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50'

export const fmtDate = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—')
// Šiandienos data vietos laiku (toISOString() duotų UTC - po vidurnakčio LT būtų vakar)
export const todayIso = () => new Date().toLocaleDateString('sv-SE')
export const fmtKg = (n?: number | null) => (n == null ? '—' : Number(n).toFixed(3).replace(/\.?0+$/, ''))
