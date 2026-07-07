import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtUSD } from '../lib/db'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DrillDown({ catName, year, onClose }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('imported_transactions')
        .select('tx_date, description, amount')
        .eq('category', catName)
        .gte('tx_date', `${year}-01-01`)
        .lte('tx_date', `${year}-12-31`)
        .order('tx_date', { ascending: false })
      setTransactions(data || [])
      setLoading(false)
    }
    load()
  }, [catName, year])

  const byMonth = {}
  for (const t of transactions) {
    const key = t.tx_date.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(t)
  }
  const months = Object.keys(byMonth).sort().reverse()
  const grandTotal = transactions.reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,24,.5)', zIndex: 70, display: 'grid', placeItems: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        className="card card-pad"
        style={{ width: 'min(600px,96vw)', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>{catName}</h2>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
              {year} · {transactions.length} transactions · <span className={grandTotal < 0 ? 'neg' : 'pos'}>{fmtUSD(grandTotal)}</span>
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {loading && <p className="muted">Loading…</p>}

        {!loading && transactions.length === 0 && (
          <p className="muted" style={{ textAlign: 'center' }}>
            No imported transactions for this category in {year}.<br/>
            <span style={{ fontSize: 12 }}>Only transactions imported via CSV appear here.</span>
          </p>
        )}

        {!loading && months.map(key => {
          const txs = byMonth[key]
          const [y, m] = key.split('-')
          const label = `${MONTH_NAMES[parseInt(m) - 1]} ${y}`
          const total = txs.reduce((s, t) => s + Number(t.amount), 0)
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
                <span className={'num ' + (total < 0 ? 'neg' : 'pos')} style={{ fontSize: 13, fontWeight: 600 }}>{fmtUSD(total)}</span>
              </div>
              <table>
                <tbody>
                  {txs.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12, color: 'var(--ink-soft)', width: 88, paddingTop: 6, paddingBottom: 6 }}>{t.tx_date}</td>
                      <td style={{ fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>{t.description}</td>
                      <td className={'num ' + (Number(t.amount) < 0 ? 'neg' : 'pos')} style={{ fontSize: 13 }}>{fmtUSD(Number(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
