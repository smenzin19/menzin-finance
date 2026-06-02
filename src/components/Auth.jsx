import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    if (error) setMsg({ type: 'err', text: error.message })
    else if (mode === 'signup') setMsg({ type: 'info', text: 'Account created. Check your email if confirmation is required, then sign in.' })
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <div className="card card-pad auth-card">
        <div className="brand">Menzin Finance<small>Net worth · Budget</small></div>
        {msg && <div className={`banner ${msg.type}`}>{msg.text}</div>}
        <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required minLength={6} value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="divider" />
        <p className="muted" style={{ textAlign: 'center' }}>
          {mode === 'signin' ? 'No account yet?' : 'Already registered?'}{' '}
          <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null) }}
            style={{ color: 'var(--forest)', fontWeight: 600 }}>
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  )
}
