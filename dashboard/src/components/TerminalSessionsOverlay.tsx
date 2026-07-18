import { lazy, Suspense } from 'react'
import type { TerminalSessionMeta } from '../hooks/useTerminalSessions'
import { TerminalSessionChip } from './TerminalSessionChip'

// xterm.js is a substantial chunk most sessions never touch — load it only
// once a terminal is actually shown.
const TerminalPanel = lazy(() => import('./TerminalPanel').then(m => ({ default: m.TerminalPanel })))

interface Props {
  sessions: Record<string, TerminalSessionMeta>
  onRestore: (cwd: string) => void
  onHide: (cwd: string) => void
  onMinimize: (cwd: string) => void
  onStop: (cwd: string) => void
}

// Mirrors LogSessionsOverlay: at most one terminal fully on screen, the
// rest tucked into a tray. Positioned bottom-left (log chips live
// bottom-right) so the two trays never overlap when both are in use.
export function TerminalSessionsOverlay({ sessions, onRestore, onHide, onMinimize, onStop }: Props) {
  const list = Object.values(sessions)
  const active = list.find(s => s.visible && !s.minimized)
  const minimizedList = list.filter(s => s.minimized)

  return (
    <>
      {active && (
        <Suspense fallback={null}>
          <TerminalPanel
            cwd={active.cwd}
            label={active.label}
            onHide={() => onHide(active.cwd)}
            onMinimize={() => onMinimize(active.cwd)}
            onStop={() => onStop(active.cwd)}
          />
        </Suspense>
      )}

      {minimizedList.length > 0 && (
        <div style={{ position: 'fixed', left: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 224 }}>
          {minimizedList.map(s => (
            <TerminalSessionChip key={s.cwd} session={s} onRestore={() => onRestore(s.cwd)} onStop={() => onStop(s.cwd)} />
          ))}
        </div>
      )}
    </>
  )
}
