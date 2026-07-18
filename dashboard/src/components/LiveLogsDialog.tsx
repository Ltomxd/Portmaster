import { useEffect, useRef } from 'react'
import { useLang } from '../context/LangContext'
import type { LogSession } from '../hooks/useLogSessions'

interface Props {
  session: LogSession
  onHide: () => void
  onMinimize: () => void
  onToggleFullscreen: () => void
  onTogglePause: () => void
  onClear: () => void
  onStop: () => void
  onReconnect: () => void
}

export function LiveLogsDialog({ session, onHide, onMinimize, onToggleFullscreen, onTogglePause, onClear, onStop, onReconnect }: Props) {
  const { T } = useLang()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const wasAtBottomRef = useRef(true)
  const { kind, title, subtitle, status, errorMsg, source, lines, paused, pendingCount, fullscreen } = session

  useEffect(() => {
    const el = scrollRef.current
    if (!el || paused) return
    if (wasAtBottomRef.current) el.scrollTop = el.scrollHeight
  }, [lines, paused])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onHide() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onHide])

  const statusMeta: Record<LogSession['status'], { color: string; label: string }> = {
    connecting: { color: 'var(--yellow)', label: T('logs_connecting') },
    live: { color: 'var(--green)', label: T('logs_live') },
    closed: { color: 'var(--muted)', label: T('logs_closed') },
    error: { color: 'var(--red2)', label: T('logs_error') },
  }
  const sm = statusMeta[status]
  const kindIcon = kind === 'docker' ? '🐳' : kind === 'pm2' ? '⚙️' : kind === 'managed' ? '🔁' : '🗒️'
  const usingFile = source?.startsWith('file:')

  return (
    <div onClick={onHide} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={fullscreen
          ? { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 20, width: '96vw', height: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }
          : { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 20, width: 'min(96vw, 860px)', height: 'min(82vh, 640px)', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 18 }}>{kindIcon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{T('logs_title')} — {title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>{subtitle}{usingFile ? ` · ${T('logs_source_file')}: ${source!.slice(5)}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: sm.color, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.color, display: 'inline-block', animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />
              {sm.label}
            </span>
            <button onClick={onMinimize} title={T('logs_minimize')} style={iconBtn}>🗕</button>
            <button onClick={onToggleFullscreen} title={fullscreen ? T('logs_exit_fullscreen') : T('logs_fullscreen')} style={iconBtn}>{fullscreen ? '⤡' : '⛶'}</button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#0a0a12', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.6, color: 'var(--subtle)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        >
          {lines.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontFamily: status === 'live' && kind === 'journal' && !usingFile ? 'inherit' : 'var(--mono)', wordBreak: status === 'live' && kind === 'journal' && !usingFile ? 'normal' : 'break-all', lineHeight: 1.7, maxWidth: 560 }}>
              {status === 'connecting' && `${T('logs_connecting')}…`}
              {status === 'error' && (errorMsg ?? T('logs_error'))}
              {status === 'live' && (kind === 'journal' && !usingFile ? T('logs_journal_hint') : `${T('logs_waiting')}…`)}
              {status === 'closed' && T('logs_closed')}
            </div>
          ) : lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onTogglePause} style={miniBtn}>{paused ? `▶ ${T('resume')}${pendingCount ? ` (${pendingCount})` : ''}` : `⏸ ${T('pause')}`}</button>
            <button onClick={onClear} style={miniBtn}>🗑 {T('logs_clear')}</button>
            {(status === 'closed' || status === 'error') && <button onClick={onReconnect} style={miniBtn}>↻ {T('logs_reconnect')}</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onHide} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('logs_close')}</button>
            <button onClick={onStop} title={T('logs_stop_hint')} style={{ background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>⏹ {T('logs_stop')}</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>{T('logs_close_hint')}</div>
      </div>
    </div>
  )
}

const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted)', padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500 }
const iconBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '4px 9px', borderRadius: 7, fontSize: 13, lineHeight: 1 }
