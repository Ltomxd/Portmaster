import { useState, useMemo, useEffect } from 'react'
import { useLang } from '../context/LangContext'
import type { InspectResult, Snapshot, PortInfo, Pm2Process } from '../types'
import type { LogTarget } from '../hooks/useLogSessions'
import { ConflictDialog, computeConflicts } from './ConflictDialog'
import { InspectDialog } from './InspectDialog'
import { ProtectDialog } from './ProtectDialog'
import { AdoptDialog } from './AdoptDialog'
import { Sparkline, type SparklinePoint } from './Sparkline'

const HISTORY_LIMIT = 120 // ~6min at the default 3s poll interval

// Rolling client-side history — resets on reload, which is fine for a trend
// view; no backend storage needed since usePortmaster already delivers a
// fresh snapshot on a fixed cadence regardless of whether values changed.
function useResourceHistory(system: Snapshot['system']) {
  const [history, setHistory] = useState<{ cpu: SparklinePoint[]; mem: SparklinePoint[]; disk: SparklinePoint[] }>({ cpu: [], mem: [], disk: [] })

  useEffect(() => {
    const t = Date.now()
    setHistory(prev => ({
      cpu: [...prev.cpu.slice(-(HISTORY_LIMIT - 1)), { t, v: system.cpu ?? 0 }],
      mem: [...prev.mem.slice(-(HISTORY_LIMIT - 1)), { t, v: system.memory?.usedPercent ?? 0 }],
      disk: [...prev.disk.slice(-(HISTORY_LIMIT - 1)), { t, v: system.disk?.usedPercent ?? 0 }],
    }))
  }, [system])

  return history
}

type GuardPayload = { key: string; ports: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }
type AdoptResult = { success: boolean; pid?: number; command?: string; error?: string }

interface Props {
  snapshot: Snapshot
  onKill: (port: number, process: string | null) => void
  onKillAll: () => void
  inspectProcess: (pid: number, port: number) => Promise<InspectResult>
  adoptPort: (port: number) => Promise<AdoptResult>
  createGuard: (payload: GuardPayload) => Promise<any>
  updateGuard: (key: string, payload: Partial<GuardPayload>) => Promise<any>
  deleteGuard: (key: string) => Promise<any>
  refresh: () => void
  onOpenLogs: (target: LogTarget) => void
  favoritePorts: Set<number>
  onToggleFavoritePort: (port: number) => void
}

export function Overview({ snapshot, onKill, onKillAll, inspectProcess, adoptPort, createGuard, updateGuard, deleteGuard, refresh, onOpenLogs, favoritePorts, onToggleFavoritePort }: Props) {
  const { T } = useLang()
  const { ports, docker, pm2, system, wsl, guards, managed } = snapshot
  const runningContainers = docker.filter(c => c.state === 'running').length
  const conflicts = useMemo(() => computeConflicts(ports), [ports])
  const history = useResourceHistory(system)
  const protectedPorts = useMemo(() => new Set(Object.values(guards).flatMap(g => g.ports ?? [])), [guards])

  const [showConflicts, setShowConflicts] = useState(false)
  const [inspecting, setInspecting] = useState<{ pid: number; port: number; process: string | null } | null>(null)
  const [protecting, setProtecting] = useState<{ port: number; process: string | null } | null>(null)
  const [adopting, setAdopting] = useState<{ port: number; process: string | null; command: string; cwd?: string } | null>(null)

  const load0 = system.loadAvg?.[0] ?? 0
  const loadKey = load0 > (system.cores * .8) ? 'load_high' : load0 > (system.cores * .5) ? 'load_moderate' : 'load_normal'

  const openProtect = (port: number, process: string | null) => setProtecting({ port, process })
  const openInspect = (pid: number, port: number, process: string | null) => setInspecting({ pid, port, process })
  const openAdopt = (port: number, process: string | null, command: string, cwd?: string) => setAdopting({ port, process, command, cwd })

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="stat-grid">
        <StatCard icon="🦝" bg="#2a1010" color="#fc5858" label={T('total_processes')} value={ports.length} extra={wsl.isWsl ? `${ports.length}` : undefined} />
        <StatCard icon="🌐" bg="#0f2a1a" color="#38d9a9" label={T('active_ports')} value={ports.length} />
        <StatCard icon="🐳" bg="#101a2e" color="#74b9ff" label={T('docker_containers')} value={runningContainers} />
        <StatCard icon="⚠️" bg="#2a1f00" color="#ffd166" label={T('port_conflicts')} value={conflicts.length} onClick={conflicts.length ? () => setShowConflicts(true) : undefined} hint={conflicts.length ? T('resolve') : undefined} />
        <StatCard icon="📈" bg="#1a1020" color="#c084fc" label={T('system_load')} value={T(loadKey)} isText />
      </div>

      <div>
        <SectionLabel>{T('system_resources')}</SectionLabel>
        <div className="res-grid">
          <ResCard icon="🖥" label={T('cpu')} big={`${(system.cpu ?? 0).toFixed(2)}%`} left={`${T('cores')}: ${system.cores ?? '—'}`} right={`${T('load')}: ${(system.loadAvg?.[0] ?? 0).toFixed(2)}`} pct={system.cpu ?? 0} color="#e53e3e" history={history.cpu} />
          <ResCard icon="💾" label={T('memory')} big={`${(system.memory?.usedPercent ?? 0).toFixed(2)}%`} left={fmt(system.memory?.used)} right={fmt(system.memory?.total)} pct={system.memory?.usedPercent ?? 0} color="#38d9a9" history={history.mem} />
          <ResCard icon="💿" label={T('disk')} big={`${(system.disk?.usedPercent ?? 0).toFixed(2)}%`} left={fmt(system.disk?.used)} right={fmt(system.disk?.total)} pct={system.disk?.usedPercent ?? 0} color="#c084fc" history={history.disk} />
          <ResCard icon="⏱" label={T('uptime')} big={system.uptime ?? '—'} left={null} right={`${T('last_updated')}: ${system.lastUpdated ?? '—'}`} pct={null} />
        </div>
      </div>

      <div className="load-grid">
        <LoadCard icon="⚡" bg="#2a1f00" color="#ffd166" label={T('min1_load')} value={(system.loadAvg?.[0] ?? 0).toFixed(2)} sub={T('current_load')} />
        <LoadCard icon="📊" bg="#0f2010" color="#38d9a9" label={T('min5_load')} value={(system.loadAvg?.[1] ?? 0).toFixed(2)} sub={T('medium_load')} />
        <LoadCard icon="🔵" bg="#10102a" color="#74b9ff" label={T('min15_load')} value={(system.loadAvg?.[2] ?? 0).toFixed(2)} sub={T('long_load')} />
      </div>

      <ProcessTable
        ports={ports} docker={docker} pm2={pm2} managed={managed} protectedPorts={protectedPorts}
        onKill={onKill} onKillAll={onKillAll}
        onProtect={openProtect} onInspect={openInspect} onLogs={onOpenLogs} onAdopt={openAdopt}
        favoritePorts={favoritePorts} onToggleFavoritePort={onToggleFavoritePort}
      />

      {showConflicts && (
        <ConflictDialog
          conflicts={conflicts}
          protectedPorts={protectedPorts}
          onKill={(port, proc) => { setShowConflicts(false); onKill(port, proc) }}
          onProtect={openProtect}
          onInspect={openInspect}
          onLogs={onOpenLogs}
          onClose={() => setShowConflicts(false)}
        />
      )}

      {inspecting && (
        <InspectDialog
          pid={inspecting.pid}
          port={inspecting.port}
          processName={inspecting.process}
          inspectProcess={inspectProcess}
          onKill={onKill}
          onProtect={openProtect}
          onLogs={() => {
            const managedPid = managed[inspecting.port]
            onOpenLogs(managedPid != null
              ? { kind: 'managed', id: managedPid, title: inspecting.process ?? `PID ${managedPid}`, subtitle: `:${inspecting.port}` }
              : { kind: 'journal', id: inspecting.pid, title: inspecting.process ?? `PID ${inspecting.pid}`, subtitle: `:${inspecting.port}` })
          }}
          onClose={() => setInspecting(null)}
        />
      )}

      {protecting && (
        <ProtectDialog
          port={protecting.port}
          process={protecting.process}
          guards={guards}
          createGuard={createGuard}
          updateGuard={updateGuard}
          deleteGuard={deleteGuard}
          refresh={refresh}
          onClose={() => setProtecting(null)}
        />
      )}

      {adopting && (
        <AdoptDialog
          port={adopting.port}
          process={adopting.process}
          command={adopting.command}
          cwd={adopting.cwd}
          adoptPort={adoptPort}
          onAdopted={pid => {
            setAdopting(null)
            refresh()
            onOpenLogs({ kind: 'managed', id: pid, title: adopting.process ?? `PID ${pid}`, subtitle: `:${adopting.port}` })
          }}
          onClose={() => setAdopting(null)}
        />
      )}

    </div>
  )
}

function StatCard({ icon, bg, label, value, extra, isText, onClick, hint }: { icon: string; bg: string; color: string; label: string; value: number | string; extra?: string; isText?: boolean; onClick?: () => void; hint?: string }) {
  return <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'var(--surface)', borderRight: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default' }}><div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div><div><div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 3 }}>{label}</div><div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontWeight: 700, fontSize: isText ? 18 : 24, lineHeight: 1 }}>{value}</span>{extra && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>+{extra}</span>}{hint && <span style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>{hint} →</span>}</div></div></div>
}

function ResCard({ icon, label, big, left, right, pct, color, history }: { icon: string; label: string; big: string; left: string | null; right: string | null; pct: number | null; color?: string; history?: SparklinePoint[] }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 18 }}>{icon}</span><span style={{ color: 'var(--subtle)', fontSize: 13 }}>{label}</span></div><div style={{ fontWeight: 700, fontSize: 26, marginBottom: 10, lineHeight: 1 }}>{big}</div>{(left || right) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>{left && <span>{left}</span>}{right && <span>{right}</span>}</div>}{pct !== null && <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginBottom: history ? 10 : 0 }}><div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, Math.max(0, pct))}%`, background: color ?? 'var(--red)', transition: 'width .6s ease' }} /></div>}{history && <Sparkline data={history} color={color ?? 'var(--red)'} formatValue={v => `${v.toFixed(1)}%`} />}</div>
}

function LoadCard({ icon, bg, color, label, value, sub }: { icon: string; bg: string; color: string; label: string; value: string; sub: string }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><div style={{ width: 34, height: 34, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div><span style={{ color: 'var(--subtle)', fontSize: 13 }}>{label}</span></div><div style={{ fontWeight: 700, fontSize: 32, lineHeight: 1, marginBottom: 6, color }}>{value}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div></div>
}

// Lower is better. Matching purely on "does it contain the substring" left
// results in port-number order regardless of how well they matched — an
// exact port/PID hit could end up buried below a loose command-string
// match. Rank exact hits, then prefix hits, then plain substring hits, so
// the thing you were actually searching for lands at the top immediately.
function matchScore(p: PortInfo, q: string): number {
  const port = String(p.port)
  const pid = p.pid != null ? String(p.pid) : ''
  const process_ = (p.process ?? '').toLowerCase()
  const command = (p.command ?? '').toLowerCase()
  if (port === q || pid === q) return 0
  if (process_ === q) return 1
  if (port.startsWith(q) || pid.startsWith(q)) return 2
  if (process_.startsWith(q)) return 3
  if (process_.includes(q)) return 4
  if (port.includes(q) || pid.includes(q)) return 5
  if (command.includes(q)) return 6
  return 7
}

// Pick the richest live-log source available for a port: an already-adopted
// (managed) process beats a matching docker container beats a matching pm2
// process beats a raw journald-by-pid follow. Managed comes first because,
// unlike the others, re-deriving it would mean killing and relaunching an
// already-fine process — this is what lets a closed/reloaded browser tab
// reconnect to a previously-adopted process without hitting Adopt again.
function resolveLogTarget(p: PortInfo, container: string | undefined, pm2: Pm2Process[], managedPid: number | undefined): LogTarget | null {
  if (managedPid != null) return { kind: 'managed', id: managedPid, title: p.process ?? `PID ${managedPid}`, subtitle: `:${p.port}` }
  if (container) return { kind: 'docker', id: container, title: container, subtitle: `:${p.port}` }
  const pm2Match = pm2.find(pr => pr.port === p.port || (p.pid != null && pr.pid === p.pid))
  if (pm2Match) return { kind: 'pm2', id: pm2Match.name, title: pm2Match.name, subtitle: `:${p.port}` }
  if (p.pid != null) return { kind: 'journal', id: p.pid, title: p.process ?? `PID ${p.pid}`, subtitle: `:${p.port}` }
  return null
}

type SourceFilter = 'all' | 'active' | 'services' | 'docker' | 'linux' | 'windows' | 'favorites'
function ProcessTable({ ports, docker, pm2, managed, protectedPorts, onKill, onKillAll, onProtect, onInspect, onLogs, onAdopt, favoritePorts, onToggleFavoritePort }: {
  ports: PortInfo[]; docker: any[]; pm2: Pm2Process[]; managed: Record<number, number>; protectedPorts: Set<number>
  onKill: (port: number, proc: string | null) => void; onKillAll: () => void
  onProtect: (port: number, process: string | null) => void
  onInspect: (pid: number, port: number, process: string | null) => void
  onLogs: (target: LogTarget) => void
  onAdopt: (port: number, process: string | null, command: string, cwd?: string) => void
  favoritePorts: Set<number>
  onToggleFavoritePort: (port: number) => void
}) {
  const { T } = useLang()
  const [query, setQuery] = useState('')
  const [portF, setPortF] = useState('all')
  const [srcF, setSrcF] = useState<SourceFilter>('active')
  const portOptions = useMemo(() => [...new Set(ports.map(p => p.port))].sort((a, b) => a - b), [ports])
  const dockerPortMap = useMemo(() => { const m: Record<number, string> = {}; for (const c of docker) for (const p of c.ports ?? []) if (p.hostPort) m[p.hostPort] = c.name; return m }, [docker])
  const filtered = useMemo(() => {
    const matched = ports.filter(p => {
      const q = query.toLowerCase()
      if (q && !String(p.port).includes(q) && !(p.process ?? '').toLowerCase().includes(q) && !String(p.pid ?? '').includes(q) && !(p.command ?? '').toLowerCase().includes(q)) return false
      if (portF !== 'all' && String(p.port) !== portF) return false
      if (srcF === 'active') return p.state === 'LISTEN'
      if (srcF === 'services') return p.state === 'LISTEN' && !!p.process && !!p.pid
      if (srcF === 'docker') return Boolean(dockerPortMap[p.port])
      if (srcF === 'linux') return p.source === 'linux'
      if (srcF === 'windows') return p.source === 'windows'
      if (srcF === 'favorites') return favoritePorts.has(p.port)
      return true
    })
    // The scanner reports a separate row per address family (0.0.0.0 vs
    // [::]) for dual-stack listeners — same owner, same port, nothing the
    // table actually displays differs between them. Collapse to one row per
    // (port, protocol, owner); a genuinely different owner on the same port
    // still gets its own row (that's a real conflict, not a display dupe).
    const seen = new Set<string>()
    const deduped: PortInfo[] = []
    for (const p of matched) {
      const container = dockerPortMap[p.port]
      const identity = p.pid != null ? `pid:${p.pid}` : container ? `docker:${container}` : p.process ? `proc:${p.source}:${p.process}` : `addr:${p.address}`
      const key = `${p.port}:${p.protocol}:${identity}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(p)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      deduped.sort((a, b) => matchScore(a, q) - matchScore(b, q) || a.port - b.port)
    }
    // Favorites float to the top regardless of search rank — that's the
    // whole point of pinning one.
    deduped.sort((a, b) => Number(favoritePorts.has(b.port)) - Number(favoritePorts.has(a.port)))
    return deduped
  }, [ports, query, portF, srcF, dockerPortMap, favoritePorts])

  return <div><div className="process-toolbar"><SectionLabel>{T('running_processes')}</SectionLabel><button onClick={onKillAll} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}><span>✕</span> {T('kill_all')}</button></div><div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}><div className="filter-row"><span style={{ color: 'var(--muted)', fontSize: 14 }}>🔍</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={T('search_placeholder')} style={{ flex: 1, minWidth: 160, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none' }} /><Sel value={portF} onChange={setPortF} opts={[{ v: 'all', l: T('all_ports') }, ...portOptions.map(p => ({ v: String(p), l: `:${p}` }))]} /><Sel value={srcF} onChange={v => setSrcF(v as SourceFilter)} opts={[{ v: 'active', l: T('active_only') }, { v: 'services', l: T('services_only') }, { v: 'docker', l: T('docker_only') }, { v: 'all', l: T('all_status') }, { v: 'linux', l: T('linux_only') }, { v: 'windows', l: T('windows_only') }, { v: 'favorites', l: T('favorites_only') }]} /></div><div className="table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}><thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>{[T('status'), T('port'), T('pid'), T('process_name'), T('cpu_mem'), T('command'), T('container'), T('directory'), ''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={9} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)' }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 32, opacity: .3 }}>🦝</span><span>{query ? T('no_results') : T('no_processes')}</span></div></td></tr> : filtered.map(p => <ProcRow key={`${p.port}-${p.pid ?? p.address}`} port={p} container={dockerPortMap[p.port]} protected_={protectedPorts.has(p.port)} logTarget={resolveLogTarget(p, dockerPortMap[p.port], pm2, managed[p.port])} managedPid={managed[p.port]} onKill={onKill} onProtect={onProtect} onInspect={onInspect} onLogs={onLogs} onAdopt={onAdopt} favorite={favoritePorts.has(p.port)} onToggleFavorite={onToggleFavoritePort} />)}</tbody></table></div></div></div>
}

function ProcRow({ port: p, container, protected_, logTarget, managedPid, onKill, onProtect, onInspect, onLogs, onAdopt, favorite, onToggleFavorite }: {
  port: PortInfo; container?: string; protected_: boolean; logTarget: LogTarget | null; managedPid?: number
  onKill: (port: number, proc: string | null) => void
  onProtect: (port: number, process: string | null) => void
  onInspect: (pid: number, port: number, process: string | null) => void
  onLogs: (target: LogTarget) => void
  onAdopt: (port: number, process: string | null, command: string, cwd?: string) => void
  favorite: boolean
  onToggleFavorite: (port: number) => void
}) {
  const { T } = useLang(); const isWin = p.source === 'windows'
  const [autoRestart, setAutoRestart] = useState(false)
  const toggleAutoRestart = () => {
    if (managedPid == null) return
    const next = !autoRestart
    setAutoRestart(next)
    fetch(`/api/managed/${managedPid}/autorestart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) }).catch(() => setAutoRestart(!next))
  }
  // Only a plain host process without a richer source (docker/pm2 already
  // give live logs) and with a captured command is a candidate to adopt.
  const canAdopt = !isWin && logTarget?.kind === 'journal' && !!p.command && p.pid != null
  return <tr style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '11px 14px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2.5s ease-in-out infinite' }} /></td><td style={{ padding: '11px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ background: 'var(--surface3)', border: `1px solid ${isWin ? 'rgba(245,158,11,.3)' : 'rgba(229,62,62,.3)'}`, color: isWin ? '#f59e0b' : 'var(--red2)', padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'var(--mono)' }}>{p.port}</span>{protected_ && <span title={T('protect_active')} style={{ fontSize: 11 }}>🛡</span>}</span></td><td style={{ padding: '11px 14px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p.pid ?? '—'}</td><td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{p.process ?? '—'}</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: isWin ? 'rgba(245,158,11,.1)' : 'var(--red-glow)', border: `1px solid ${isWin ? 'rgba(245,158,11,.25)' : 'rgba(229,62,62,.25)'}`, color: isWin ? '#f59e0b' : 'var(--red2)' }}>{isWin ? 'Windows' : 'Host'}</span></div></td><td style={{ padding: '11px 14px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{p.cpuPercent != null ? <span>{p.cpuPercent.toFixed(1)}% <span style={{ opacity: .5 }}>·</span> {(p.memoryMB ?? 0).toFixed(0)}MB</span> : '—'}</td><td style={{ padding: '11px 14px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.command}><span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p.command?.substring(0, 38) ?? '—'}</span></td><td style={{ padding: '11px 14px', fontSize: 12 }}>{container ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--subtle)' }}><span>🐳</span>{container}</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--muted)' }}><span style={{ opacity: .3 }}>⬡</span>{T('host_process')}</span>}</td><td style={{ padding: '11px 14px', color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--mono)' }}>{p.cwd ?? '—'}</td><td style={{ padding: '11px 14px' }}><div style={{ display: 'flex', gap: 6 }}>
    <button onClick={() => onToggleFavorite(p.port)} title={favorite ? T('unfavorite') : T('favorite')} style={{ background: 'transparent', border: 'none', color: favorite ? 'var(--yellow)' : 'var(--subtle)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>{favorite ? '★' : '☆'}</button>
    {p.pid != null && <button onClick={() => onInspect(p.pid!, p.port, p.process)} title={`${T('inspect_title')} :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--subtle)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🔎</button>}
    {logTarget && <button onClick={() => onLogs(logTarget)} title={`${T('view_live_logs')} :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--subtle)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>📜</button>}
    {canAdopt && <button onClick={() => onAdopt(p.port, p.process, p.command!, p.cwd)} title={`${T('adopt_button')} :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--subtle)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🔁</button>}
    {managedPid != null && <button onClick={toggleAutoRestart} title={autoRestart ? T('auto_restart_on') : T('auto_restart_off')} style={{ background: autoRestart ? 'rgba(56,217,169,.12)' : 'transparent', border: autoRestart ? '1px solid rgba(56,217,169,.35)' : 'none', color: autoRestart ? 'var(--green)' : 'var(--subtle)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>♻</button>}
    <button onClick={() => onProtect(p.port, p.process)} title={`${protected_ ? T('protect_active') : T('protect')} :${p.port}`} style={{ background: protected_ ? 'rgba(56,217,169,.12)' : 'transparent', border: protected_ ? '1px solid rgba(56,217,169,.35)' : 'none', color: protected_ ? 'var(--green)' : 'var(--blue)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🛡</button>
    <button onClick={() => onKill(p.port, p.process)} title={`Kill :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🗑</button>
  </div></td></tr>
}

function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: { v: string; l: string }[] }) {
  return <div style={{ position: 'relative' }}><select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: 'none', background: 'var(--surface3)', border: '1px solid var(--border2)', color: 'var(--text)', padding: '5px 26px 5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', outline: 'none' }}>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select><span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: 9 }}>▾</span></div>
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase' }}>{children}</div> }
function fmt(b?: number): string { if (!b) return '—'; if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'; if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB'; if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB'; return (b / 1e3).toFixed(1) + ' KB' }
