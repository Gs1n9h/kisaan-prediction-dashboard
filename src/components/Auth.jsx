import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Auth({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [usePassword, setUsePassword] = useState(false)

  async function handleMagicLink(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      setMessage('Check your email for the sign-in link.')
    } catch (err) {
      setMessage(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Check your email for the confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSuccess?.()
      }
    } catch (err) {
      setMessage(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-card">
      <h1>Kisaan demand prediction</h1>
      <p className="auth-subtitle">
        {usePassword ? 'Sign in with your password' : 'Sign in — we’ll send you a link by email'}
      </p>

      {!usePassword ? (
        <>
          <form onSubmit={handleMagicLink}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <button type="submit" disabled={loading}>
              {loading ? '…' : 'Send magic link'}
            </button>
          </form>
          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setUsePassword(true)
              setMessage('')
            }}
          >
            Sign in with password instead
          </button>
        </>
      ) : (
        <>
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isSignUp}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
            <button type="submit" disabled={loading}>
              {loading ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>
          <button
            type="button"
            className="auth-toggle"
            onClick={() => setIsSignUp((v) => !v)}
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setUsePassword(false)
              setMessage('')
            }}
          >
            Use magic link instead
          </button>
        </>
      )}

      {message && <p className="auth-message">{message}</p>}
    </div>
  )
}
