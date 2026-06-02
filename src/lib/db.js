import { supabase } from './supabase'

export const fmtUSD = (n, decimals = 0) =>
  (n == null || isNaN(n))
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }).format(n)

export const fmtPct = (n) =>
  (n == null || isNaN(n)) ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`

export const fmtMonth = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const GROUPS = ['Cash', 'Business', 'Investment', 'Retirement']

export const ACCOUNT_TYPES = [
  'checking', 'savings', 'treasury', 'savings_bond', 'credit_card',
  'business', 'brokerage', 'hsa', 'retirement', 'other',
]

// Insert helper that always stamps the current user id (required by RLS check).
export async function insertOwned(table, rows) {
  const { data: { user } } = await supabase.auth.getUser()
  const stamped = (Array.isArray(rows) ? rows : [rows]).map(r => ({ ...r, user_id: user.id }))
  return supabase.from(table).insert(stamped).select()
}
