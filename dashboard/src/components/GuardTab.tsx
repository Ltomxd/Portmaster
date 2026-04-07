import { useLang } from '../context/LangContext'
import type { GuardStatus, GuardEvent } from '../types'

export function GuardTab({ guards }: { guards: Record<string, GuardStatus> }) {
  const { T } = useLang()
  const entries = Object.entries(guards)
  const typeColor: Record<string, string> = { port_appeared: 'var(--green)', port_killed: 'var(--red2)', port_disappeared: 'var(--yellow)', port_changed: 'var(--blue)' }
  const typeLabel = (t: string) => ({ port_appeared: T('appeared'), port_killed: T('killed'), port_disappeared: T('closed'), port_changed: T('changed') }[t] ?? t)

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14 }}>{T('guard_title')}</div>
      {entries.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 36, opacity: .3 }}>🦝</span><div style={{ color: 'var(--muted)', fontSize: 13 }}>{T('no_guards')}</div></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
          {entries.map(([key, g]) => (
            <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, fontSize: 14 }}>Guard: {key}</span><span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500, background: g.running ? 'var(--red-glow)' : 'var(--surface2)', border: g.running ? '1px solid rgba(229,62,62,.3)' : '1px solid var(--border)', color: g.running ? 'var(--red2)' : 'var(--muted)' }}>{g.running ? `● ${T('active')}` : `○ ${T('inactive')}`}</span></div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>{(g.recentEvents ?? []).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{T('no_events')}</div> : [...g.recentEvents].reverse().slice(0, 10).map((ev: GuardEvent, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ color: 'var(--muted)', fontSize: 10, minWidth: 55 }}>{new Date(ev.timestamp).toLocaleTimeString()}</span><span style={{ color: typeColor[ev.type] ?? 'var(--text)', fontWeight: 500 }}>{typeLabel(ev.type)}</span><span style={{ color: 'var(--red2)', fontFamily: 'var(--mono)' }}>:{ev.port}</span>{ev.info?.process && <span style={{ color: 'var(--muted)' }}>{ev.info.process}</span>}</div>)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
