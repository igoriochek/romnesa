import { useState, type FormEvent } from 'react'
import { changePassword, errText, type User } from '../api'
import { btnCls, Err, Field, inputCls } from '../ui'

/** Slaptažodžio keitimas. forced - numatytasis slaptažodis, be pakeitimo toliau neleidžiama. */
export default function ChangePasswordForm({ forced, onDone, onCancel }: {
  forced?: boolean
  onDone: (user: User) => void
  onCancel?: () => void
}) {
  const [f, setF] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      onDone((await changePassword(f)).data)
    } catch (e2) {
      setErr(errText(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 text-stone-800 shadow-lg ring-1 ring-stone-200">
      <h2 className="text-lg font-semibold text-amber-900">Slaptažodžio keitimas</h2>
      {forced && (
        <p className="mt-1 text-sm text-stone-600">
          Naudojate numatytąjį slaptažodį. Saugumo sumetimais jį reikia pakeisti prieš tęsiant darbą.
        </p>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Dabartinis slaptažodis">
          <input type="password" className={inputCls} value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} autoComplete="current-password" required autoFocus />
        </Field>
        <Field label="Naujas slaptažodis (bent 8 simboliai, raidės ir skaičiai)">
          <input type="password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Pakartokite naują slaptažodį">
          <input type="password" className={inputCls} value={f.password_confirmation} onChange={(e) => setF({ ...f, password_confirmation: e.target.value })} autoComplete="new-password" minLength={8} required />
        </Field>
      </div>
      <Err msg={err} />
      <div className="mt-5 flex gap-2">
        <button className={`${btnCls} flex-1 py-2`} disabled={busy}>{busy ? 'Saugoma…' : 'Pakeisti slaptažodį'}</button>
        {onCancel && <button type="button" className="rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100" onClick={onCancel}>Atšaukti</button>}
      </div>
    </form>
  )
}
