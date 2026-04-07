import { useState, useMemo } from 'react'
import { useLang } from '../context/LangContext'
import type { Snapshot, PortInfo } from '../types'

interface Props {
  snapshot: Snapshot
  onKill: (port: number, process: string | null) => void
  onKillAll: () => void
  onProtect: (port: number, process: string | null) => void
}

export function Overview({ snapshot, onKill, onKillAll, onProtect }: Props) {
  const { T } = useLang()
  const { ports, docker, system, wsl } = snapshot
  const runningContainers = docker.filter(c => c.state === 'running').length
  const conflicts = Object.values(ports.reduce((a, p) => { a[p.port] = (a[p.port] ?? 0) + 1; return a }, {} as Record<number, number>)).filter(v => v > 1).length
  const load0 = system.loadAvg?.[0] ?? 0
  const loadKey = load0 > (system.cores * .8) ? 'load_high' : load0 > (system.cores * .5) ? 'load_moderate' : 'load_normal'

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stat-grid">
        <StatCard icon="🦝" bg="#2a1010" color="#fc5858" label={T('total_processes')} value={ports.length} extra={wsl.isWsl ? `${ports.length}` : undefined} />
        <StatCard icon="🌐" bg="#0f2a1a" color="#38d9a9" label={T('active_ports')} value={ports.length} />
        <StatCard icon="🐳" bg="#101a2e" color="#74b9ff" label={T('docker_containers')} value={runningContainers} />
        <StatCard icon="⚠️" bg="#2a1f00" color="#ffd166" label={T('port_conflicts')} value={conflicts} />
        <StatCard icon="📈" bg="#1a1020" color="#c084fc" label={T('system_load')} value={T(loadKey)} isText />
      </div>

      <div>
        <SectionLabel>{T('system_resources')}</SectionLabel>
        <div className="res-grid">
          <ResCard icon="🖥" label={T('cpu')} big={`${(system.cpu ?? 0).toFixed(2)}%`} left={`${T('cores')}: ${system.cores ?? '—'}`} right={`${T('load')}: ${(system.loadAvg?.[0] ?? 0).toFixed(2)}`} pct={system.cpu ?? 0} color="#e53e3e" />
          <ResCard icon="💾" label={T('memory')} big={`${(system.memory?.usedPercent ?? 0).toFixed(2)}%`} left={fmt(system.memory?.used)} right={fmt(system.memory?.total)} pct={system.memory?.usedPercent ?? 0} color="#38d9a9" />
          <ResCard icon="💿" label={T('disk')} big={`${(system.disk?.usedPercent ?? 0).toFixed(2)}%`} left={fmt(system.disk?.used)} right={fmt(system.disk?.total)} pct={system.disk?.usedPercent ?? 0} color="#c084fc" />
          <ResCard icon="⏱" label={T('uptime')} big={system.uptime ?? '—'} left={null} right={`${T('last_updated')}: ${system.lastUpdated ?? '—'}`} pct={null} />
        </div>
      </div>

      <div className="load-grid">
        <LoadCard icon="⚡" bg="#2a1f00" color="#ffd166" label={T('min1_load')} value={(system.loadAvg?.[0] ?? 0).toFixed(2)} sub={T('current_load')} />
        <LoadCard icon="📊" bg="#0f2010" color="#38d9a9" label={T('min5_load')} value={(system.loadAvg?.[1] ?? 0).toFixed(2)} sub={T('medium_load')} />
        <LoadCard icon="🔵" bg="#10102a" color="#74b9ff" label={T('min15_load')} value={(system.loadAvg?.[2] ?? 0).toFixed(2)} sub={T('long_load')} />
      </div>

      <ProcessTable ports={ports} docker={docker} onKill={onKill} onKillAll={onKillAll} onProtect={onProtect} />
    </div>
  )
}

function StatCard({ icon, bg, label, value, extra, isText }: { icon: string; bg: string; color: string; label: string; value: number | string; extra?: string; isText?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}><div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div><div><div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 3 }}>{label}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontWeight: 700, fontSize: isText ? 18 : 24, lineHeight: 1 }}>{value}</span>{extra && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>+{extra}</span>}</div></div></div>
}

function ResCard({ icon, label, big, left, right, pct, color }: { icon: string; label: string; big: string; left: string | null; right: string | null; pct: number | null; color?: string }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 18 }}>{icon}</span><span style={{ color: 'var(--subtle)', fontSize: 13 }}>{label}</span></div><div style={{ fontWeight: 700, fontSize: 26, marginBottom: 10, lineHeight: 1 }}>{big}</div>{(left || right) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>{left && <span>{left}</span>}{right && <span>{right}</span>}</div>}{pct !== null && <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}><div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, Math.max(0, pct))}%`, background: color ?? 'var(--red)', transition: 'width .6s ease' }} /></div>}</div>
}

function LoadCard({ icon, bg, color, label, value, sub }: { icon: string; bg: string; color: string; label: string; value: string; sub: string }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div><span style={{ color: 'var(--subtle)', fontSize: 13 }}>{label}</span></div><div style={{ fontWeight: 700, fontSize: 32, lineHeight: 1, marginBottom: 6, color }}>{value}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div></div>
}

type SourceFilter = 'all' | 'active' | 'services' | 'docker' | 'linux' | 'windows'
function ProcessTable({ ports, docker, onKill, onKillAll, onProtect }: { ports: PortInfo[]; docker: any[]; onKill: (port: number, proc: string | null) => void; onKillAll: () => void; onProtect: (port: number, process: string | null) => void }) {
  const { T } = useLang()
  const [query, setQuery] = useState('')
  const [portF, setPortF] = useState('all')
  const [srcF, setSrcF] = useState<SourceFilter>('active')
  const portOptions = useMemo(() => [...new Set(ports.map(p => p.port))].sort((a, b) => a - b), [ports])
  const dockerPortMap = useMemo(() => { const m: Record<number, string> = {}; for (const c of docker) for (const p of c.ports ?? []) if (p.hostPort) m[p.hostPort] = c.name; return m }, [docker])
  const filtered = useMemo(() => ports.filter(p => {
    const q = query.toLowerCase()
    if (q && !String(p.port).includes(q) && !(p.process ?? '').toLowerCase().includes(q) && !String(p.pid ?? '').includes(q) && !(p.command ?? '').toLowerCase().includes(q)) return false
    if (portF !== 'all' && String(p.port) !== portF) return false
    if (srcF === 'active') return p.state === 'LISTEN'
    if (srcF === 'services') return p.state === 'LISTEN' && !!p.process && !!p.pid
    if (srcF === 'docker') return Boolean(dockerPortMap[p.port])
    if (srcF === 'linux') return p.source === 'linux'
    if (srcF === 'windows') return p.source === 'windows'
    return true
  }), [ports, query, portF, srcF, dockerPortMap])

  return <div><div className="process-toolbar"><SectionLabel>{T('running_processes')}</SectionLabel><button onClick={onKillAll} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}><span>✕</span> {T('kill_all')}</button></div><div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}><div className="filter-row"><span style={{ color: 'var(--muted)', fontSize: 14 }}>🔍</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={T('search_placeholder')} style={{ flex: 1, minWidth: 160, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none' }} /><Sel value={portF} onChange={setPortF} opts={[{ v: 'all', l: T('all_ports') }, ...portOptions.map(p => ({ v: String(p), l: `:${p}` }))]} /><Sel value={srcF} onChange={v => setSrcF(v as SourceFilter)} opts={[{ v: 'active', l: T('active_only') }, { v: 'services', l: T('services_only') }, { v: 'docker', l: T('docker_only') }, { v: 'all', l: T('all_status') }, { v: 'linux', l: T('linux_only') }, { v: 'windows', l: T('windows_only') }]} /></div><div className="table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}><thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>{[T('status'), T('port'), T('pid'), T('process_name'), T('command'), T('container'), T('directory'), ''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)' }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 32, opacity: .3 }}>🦝</span><span>{query ? T('no_results') : T('no_processes')}</span></div></td></tr> : filtered.map(p => <ProcRow key={`${p.port}-${p.pid ?? p.address}`} port={p} container={dockerPortMap[p.port]} onKill={onKill} onProtect={onProtect} />)}</tbody></table></div></div></div>
}

function ProcRow({ port: p, container, onKill, onProtect }: { port: PortInfo; container?: string; onKill: (port: number, proc: string | null) => void; onProtect: (port: number, process: string | null) => void }) {
  const { T } = useLang(); const isWin = p.source === 'windows'
  return <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '11px 14px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2.5s ease-in-out infinite' }} /></td><td style={{ padding: '11px 14px' }}><span style={{ background: 'var(--surface3)', border: `1px solid ${isWin ? 'rgba(245,158,11,.3)' : 'rgba(229,62,62,.3)'}`, color: isWin ? '#f59e0b' : 'var(--red2)', padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'var(--mono)' }}>{p.port}</span></td><td style={{ padding: '11px 14px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p.pid ?? '—'}</td><td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{p.process ?? '—'}</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: isWin ? 'rgba(245,158,11,.1)' : 'var(--red-glow)', border: `1px solid ${isWin ? 'rgba(245,158,11,.25)' : 'rgba(229,62,62,.25)'}`, color: isWin ? '#f59e0b' : 'var(--red2)' }}>{isWin ? 'Windows' : 'Host'}</span></div></td><td style={{ padding: '11px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.command}><span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p.command?.substring(0, 38) ?? '—'}</span></td><td style={{ padding: '11px 14px', fontSize: 12 }}>{container ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--subtle)' }}><span>🐳</span>{container}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}><span style={{ opacity: .3 }}>⬡</span>{T('host_process')}</span>}</td><td style={{ padding: '11px 14px', color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p.cwd ?? '—'}</td><td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', gap: 6 }}><button onClick={() => onProtect(p.port, p.process)} title={`Protect :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--blue)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🛡</button><button onClick={() => onKill(p.port, p.process)} title={`Kill :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🗑</button></div></td></tr>
}

function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: { v: string; l: string }[] }) {
  return <div style={{ position: 'relative' }}><select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: 'none', background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text)', padding: '5px 26px 5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', outline: 'none' }}>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: 9 }}>▾</span></div>
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase' }}>{children}</div> }
function fmt(b?: number): string { if (!b) return '—'; if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'; if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB'; if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB'; return (b / 1e3).toFixed(1) + ' KB' }
