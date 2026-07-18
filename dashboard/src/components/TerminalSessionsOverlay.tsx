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
  onCommandSent: (cwd: string) => void
}

// Mirrors LogSessionsOverlay: up to two terminals on screen at once (side
// by side, via openSplit), the rest tucked into a tray. Positioned
// bottom-left (log chips live bottom-right) so the two trays never overlap.
export function TerminalSessionsOverlay({ sessions, onRestore, onHide, onMinimize, onStop, onCommandSent }: Props) {
  const list = Object.values(sessions)
  const activeList = list.filter(s => s.visible && !s.minimized)
  const minimizedList = list.filter(s => s.minimized)
  const split = activeList.length > 1

  return (
    <>
      {activeList.length > 0 && (
        <div
          onClick={() => onHide(activeList[activeList.length - 1].cwd)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 230, display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: split ? 14 : 0, padding: split ? '4vh 3vw' : 0, animation: 'fadeIn .15s' }}
        >
          <Suspense fallback={null}>
            {activeList.map(s => (
              <TerminalPanel
                key={s.cwd}
                cwd={s.cwd}
                label={s.label}
                embedded={split}
                pendingCommand={s.pendingCommand}
                onCommandSent={() => onCommandSent(s.cwd)}
                onHide={() => onHide(s.cwd)}
                onMinimize={() => onMinimize(s.cwd)}
                onStop={() => onStop(s.cwd)}
              />
            ))}
          </Suspense>
        </div>
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
