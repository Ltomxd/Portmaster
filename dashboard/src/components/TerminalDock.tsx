import { useRef, useState } from 'react'
import { useLang } from '../context/LangContext'
import type { TerminalSessionMeta } from '../hooks/useTerminalSessions'

interface Props {
  sessions: TerminalSessionMeta[]
  onRestore: (cwd: string) => void
  onStop: (cwd: string) => void
}

const DRAG_THRESHOLD = 4 // px of movement before a pointerdown counts as a drag instead of a click

// Once more than two terminal windows exist, juggling them through the tiny
// bottom-left chip tray stops scaling — this is a single, freely draggable
// dock (like the tray, but it never auto-hides) that expands into a list of
// every terminal (open or minimized) so you can jump straight to any of them.
export function TerminalDock({ sessions, onRestore, onStop }: Props) {
  const { T } = useLang()
  // Defaults to the right edge, vertically centered — the bottom-left corner
  // belongs to the app's own sidebar footer (language/audit/password
  // controls) and bottom-right to the log-session tray, so neither bottom
  // corner is free real estate. It's fully draggable from here regardless.
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 70), y: Math.max(16, window.innerHeight / 2 - 20) }))
  const [open, setOpen] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    const maxX = Math.max(8, window.innerWidth - 60)
    const maxY = Math.max(8, window.innerHeight - 60)
    setPos({ x: Math.min(Math.max(d.origX + dx, 8), maxX), y: Math.min(Math.max(d.origY + dy, 8), maxY) })
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    if (d && !d.moved) setOpen(o => !o)
    dragRef.current = null
  }

  const panelBelow = pos.y < window.innerHeight / 2
  const panelRight = pos.x > window.innerWidth / 2

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 226 }}>
      {open && (
        <div
          style={{
            position: 'absolute', [panelRight ? 'right' : 'left']: 0, [panelBelow ? 'top' : 'bottom']: 'calc(100% + 8px)',
            width: 240, maxHeight: '50vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.5)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
            animation: panelBelow ? 'slideDown .12s ease' : 'slideUp .12s ease',
          } as React.CSSProperties}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', padding: '2px 6px 4px' }}>{T('terminal_dock_heading')} ({sessions.length})</div>
          {sessions.map(s => (
            <div key={s.cwd} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '6px 8px' }}>
              <button
                onClick={() => { onRestore(s.cwd); setOpen(false) }}
                title={T('terminal_restore')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              >
                {/* Every session listed here — shown or minimized — is a shell that's
                    actually running (minimized ones stay connected in the background,
                    they're not paused), so the dot always reads as live. */}
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: 'var(--green)', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
              </button>
              <button onClick={() => onStop(s.cwd)} title={T('terminal_stop_hint')} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title={T('terminal_dock_toggle')}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 999, padding: '8px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.4)', cursor: 'grab', touchAction: 'none', color: 'var(--text)',
        }}
      >
        <span style={{ fontSize: 14 }}>🖳</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{sessions.length}</span>
      </button>
    </div>
  )
}
