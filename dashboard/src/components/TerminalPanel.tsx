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
  x: number           // floating window position, freely draggable via the title bar
  y: number
  zIndex: number      // stacking order — highest is the most recently focused window
  focused: boolean    // whether this is the topmost window (only it reacts to Escape)
  hidden?: boolean    // minimized — stays mounted and connected, just visually tucked away
  pendingCommand?: string // run once right after connecting (saved commands), then cleared
  onCommandSent?: () => void
  onHide: () => void
  onMinimize: () => void
  onStop: () => void
  onMove: (x: number, y: number) => void
  onFocus: () => void
}

// How long to wait before retrying after the connection drops for a reason
// other than the shell itself exiting (e.g. the dashboard process restarting) —
// short enough to feel instant, long enough not to hammer a server that's
// still coming back up.
const RECONNECT_DELAY_MS = 1200

// Keeps the title bar reachable on screen after a drag, however far the
// window gets pushed — a plain clamp is enough since dragging only ever
// moves in small increments from wherever the pointer already is.
function clampPosition(x: number, y: number) {
  const maxX = Math.max(8, window.innerWidth - 160)
  const maxY = Math.max(0, window.innerHeight - 44)
  return { x: Math.min(Math.max(x, 8), maxX), y: Math.min(Math.max(y, 0), maxY) }
}

type Status = 'connecting' | 'live' | 'closed' | 'error'

// A real interactive shell (node-pty on the server) rendered with xterm.js.
// The PTY lives server-side, keyed by cwd, independent of this component's
// mount state (see src/core/terminal.ts). Minimizing keeps this component
// mounted (just visually hidden — see the `hidden` prop) so the WebSocket
// and the shell's live output stay connected the whole time; only unmounting
// (an explicit "Close") or a real network drop tears down the socket, and an
// unexpected drop (e.g. the dashboard process itself restarting) reconnects
// on its own instead of sitting there looking dead. Only onStop actually
// ends the underlying shell.
export function TerminalPanel({ cwd, label, x, y, zIndex, focused, hidden, pendingCommand, onCommandSent, onHide, onMinimize, onStop, onMove, onFocus }: Props) {
  const { T } = useLang()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [fullscreen, setFullscreen] = useState(false)
  // Pointer-drag state for the title bar; a ref (not state) since it's
  // written on every pointermove and shouldn't trigger re-renders.
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handleDragStart = (e: React.PointerEvent) => {
    if (fullscreen) return
    onFocus()
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: x, origY: y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const { x: nx, y: ny } = clampPosition(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY))
    onMove(nx, ny)
  }
  const handleDragEnd = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
  }

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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closeCurrentWs = () => {}
    let disposeTerm = () => {}

    // Opens (or reopens, after an unexpected drop) the WebSocket for an
    // already-created `term`. Split out from terminal setup below so a
    // dropped connection can be retried without recreating the xterm
    // instance (which would wipe the scrollback the user's looking at).
    function connectWs(term: Terminal) {
      if (cancelled) return
      setStatus('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws-terminal?cwd=${encodeURIComponent(cwd)}&cols=${term.cols}&rows=${term.rows}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
      // Set once the server confirms the shell itself ended — distinguishes
      // "the process exited" (don't reconnect, it'd just spawn a new shell)
      // from any other drop (server restart, network blip — the tmux
      // session is still alive server-side, so reconnecting just reattaches).
      let shellExited = false

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
          else if (msg.type === 'exit') { shellExited = true; setStatus('closed'); term.write(`\r\n\x1b[90m[${T('terminal_exited')}]\x1b[0m\r\n`) }
        } catch {}
      }
      ws.onerror = () => setStatus('error')
      ws.onclose = () => {
        setStatus(s => (s === 'error' ? s : 'closed'))
        if (!cancelled && !shellExited) reconnectTimer = setTimeout(() => connectWs(term), RECONNECT_DELAY_MS)
      }

      closeCurrentWs = () => { try { ws.close() } catch {} }
    }

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

      const dataSub = term.onData(data => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      const resizeObserver = new ResizeObserver(() => {
        try { fit.fit() } catch {}
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      })
      resizeObserver.observe(container)
      term.focus()

      disposeTerm = () => {
        dataSub.dispose()
        resizeObserver.disconnect()
        term.dispose()
      }
      connectWs(term)
    })

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      closeCurrentWs()
      disposeTerm()
    }
  }, [cwd])

  useEffect(() => {
    if (hidden) return
    const id = requestAnimationFrame(() => {
      try { fitRef.current?.fit() } catch {}
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [fullscreen, hidden])

  // Only the topmost window reacts to Escape — otherwise every open floating
  // terminal would hide itself at once, since each mounts its own listener.
  useEffect(() => {
    if (!focused) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !fullscreen) onHide() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onHide, fullscreen, focused])

  const statusMeta: Record<Status, { color: string; label: string }> = {
    connecting: { color: 'var(--yellow)', label: T('logs_connecting') },
    live: { color: 'var(--green)', label: T('terminal_live') },
    closed: { color: 'var(--muted)', label: T('logs_closed') },
    error: { color: 'var(--red2)', label: T('logs_error') },
  }
  const sm = statusMeta[status]

  // Every terminal is its own free-floating window now — positioned via
  // x/y (updated by dragging the title bar) rather than centered in a
  // shared modal backdrop, so several can be open and moved around at once.
  const positionStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', top: '3vh', left: '2vw', width: '96vw', height: '94vh', zIndex: 1000 }
    : { position: 'fixed', top: y, left: x, width: 'min(96vw, 900px)', height: 'min(80vh, 560px)', zIndex }

  return (
    <div
      onPointerDown={onFocus}
      style={{ ...positionStyle, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 16, display: hidden ? 'none' : 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}
    >
      <div
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, cursor: fullscreen ? 'default' : 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 16 }}>🖳</span>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{T('terminal_title')} — {label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: sm.color, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.color, display: 'inline-block', animation: status === 'live' ? 'pulse 2s infinite' : 'none' }} />
            {sm.label}
          </span>
          <button onPointerDown={e => e.stopPropagation()} onClick={onMinimize} title={T('logs_minimize')} style={iconBtn}>🗕</button>
          <button onPointerDown={e => e.stopPropagation()} onClick={() => setFullscreen(f => !f)} title={fullscreen ? T('logs_exit_fullscreen') : T('logs_fullscreen')} style={iconBtn}>{fullscreen ? '⤡' : '⛶'}</button>
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
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border2)', color: 'var(--subtle)', padding: '4px 9px', borderRadius: 7, fontSize: 13, lineHeight: 1 }
