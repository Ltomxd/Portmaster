import { useLang } from '../context/LangContext'
import type { LogSession } from '../hooks/useLogSessions'

interface Props {
  session: LogSession
  onRestore: () => void
  onStop: () => void
}

export function LogSessionChip({ session, onRestore, onStop }: Props) {
  const { T } = useLang()
  const { kind, title, status, pendingCount } = session
  const kindIcon = kind === 'docker' ? '🐳' : kind === 'pm2' ? '⚙️' : kind === 'managed' ? '🔁' : '🗒️'
  const color = status === 'live' ? 'var(--green)' : status === 'error' ? 'var(--red2)' : status === 'connecting' ? 'var(--yellow)' : 'var(--muted)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 200, maxWidth: 260 }}>
      <button onClick={onRestore} title={T('logs_restore')} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />
        <span style={{ fontSize: 13, flexShrink: 0 }}>{kindIcon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {pendingCount > 0 && <span style={{ fontSize: 10, color: 'var(--yellow)', fontWeight: 700, flexShrink: 0 }}>+{pendingCount}</span>}
      </button>
      <button onClick={onStop} title={T('logs_stop_hint')} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}>✕</button>
    </div>
  )
}
