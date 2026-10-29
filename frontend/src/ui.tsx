import { useEffect, useRef, useState, type ReactNode } from 'react'

// ---- Ikonos (linijinės, 24×24, spalva iš currentColor) ----
const ICONS = {
  factory: 'M2 20h20M4 20V10l5 3V10l5 3V6l6-2v16M8 16h1M13 16h1M17 16h1',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.2-6.1 2.4-.5 4.9-2 5.8-3.9',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M16 13H8M16 17H8M10 9H8',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h2a1.5 1.5 0 0 1 0 3H8v-3Zm0 3v2M14 13v5M14 13h3M14 15.5h2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z',
  lock: 'M5 11h14v11H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v11H5zM8 11V7a4 4 0 0 1 7.8-1.2',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8ZM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  chevron: 'm6 9 6 6 6-6',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  chart: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-8',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8ZM7 7h.01',
} as const
export type IconName = keyof typeof ICONS

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

/** noPrint - formos ir pan., kurių nereikia spausdinant / eksportuojant į PDF. */
export function Card({ title, children, actions, noPrint, icon, className = '' }: {
  title: ReactNode; children: ReactNode; actions?: ReactNode; noPrint?: boolean; icon?: IconName; className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-200 ${noPrint ? 'no-print' : ''} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#fbf7f2] px-5 py-3">
        <h2 className="flex items-center gap-2.5 text-lg font-bold text-stone-900">
          {icon && <span className="text-amber-800"><Icon name={icon} className="h-6 w-6" /></span>}
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export interface Col<T> {
  header: string
  render: (row: T) => ReactNode
  align?: 'right' | 'center'
}

const alignCls = (a?: 'right' | 'center') => (a === 'right' ? 'text-right tabular-nums' : a === 'center' ? 'text-center' : '')

export function Table<T extends { id: number | string }>({ cols, rows, empty = 'Nėra duomenų', rowClass }: {
  cols: Col<T>[]
  rows: T[]
  empty?: string
  rowClass?: (row: T) => string
}) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-stone-400">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-stone-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-100 text-stone-700">
            {cols.map((c, i) => (
              <th key={c.header || i} className="border-r border-stone-200 px-2.5 py-2 text-center font-semibold whitespace-nowrap last:border-r-0">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-stone-200 hover:bg-amber-50/40 ${rowClass?.(r) ?? ''}`}>
              {cols.map((c, i) => (
                <td key={c.header || i} className={`border-r border-stone-100 px-2.5 py-2 last:border-r-0 ${alignCls(c.align)}`}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Tone = 'stone' | 'green' | 'red' | 'amber' | 'blue' | 'yellow'

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    stone: 'bg-stone-200/70 text-stone-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-orange-100 text-orange-800',
    blue: 'bg-sky-100 text-sky-800',
    yellow: 'bg-amber-200 text-amber-950',
  }
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

/** L savaitės kodas - geltonas ženkliukas kaip makete. */
export const LWeekBadge = ({ code }: { code?: string | null }) => (code ? <Badge tone="yellow">{code}</Badge> : <>—</>)

export const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-700 disabled:bg-stone-50'

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
    </label>
  )
}

export function Err({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>
}

/** Raktas–reikšmė lentelė (Informacija, kortelės). */
export function InfoRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-stone-100 last:border-0">
            <td className="py-1.5 pr-2 text-stone-700">{k}</td>
            <td className="w-28 bg-sky-50 px-2 py-1.5 text-right font-semibold tabular-nums">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function IconBtn({ icon, title, onClick, tone = 'stone' }: { icon: IconName; title: string; onClick: () => void; tone?: 'stone' | 'red' }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={`rounded p-1 ${tone === 'red' ? 'text-red-600 hover:bg-red-50' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`}>
      <Icon name={icon} />
    </button>
  )
}

/** Mygtukas su išskleidžiamu meniu (viršutinė juosta: Spausdinti / Eksportuoti į PDF / Nustatymai). */
export function Dropdown({ label, icon, items, disabled }: {
  label: string; icon: IconName; disabled?: boolean
  items: ({ label: string; icon?: IconName; onClick: () => void } | 'sep')[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-amber-50 disabled:opacity-60">
        <Icon name={icon} className={`h-4 w-4 ${icon === 'pdf' ? 'text-red-600' : ''}`} />
        {label}
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 min-w-56 rounded-lg bg-white py-1 text-sm text-stone-800 shadow-lg ring-1 ring-stone-200">
          {items.map((it, i) => it === 'sep'
            ? <div key={i} className="my-1 border-t border-stone-100" />
            : (
              <button key={i} type="button" onClick={() => { setOpen(false); it.onClick() }}
                className="flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-1.5 text-left hover:bg-amber-50">
                <Icon name={it.icon ?? 'doc'} className="h-4 w-4 text-stone-500" />
                {it.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export const smallBtnCls = 'rounded px-2 py-0.5 text-xs text-stone-600 hover:bg-stone-100'
export const linkBtnCls = 'rounded px-1.5 py-0.5 text-sm text-stone-700 hover:bg-stone-100'
export const outlineBtnCls = 'rounded-md border border-amber-800 px-3 py-0.5 text-sm font-medium text-amber-900 hover:bg-amber-50'

export const btnCls =
  'rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50'
export const greenBtnCls =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50'
export const ghostBtnCls =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50'

export const fmtDate = (iso?: string | null) => (iso ? iso.slice(0, 10) : '—')
// Šiandienos data vietos laiku (toISOString() duotų UTC - po vidurnakčio LT būtų vakar)
export const todayIso = () => new Date().toLocaleDateString('sv-SE')
// Skaičiai lietuviškai: kablelis, tarpas tūkstančiams (1 245,60)
const num = (n: number, min: number, max: number) =>
  Number(n).toLocaleString('lt-LT', { minimumFractionDigits: min, maximumFractionDigits: max })
export const fmtKg = (n?: number | null) => (n == null ? '—' : num(n, 1, 3))
// Suma eurais (2 sk. po kablelio); vieneto kaina - iki 4, bet ne mažiau 2
export const fmtEur = (n?: number | null) => (n == null ? '—' : num(n, 2, 2))
export const fmtUnitEur = (n?: number | null) => (n == null ? '—' : num(n, 2, 4))
export const fmtPct = (n?: number | null) => (n == null ? '—' : num(n, 1, 1))
