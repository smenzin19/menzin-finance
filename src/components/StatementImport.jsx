import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtUSD } from '../lib/db'

// Keyword rules: each entry maps keywords (lowercase) to a category name.
// The first matching rule wins. Add more rules here as you learn your patterns.
const RULES = [
  { keywords: ['uber', 'lyft', 'via '], category: 'Rideshare' },
  { keywords: ['mta', 'metro-north', 'path ', 'nj transit', 'lirr', 'transit'], category: 'Train/Subway' },
  { keywords: ['amazon', 'amzn'], category: 'Amazon' },
  { keywords: ['apple.com/bill', 'apple music'], category: 'Apple Music' },
  { keywords: ['icloud'], category: 'iCloud' },
  { keywords: ['equinox'], category: 'Equinox' },
  { keywords: ['spectrum', 'charter comm'], category: 'Spectrum' },
  { keywords: ['con ed', 'coned', 'consolidated edison'], category: 'ConED' },
  { keywords: ['cobra', 'health ins'], category: 'COBRA' },
  { keywords: ['venmo'], category: 'Venmo' },
  { keywords: ['zelle'], category: 'Zelle' },
  { keywords: ['mlb', 'mlb.tv'], category: 'MLB.tv' },
  { keywords: ['cvs', 'walgreens', 'vitamin', 'supplement'], category: 'CVS/Supplements' },
  { keywords: ['dry clean', 'laundry', 'prestige clean'], category: 'Dry Cleaning' },
  { keywords: ['doctor', 'medical', 'dentist', 'pharmacy', 'hospital'], category: 'Medical' },
  { keywords: ['upwork'], category: 'Upwork' },
  { keywords: ['barber', 'haircut', 'great clips', 'supercuts'], category: 'Haircut' },
  { keywords: ['irs ', 'tax', 'turbotax'], category: 'Taxes' },
  { keywords: ['doordash', 'grubhub', 'seamless', 'uber eats', 'restaurant',
               'pizza', 'sushi', 'diner', 'cafe', 'coffee', 'starbucks',
               'chipotle', 'shake shack', 'mcdonald', 'dunkin', 'bagel',
               'deli', 'bakery', 'tavern', 'grill', 'kitchen', 'eatery'], category: 'Food' },
]

function guessCategory(description) {
  const lower = description.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return rule.category
  }
  return 'Misc'
}

// Parse a Chase CSV export.
// Expected columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
function parseChaseCSV(text) {
  const lines = text.trim().split('\n')
  // Find header row
  const headerIdx = lines.findIndex(l => l.toLowerCase().includes('transaction date'))
  if (headerIdx === -1) return null

  const header = lines[headerIdx].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
  const dateCol = header.findIndex(h => h === 'transaction date')
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

export default function StatementImport({ cats, year, month, onClose, onApplied }) {
  const [transactions, setTransactions] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  const monthIso = `${year}-${String(month + 1).padStart(2, '0')}-01`

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseChaseCSV(ev.target.result)
      if (!parsed) {
        setError('Could not parse this file. Make sure it\'s a Chase CSV export.')
        return
      }
      setError(null)
      setTransactions(parsed.map(t => ({ ...t, category: guessCategory(t.desc), skip: false })))
    }
    reader.readAsText(file)
  }

  function setTxField(i, field, value) {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  async function apply() {
    setBusy(true)
    const active = transactions.filter(t => !t.skip)

    // Sum amounts by category
    const totals = {}
    for (const t of active) {
      totals[t.category] = (totals[t.category] || 0) + t.amount
    }

    const { data: { user } } = await supabase.auth.getUser()

    // Upsert each category total — adds to existing value if present
    for (const [catName, amount] of Object.entries(totals)) {
      const cat = cats.find(c => c.name === catName)
      if (!cat) continue

      // Get existing entry for this month
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

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.4)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 24 }}
      onClick={onClose}>
      <div className="card card-pad" style={{ width: 'min(780px,96vw)', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Import Chase statement → {MONTHS[month]} {year}</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {!transactions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="muted">Download your Chase statement as a CSV (Chase website → Accounts → Download → CSV), then upload it here.</p>
            {error && <div className="banner err">{error}</div>}
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
            <button className="btn" onClick={() => fileRef.current.click()}>Choose CSV file</button>
          </div>
        )}

        {transactions && (
          <>
            <p className="muted">{transactions.length} transactions found. Review categories, uncheck anything to skip, then click Apply.</p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => (
                    <tr key={i} style={{ opacity: t.skip ? 0.35 : 1 }}>
                      <td>
                        <input type="checkbox" checked={!t.skip} onChange={e => setTxField(i, 'skip', !e.target.checked)} />
                      </td>
                      <td style={{ fontSize: 13 }}>{t.date}</td>
                      <td style={{ fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</td>
                      <td className={'num ' + (t.amount < 0 ? 'neg' : 'pos')} style={{ fontSize: 13 }}>{fmtUSD(t.amount)}</td>
                      <td>
                        <select value={t.category} onChange={e => setTxField(i, 'category', e.target.value)}
                          style={{ fontSize: 13, border: '1px solid var(--line)', borderRadius: 7, padding: '3px 7px', background: '#fff' }}>
                          {cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn" disabled={busy} onClick={apply}>{busy ? 'Applying…' : `Apply ${transactions.filter(t=>!t.skip).length} transactions`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
