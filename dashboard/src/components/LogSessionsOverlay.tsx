import { LiveLogsDialog } from './LiveLogsDialog'
import { LogSessionChip } from './LogSessionChip'
import type { LogSession } from '../hooks/useLogSessions'

interface Props {
  sessions: Record<string, LogSession>
  onRestore: (key: string) => void
  onHide: (key: string) => void
  onMinimize: (key: string) => void
  onToggleFullscreen: (key: string) => void
  onTogglePause: (key: string) => void
  onClear: (key: string) => void
  onStop: (key: string) => void
  onReconnect: (key: string) => void
}

// Renders at most one full dialog (the currently-focused session) plus a
// stack of chips for everything else that's still running in the
// background. Lives once at the app root so sessions survive tab switches.
export function LogSessionsOverlay({ sessions, onRestore, onHide, onMinimize, onToggleFullscreen, onTogglePause, onClear, onStop, onReconnect }: Props) {
  const list = Object.values(sessions)
  const active = list.find(s => s.visible && !s.minimized)
  const minimizedList = list.filter(s => s.minimized)

  return (
    <>
      {active && (
        <LiveLogsDialog
          session={active}
          onHide={() => onHide(active.key)}
          onMinimize={() => onMinimize(active.key)}
          onToggleFullscreen={() => onToggleFullscreen(active.key)}
          onTogglePause={() => onTogglePause(active.key)}
          onClear={() => onClear(active.key)}
          onStop={() => onStop(active.key)}
          onReconnect={() => onReconnect(active.key)}
        />
      )}

      {minimizedList.length > 0 && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 225 }}>
          {minimizedList.map(s => (
            <LogSessionChip key={s.key} session={s} onRestore={() => onRestore(s.key)} onStop={() => onStop(s.key)} />
          ))}
        </div>
      )}
    </>
  )
}
