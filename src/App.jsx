import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'

export default function App() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(() => {
      if (cancelled) return
      setChecking(false)
    }, 5000)

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!cancelled) {
          setSession(s)
          setChecking(false)
        }
      })
      .catch(() => {
        if (!cancelled) setChecking(false)
      })
      .finally(() => clearTimeout(timeout))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  if (checking) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app auth-page">
        <Auth
          onSuccess={() => {
            supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <Dashboard />
    </div>
  )
}
