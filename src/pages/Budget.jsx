import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { insertOwned, fmtUSD } from '../lib/db'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Budget() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [cats, setCats] = useState([])
  const [entries, setEntries] = useState({})  // `${catId}|${monthIso}` -> amount
  const [newCat, setNewCat] = useState('')

  const monthIso = m => `${year}-${String(m + 1).padStart(2, '0')}-01`

  async function load() {
    const { data: c } = await supabase.from('budget_categories').select('*').order('sort_order')
    setCats(c || [])
    const from = `${year}-01-01`, to = `${year}-12-01`
    const { data: e } = await supabase.from('budget_entries').select('*').gte('month', from).lte('month', to)
    setEntries(Object.fromEntries((e || []).map(r => [`${r.category_id}|${r.month}`, Number(r.amount)])))
  }
  useEffect(() => { load() }, [year])

  async function setCell(catId, m, raw) {
    const key = `${catId}|${monthIso(m)}`
    const amount = raw === '' ? null : (parseFloat(raw) || 0)
    setEntries(prev => { const n = { ...prev }; if (amount == null) delete n[key]; else n[key] = amount; return n })
    if (amount == null) {
      await supabase.from('budget_entries').delete().eq('category_id', catId).eq('month', monthIso(m))
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('budget_entries').upsert(
        { user_id: user.id, category_id: catId, month: monthIso(m), amount },
        { onConflict: 'category_id,month' })
    }
  }

  async function addCat() {
    if (!newCat.trim()) return
    await insertOwned('budget_categories', { name: newCat.trim(), sort_order: cats.length })
    setNewCat(''); load()
  }

  async function delCat(id) {
    if (!confirm('Delete this category and all its entries?')) return
    await supabase.from('budget_categories').delete().eq('id', id)
    load()
  }

  const rowTotal = id => MONTHS.reduce((s, _, m) => s + (entries[`${id}|${monthIso(m)}`] || 0), 0)
  const rowCount = id => MONTHS.filter((_, m) => entries[`${id}|${monthIso(m)}`] !== undefined).length
  const colTotal = m => cats.reduce((s, c) => s + (entries[`${c.id}|${monthIso(m)}`] || 0), 0)
  const grandTotal = cats.reduce((s, c) => s + rowTotal(c.id), 0)

  return (
    <>
      <div className="page-head">
        <div><h1>Budget</h1><p>Negative = expense · positive = income. Net for {year}: <span className={grandTotal < 0 ? 'neg' : 'pos'}>{fmtUSD(grandTotal)}</span></p></div>
      </div>

      <div className="toolbar">
        <div className="field">
          <label>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {[year - 2, year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map(y => <option key={y}>{y}</option>)}
            {![2024, 2025, 2026].includes(year) && [2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="spacer" />
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label>New category</label>
          <input value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCat()} placeholder="e.g. Groceries" />
        </div>
        <button className="btn" onClick={addCat}>Add category</button>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--card)' }}>Category</th>
                {MONTHS.map(m => <th key={m} className="num">{m}</th>)}
                <th className="num">Total</th><th className="num">Avg</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => {
                const t = rowTotal(c.id), n = rowCount(c.id)
                return (
                  <tr key={c.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--card)' }}>{c.name}</td>
                    {MONTHS.map((_, m) => {
                      const v = entries[`${c.id}|${monthIso(m)}`]
                      return (
                        <td key={m} className="num">
                          <input className="cell-input" inputMode="decimal" defaultValue={v ?? ''}
                            key={`${c.id}-${m}-${year}-${v}`}
                            onBlur={e => { if (e.target.value !== String(v ?? '')) setCell(c.id, m, e.target.value) }} />
                        </td>
                      )
                    })}
                    <td className={'num ' + (t < 0 ? 'neg' : t > 0 ? 'pos' : '')} style={{ fontWeight: 600 }}>{fmtUSD(t)}</td>
                    <td className="num">{n ? fmtUSD(t / n) : '—'}</td>
                    <td className="row-actions"><button className="icon-btn" onClick={() => delCat(c.id)}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--card)' }}>Monthly net</td>
                {MONTHS.map((_, m) => {
                  const t = colTotal(m)
                  return <td key={m} className={'num ' + (t < 0 ? 'neg' : t > 0 ? 'pos' : '')} style={{ fontWeight: 600 }}>{t ? fmtUSD(t) : '—'}</td>
                })}
                <td className={'num ' + (grandTotal < 0 ? 'neg' : 'pos')} style={{ fontWeight: 700 }}>{fmtUSD(grandTotal)}</td>
                <td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {cats.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>No categories yet — add one above, or import your spreadsheet from the Net Worth tab.</p>}
    </>
  )
}
