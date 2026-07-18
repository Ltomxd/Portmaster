import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import type { InspectResult } from '../types'

interface Props {
  pid: number
  port: number
  processName: string | null
  inspectProcess: (pid: number, port: number) => Promise<InspectResult>
  onKill: (port: number, process: string | null) => void
  onProtect: (port: number, process: string | null) => void
  onLogs: () => void
  onClose: () => void
}

export function InspectDialog({ pid, port, processName, inspectProcess, onKill, onProtect, onLogs, onClose }: Props) {
  const { T } = useLang()
  const [data, setData] = useState<InspectResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    inspectProcess(pid, port).then(r => {
      if (cancelled) return
      if (r.success) setData(r); else setError(r.error ?? 'Error')
      setLoading(false)
    }).catch(e => { if (!cancelled) { setError(e?.message ?? 'Error'); setLoading(false) } })
    return () => { cancelled = true }
  }, [pid, port, inspectProcess])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const externalCount = data?.connections.filter(c => c.external).length ?? 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 24, width: 'min(96vw, 640px)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{T('inspect_title')} :{port}</div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 18 }}>PID {pid} · {processName ?? T('unknown_process')}</div>

        {loading && <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('inspecting')}…</div>}
        {!loading && error && <div style={{ padding: '20px 0', color: 'var(--red2)', fontSize: 13 }}>{error}</div>}

        {!loading && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section>
              <SectionTitle>{T('process_details')}</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12 }}>
                <Field label={T('user')} value={data.process.user ? `${data.process.user} (uid ${data.process.uid})` : '—'} />
                <Field label={T('started_at')} value={data.process.startedAt ? new Date(data.process.startedAt).toLocaleString() : '—'} />
                <Field label={T('executable')} value={data.process.exe ?? T('permission_denied')} mono full />
                <Field label={T('command')} value={data.process.command ?? '—'} mono full />
                <Field label={T('directory')} value={data.process.cwd ?? '—'} mono full />
                <Field label={T('threads')} value={data.process.threads != null ? String(data.process.threads) : '—'} />
                <Field label={T('memory_usage')} value={data.process.memoryKb != null ? `${(data.process.memoryKb / 1024).toFixed(1)} MB` : '—'} />
              </div>
            </section>

            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SectionTitle noMargin>{T('active_connections')}</SectionTitle>
                {externalCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red2)', background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', borderRadius: 5, padding: '1px 7px' }}>⚠ {externalCount} {T('external_connections')}</span>}
              </div>
              {data.connections.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: '10px 2px' }}>{T('no_connections')}</div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr style={{ background: 'var(--surface2)' }}>
                      {[T('protocol'), T('state'), T('local_address'), T('remote_address')].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', fontSize: 10 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {data.connections.map((c, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)', background: c.external ? 'var(--red-glow)' : 'transparent' }}>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{c.proto.toUpperCase()}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{c.state}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)' }}>{c.local}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', color: c.external ? 'var(--red2)' : 'var(--text)', fontWeight: c.external ? 700 : 400 }}>{c.remote}{c.external ? ' ⚠' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <SectionTitle noMargin>{T('security_logs')}</SectionTitle>
                <button onClick={onLogs} style={{ background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600 }}>📜 {T('view_live_logs')}</button>
              </div>
              {data.logs.source === 'none' ? (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: '10px 2px' }}>{T('no_security_logs')}</div>
              ) : (
                <pre style={{ background: '#0a0a12', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--subtle)', maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{data.logs.text}</pre>
              )}
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button onClick={() => onProtect(port, processName)} style={{ background: 'transparent', border: '1px solid var(--border2)', color: 'var(--blue)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>🛡 {T('protect')}</button>
              <button onClick={() => onKill(port, processName)} style={{ background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.4)', color: 'var(--red2)', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>{T('confirm_kill')}</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('cancel')}</button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: noMargin ? 0 : 8 }}>{children}</div>
}

function Field({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'var(--mono)' : undefined, wordBreak: 'break-all', color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
