import { useLang } from '../context/LangContext'
import type { TerminalSessionMeta } from '../hooks/useTerminalSessions'

interface Props {
  session: TerminalSessionMeta
  onRestore: () => void
  onStop: () => void
}

export function TerminalSessionChip({ session, onRestore, onStop }: Props) {
  const { T } = useLang()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 10, padding: '8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,.4)', minWidth: 180, maxWidth: 240 }}>
      <button onClick={onRestore} title={T('terminal_restore')} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 13 }}>🖳</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.label}</span>
      </button>
      <button onClick={onStop} title={T('terminal_stop_hint')} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}>✕</button>
    </div>
  )
}
