import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import StatementImport from '../components/StatementImport'
import RulesEditor from '../components/RulesEditor'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { supabase } from '../lib/supabase'
import { insertOwned, fmtUSD } from '../lib/db'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CURRENT_MONTH = new Date().getMonth()

export default function Budget() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [cats, setCats] = useState([])
  const [entries, setEntries] = useState({})  // `${catId}|${monthIso}` -> amount
  const [newCat, setNewCat] = useState('')
  const [sortBy, setSortBy] = useState('default')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [importing, setImporting] = useState(false)
  const [editingRules, setEditingRules] = useState(false)

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

  async function renameCat(id) {
    if (!editingName.trim()) return
    await supabase.from('budget_categories').update({ name: editingName.trim() }).eq('id', id)
    setEditingId(null)
    load()
  }

  const rowTotal = id => MONTHS.reduce((s, _, m) => s + (entries[`${id}|${monthIso(m)}`] || 0), 0)
  const rowCount = id => MONTHS.filter((_, m) => entries[`${id}|${monthIso(m)}`] !== undefined).length
  const colTotal = m => cats.reduce((s, c) => s + (entries[`${c.id}|${monthIso(m)}`] || 0), 0)
  const grandTotal = cats.reduce((s, c) => s + rowTotal(c.id), 0)

  const sortedCats = [...cats].sort((a, b) => {
    if (sortBy === 'alpha') return a.name.localeCompare(b.name)
    if (sortBy.startsWith('month-')) {
      const m = parseInt(sortBy.split('-')[1])
      return (entries[`${a.id}|${monthIso(m)}`] || 0) - (entries[`${b.id}|${monthIso(m)}`] || 0)
    }
    return 0
  })

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
        <div className="field">
          <label>Sort by</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="default">Default order</option>
            <option value="alpha">Alphabetical</option>
            {MONTHS.map((m, i) => <option key={i} value={`month-${i}`}>{m} amount</option>)}
          </select>
        </div>
        <div className="spacer" />
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label>New category</label>
          <input value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCat()} placeholder="e.g. Groceries" />
        </div>
        <button className="btn" onClick={addCat}>Add category</button>
        <button className="btn ghost" onClick={() => setEditingRules(true)}>Edit rules</button>
        <button className="btn ghost" onClick={() => setImporting(true)}>↑ Import statement</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Monthly net</div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MONTHS.map((m, i) => ({ month: m, income: Math.max(0, colTotal(i)), expense: Math.min(0, colTotal(i)) }))} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#e0dccf" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b675e' }} tickLine={false} axisLine={{ stroke: '#e0dccf' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b675e' }} tickLine={false} axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={48} />
              <Tooltip formatter={v => fmtUSD(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e0dccf' }} />
              <ReferenceLine y={0} stroke="#c0bdb4" />
              <Bar dataKey="income" fill="#2f6b4f" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expense" fill="#b3502f" radius={[0, 0, 4, 4]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--card)' }}>Category</th>
                {MONTHS.map((m, i) => <th key={m} className="num" style={i === CURRENT_MONTH && year === new Date().getFullYear() ? { background: '#e4ede7', color: '#2f6b4f' } : null}>{m}</th>)}
                <th className="num">Total</th><th className="num">Avg</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sortedCats.map(c => {
                const t = rowTotal(c.id), n = rowCount(c.id)
                return (
                  <tr key={c.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--card)' }}>
                      {editingId === c.id
                        ? <input autoFocus value={editingName} onChange={e => setEditingName(e.target.value)}
                            onBlur={() => renameCat(c.id)}
                            onKeyDown={e => { if (e.key === 'Enter') renameCat(c.id); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ border: '1px solid var(--forest)', borderRadius: 6, padding: '3px 7px', fontSize: 14, width: '100%' }} />
                        : <span style={{ cursor: 'pointer' }} title="Click to rename" onClick={() => { setEditingId(c.id); setEditingName(c.name) }}>{c.name}</span>
                      }
                    </td>
                    {MONTHS.map((_, m) => {
                      const v = entries[`${c.id}|${monthIso(m)}`]
                      const isCurrent = m === CURRENT_MONTH && year === new Date().getFullYear()
                      return (
                        <td key={m} className="num" style={isCurrent ? { background: '#e4ede7' } : null}>
                          <input className="cell-input" inputMode="decimal" defaultValue={v ?? ''}
                            key={`${c.id}-${m}-${year}-${v}`}
                            onBlur={e => { if (e.target.value !== String(v ?? '')) setCell(c.id, m, e.target.value) }} />
                        </td>
                      )
                    })}
                    <td className={'num ' + (t < 0 ? 'neg' : t > 0 ? 'pos' : '')} style={{ fontWeight: 600 }}>{fmtUSD(t)}</td>
                    <td className="num">{n ? fmtUSD(t / n) : '—'}</td>
                    <td className="row-actions" style={{ position: 'sticky', right: 0, background: 'var(--card)' }}><button className="icon-btn" onClick={() => delCat(c.id)}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
              <tr>
                <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--card)' }}>Monthly net</td>
                {MONTHS.map((_, m) => {
                  const t = colTotal(m)
                  const isCurrent = m === CURRENT_MONTH && year === new Date().getFullYear()
                  return <td key={m} className={'num ' + (t < 0 ? 'neg' : t > 0 ? 'pos' : '')} style={{ fontWeight: 600, ...(isCurrent ? { background: '#e4ede7' } : {}) }}>{t ? fmtUSD(t) : '—'}</td>
                })}
                <td className={'num ' + (grandTotal < 0 ? 'neg' : 'pos')} style={{ fontWeight: 700 }}>{fmtUSD(grandTotal)}</td>
                <td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {cats.length === 0 && <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>No categories yet — add one above, or import your spreadsheet from the Net Worth tab.</p>}
      {importing && <StatementImport cats={cats} onClose={() => setImporting(false)} onApplied={() => { setImporting(false); load() }} />}
      {editingRules && <RulesEditor cats={cats} onClose={() => setEditingRules(false)} />}
    </>
  )
}
