import { useMemo, useState } from 'react'
import { useLang } from '../context/LangContext'
import type { GuardStatus } from '../types'

type GuardPayload = { key: string; ports: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }

interface Props {
  port: number
  process: string | null
  guards: Record<string, GuardStatus>
  createGuard: (payload: GuardPayload) => Promise<any>
  updateGuard: (key: string, payload: Partial<GuardPayload>) => Promise<any>
  deleteGuard: (key: string) => Promise<any>
  refresh: () => void
  onClose: () => void
}

const INTERVAL_PRESETS = [
  { v: 1000, key: 'interval_fast' },
  { v: 3000, key: 'interval_normal' },
  { v: 10000, key: 'interval_relaxed' },
] as const

export function ProtectDialog({ port, process, guards, createGuard, updateGuard, deleteGuard, refresh, onClose }: Props) {
  const { T } = useLang()

  const existing = useMemo(() => Object.entries(guards).find(([, g]) => g.ports?.includes(port)) ?? null, [guards, port])
  const [existingKey, existingGuard] = existing ?? [null, null]
  const isProtected = !!existingGuard

  const [autoKill, setAutoKill] = useState(existingGuard?.autoKill ?? true)
  const [allowed, setAllowed] = useState((existingGuard?.allowedProcesses ?? (process ? [process] : [])).join(', '))
  const [intervalMs, setIntervalMs] = useState(existingGuard?.intervalMs ?? 3000)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'success' | 'error' } | null>(null)
  const [removed, setRemoved] = useState(false)

  const allowedList = allowed.split(',').map(s => s.trim()).filter(Boolean)
  const key = existingKey ?? `port-${port}`

  async function handleSave() {
    setBusy(true); setMsg(null)
    const payload = { ports: [port], autoKill, allowedProcesses: allowedList, intervalMs }
    const r = isProtected ? await updateGuard(key, payload) : await createGuard({ key, ...payload })
    setBusy(false)
    if (r?.success) { setMsg({ text: T('protect_saved'), kind: 'success' }); refresh() }
    else setMsg({ text: r?.error ?? T('protect_failed'), kind: 'error' })
  }

  async function handleRemove() {
    if (!existingKey) return
    setBusy(true); setMsg(null)
    const r = await deleteGuard(existingKey)
    setBusy(false)
    if (r?.success) { setMsg({ text: T('protect_removed'), kind: 'success' }); setRemoved(true); refresh() }
    else setMsg({ text: r?.error ?? T('protect_failed'), kind: 'error' })
  }

  const active = isProtected && !removed

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid rgba(116,185,255,.3)', borderRadius: 12, padding: 26, width: 'min(94vw, 480px)', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🛡</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{T('protect_title')} :{port}</div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 16 }}>{process ?? T('unknown_process')}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--muted)', display: 'inline-block', animation: active ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--green)' : 'var(--muted)' }}>{active ? T('protect_active') : T('protect_inactive')}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoKill} onChange={e => setAutoKill(e.target.checked)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{T('protect_autokill_label')}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{T('protect_autokill_desc')}</div>
            </div>
          </label>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{T('protect_allowed_label')}</div>
            <input value={allowed} onChange={e => setAllowed(e.target.value)} placeholder="node, vite, nginx" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{allowedList.length === 0 ? T('protect_allowed_empty_warning') : T('protect_allowed_desc')}</div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{T('protect_interval')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {INTERVAL_PRESETS.map(p => (
                <button key={p.v} onClick={() => setIntervalMs(p.v)} style={{
                  flex: 1, padding: '7px 8px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: intervalMs === p.v ? 'rgba(116,185,255,.15)' : 'var(--surface2)',
                  border: `1px solid ${intervalMs === p.v ? 'rgba(116,185,255,.4)' : 'var(--border)'}`,
                  color: intervalMs === p.v ? 'var(--blue)' : 'var(--muted)',
                }}>{T(p.key)}</button>
              ))}
            </div>
          </div>
        </div>

        {msg && <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${msg.kind === 'success' ? 'rgba(56,217,169,.3)' : 'rgba(229,62,62,.3)'}`, background: msg.kind === 'success' ? 'rgba(56,217,169,.08)' : 'var(--red-glow)', color: msg.kind === 'success' ? 'var(--green)' : 'var(--red2)', fontSize: 12 }}>{msg.text}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div>
            {active && <button onClick={handleRemove} disabled={busy} style={{ background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, opacity: busy ? .6 : 1 }}>{T('protect_remove')}</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('cancel')}</button>
            <button onClick={handleSave} disabled={busy} style={{ background: 'rgba(116,185,255,.15)', border: '1px solid rgba(116,185,255,.4)', color: 'var(--blue)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: busy ? .6 : 1 }}>{busy ? '…' : active ? T('protect_update') : T('protect_save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
