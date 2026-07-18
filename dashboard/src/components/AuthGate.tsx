import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import raccoon from '../assets/raccoon.jpg'

type Status = 'loading' | 'locked' | 'open'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { T } = useLang()
  const [status, setStatus] = useState<Status>('loading')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => {
      setStatus(!d.success || !d.enabled || d.authenticated ? 'open' : 'locked')
    }).catch(() => setStatus('open'))
  }, [])

  const login = async () => {
    if (!password) return
    setLoggingIn(true); setError(null)
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const d = await r.json()
      if (d.success) setStatus('open')
      else setError(d.error ?? T('login_failed'))
    } catch {
      setError(T('login_failed'))
    }
    setLoggingIn(false)
  }

  if (status === 'loading') return null
  if (status === 'open') return <>{children}</>

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 32, width: 'min(92vw, 360px)', boxShadow: '0 25px 60px rgba(0,0,0,.6)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--red)', margin: '0 auto 16px' }}>
          <img src={raccoon} alt="Portmaster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Portmaster</div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 20 }}>{T('login_prompt')}</div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') login() }}
          placeholder={T('password')}
          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 13, textAlign: 'center', marginBottom: 12, outline: 'none' }}
        />
        <button onClick={login} disabled={loggingIn || !password} style={{ width: '100%', background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.4)', color: 'var(--red2)', padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: loggingIn ? .6 : 1 }}>{loggingIn ? '…' : T('login')}</button>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red2)' }}>{error}</div>}
      </div>
    </div>
  )
}
