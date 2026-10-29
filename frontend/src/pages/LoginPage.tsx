import { useState, type FormEvent } from 'react'
import { errText, login, type User } from '../api'
import { btnCls, Err, Field, inputCls } from '../ui'

export default function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await login(username.trim(), password))
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3ef] px-4 text-stone-800">
      <form onSubmit={submit} className="w-full max-w-sm overflow-hidden rounded-xl border-t-8 border-[#7a3410] bg-white p-6 shadow-sm ring-1 ring-stone-200">
        <h1 className="text-xl font-semibold tracking-tight text-amber-900">UAB „Romnesa“</h1>
        <p className="mb-5 text-sm text-stone-500">Šakočių apskaita — prisijungimas</p>

        <div className="space-y-3">
          <Field label="Vartotojo vardas">
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="Slaptažodis">
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
        </div>

        <Err msg={error} />

        <button type="submit" disabled={busy} className={`${btnCls} mt-5 w-full py-2`}>
          {busy ? 'Jungiamasi…' : 'Prisijungti'}
        </button>
      </form>
    </div>
  )
}
