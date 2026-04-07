import { useLang } from '../context/LangContext'
import type { Pm2Process } from '../types'

interface Props { processes: Pm2Process[]; onAction: (name: string, action: 'start' | 'stop' | 'restart') => void }

export function Pm2Tab({ processes, onAction }: Props) {
  const { T } = useLang()
  const sc: Record<string, string> = { online: 'var(--green)', errored: 'var(--red2)', stopped: 'var(--muted)', stopping: 'var(--yellow)' }
  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 14 }}>{T('pm2_processes')}</div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>{['ID', T('name'), 'PID', T('status'), T('cpu'), T('memory'), T('restarts'), T('uptime'), T('port'), T('actions')].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
            <tbody>{processes.length === 0 ? <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>{T('no_pm2')}</td></tr> : processes.map(p => { const c = sc[p.status] ?? 'var(--muted)'; return <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{p.id}</td><td style={{ padding: '11px 14px', fontWeight: 600 }}>{p.name}</td><td style={{ padding: '11px 14px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p.pid ?? '—'}</td><td style={{ padding: '11px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: c }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block', animation: p.status === 'online' ? 'pulse 2s infinite' : 'none' }} />{p.status}</span></td><td style={{ padding: '11px 14px', fontSize: 12 }}>{p.cpu?.toFixed(1) ?? 0}%</td><td style={{ padding: '11px 14px', fontSize: 12 }}>{fmtMem(p.memory)}</td><td style={{ padding: '11px 14px', fontSize: 12, color: p.restarts > 5 ? 'var(--yellow)' : 'var(--muted)' }}>{p.restarts}</td><td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{fmtUp(p.uptime)}</td><td style={{ padding: '11px 14px' }}>{p.port ? <span style={{ color: 'var(--red2)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p.port}</span> : '—'}</td><td style={{ padding: '11px 14px', display: 'flex', gap: 5 }}>{p.status === 'online' ? <><Btn label={T('restart')} v="restart" onClick={() => onAction(p.name, 'restart')} /><Btn label={T('stop')} v="stop" onClick={() => onAction(p.name, 'stop')} /></> : <Btn label={T('start')} v="start" onClick={() => onAction(p.name, 'start')} />}</td></tr> })}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Btn({ label, v, onClick }: { label: string; v: 'start' | 'stop' | 'restart'; onClick: () => void }) {
  const styles = { start: { c: 'var(--green)', b: 'rgba(56,217,169,.25)' }, stop: { c: 'var(--red2)', b: 'rgba(229,62,62,.25)' }, restart: { c: 'var(--blue)', b: 'rgba(116,185,255,.25)' } }
  const s = styles[v]
  return <button onClick={onClick} style={{ background: 'transparent', border: `1px solid ${s.b}`, color: s.c, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{label}</button>
}
function fmtMem(b: number) { if (!b) return '—'; if (b > 1e9) return (b / 1e9).toFixed(1) + 'GB'; if (b > 1e6) return (b / 1e6).toFixed(1) + 'MB'; return (b / 1e3).toFixed(1) + 'KB' }
function fmtUp(ms: number | null) { if (!ms) return '—'; const s = Math.floor((Date.now() - ms) / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); return h < 24 ? h + 'h' + (m % 60) + 'm' : Math.floor(h / 24) + 'd' + (h % 24) + 'h' }
