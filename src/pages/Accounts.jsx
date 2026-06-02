import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { insertOwned, fmtUSD, GROUPS, ACCOUNT_TYPES } from '../lib/db'

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [latest, setLatest] = useState({})
  const [form, setForm] = useState({ name: '', account_type: 'checking', group: 'Cash', is_liability: false })
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('accounts').select('*').eq('archived', false).order('sort_order')
    setAccounts(data || [])
    // most recent balance per account
    const { data: nw } = await supabase.from('net_worth_by_date').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1)
    if (nw?.[0]) {
      const { data: bals } = await supabase.from('balance_snapshots').select('account_id,balance').eq('snapshot_date', nw[0].snapshot_date)
      setLatest(Object.fromEntries((bals || []).map(b => [b.account_id, Number(b.balance)])))
    }
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name.trim()) return
    setBusy(true)
    await insertOwned('accounts', { ...form, sort_order: accounts.length })
    setForm({ name: '', account_type: 'checking', group: 'Cash', is_liability: false })
    setBusy(false); load()
  }

  async function update(id, patch) {
    setAccounts(accounts.map(a => a.id === id ? { ...a, ...patch } : a))
    await supabase.from('accounts').update(patch).eq('id', id)
  }

  async function archive(id) {
    if (!confirm('Archive this account? Its history stays but it is hidden from new snapshots.')) return
    await supabase.from('accounts').update({ archived: true }).eq('id', id)
    load()
  }

  const totalByGroup = g => accounts.filter(a => a.group === g).reduce((s, a) => s + (latest[a.id] || 0), 0)

  return (
    <>
      <div className="page-head">
        <div><h1>Accounts</h1><p>{accounts.length} active accounts</p></div>
      </div>

      <div className="grid stat-grid" style={{ marginBottom: 18 }}>
        {GROUPS.map(g => (
          <div key={g} className="card card-pad stat">
            <div className="label">{g}</div>
            <div className="value">{fmtUSD(totalByGroup(g))}</div>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-title">Add account</div>
        <div className="toolbar">
          <div className="field" style={{ flex: 2, minWidth: 160 }}>
            <label>Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chase Checking" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Group</label>
            <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
              {GROUPS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Liability</label>
            <select value={form.is_liability ? 'yes' : 'no'} onChange={e => setForm({ ...form, is_liability: e.target.value === 'yes' })}>
              <option value="no">No</option><option value="yes">Yes</option>
            </select>
          </div>
          <button className="btn" disabled={busy} onClick={add}>Add</button>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Account</th><th>Type</th><th>Group</th><th className="num">Latest balance</th><th></th></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id}>
                  <td>{a.name} {a.is_liability && <span className="pill liab">liability</span>}</td>
                  <td>{a.account_type.replace('_', ' ')}</td>
                  <td>
                    <select className="pill" style={{ cursor: 'pointer' }} value={a.group}
                      onChange={e => update(a.id, { group: e.target.value })}>
                      {GROUPS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className={'num ' + ((latest[a.id] || 0) < 0 ? 'neg' : '')}>{fmtUSD(latest[a.id])}</td>
                  <td className="row-actions"><button className="icon-btn" onClick={() => archive(a.id)}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
