import { useState, useCallback } from 'react'
import { LangProvider, useLang } from './context/LangContext'
import { usePortmaster } from './hooks/usePortmaster'
import { useToast } from './hooks/useToast'
import { Sidebar } from './components/Sidebar'
import { Overview } from './components/Overview'
import { DockerTab } from './components/DockerTab'
import { Pm2Tab } from './components/Pm2Tab'
import { GuardTab } from './components/GuardTab'
import { KillDialog } from './components/KillDialog'
import { ToastList } from './components/ToastList'

type Tab = 'overview' | 'docker' | 'pm2' | 'guard'

function Dashboard() {
  const { snapshot, connState, refresh, killPort, dockerAction, pm2Action } = usePortmaster()
  const { toasts, toast, dismiss } = useToast()
  const { T } = useLang()
  const [tab, setTab] = useState<Tab>('overview')
  const [pending, setPending] = useState<{ port: number; process: string | null } | null>(null)
  const [paused, setPaused] = useState(false)

  const counts = {
    overview: snapshot.ports.length,
    docker:   snapshot.docker.filter(c => c.state === 'running').length,
    pm2:      snapshot.pm2.filter(p => p.status === 'online').length,
    guard:    Object.values(snapshot.guards).filter(g => g.running).length,
  }

  const handleKill = useCallback(async () => {
    if (!pending) return
    const { port } = pending; setPending(null)
    const r = await killPort(port)
    if (r.success) toast(`${T('killed_port')} :${port}`, 'success')
    else toast(`${T('failed_kill')} :${port} — ${r.error ?? '?'}`, 'error')
  }, [pending, killPort, toast, T])

  const handleKillAll = useCallback(async () => {
    const active = snapshot.ports.filter(p => p.source === 'linux')
    for (const p of active) await killPort(p.port)
    toast(`${active.length} ${T('killed_processes')}`, 'success')
  }, [snapshot.ports, killPort, toast, T])

  const handleDocker = useCallback(async (name: string, action: 'start'|'stop'|'restart') => {
    const r = await dockerAction(name, action)
    if (r.success) toast(`${name} ${action}ed`, 'success'); else toast(r.error ?? 'Failed', 'error')
  }, [dockerAction, toast])

  const handlePm2 = useCallback(async (name: string, action: 'start'|'stop'|'restart') => {
    const r = await pm2Action(name, action)
    if (r.success) toast(`PM2 ${name} ${action}ed`, 'success'); else toast(r.error ?? 'Failed', 'error')
  }, [pm2Action, toast])

  const subtitles: Record<Tab, string> = {
    overview: T('subtitle_overview'), docker: T('subtitle_docker'),
    pm2: T('subtitle_pm2'), guard: T('subtitle_guard'),
  }
  const titles: Record<Tab, string> = {
    overview: T('overview'), docker: T('docker'), pm2: T('pm2'), guard: T('guard'),
  }
  const ok = connState === 'connected'

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      <Sidebar activeTab={tab} onTabChange={t => setTab(t)} counts={counts} wsl={snapshot.wsl} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: 56, borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{titles[tab]}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>{subtitles[tab]}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Connection badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? 'var(--green)' : 'var(--muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--yellow)', display: 'inline-block', animation: ok ? 'pulse 2s infinite' : 'none' }} />
              {ok ? T('connected') : connState === 'reconnecting' ? T('reconnecting') : T('connecting')}
            </div>
            <HBtn onClick={() => setPaused(p => !p)} label={paused ? T('resume') : T('pause')} />
            <HBtn onClick={refresh} label={T('refresh')} primary />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'overview' && <Overview snapshot={snapshot} onKill={(p, n) => setPending({ port: p, process: n })} onKillAll={handleKillAll} />}
          {tab === 'docker'   && <DockerTab containers={snapshot.docker} onAction={handleDocker} />}
          {tab === 'pm2'      && <Pm2Tab processes={snapshot.pm2} onAction={handlePm2} />}
          {tab === 'guard'    && <GuardTab guards={snapshot.guards} />}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 24px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
          <span>🦝 Portmaster — WSL/Ubuntu Port Manager</span>
          <a href="https://github.com/Ltomxd/Portmaster" target="_blank" rel="noreferrer" style={{ color: 'var(--red2)', textDecoration: 'none', fontWeight: 600 }}>
            github.com/Ltomxd/Portmaster
          </a>
        </div>
      </div>

      <KillDialog port={pending?.port ?? null} processName={pending?.process ?? null} onConfirm={handleKill} onCancel={() => setPending(null)} />
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function HBtn({ onClick, label, primary }: { onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button onClick={onClick} style={{
      background: primary ? 'var(--red-glow)' : 'transparent',
      border: `1px solid ${primary ? 'rgba(229,62,62,.35)' : 'var(--border)'}`,
      color: primary ? 'var(--red2)' : 'var(--muted)',
      padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, transition: 'all .15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--red2)'; (e.currentTarget as HTMLElement).style.color = 'var(--red2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = primary ? 'rgba(229,62,62,.35)' : 'var(--border)'; (e.currentTarget as HTMLElement).style.color = primary ? 'var(--red2)' : 'var(--muted)' }}
    >{label}</button>
  )
}

export default function App() {
  return <LangProvider><Dashboard /></LangProvider>
}
