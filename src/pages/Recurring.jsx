import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtUSD, fmtDate } from '../lib/db'

export default function Recurring() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('imported_transactions')
        .select('tx_date, description, amount, category')
        .order('tx_date')
      setRows(group(data || []))
    }
    load()
  }, [])

  if (rows === null) return null

  const yearAgo = new Date()
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const yearAgoIso = yearAgo.toISOString().slice(0, 10)
  const last12moTotal = rows.reduce((s, r) => s + r.txs.filter(t => t.tx_date >= yearAgoIso).reduce((a, t) => a + Number(t.amount), 0), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recurring</h1>
          <p>{rows.length} recurring charge{rows.length !== 1 ? 's' : ''} detected · trailing 12mo total <span className={last12moTotal < 0 ? 'neg' : 'pos'}>{fmtUSD(last12moTotal)}</span></p>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
          No recurring charges yet — a description needs to show up in 2+ different months of imported transactions to appear here.
        </p>
      )}

      {rows.length > 0 && (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="num">Occurrences</th>
                  <th className="num">Avg amount</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.description}>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                    <td>{r.category || <span className="muted">—</span>}</td>
                    <td className="num">{r.txs.length}</td>
                    <td className={'num ' + (r.avg < 0 ? 'neg' : 'pos')} style={{ fontWeight: 600 }}>{fmtUSD(r.avg)}</td>
                    <td>{fmtDate(r.lastDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function group(transactions) {
  const byDesc = {}
  for (const t of transactions) {
    if (!byDesc[t.description]) byDesc[t.description] = []
    byDesc[t.description].push(t)
  }
  return Object.entries(byDesc)
    .map(([description, txs]) => {
      const months = new Set(txs.map(t => t.tx_date.slice(0, 7)))
      const avg = txs.reduce((s, t) => s + Number(t.amount), 0) / txs.length
      const lastDate = txs.reduce((max, t) => t.tx_date > max ? t.tx_date : max, txs[0].tx_date)
      const category = [...txs].reverse().find(t => t.category)?.category ?? null
      return { description, txs, months, avg, lastDate, category }
    })
    .filter(r => r.months.size >= 2)
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))
}
