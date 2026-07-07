import { useState, useRef, useEffect, Fragment } from 'react'
import { X, BookMarked, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtUSD } from '../lib/db'
import RulesEditor from './RulesEditor'

// Chase CSV: MM/DD/YYYY → YYYY-MM-01
function parseDateToMonthIso(dateStr) {
  const parts = dateStr.split('/')
  if (parts.length < 3) return null
  const [m, , y] = parts
  if (!m || !y) return null
  return `${y}-${m.padStart(2, '0')}-01`
}

function guessCategory(description, rules, catNames) {
  const lower = description.toLowerCase()
  for (const rule of rules) {
    const keywords = rule.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    if (keywords.some(k => k && lower.includes(k))) {
      return catNames.includes(rule.category) ? rule.category : null
    }
  }
  return null
}

function parseChaseCSV(text) {
  const lines = text.trim().split('\n')
  // Support both credit card format (Transaction Date) and checking format (Posting Date)
  const headerIdx = lines.findIndex(l => {
    const lower = l.toLowerCase()
    return lower.includes('transaction date') || lower.includes('posting date')
  })
  if (headerIdx === -1) return null

  const header = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
  const dateCol = header.findIndex(h => h === 'transaction date' || h === 'posting date')
  const descCol = header.findIndex(h => h === 'description')
  const amtCol  = header.findIndex(h => h === 'amount')
  if (dateCol === -1 || descCol === -1 || amtCol === -1) return null

  const rows = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 3) continue
    const date = cols[dateCol]
    const desc = cols[descCol]
    const amt  = parseFloat(cols[amtCol])
    if (!date || !desc || isNaN(amt)) continue
    rows.push({ date, desc, amount: amt })
  }
  return rows
}

export default function StatementImport({ cats, onClose, onApplied }) {
  const [rules, setRules] = useState([])
  const [transactions, setTransactions] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editingRules, setEditingRules] = useState(false)
  const [saveRuleFor, setSaveRuleFor] = useState(null)
  const [ruleKeyword, setRuleKeyword] = useState('')
  const [sortCol, setSortCol] = useState(null)   // 'date' | 'desc' | 'amount' | 'category'
  const [sortDir, setSortDir] = useState('asc')
  const fileRef = useRef()

  const catNames = cats.map(c => c.name)

  useEffect(() => { loadRules() }, [])

  async function loadRules() {
    const { data } = await supabase.from('categorization_rules').select('*').order('sort_order')
    setRules(data || [])
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseChaseCSV(ev.target.result)
      if (!parsed) {
        setError("Could not parse this file. Make sure it's a Chase CSV export.")
        return
      }
      setError(null)
      setTransactions(parsed.map((t, i) => ({
        ...t,
        _idx: i,
        monthIso: parseDateToMonthIso(t.date),
        category: guessCategory(t.desc, rules, catNames),
        skip: false,
      })))
    }
    reader.readAsText(file)
  }

  function setTxField(idx, field, value) {
    setTransactions(prev => prev.map(t => t._idx === idx ? { ...t, [field]: value } : t))
  }

  function openSaveRule(idx) {
    const t = transactions.find(t => t._idx === idx)
    const cleaned = t.desc.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ')
    setSaveRuleFor(i)
    setRuleKeyword(cleaned)
  }

  async function saveRule() {
    const t = transactions.find(t => t._idx === saveRuleFor)
    if (!ruleKeyword.trim() || !t.category) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('categorization_rules').insert({
      user_id: user.id,
      keywords: ruleKeyword.trim(),
      category: t.category,
      sort_order: rules.length,
    })
    setSaveRuleFor(null)
    setRuleKeyword('')
    loadRules()
  }

  async function apply() {
    setBusy(true)
    const active = transactions.filter(t => !t.skip && t.category && t.monthIso)

    // Sum by (category, monthIso) before upserting
    const grouped = {}
    for (const t of active) {
      const key = `${t.category}|||${t.monthIso}`
      grouped[key] = (grouped[key] || 0) + t.amount
    }

    const { data: { user } } = await supabase.auth.getUser()

    for (const [key, amount] of Object.entries(grouped)) {
      const sepIdx = key.indexOf('|||')
      const catName = key.slice(0, sepIdx)
      const monthIso = key.slice(sepIdx + 3)
      const cat = cats.find(c => c.name === catName)
      if (!cat) continue

      const { data: existing } = await supabase
        .from('budget_entries')
        .select('id, amount')
        .eq('category_id', cat.id)
        .eq('month', monthIso)
        .maybeSingle()

      const newAmount = existing ? Number(existing.amount) + amount : amount

      await supabase.from('budget_entries').upsert(
        { user_id: user.id, category_id: cat.id, month: monthIso, amount: newAmount },
        { onConflict: 'category_id,month' }
      )
    }

    setBusy(false)
    onApplied()
  }

  const needsCatCount = transactions ? transactions.filter(t => !t.skip && !t.category).length : 0
  const activeCount   = transactions ? transactions.filter(t => !t.skip && t.category && t.monthIso).length : 0

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const displayTxs = transactions ? [...transactions].sort((a, b) => {
    if (!sortCol) return 0
    let av, bv
    if (sortCol === 'date')     { av = a.date;     bv = b.date }
    if (sortCol === 'desc')     { av = a.desc;     bv = b.desc }
    if (sortCol === 'amount')   { av = a.amount;   bv = b.amount }
    if (sortCol === 'category') { av = a.category || ''; bv = b.category || '' }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  }) : []

  const SortHd = ({ col, children, className }) => {
    const active = sortCol === col
    return (
      <th className={className} onClick={() => toggleSort(col)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
      </th>
    )
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.4)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 24 }}
        onClick={editingRules ? undefined : onClose}
      >
        <div
          className="card card-pad"
          style={{ width: 'min(880px,96vw)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="section-title" style={{ margin: 0 }}>Import Chase statement</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn ghost" style={{ fontSize: 13 }} onClick={() => setEditingRules(true)}>
                Edit rules
              </button>
              <button className="icon-btn" onClick={onClose}><X size={16} /></button>
            </div>
          </div>

          {!transactions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="muted">
                Download your Chase statement as a CSV (Chase website → Accounts → Download → CSV), then upload it here.
                Transactions are distributed into the correct month automatically.
              </p>
              {error && <div className="banner err">{error}</div>}
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
              <button className="btn" onClick={() => fileRef.current.click()}>Choose CSV file</button>
            </div>
          )}

          {transactions && (
            <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <p className="muted" style={{ margin: 0 }}>
                  {transactions.length} transactions · {activeCount} will be applied
                </p>
                {needsCatCount > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#b3502f', fontSize: 13 }}>
                    <AlertCircle size={14} /> {needsCatCount} need a category
                  </span>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      <SortHd col="date">Date</SortHd>
                      <SortHd col="desc">Description</SortHd>
                      <SortHd col="amount" className="num">Amount</SortHd>
                      <SortHd col="category">Category</SortHd>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTxs.map(t => {
                      const idx = t._idx
                      const needsCat = !t.category
                      return (
                        <Fragment key={idx}>
                          <tr style={{
                            opacity: t.skip ? 0.35 : 1,
                            background: needsCat && !t.skip ? '#fff8f5' : undefined,
                          }}>
                            <td>
                              <input type="checkbox" checked={!t.skip}
                                onChange={e => setTxField(idx, 'skip', !e.target.checked)} />
                            </td>
                            <td style={{ fontSize: 13 }}>{t.date}</td>
                            <td style={{ fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={t.desc}>{t.desc}</td>
                            <td className={'num ' + (t.amount < 0 ? 'neg' : 'pos')} style={{ fontSize: 13 }}>
                              {fmtUSD(t.amount)}
                            </td>
                            <td>
                              <select
                                value={t.category || ''}
                                onChange={e => setTxField(idx, 'category', e.target.value)}
                                style={{
                                  fontSize: 13,
                                  border: `1px solid ${needsCat && !t.skip ? '#b3502f' : 'var(--line)'}`,
                                  borderRadius: 7,
                                  padding: '3px 7px',
                                  background: '#fff',
                                }}
                              >
                                {needsCat && <option value="">— assign category —</option>}
                                {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                            </td>
                            <td>
                              {!t.skip && t.category && (
                                <button
                                  className="icon-btn"
                                  title="Save as rule"
                                  onClick={() => saveRuleFor === idx ? setSaveRuleFor(null) : openSaveRule(idx)}
                                >
                                  <BookMarked size={13} />
                                </button>
                              )}
                            </td>
                          </tr>

                          {saveRuleFor === idx && (
                            <tr style={{ background: '#f0f5f2' }}>
                              <td colSpan={6} style={{ padding: '8px 12px' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                                  <span className="muted">Keyword:</span>
                                  <input
                                    autoFocus
                                    value={ruleKeyword}
                                    onChange={e => setRuleKeyword(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveRule(); if (e.key === 'Escape') setSaveRuleFor(null) }}
                                    placeholder="e.g. starbucks, coffee"
                                    style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '3px 8px', fontSize: 13, width: 200 }}
                                  />
                                  <span className="muted">→ {t.category}</span>
                                  <button className="btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={saveRule}>
                                    Save rule
                                  </button>
                                  <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSaveRuleFor(null)}>
                                    Dismiss
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button className="btn ghost" onClick={onClose}>Cancel</button>
                <button className="btn" disabled={busy || activeCount === 0} onClick={apply}>
                  {busy ? 'Applying…' : `Apply ${activeCount} transactions`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {editingRules && (
        <RulesEditor cats={cats} onClose={() => { setEditingRules(false); loadRules() }} />
      )}
    </>
  )
}
