import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import type { PortInfo } from '../types'

interface Props {
  ports: PortInfo[]
  favoritePorts: Set<number>
  favoriteProjects: Set<string>
  onToggleFavoritePort: (port: number) => void
  onToggleFavoriteProject: (path: string) => void
  onKill: (port: number, process: string | null) => void
  onOpenTerminal: (cwd: string, label: string) => void
}

// One place to see everything you've starred — ports from Overview, folders
// from Projects — instead of hunting the star back down in each tab's list.
export function FavoritesTab({ ports, favoritePorts, favoriteProjects, onToggleFavoritePort, onToggleFavoriteProject, onKill, onOpenTerminal }: Props) {
  const { T } = useLang()
  const [query, setQuery] = useState('')
  const [liveTerminals, setLiveTerminals] = useState<Set<string>>(new Set())

  // Same "who's actually running" check ProjectsTab does — a favorited
  // folder's terminal lives server-side (tmux), independent of this tab, so
  // this has to be polled rather than derived from local state.
  useEffect(() => {
    let cancelled = false
    const poll = () => {
      fetch('/api/terminal/sessions').then(r => r.json()).then(d => {
        if (!cancelled && d.success) setLiveTerminals(new Set<string>(d.paths ?? []))
      }).catch(() => {})
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // A dual-stack listener (0.0.0.0 + [::]) reports as two PortInfo rows for
  // the same port — a favorite is "port 3000", not "port 3000 on IPv6
  // specifically", so collapse to one row, preferring whichever has a PID.
  const q = query.trim().toLowerCase()
  const favoritePortRows = [...favoritePorts]
    .map(port => {
      const matches = ports.filter(p => p.port === port)
      return matches.find(p => p.pid != null) ?? matches[0] ?? { port, pid: null, process: null, protocol: 'TCP' as const, state: 'DOWN', address: '', source: 'linux' as const }
    })
    .filter(p => !q || String(p.port).includes(q) || (p.process ?? '').toLowerCase().includes(q))

  const favoriteProjectPaths = [...favoriteProjects].filter(path => !q || path.toLowerCase().includes(q))

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px' }}>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>🔍</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={T('favorites_search_placeholder')} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
      </div>

      <div>
        <SectionLabel>{T('favorite_ports_section')}</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
          {favoritePortRows.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{q ? T('no_results') : T('favorites_empty_ports')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {[T('port'), T('pid'), T('process_name'), T('cpu_mem'), ''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {favoritePortRows.map(p => (
                  <tr key={p.port} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}><span style={{ background: 'var(--surface3)', border: '1px solid rgba(229,62,62,.3)', color: 'var(--red2)', padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 12, fontFamily: 'var(--mono)' }}>{p.port}</span></td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)' }}>{p.pid ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{p.process ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{p.cpuPercent != null ? <span>{p.cpuPercent.toFixed(1)}% · {(p.memoryMB ?? 0).toFixed(0)}MB</span> : '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => onToggleFavoritePort(p.port)} title={T('unfavorite')} style={{ background: 'transparent', border: 'none', color: 'var(--yellow)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>★</button>
                        <button onClick={() => onKill(p.port, p.process)} title={`Kill :${p.port}`} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>{T('favorite_projects_section')}</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
          {favoriteProjectPaths.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{q ? T('no_results') : T('favorites_empty_projects')}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {favoriteProjectPaths.map(path => {
                  const label = path.split('/').filter(Boolean).pop() ?? path
                  const isLive = liveTerminals.has(path)
                  return (
                    <tr key={path} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>📁</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                              {isLive && <span title={T('terminal_running_hint')} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: 'var(--green)' }}><LiveDot />{T('terminal_running')}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{path}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => onToggleFavoriteProject(path)} title={T('unfavorite')} style={{ background: 'transparent', border: 'none', color: 'var(--yellow)', padding: '4px 7px', borderRadius: 6, fontSize: 14 }}>★</button>
                          <button onClick={() => onOpenTerminal(path, label)} title={isLive ? T('terminal_running_hint') : T('terminal_open_here')} style={{ background: isLive ? 'rgba(56,217,169,.1)' : 'transparent', border: `1px solid ${isLive ? 'rgba(56,217,169,.4)' : 'var(--border2)'}`, color: isLive ? 'var(--green)' : 'var(--subtle)', padding: '4px 9px', borderRadius: 6, fontSize: 12 }}>🖳</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase' }}>{children}</div> }
function LiveDot() { return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} /> }
