import { useEffect, useState, useMemo } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { insertOwned, fmtUSD, fmtPct, fmtMonth, fmtDate, GROUPS } from '../lib/db'
import ImportStarter from '../components/ImportStarter'

const GROUP_COLOR = { Cash: '#2f6b4f', Business: '#a6802a', Investment: '#3a6ea5', Retirement: '#7a5ba6' }

export default function NetWorth() {
  const [accounts, setAccounts] = useState(null)
  const [snaps, setSnaps] = useState([])     // net_worth_by_date rows
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    const { data: accts } = await supabase.from('accounts').select('*').eq('archived', false).order('sort_order')
    const { data: nw } = await supabase.from('net_worth_by_date').select('*')
    setAccounts(accts || [])
    setSnaps(nw || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (loading) return null
  if (accounts.length === 0) return <ImportStarter onDone={load} />

  const latest = snaps[snaps.length - 1]
  const prev = snaps[snaps.length - 2]
  const delta = latest && prev ? latest.total - prev.total : null
  const pct = latest && prev ? (latest.total - prev.total) / prev.total : null

  const chartData = snaps.map(s => ({
    date: fmtMonth(s.snapshot_date),
    Total: Number(s.total),
  }))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Net Worth</h1>
          <p>{snaps.length} snapshots · latest {latest ? fmtDate(latest.snapshot_date) : '—'}</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}>+ New snapshot</button>
      </div>

      <div className="grid stat-grid" style={{ marginBottom: 18 }}>
        <Stat label="Total Net Worth" value={fmtUSD(latest?.total)}
          sub={delta != null ? `${fmtUSD(delta)} (${fmtPct(pct)}) vs prior` : 'first snapshot'}
          deltaSign={delta} />
        {GROUPS.map(g => (
          <Stat key={g} label={g} value={fmtUSD(latest?.[g.toLowerCase()])} accent={GROUP_COLOR[g]} />
        ))}
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-title">Trajectory</div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f6b4f" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2f6b4f" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e0dccf" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b675e' }} tickLine={false} axisLine={{ stroke: '#e0dccf' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b675e' }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
              <Tooltip formatter={v => fmtUSD(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e0dccf', fontFamily: 'IBM Plex Mono' }} />
              <Area type="monotone" dataKey="Total" stroke="#2f6b4f" strokeWidth={2.5} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 4 }}><div className="section-title">History</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Date</th><th className="num">Total</th>{GROUPS.map(g => <th key={g} className="num">{g}</th>)}<th className="num">Δ</th><th className="num">%</th></tr>
            </thead>
            <tbody>
              {[...snaps].reverse().map((s, i, arr) => {
                const p = arr[i + 1]
                const d = p ? s.total - p.total : null
                const pct = p && p.total ? (s.total - p.total) / Math.abs(p.total) : null
                return (
                  <tr key={s.snapshot_date}>
                    <td>{fmtDate(s.snapshot_date)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtUSD(s.total)}</td>
                    {GROUPS.map(g => <td key={g} className="num">{fmtUSD(s[g.toLowerCase()])}</td>)}
                    <td className={'num ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '')}>{d != null ? fmtUSD(d) : '—'}</td>
                    <td className={'num ' + (pct > 0 ? 'pos' : pct < 0 ? 'neg' : '')}>{pct != null ? fmtPct(pct) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <SnapshotModal accounts={accounts} lastDate={latest?.snapshot_date}
        onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </>
  )
}

function Stat({ label, value, sub, accent, deltaSign }) {
  return (
    <div className="card card-pad stat">
      <div className="label" style={accent ? { color: accent } : null}>{label}</div>
      <div className="value">{value}</div>
      {sub && <div className={'sub ' + (deltaSign > 0 ? 'pos' : deltaSign < 0 ? 'neg' : '')}>{sub}</div>}
    </div>
  )
}

function SnapshotModal({ accounts, lastDate, onClose, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  // Prefill with the most recent balance per account for quick editing.
  useEffect(() => {
    if (!lastDate) return
    supabase.from('balance_snapshots').select('account_id,balance').eq('snapshot_date', lastDate)
      .then(({ data }) => setVals(Object.fromEntries((data || []).map(r => [r.account_id, String(r.balance)]))))
  }, [lastDate])

  const total = useMemo(
    () => accounts.reduce((s, a) => s + (parseFloat(vals[a.id]) || 0), 0),
    [vals, accounts])

  async function save() {
    setBusy(true); setErr(null)
    const rows = accounts
      .filter(a => vals[a.id] !== undefined && vals[a.id] !== '')
      .map(a => ({ account_id: a.id, snapshot_date: date, balance: parseFloat(vals[a.id]) || 0 }))
    const { error } = await insertOwned('balance_snapshots', rows)
    if (error) { setErr(error.message); setBusy(false); return }
    onSaved()
  }

  return (
    <div className="auth-wrap" style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.35)', zIndex: 50 }} onClick={onClose}>
      <div className="card card-pad" style={{ width: 'min(560px,94vw)', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h2 className="section-title">New snapshot</h2>
        {err && <div className="banner err">{err}</div>}
        <div className="field" style={{ marginBottom: 16, maxWidth: 200 }}>
          <label>Snapshot date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <table>
          <thead><tr><th>Account</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id}>
                <td>{a.name} {a.is_liability && <span className="pill liab">liability</span>}</td>
                <td className="num">
                  <input className="cell-input" inputMode="decimal" placeholder="0"
                    value={vals[a.id] ?? ''} onChange={e => setVals({ ...vals, [a.id]: e.target.value })} />
                </td>
              </tr>
            ))}
            <tr><td style={{ fontWeight: 600 }}>Total</td><td className="num" style={{ fontWeight: 600 }}>{fmtUSD(total)}</td></tr>
          </tbody>
        </table>
        <div className="row-actions" style={{ marginTop: 18 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save snapshot'}</button>
        </div>
      </div>
    </div>
  )
}
