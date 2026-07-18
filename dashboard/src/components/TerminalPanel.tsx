import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import './TerminalPanel.css'
import { useLang } from '../context/LangContext'

const FONT_FAMILY = '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, "Symbols Nerd Font Mono", monospace'

// Portmaster's palette doubling as the terminal's 16-color ANSI theme, so a
// prompt's colors read as part of the app instead of a generic black box.
const TERMINAL_THEME = {
  background: '#0a0a12',
  foreground: '#e8e8f0',
  cursor: '#fc5858',
  cursorAccent: '#0a0a12',
  selectionBackground: 'rgba(252,88,88,.28)',
  black: '#141418',
  red: '#fc5858',
  green: '#38d9a9',
  yellow: '#ffd166',
  blue: '#74b9ff',
  magenta: '#c084fc',
  cyan: '#4dd4dd',
  white: '#e8e8f0',
  brightBlack: '#5a5a78',
  brightRed: '#ff8080',
  brightGreen: '#6fe6c4',
  brightYellow: '#ffe08a',
  brightBlue: '#a0d2ff',
  brightMagenta: '#d9b3ff',
  brightCyan: '#7fe8ee',
  brightWhite: '#ffffff',
}

interface Props {
  cwd: string        // relative path from the projects root
  label: string       // display title, e.g. the folder name
  embedded?: boolean  // rendered side-by-side in a split view — no own backdrop, no fullscreen
  pendingCommand?: string // run once right after connecting (saved commands), then cleared
  onCommandSent?: () => void
  onHide: () => void
  onMinimize: () => void
  onStop: () => void
}

type Status = 'connecting' | 'live' | 'closed' | 'error'

// A real interactive shell (node-pty on the server) rendered with xterm.js.
// The PTY lives server-side, keyed by cwd, independent of this component's
// mount state (see src/core/terminal.ts) — hiding or minimizing this panel
// only drops the WebSocket, never the shell. Reopening the same folder
// reconnects and replays whatever ran while it was closed, so something
// like `pnpm run dev` keeps going. Only onStop actually ends it.
export function TerminalPanel({ cwd, label, embedded, pendingCommand, onCommandSent, onHide, onMinimize, onStop }: Props) {
  const { T } = useLang()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [fullscreen, setFullscreen] = useState(false)

  // Kept current on every render but read only once, at connect time — the
  // main effect below only depends on `cwd`, so it must not reconnect just
  // because a fresh pendingCommand/onCommandSent identity came in.
  const pendingCommandRef = useRef(pendingCommand)
  const onCommandSentRef = useRef(onCommandSent)
  useEffect(() => { pendingCommandRef.current = pendingCommand; onCommandSentRef.current = onCommandSent })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let cleanup = () => {}

    // xterm's canvas renderer rasterizes each glyph with whatever font is
    // ready at that instant — unlike DOM text, it doesn't repaint on a
    // late-arriving web font. Wait for both fonts before the first prompt
    // is drawn, or icons flash as tofu boxes until the next full redraw.
    Promise.all([
      document.fonts.load(`13px "Symbols Nerd Font Mono"`),
      document.fonts.load(`13px "JetBrains Mono"`),
    ]).catch(() => {}).then(() => {
      if (cancelled || !containerRef.current) return

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        lineHeight: 1.3,
        fontFamily: FONT_FAMILY,
        theme: TERMINAL_THEME,
        scrollback: 5000,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)
      fit.fit()
      termRef.current = term
      fitRef.current = fit

      // GPU-rendered glyphs instead of the DOM renderer — the difference is
      // most visible under bursty output (a build log, `ls` on a huge dir)
      // where the default renderer can visibly fall behind. Not every GPU
      // driver plays nice with WebGL2 in a browser, so this is best-effort:
      // fall back to the default renderer silently on failure or context loss.
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => { try { webgl.dispose() } catch {} })
        term.loadAddon(webgl)
      } catch {}

      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws-terminal?cwd=${encodeURIComponent(cwd)}&cols=${term.cols}&rows=${term.rows}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('live')
        // Give tmux's attach redraw a beat to land before typing over it.
        if (pendingCommandRef.current) {
          const cmd = pendingCommandRef.current
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }))
            onCommandSentRef.current?.()
          }, 200)
        }
      }
      ws.onmessage = e => {
        // PTY output arrives as a raw binary frame (see server.ts) — skips
        // JSON parsing on the hottest path so bursty output (command
        // execution, fast scrolling) renders without added overhead.
        // Everything else (status/error/exit) is a small, rare JSON frame.
        if (e.data instanceof ArrayBuffer) { term.write(new Uint8Array(e.data)); return }
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'status' && msg.data === 'reattached') term.write(`\x1b[90m[${T('terminal_reattached')}]\x1b[0m\r\n`)
          else if (msg.type === 'error') { setStatus('error'); term.write(`\r\n\x1b[31m[error] ${msg.data}\x1b[0m\r\n`) }
          else if (msg.type === 'exit') { setStatus('closed'); term.write(`\r\n\x1b[90m[${T('terminal_exited')}]\x1b[0m\r\n`) }
        } catch {}
      }
      ws.onerror = () => setStatus('error')
      ws.onclose = () => setStatus(s => (s === 'error' ? s : 'closed'))

      const dataSub = term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      const resizeObserver = new ResizeObserver(() => {
        try { fit.fit() } catch {}
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      })
      resizeObserver.observe(container)
      term.focus()

      cleanup = () => {
        dataSub.dispose()
        resizeObserver.disconnect()
        ws.close()
        term.dispose()
      }
    })

    return () => { cancelled = true; cleanup() }
  }, [cwd])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try { fitRef.current?.fit() } catch {}
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [fullscreen])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !fullscreen) onHide() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onHide, fullscreen])

  const statusMeta: Record<Status, { color: string; label: string }> = {
    connecting: { color: 'var(--yellow)', label: T('logs_connecting') },
    live: { color: 'var(--green)', label: T('terminal_live') },
    closed: { color: 'var(--muted)', label: T('logs_closed') },
    error: { color: 'var(--red2)', label: T('logs_error') },
  }
  const sm = statusMeta[status]

  const card = (
    <div
      onClick={e => e.stopPropagation()}
      style={embedded
        ? { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)' }
        : fullscreen
          ? { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, width: '96vw', height: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }
          : { background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, width: 'min(96vw, 900px)', height: 'min(80vh, 560px)', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>🖳</span>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{T('terminal_title')} — {label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: sm.color, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.color, display: 'inline-block', animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />
            {sm.label}
          </span>
          <button onClick={onMinimize} title={T('logs_minimize')} style={iconBtn}>🗕</button>
          {!embedded && <button onClick={() => setFullscreen(f => !f)} title={fullscreen ? T('logs_exit_fullscreen') : T('logs_fullscreen')} style={iconBtn}>{fullscreen ? '⤡' : '⛶'}</button>}
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', background: '#0a0a12', padding: '6px 8px' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button onClick={onHide} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('logs_close')}</button>
        <button onClick={onStop} title={T('terminal_stop_hint')} style={{ background: 'var(--red-glow)', border: '1px solid rgba(229,62,62,.35)', color: 'var(--red2)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>⏹ {T('logs_stop')}</button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>{T('terminal_close_hint')}</div>
    </div>
  )

  if (embedded) return card

  return (
    <div onClick={onHide} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(3px)', zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      {card}
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '4px 9px', borderRadius: 7, fontSize: 13, lineHeight: 1 }
