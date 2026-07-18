import { useEffect, useState, useCallback } from 'react'
import { useLang } from '../context/LangContext'
import type { DirEntry, BrowseResult } from '../types'

interface Props {
  onOpenTerminal: (cwd: string, label: string) => void
}

export function ProjectsTab({ onOpenTerminal }: Props) {
  const { T } = useLang()
  const [root, setRoot] = useState<string | null | undefined>(undefined) // undefined = loading
  const [pathInput, setPathInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [editingRoot, setEditingRoot] = useState(false)
  const [liveTerminals, setLiveTerminals] = useState<Set<string>>(new Set())

  const loadRoot = useCallback(() => {
    fetch('/api/projects/root').then(r => r.json()).then(d => setRoot(d.projectsRoot ?? null)).catch(() => setRoot(null))
  }, [])

  useEffect(() => { loadRoot() }, [loadRoot])

  const browse = useCallback((relPath: string) => {
    setLoadingEntries(true)
    setBrowseError(null)
    fetch(`/api/projects/browse?path=${encodeURIComponent(relPath)}`)
      .then(r => r.json())
      .then((d: BrowseResult) => {
        if (d.success) { setEntries(d.entries ?? []); setCurrentPath(d.path ?? '') }
        else { setBrowseError(d.error ?? T('projects_browse_failed')); setEntries(null) }
      })
      .catch(() => setBrowseError(T('projects_browse_failed')))
      .finally(() => setLoadingEntries(false))
  }, [T])

  useEffect(() => {
    if (root) browse('')
  }, [root, browse])

  // Terminal shells live server-side, independent of which browser tab (if
  // any) has them open — poll for which folders currently have one running
  // so the "online" indicator stays correct even after this tab reloaded.
  useEffect(() => {
    if (!root) return
    let cancelled = false
    const poll = () => {
      fetch('/api/terminal/sessions').then(r => r.json()).then(d => {
        if (!cancelled && d.success) setLiveTerminals(new Set<string>(d.paths ?? []))
      }).catch(() => {})
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [root])

  const handleSaveRoot = async () => {
    if (!pathInput.trim()) return
    setSaving(true); setSaveError(null)
    try {
      const r = await fetch('/api/projects/root', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: pathInput.trim() }) })
      const d = await r.json()
      if (d.success) { setRoot(d.path); setEditingRoot(false); setPathInput('') }
      else setSaveError(d.error ?? T('projects_save_failed'))
    } catch (e: any) {
      setSaveError(e?.message ?? T('projects_save_failed'))
    }
    setSaving(false)
  }

  const segments = currentPath ? currentPath.split('/').filter(Boolean) : []

  const openTerminalHere = () => {
    const label = segments.length ? segments[segments.length - 1] : (root ?? 'root')
    onOpenTerminal(currentPath, label)
  }

  if (root === undefined) {
    return <div style={{ padding: '20px 24px', color: 'var(--muted)', fontSize: 13 }}>{T('projects_loading')}…</div>
  }

  if (!root || editingRoot) {
    return (
      <div style={{ padding: '20px 24px' }}>
        <SectionLabel>{T('projects_title')}</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, maxWidth: 560, marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{T('projects_setup_title')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>{T('projects_setup_desc')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveRoot() }}
              placeholder="/home/kira/codemark"
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--mono)' }}
            />
            <button onClick={handleSaveRoot} disabled={saving || !pathInput.trim()} style={{ background: 'rgba(116,185,255,.15)', border: '1px solid rgba(116,185,255,.4)', color: 'var(--blue)', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: saving ? .6 : 1 }}>{saving ? '…' : T('save')}</button>
            {root && <button onClick={() => { setEditingRoot(false); setSaveError(null) }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>{T('cancel')}</button>}
          </div>
          {saveError && <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(229,62,62,.3)', background: 'var(--red-glow)', color: 'var(--red2)', fontSize: 12 }}>{saveError}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <SectionLabel>{T('projects_title')}</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setPathInput(root); setEditingRoot(true) }} style={miniBtn}>⚙ {T('projects_change_root')}</button>
          <button onClick={openTerminalHere} title={liveTerminals.has(currentPath) ? T('terminal_running_hint') : undefined} style={{ ...miniBtn, display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(56,217,169,.1)', border: '1px solid rgba(56,217,169,.35)', color: 'var(--green)' }}>
            {liveTerminals.has(currentPath) && <LiveDot />}
            🖳 {T('terminal_open_here')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, fontFamily: 'var(--mono)' }}>
        <button onClick={() => browse('')} style={crumbBtn(currentPath === '')}>{root}</button>
        {segments.map((seg, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--muted)' }}>/</span>
            <button onClick={() => browse(segments.slice(0, i + 1).join('/'))} style={crumbBtn(i === segments.length - 1)}>{seg}</button>
          </span>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {loadingEntries ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('projects_loading')}…</div>
        ) : browseError ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--red2)', fontSize: 13 }}>{browseError}</div>
        ) : !entries || entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('projects_empty')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {[T('name'), T('projects_modified'), ''].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {entries.map(entry => {
                const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
                const isLive = entry.isDirectory && liveTerminals.has(entryPath)
                return (
                  <tr key={entry.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      {entry.isDirectory ? (
                        <button onClick={() => browse(entryPath)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>📁</span>{entry.name}
                          {isLive && <span title={T('terminal_running_hint')} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: 'var(--green)' }}><LiveDot />{T('terminal_running')}</span>}
                        </button>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ opacity: .5 }}>📄</span>{entry.name}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{new Date(entry.mtime).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {entry.isDirectory && (
                        <button onClick={() => onOpenTerminal(entryPath, entry.name)} title={isLive ? T('terminal_running_hint') : `${T('terminal_open_here')}: ${entry.name}`} style={{ background: isLive ? 'rgba(56,217,169,.1)' : 'transparent', border: `1px solid ${isLive ? 'rgba(56,217,169,.4)' : 'var(--border2)'}`, color: isLive ? 'var(--green)' : 'var(--subtle)', padding: '4px 9px', borderRadius: 6, fontSize: 12 }}>🖳</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}

function crumbBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(229,62,62,.12)' : 'transparent',
    border: `1px solid ${active ? 'rgba(229,62,62,.3)' : 'transparent'}`,
    color: active ? 'var(--red2)' : 'var(--subtle)',
    padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
  }
}

const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted)', padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer' }

function SectionLabel({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.6px', color: 'var(--muted)', textTransform: 'uppercase' }}>{children}</div> }

function LiveDot() {
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} />
}
