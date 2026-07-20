import { lazy, Suspense } from 'react'
import type { TerminalSessionMeta } from '../hooks/useTerminalSessions'
import { TerminalSessionChip } from './TerminalSessionChip'
import { TerminalDock } from './TerminalDock'

// xterm.js is a substantial chunk most sessions never touch — load it only
// once a terminal is actually shown.
const TerminalPanel = lazy(() => import('./TerminalPanel').then(m => ({ default: m.TerminalPanel })))

interface Props {
  sessions: Record<string, TerminalSessionMeta>
  onRestore: (cwd: string) => void
  onHide: (cwd: string) => void
  onMinimize: (cwd: string) => void
  onStop: (cwd: string) => void
  onMove: (cwd: string, x: number, y: number) => void
  onFocus: (cwd: string) => void
  onCommandSent: (cwd: string) => void
}

// Each terminal is an independently positioned, freely draggable floating
// window (see TerminalPanel) — there's no shared modal backdrop, so several
// can be on screen and moved around at once. Once more than two sessions
// exist (open or minimized), a single draggable TerminalDock takes over as
// the way to jump between them instead of the small bottom-left tray.
export function TerminalSessionsOverlay({ sessions, onRestore, onHide, onMinimize, onStop, onMove, onFocus, onCommandSent }: Props) {
  const list = Object.values(sessions)
  const activeList = list.filter(s => s.visible && !s.minimized)
  const minimizedList = list.filter(s => s.minimized)
  // Minimized sessions stay mounted (just visually hidden — see TerminalPanel's
  // `hidden` prop) instead of unmounting, so their WebSocket and shell output
  // keep running in the background: restoring one is instant, never a reconnect.
  const mountedList = list.filter(s => s.visible || s.minimized)
  const showDock = list.length > 2
  const topCwd = activeList.reduce<string | null>((top, s) => (!top || s.z > sessions[top].z ? s.cwd : top), null)

  return (
    <>
      <Suspense fallback={null}>
        {mountedList.map(s => (
          <TerminalPanel
            key={s.cwd}
            cwd={s.cwd}
            label={s.label}
            x={s.x}
            y={s.y}
            zIndex={s.z}
            focused={s.cwd === topCwd}
            hidden={!s.visible}
            pendingCommand={s.pendingCommand}
            onCommandSent={() => onCommandSent(s.cwd)}
            onHide={() => onHide(s.cwd)}
            onMinimize={() => onMinimize(s.cwd)}
            onStop={() => onStop(s.cwd)}
            onMove={(x, y) => onMove(s.cwd, x, y)}
            onFocus={() => onFocus(s.cwd)}
          />
        ))}
      </Suspense>

      {showDock ? (
        <TerminalDock sessions={list} onRestore={onRestore} onStop={onStop} />
      ) : (
        minimizedList.length > 0 && (
          <div style={{ position: 'fixed', left: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 224 }}>
            {minimizedList.map(s => (
              <TerminalSessionChip key={s.cwd} session={s} onRestore={() => onRestore(s.cwd)} onStop={() => onStop(s.cwd)} />
            ))}
          </div>
        )
      )}
    </>
  )
}
