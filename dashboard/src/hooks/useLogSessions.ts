import { useState, useRef, useCallback, useEffect } from 'react'

export type LogKind = 'docker' | 'pm2' | 'journal' | 'managed'
export type LogStatus = 'connecting' | 'live' | 'closed' | 'error'

export interface LogTarget { kind: LogKind; id: string | number; title: string; subtitle?: string }

export interface LogSession {
  key: string
  kind: LogKind
  id: string | number
  title: string
  subtitle?: string
  status: LogStatus
  errorMsg: string | null
  source: string | null
  lines: string[]
  pendingCount: number
  paused: boolean
  minimized: boolean
  visible: boolean
  fullscreen: boolean
}

interface Ephemeral {
  status: LogStatus
  errorMsg: string | null
  source: string | null
}

const MAX_LINES = 2000
const FLUSH_MS = 200
const STORAGE_KEY = 'portmaster:logs'

function keyOf(kind: LogKind, id: string | number) { return `${kind}:${id}` }

function loadPersisted(): LogTarget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((t): t is LogTarget => t && typeof t.kind === 'string' && (typeof t.id === 'string' || typeof t.id === 'number') && typeof t.title === 'string') : []
  } catch { return [] }
}

// A "session" is the WebSocket + accumulated output for one log target. It
// lives here, independent of any dialog component's mount state — closing
// or minimizing the viewer never touches the connection, so the underlying
// `docker logs -f` / `tail -f` / `journalctl -f` keeps running until the
// user explicitly stops it. Reopening the same target reuses the session
// instead of reconnecting, so nothing gets re-executed.
//
// WS message handlers never call setSessions directly. open() dispatches a
// state update to create the fresh session and, in the same tick, calls
// connect() — but React only *commits* that state update on its own
// schedule, and a same-machine WebSocket can round-trip its first message
// before that commit lands. A handler that wrote straight into React state
// would silently no-op for any message caught in that gap (the session
// isn't there yet to update), which reads as "stuck on Connecting forever"
// since nothing ever revisits a dropped update. So every WS handler instead
// writes to a plain ref — always available immediately — and one recurring
// timer copies ref state into React state for whatever sessions currently
// exist. Worst case a message waits one 200ms tick; it never gets lost.
export function useLogSessions() {
  const [sessions, setSessions] = useState<Record<string, LogSession>>({})
  const wsMap = useRef<Map<string, WebSocket>>(new Map())
  const bufferMap = useRef<Map<string, string[]>>(new Map())
  const pausedMap = useRef<Map<string, boolean>>(new Map())
  const ephemeralMap = useRef<Map<string, Ephemeral>>(new Map())
  // Guards the sync-to-storage effect below from firing (with an empty
  // `sessions`) before the restore effect below has queued its updates —
  // otherwise the very first render's empty state would wipe out the
  // persisted list moments before the restored sessions land.
  const hydratedRef = useRef(false)

  const patch = useCallback((key: string, p: Partial<LogSession> | ((s: LogSession) => Partial<LogSession>)) => {
    setSessions(prev => {
      const cur = prev[key]
      if (!cur) return prev
      const delta = typeof p === 'function' ? p(cur) : p
      return { ...prev, [key]: { ...cur, ...delta } }
    })
  }, [])

  // Syncs ref-held ephemeral status + buffered lines into visible state on a
  // fixed cadence — batches chatty streams into one React update instead of
  // one per WS message, and (see note above) is the only thing that ever
  // writes WS-driven data into session state, sidestepping the create/first-
  // message race entirely.
  useEffect(() => {
    const timer = setInterval(() => {
      setSessions(prev => {
        let changed = false
        const next = { ...prev }
        for (const [key, eph] of ephemeralMap.current) {
          const sess = next[key]
          if (!sess) continue
          const buf = bufferMap.current.get(key) ?? []
          const paused = pausedMap.current.get(key)

          let updated = sess
          let dirty = false
          if (sess.status !== eph.status || sess.errorMsg !== eph.errorMsg || sess.source !== eph.source) {
            updated = { ...updated, status: eph.status, errorMsg: eph.errorMsg, source: eph.source }
            dirty = true
          }
          if (buf.length) {
            if (paused) {
              if (updated.pendingCount !== buf.length) { updated = { ...updated, pendingCount: buf.length }; dirty = true }
            } else {
              updated = { ...updated, lines: [...updated.lines, ...buf].slice(-MAX_LINES), pendingCount: 0 }
              bufferMap.current.set(key, [])
              dirty = true
            }
          }
          if (dirty) { next[key] = updated; changed = true }
        }
        return changed ? next : prev
      })
    }, FLUSH_MS)
    return () => clearInterval(timer)
  }, [])

  const connect = useCallback((key: string, kind: LogKind, id: string | number) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws-logs/${kind}/${encodeURIComponent(String(id))}`)
    wsMap.current.set(key, ws)
    bufferMap.current.set(key, [])
    pausedMap.current.set(key, false)
    ephemeralMap.current.set(key, { status: 'connecting', errorMsg: null, source: null })

    const setEph = (patchEph: Partial<Ephemeral>) => {
      const cur = ephemeralMap.current.get(key)
      if (cur) ephemeralMap.current.set(key, { ...cur, ...patchEph })
    }

    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'line') {
          setEph({ status: 'live' })
          const newLines = String(msg.data).split(/\r?\n/).filter((l: string) => l.length > 0)
          if (newLines.length) bufferMap.current.get(key)?.push(...newLines)
        } else if (msg.type === 'error') {
          setEph({ status: 'error', errorMsg: msg.data })
        } else if (msg.type === 'status') {
          if (msg.data === 'closed') {
            const cur = ephemeralMap.current.get(key)
            if (cur && cur.status !== 'error') setEph({ status: 'closed' })
          } else if (String(msg.data).startsWith('live')) {
            const parts = String(msg.data).split(':')
            setEph({ status: 'live', source: parts.length > 1 ? parts.slice(1).join(':') : null })
          }
        }
      } catch {}
    }
    ws.onerror = () => setEph({ status: 'error' })
    ws.onclose = () => {
      const cur = ephemeralMap.current.get(key)
      if (cur && cur.status !== 'error') setEph({ status: 'closed' })
    }
  }, [])

  // Tracks which keys have ever been connected — checked synchronously so
  // open() knows immediately whether to call connect(), instead of reading
  // a closure flag set inside the setSessions updater. React only runs that
  // updater on its own schedule (synchronously for a plain click, but
  // *not* when open() is invoked from a promise callback — e.g. right after
  // `await adoptPort(...)` resolves), so a flag read immediately after
  // calling setSessions() could still be stale, silently skipping
  // connect() and leaving the dialog stuck on "Connecting" forever with no
  // WebSocket ever opened.
  const knownKeysRef = useRef<Set<string>>(new Set())

  // Opening a target: reuse the live session if one exists (never
  // re-executes), otherwise start a fresh one. Any other session that was
  // fully open gets tucked into the minimized tray rather than losing it.
  const open = useCallback((target: LogTarget) => {
    const key = keyOf(target.kind, target.id)
    const isNew = !knownKeysRef.current.has(key)
    if (isNew) knownKeysRef.current.add(key)

    setSessions(prev => {
      const demote = (s: LogSession) => (s.visible && !s.minimized ? { ...s, visible: false, minimized: true } : s)
      const others = Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, k === key ? s : demote(s)]))

      if (prev[key]) {
        return { ...others, [key]: { ...prev[key], visible: true, minimized: false } }
      }
      const fresh: LogSession = {
        key, kind: target.kind, id: target.id, title: target.title, subtitle: target.subtitle,
        status: 'connecting', errorMsg: null, source: null, lines: [], pendingCount: 0,
        paused: false, minimized: false, visible: true, fullscreen: false,
      }
      return { ...others, [key]: fresh }
    })
    if (isNew) connect(key, target.kind, target.id)
  }, [connect])

  const restore = useCallback((key: string) => {
    setSessions(prev => {
      if (!prev[key]) return prev
      const demote = (s: LogSession) => (s.visible && !s.minimized ? { ...s, visible: false, minimized: true } : s)
      const others = Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, k === key ? s : demote(s)]))
      return { ...others, [key]: { ...prev[key], visible: true, minimized: false } }
    })
  }, [])

  // Hide: dismiss the viewer entirely, no visible reminder — the session
  // (and its connection) keeps running; opening the same target again picks
  // up right where it left off.
  const hide = useCallback((key: string) => patch(key, { visible: false, minimized: false }), [patch])
  // Minimize: same "keep running" contract as hide, but leaves a small
  // persistent chip so it's easy to get back to.
  const minimize = useCallback((key: string) => patch(key, { visible: false, minimized: true }), [patch])
  const toggleFullscreen = useCallback((key: string) => patch(key, s => ({ fullscreen: !s.fullscreen })), [patch])

  const togglePause = useCallback((key: string) => {
    setSessions(prev => {
      const cur = prev[key]; if (!cur) return prev
      const next = !cur.paused
      pausedMap.current.set(key, next)
      if (!next) {
        const buf = bufferMap.current.get(key) ?? []
        bufferMap.current.set(key, [])
        return { ...prev, [key]: { ...cur, paused: next, lines: [...cur.lines, ...buf].slice(-MAX_LINES), pendingCount: 0 } }
      }
      return { ...prev, [key]: { ...cur, paused: next } }
    })
  }, [])

  const clearLines = useCallback((key: string) => patch(key, { lines: [], pendingCount: 0 }), [patch])

  // The only action that actually ends the underlying process — everything
  // else above just changes what's on screen.
  const stop = useCallback((key: string) => {
    wsMap.current.get(key)?.close()
    wsMap.current.delete(key)
    bufferMap.current.delete(key)
    pausedMap.current.delete(key)
    ephemeralMap.current.delete(key)
    knownKeysRef.current.delete(key)
    setSessions(prev => { const n = { ...prev }; delete n[key]; return n })
  }, [])

  const reconnect = useCallback((key: string) => {
    const cur = sessions[key]
    if (!cur) return
    wsMap.current.get(key)?.close()
    connect(key, cur.kind, cur.id)
    patch(key, { status: 'connecting', errorMsg: null, source: null })
  }, [sessions, connect, patch])

  useEffect(() => () => { for (const ws of wsMap.current.values()) ws.close() }, [])

  // A reload or an accidentally-closed tab loses this component's state,
  // but the underlying source doesn't: docker/pm2/journal targets just
  // re-tail their own persistent log store, and managed (adopted) targets
  // tap the still-running supervisor pipe directly — either way reconnecting
  // is exactly as good as never having disconnected. Bring the tray chips
  // back (minimized, never full-screen) for whatever was open before.
  useEffect(() => {
    for (const target of loadPersisted()) {
      open(target)
      minimize(keyOf(target.kind, target.id))
    }
    hydratedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep localStorage in sync so the tray survives a reload/tab close.
  useEffect(() => {
    if (!hydratedRef.current) return
    const list: LogTarget[] = Object.values(sessions).map(s => ({ kind: s.kind, id: s.id, title: s.title, subtitle: s.subtitle }))
    try {
      if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [sessions])

  return { sessions, open, hide, minimize, restore, toggleFullscreen, togglePause, clearLines, stop, reconnect }
}
