import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'

interface AuditEntry {
  timestamp: string
  action: 'kill' | 'guard_kill' | 'adopt'
  port: number
  process: string | null
  detail?: string
}

interface Props {
  open: boolean
  onClose: () => void
}

const ACTION_META: Record<AuditEntry['action'], { icon: string; color: string }> = {
  kill: { icon: '🗑', color: 'var(--red2)' },
  guard_kill: { icon: '🛡', color: 'var(--red2)' },
  adopt: { icon: '🔁', color: 'var(--green)' },
}

export function AuditLogDialog({ open, onClose }: Props) {
  const { T } = useLang()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/audit').then(r => r.json()).then(d => setEntries(d.success ? d.entries ?? [] : [])).finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 20, width: 'min(92vw, 560px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📋</span> {T('audit_log_title')}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, padding: '2px 6px' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('projects_loading')}…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('audit_log_empty')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((e, i) => {
                const meta = ACTION_META[e.action]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ fontSize: 14, color: meta.color }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {T(`audit_action_${e.action}`)} <span style={{ fontFamily: 'var(--mono)', color: 'var(--red2)' }}>:{e.port}</span>
                        {e.process && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {e.process}</span>}
                      </div>
                      {e.detail && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.detail}</div>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleString()}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
