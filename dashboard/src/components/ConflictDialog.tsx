import { useEffect } from 'react'
import { useLang } from '../context/LangContext'
import type { PortInfo } from '../types'
import type { LogTarget } from '../hooks/useLogSessions'

export interface Conflict { port: number; owners: PortInfo[] }

// A real conflict = one port claimed by more than one *distinct* owner.
// The same process listening on IPv4 + IPv6, or on TCP + UDP, shows up as
// several rows sharing the same PID — that is NOT a conflict, so we collapse
// rows by owner identity (PID when known, else by process name).
// When the dashboard runs unprivileged, the kernel hides the PID for
// sockets owned by other users (e.g. root's sshd/systemd-resolved) — those
// rows have pid=null AND process=null. Without an identity to compare we
// can't tell two such rows apart, so they're bucketed together per port
// instead of once per address family; otherwise every dual-stack root
// service would look like a conflict.
export function computeConflicts(ports: PortInfo[]): Conflict[] {
  const byPort = new Map<number, PortInfo[]>()
  for (const p of ports) {
    const arr = byPort.get(p.port)
    if (arr) arr.push(p); else byPort.set(p.port, [p])
  }
  const conflicts: Conflict[] = []
  for (const [port, list] of byPort) {
    const owners = new Map<string, PortInfo>()
    for (const p of list) {
      const key = p.pid != null ? `pid:${p.pid}` : p.process ? `proc:${p.source}:${p.process}` : `unknown:${p.source}`
      if (!owners.has(key)) owners.set(key, p)
    }
    if (owners.size > 1) conflicts.push({ port, owners: [...owners.values()] })
  }
  return conflicts.sort((a, b) => a.port - b.port)
}

interface Props {
  conflicts: Conflict[]
  protectedPorts: Set<number>
  onKill: (port: number, process: string | null) => void
  onProtect: (port: number, process: string | null) => void
  onInspect: (pid: number, port: number, process: string | null) => void
  onLogs: (target: LogTarget) => void
  onClose: () => void
}

export function ConflictDialog({ conflicts, protectedPorts, onKill, onProtect, onInspect, onLogs, onClose }: Props) {
  const { T } = useLang()
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid rgba(255,209,102,.3)', borderRadius: 12, padding: 24, width: 'min(94vw, 560px)', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{T('conflicts_title')}</div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>{T('conflicts_desc')}</div>

        {conflicts.length === 0 ? (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>{T('no_conflicts')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {conflicts.map(c => {
              const isProtected = protectedPorts.has(c.port)
              return (
              <div key={c.port} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: 'var(--surface2)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ background: 'var(--surface3)', border: '1px solid rgba(255,209,102,.35)', color: 'var(--yellow)', padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'var(--mono)' }}>:{c.port}</span>
                  {isProtected && <span title={T('protect_active')} style={{ fontSize: 12 }}>🛡</span>}
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{c.owners.length} {T('conflict_owners')}</span>
                </div>
                {c.owners.map((o, i) => (
                  <div key={`${o.pid ?? o.address}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{o.process ?? T('unknown_process')}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: o.source === 'windows' ? 'rgba(245,158,11,.1)' : 'var(--surface3)', border: '1px solid var(--border2)', color: o.source === 'windows' ? '#f59e0b' : 'var(--muted)' }}>{o.source === 'windows' ? 'Windows' : 'Host'}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{o.protocol}</span>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--mono)', marginTop: 2 }}>PID {o.pid ?? '—'} · {o.address}</div>
                    </div>
                    {o.pid != null && <button onClick={() => onInspect(o.pid!, c.port, o.process)} title={`${T('inspect_title')} :${c.port}`} style={{ background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '5px 9px', borderRadius: 7, fontSize: 13, flexShrink: 0 }}>🔎</button>}
                    {o.pid != null && <button onClick={() => onLogs({ kind: 'journal', id: o.pid!, title: o.process ?? `PID ${o.pid}`, subtitle: `:${c.port}` })} title={`${T('view_live_logs')} :${c.port}`} style={{ background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '5px 9px', borderRadius: 7, fontSize: 13, flexShrink: 0 }}>📜</button>}
                    <button onClick={() => onProtect(c.port, o.process)} title={`${isProtected ? T('protect_active') : T('protect')} :${c.port}`} style={{ background: isProtected ? 'rgba(56,217,169,.12)' : 'transparent', border: isProtected ? '1px solid rgba(56,217,169,.35)' : '1px solid var(--border2)', color: isProtected ? 'var(--green)' : 'var(--blue)', padding: '5px 9px', borderRadius: 7, fontSize: 13, flexShrink: 0 }}>🛡</button>
                    <button onClick={() => onKill(c.port, o.process)} title={`${T('kill_process')} :${c.port}`} style={{ background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.4)', color: 'var(--red2)', padding: '5px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{T('stop')}</button>
                  </div>
                ))}
              </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('cancel')}</button>
        </div>
      </div>
    </div>
  )
}
