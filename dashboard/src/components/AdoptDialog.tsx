import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'

interface Props {
  port: number
  process: string | null
  command: string
  cwd?: string
  adoptPort: (port: number) => Promise<{ success: boolean; pid?: number; command?: string; error?: string }>
  onAdopted: (pid: number) => void
  onClose: () => void
}

export function AdoptDialog({ port, process: processName, command, cwd, adoptPort, onAdopted, onClose }: Props) {
  const { T } = useLang()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, busy])

  const handleConfirm = async () => {
    setBusy(true); setError(null)
    const r = await adoptPort(port)
    setBusy(false)
    if (r?.success && r.pid) onAdopted(r.pid)
    else setError(r?.error ?? T('adopt_failed'))
  }

  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid rgba(116,185,255,.3)', borderRadius: 12, padding: 26, width: 'min(94vw, 480px)', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🔁</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{T('adopt_title')} :{port}</div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>{T('adopt_desc')}</div>

        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{T('command')}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: cwd ? 8 : 0 }}>{command}</div>
          {cwd && <>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{T('directory')}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--subtle)', wordBreak: 'break-all' }}>{cwd}</div>
          </>}
        </div>

        <div style={{ fontSize: 11, color: 'var(--yellow)', lineHeight: 1.6, marginBottom: 18 }}>
          ⚠ {T('adopt_warning')}
        </div>

        {error && <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(229,62,62,.3)', background: 'var(--red-glow)', color: 'var(--red2)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('cancel')}</button>
          <button onClick={handleConfirm} disabled={busy} style={{ background: 'rgba(116,185,255,.15)', border: '1px solid rgba(116,185,255,.4)', color: 'var(--blue)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: busy ? .6 : 1 }}>{busy ? `${T('adopt_in_progress')}…` : T('adopt_confirm')}</button>
        </div>
      </div>
    </div>
  )
}
