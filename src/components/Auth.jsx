import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')   // 'signin' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      setMsg(error
        ? { type: 'err', text: error.message }
        : { type: 'info', text: 'Password reset email sent — check your inbox.' }
      )
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ type: 'err', text: error.message })
    }
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
          {mode === 'signin' && (
            <div className="field">
              <label>Password</label>
              <input type="password" required minLength={6} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          <button className="btn" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Send reset email'}
          </button>
        </form>
        <div className="divider" />
        <p className="muted" style={{ textAlign: 'center' }}>
          {mode === 'signin' ? 'Forgot your password?' : 'Remember it?'}{' '}
          <a href="#" onClick={e => { e.preventDefault(); setMode(mode === 'signin' ? 'reset' : 'signin'); setMsg(null) }}
            style={{ color: 'var(--forest)', fontWeight: 600 }}>
            {mode === 'signin' ? 'Reset it' : 'Back to sign in'}
          </a>
        </p>
      </div>
    </div>
  )
}
