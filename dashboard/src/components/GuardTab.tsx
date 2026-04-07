import { useMemo, useState, type CSSProperties } from 'react'
import { useLang } from '../context/LangContext'
import type { GuardStatus, GuardEvent } from '../types'

interface Props {
  guards: Record<string, GuardStatus>
  onCreate: (payload: { key: string; ports: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }) => Promise<any>
  onUpdate: (key: string, payload: { ports?: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }) => Promise<any>
  onDelete: (key: string) => Promise<any>
  onRefresh: () => void
}

export function GuardTab({ guards, onCreate, onUpdate, onDelete, onRefresh }: Props) {
  const { T } = useLang()
  const [portInput, setPortInput] = useState('3000')
  const [allowInput, setAllowInput] = useState('')
  const [autoKill, setAutoKill] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const entries = Object.entries(guards)
  const typeColor: Record<string, string> = { port_appeared: 'var(--green)', port_killed: 'var(--red2)', port_disappeared: 'var(--yellow)', port_changed: 'var(--blue)' }
  const typeLabel = (t: string) => ({ port_appeared: T('appeared'), port_killed: T('killed'), port_disappeared: T('closed'), port_changed: T('changed') }[t] ?? t)

  const parsedPorts = useMemo(() => portInput.split(',').map(v => parseInt(v.trim())).filter(v => Number.isFinite(v) && v > 0 && v <= 65535), [portInput])

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14 }}>{T('guard_title')}</div>
      {statusMsg && <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--subtle)', fontSize: 12 }}>{statusMsg}</div>}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr auto auto', gap: 8 }}>
          <input value={portInput} onChange={e => setPortInput(e.target.value)} placeholder="3000, 8080" style={inputStyle} />
          <input value={allowInput} onChange={e => setAllowInput(e.target.value)} placeholder="node,vite,nginx" style={inputStyle} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}><input type="checkbox" checked={autoKill} onChange={e => setAutoKill(e.target.checked)} /> autoKill</label>
          <button
            onClick={async () => {
              if (!parsedPorts.length) return
              const key = `guard-${parsedPorts.join('-')}`
              const r = await onCreate({ key, ports: parsedPorts, autoKill, allowedProcesses: allowInput.split(',').map(v => v.trim()).filter(Boolean), intervalMs: 1500 })
              setStatusMsg(r?.success ? `Guard creado: ${key}` : (r?.error ?? 'No se pudo crear guard'))
              onRefresh()
            }}
            style={btnStyle}
          >Crear guard</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{T('no_guards')}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
          {entries.map(([key, g]) => (
            <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Guard: {key} {g.ports?.length ? `(${g.ports.join(',')})` : ''}</span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 500, background: g.running ? 'var(--red-glow)' : 'var(--surface2)', border: g.running ? '1px solid rgba(229,62,62,.3)' : '1px solid var(--border)', color: g.running ? 'var(--red2)' : 'var(--muted)' }}>{g.running ? `● ${T('active')}` : `○ ${T('inactive')}`}</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button style={miniBtn} onClick={async () => { const r = await onUpdate(key, { autoKill: !g.autoKill }); setStatusMsg(r?.success ? `Guard actualizado: ${key}` : (r?.error ?? 'No se pudo actualizar')); onRefresh() }}>{g.autoKill ? 'Desactivar autoKill' : 'Activar autoKill'}</button>
                <button style={miniBtn} onClick={async () => { const r = await onDelete(key); setStatusMsg(r?.success ? `Guard eliminado: ${key}` : (r?.error ?? 'No se pudo eliminar')); onRefresh() }}>Eliminar</button>
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {(g.recentEvents ?? []).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{T('no_events')}</div> : [...g.recentEvents].reverse().slice(0, 10).map((ev: GuardEvent, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 10, minWidth: 55 }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    <span style={{ color: typeColor[ev.type] ?? 'var(--text)', fontWeight: 500 }}>{typeLabel(ev.type)}</span>
                    <span style={{ color: 'var(--red2)', fontFamily: 'var(--mono)' }}>:{ev.port}</span>
                    {ev.info?.process && <span style={{ color: 'var(--muted)' }}>{ev.info.process}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle: CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }
const btnStyle: CSSProperties = { background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600 }
const miniBtn: CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 7, padding: '5px 10px', fontSize: 11 }
