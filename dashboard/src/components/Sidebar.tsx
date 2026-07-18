import { useEffect, useRef, useState } from 'react'
import raccoon from '../assets/raccoon.jpg'
import { useLang } from '../context/LangContext'
import type { WslInfo } from '../types'
import { AuditLogDialog } from './AuditLogDialog'

type Tab = 'overview' | 'docker' | 'pm2' | 'guard' | 'projects' | 'favorites'

interface Props {
  activeTab: Tab
  onTabChange: (t: Tab) => void
  counts: Record<Tab, number>
  wsl: WslInfo
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ activeTab, onTabChange, counts, wsl, isOpen = false, onClose }: Props) {
  const { lang, setLang, T } = useLang()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [configMsg, setConfigMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => setAuthEnabled(!!d.enabled)).catch(() => {})
  }, [])

  const savePassword = async () => {
    try {
      const r = await fetch('/api/auth/set-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) })
      const d = await r.json()
      if (d.success) {
        setAuthEnabled(!!newPw)
        setPwMsg({ text: newPw ? T('password_set') : T('password_cleared'), ok: true })
        setCurrentPw(''); setNewPw(''); setShowPwForm(false)
      } else {
        setPwMsg({ text: d.error ?? T('password_save_failed'), ok: false })
      }
    } catch {
      setPwMsg({ text: T('password_save_failed'), ok: false })
    }
    setTimeout(() => setPwMsg(null), 3000)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.reload()
  }

  const showMsg = (text: string, ok: boolean) => {
    setConfigMsg({ text, ok })
    setTimeout(() => setConfigMsg(null), 3000)
  }

  const exportConfig = async () => {
    try {
      const d = await fetch('/api/config/export').then(r => r.json())
      if (!d.success) { showMsg(T('config_export_failed'), false); return }
      const blob = new Blob([JSON.stringify(d.config, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'portmaster-config.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showMsg(T('config_export_failed'), false)
    }
  }

  const importConfig = async (file: File) => {
    try {
      const config = JSON.parse(await file.text())
      const d = await fetch('/api/config/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) }).then(r => r.json())
      showMsg(d.success ? T('config_import_ok') : (d.error ?? T('config_import_failed')), !!d.success)
    } catch {
      showMsg(T('config_import_failed'), false)
    }
  }

  const nav: { id: Tab; icon: string; label: string }[] = [
    { id: 'overview', icon: '⌂', label: T('overview') },
    { id: 'docker', icon: '🐳', label: T('docker') },
    { id: 'pm2', icon: '⟳', label: T('pm2') },
    { id: 'guard', icon: '⬡', label: T('guard') },
    { id: 'projects', icon: '📁', label: T('projects_title') },
    { id: 'favorites', icon: '★', label: T('favorites_title') },
  ]

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid var(--red)',
            animation: 'raccoonGlow 3s ease-in-out infinite',
            flexShrink: 0,
          }}>
            <img src={raccoon} alt="Portmaster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.3px', color: 'var(--text)' }}>Portmaster</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>by Ltomxd</div>
          </div>
        </div>

        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {nav.map(item => {
            const active = activeTab === item.id
            return (
              <button key={item.id} onClick={() => onTabChange(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                background: active ? 'var(--red-glow)' : 'transparent',
                border: active ? '1px solid rgba(229,62,62,.3)' : '1px solid transparent',
                color: active ? 'var(--red2)' : 'var(--muted)',
                fontSize: 13, fontWeight: active ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
              }}
              >
                <span style={{ fontSize: 14, opacity: active ? 1 : .5 }}>{item.icon}</span>
                {item.label}
                {counts[item.id] > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                    background: active ? 'rgba(229,62,62,.2)' : 'var(--surface3)',
                    color: active ? 'var(--red2)' : 'var(--muted)',
                    border: `1px solid ${active ? 'rgba(229,62,62,.35)' : 'var(--border)'}`,
                    padding: '1px 7px', borderRadius: 10,
                  }}>
                    {counts[item.id]}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Language / Idioma
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['en', 'es'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: lang === l ? 'var(--red-glow)' : 'var(--surface2)',
                border: `1px solid ${lang === l ? 'rgba(229,62,62,.4)' : 'var(--border)'}`,
                color: lang === l ? 'var(--red2)' : 'var(--muted)',
              }}>
                {l === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
              </button>
            ))}
          </div>

          {wsl.isWsl && (
            <div style={{
              marginTop: 10, fontSize: 11, padding: '5px 10px', borderRadius: 6, textAlign: 'center',
              background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', color: '#f59e0b',
            }}>
              ⊞ WSL{wsl.wslVersion} Active
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={exportConfig} title={T('config_export')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>⭳ {T('config_export')}</button>
            <button onClick={() => fileInputRef.current?.click()} title={T('config_import')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>⭱ {T('config_import')}</button>
            <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importConfig(f); e.target.value = '' }} />
          </div>
          {configMsg && (
            <div style={{ marginTop: 8, fontSize: 10, textAlign: 'center', color: configMsg.ok ? 'var(--green)' : 'var(--red2)' }}>{configMsg.text}</div>
          )}
          <button onClick={() => setAuditOpen(true)} style={{ width: '100%', marginTop: 8, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>📋 {T('audit_log_title')}</button>

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={() => setShowPwForm(s => !s)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>🔒 {authEnabled ? T('change_password') : T('set_password')}</button>
            {authEnabled && <button onClick={logout} style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>⏻ {T('logout')}</button>}
          </div>
          {showPwForm && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {authEnabled && <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder={T('current_password')} style={pwInput} />}
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') savePassword() }} placeholder={T('new_password_placeholder')} style={pwInput} />
              <button onClick={savePassword} style={{ padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(116,185,255,.15)', border: '1px solid rgba(116,185,255,.4)', color: 'var(--blue)' }}>{T('save')}</button>
            </div>
          )}
          {pwMsg && <div style={{ marginTop: 6, fontSize: 10, textAlign: 'center', color: pwMsg.ok ? 'var(--green)' : 'var(--red2)' }}>{pwMsg.text}</div>}
        </div>
      </aside>
      <AuditLogDialog open={auditOpen} onClose={() => setAuditOpen(false)} />
    </>
  )
}

const pwInput: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '6px 10px', fontSize: 11, outline: 'none' }
