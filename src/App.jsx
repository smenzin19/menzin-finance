import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { TrendingUp, Wallet, PieChart, Repeat, LogOut } from 'lucide-react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import NetWorth from './pages/NetWorth'
import Accounts from './pages/Accounts'
import Budget from './pages/Budget'
import Recurring from './pages/Recurring'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Auth />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Menzin<br/>Finance<small>Net worth · Budget</small></div>
        <NavLink to="/" end className="nav-link"><TrendingUp size={17}/> Net Worth</NavLink>
        <NavLink to="/accounts" className="nav-link"><Wallet size={17}/> Accounts</NavLink>
        <NavLink to="/budget" className="nav-link"><PieChart size={17}/> Budget</NavLink>
        <NavLink to="/recurring" className="nav-link"><Repeat size={17}/> Recurring</NavLink>
        <div className="nav-spacer" />
        <button className="nav-link" style={{ border: 'none', background: 'none', textAlign: 'left' }}
          onClick={() => supabase.auth.signOut()}>
          <LogOut size={17}/> Sign out
        </button>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<NetWorth />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
