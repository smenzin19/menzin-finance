import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { insertOwned } from '../lib/db'
import starter from '../data/starterData.json'

// Pushes the data extracted from Menzin_Finances.xlsx into the user's tables.
// Safe to expose once; it no-ops if accounts already exist.
export default function ImportStarter({ onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function run() {
    setBusy(true); setMsg(null)
    try {
      const { count } = await supabase.from('accounts').select('id', { count: 'exact', head: true })
      if (count > 0) { setMsg('You already have accounts — import skipped to avoid duplicates.'); setBusy(false); return }

      // 1) accounts
      const acctRows = starter.accounts.map(([name, type, group, liab], i) => ({
        name, account_type: type, group, is_liability: liab, sort_order: i,
      }))
      const { data: accts, error: e1 } = await insertOwned('accounts', acctRows)
      if (e1) throw e1
      const byName = Object.fromEntries(accts.map(a => [a.name, a.id]))

      // 2) balance snapshots
      const snapRows = []
      for (const s of starter.snapshots)
        for (const [name, bal] of Object.entries(s.balances))
          if (byName[name]) snapRows.push({ account_id: byName[name], snapshot_date: s.date, balance: bal })
      const { error: e2 } = await insertOwned('balance_snapshots', snapRows)
      if (e2) throw e2

      // 3) budget categories
      const catRows = starter.budget_categories.map((c, i) => ({ name: c.name, sort_order: i }))
      const { data: cats, error: e3 } = await insertOwned('budget_categories', catRows)
      if (e3) throw e3
      const catId = Object.fromEntries(cats.map(c => [c.name, c.id]))

      // 4) budget entries
      const entRows = []
      for (const c of starter.budget_categories)
        for (const [month, amount] of Object.entries(c.entries))
          entRows.push({ category_id: catId[c.name], month, amount })
      const { error: e4 } = await insertOwned('budget_entries', entRows)
      if (e4) throw e4

      setMsg('Imported your history. Reloading…')
      setTimeout(() => onDone?.(), 700)
    } catch (err) {
      setMsg('Import failed: ' + err.message)
    }
    setBusy(false)
  }

  return (
    <div className="card card-pad" style={{ textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
      <h2 className="section-title">Welcome — let's bring your data in</h2>
      <p className="muted" style={{ marginBottom: 18 }}>
        Import the {starter.accounts.length} accounts and {starter.snapshots.length} monthly snapshots
        from your spreadsheet, plus {starter.budget_categories.length} budget categories. You can edit everything afterward.
      </p>
      {msg && <div className="banner info" style={{ marginBottom: 16 }}>{msg}</div>}
      <button className="btn" disabled={busy} onClick={run} style={{ margin: '0 auto' }}>
        {busy ? 'Importing…' : 'Import my Excel history'}
      </button>
      <div className="divider" />
      <button className="btn ghost sm" onClick={() => onDone?.()} style={{ margin: '0 auto' }}>
        Start empty instead
      </button>
    </div>
  )
}
