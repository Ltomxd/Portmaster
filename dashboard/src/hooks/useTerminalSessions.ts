import { useCallback, useEffect, useRef, useState } from 'react'

export interface TerminalSessionMeta {
  cwd: string
  label: string
  visible: boolean
  minimized: boolean
  pendingCommand?: string
  x: number
  y: number
  z: number
}

const STORAGE_KEY = 'portmaster:terminals'

function loadPersisted(): Array<{ cwd: string; label: string }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(s => s && typeof s.cwd === 'string' && typeof s.label === 'string') : []
  } catch { return [] }
}

// Unlike useLogSessions, this hook doesn't own a WebSocket — the shell
// itself lives server-side, keyed by cwd, and outlives any single
// connection (see src/core/terminal.ts). This hook only tracks which
// terminal is currently on screen vs. tucked into the minimized tray;
// TerminalPanel reconnects and replays history on its own each time it
// mounts, so there's nothing here to keep alive across a hide.
// Base top-left corner for the first floating window, and the diagonal step
// applied to each one opened after it (classic OS-style window cascade) so
// freshly opened terminals don't stack exactly on top of one another.
const CASCADE_ORIGIN = { x: 90, y: 70 }
const CASCADE_STEP = 34
const CASCADE_WRAP = 8

export function useTerminalSessions() {
  const [sessions, setSessions] = useState<Record<string, TerminalSessionMeta>>({})
  // Guards the sync-to-storage effect below from firing (with an empty
  // `sessions`) before hydration below has had a chance to read what was
  // there — otherwise the very first render's empty state would wipe out
  // the persisted list moments before the async restore check completes.
  const hydratedRef = useRef(false)
  // Monotonically increasing stacking order: whichever window was most
  // recently opened or clicked gets the highest z, so it renders on top.
  const zRef = useRef(1)
  const nextZ = () => ++zRef.current
  // How many windows have been placed so far, used to offset each new one
  // along the cascade so it doesn't land exactly on the last.
  const placedRef = useRef(0)
  const nextPos = () => {
    const i = placedRef.current++ % CASCADE_WRAP
    return { x: CASCADE_ORIGIN.x + i * CASCADE_STEP, y: CASCADE_ORIGIN.y + i * CASCADE_STEP }
  }

  // A reload or an accidentally-closed tab loses this component's state,
  // but the PTY itself keeps running server-side. Bring its tray chip back
  // (as minimized, never full-screen) for whichever remembered sessions are
  // still actually alive — anything the user explicitly stopped, or that
  // died on its own, is dropped rather than resurrected.
  useEffect(() => {
    const persisted = loadPersisted()
    if (!persisted.length) { hydratedRef.current = true; return }
    fetch('/api/terminal/sessions').then(r => r.json()).then(d => {
      if (!d.success) return
      const live = new Set<string>(d.paths ?? [])
      const restored = persisted.filter(s => live.has(s.cwd))
      if (restored.length) {
        setSessions(prev => {
          const next = { ...prev }
          for (const s of restored) if (!next[s.cwd]) {
            const pos = nextPos()
            next[s.cwd] = { cwd: s.cwd, label: s.label, visible: false, minimized: true, x: pos.x, y: pos.y, z: nextZ() }
          }
          return next
        })
      } else {
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
      }
    }).catch(() => {}).finally(() => { hydratedRef.current = true })
  }, [])

  // Keep localStorage in sync so the tray survives a reload/tab close.
  useEffect(() => {
    if (!hydratedRef.current) return
    const list = Object.values(sessions).map(s => ({ cwd: s.cwd, label: s.label }))
    try {
      if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [sessions])

  // Every terminal is an independently positioned, freely draggable window,
  // so opening one never needs to hide any other — they can all be visible
  // and moved out of each other's way. `open`/`openSplit`/`restore` all just
  // (re)show a window in front of the rest; the distinction between them is
  // API-compatibility with existing call sites, not behavior anymore.
  const show = (prev: Record<string, TerminalSessionMeta>, cwd: string, label: string, pendingCommand?: string) => {
    const existing = prev[cwd]
    const pos = existing ? { x: existing.x, y: existing.y } : nextPos()
    return { ...prev, [cwd]: { cwd, label, visible: true, minimized: false, pendingCommand, x: pos.x, y: pos.y, z: nextZ() } }
  }

  const open = useCallback((cwd: string, label: string, pendingCommand?: string) => {
    setSessions(prev => show(prev, cwd, label, pendingCommand))
  }, [])

  // Kept as a distinct action for existing call sites ("open alongside the
  // current terminal") — now equivalent to `open` since every window floats
  // independently, but named separately in case the two ever need to diverge.
  const openSplit = useCallback((cwd: string, label: string) => {
    setSessions(prev => show(prev, cwd, label))
  }, [])

  const clearPendingCommand = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd]?.pendingCommand ? { ...prev, [cwd]: { ...prev[cwd], pendingCommand: undefined } } : prev))
  }, [])

  const restore = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd] ? show(prev, cwd, prev[cwd].label, prev[cwd].pendingCommand) : prev))
  }, [])

  // Reposition a window (drag) without disturbing its stacking order.
  const move = useCallback((cwd: string, x: number, y: number) => {
    setSessions(prev => (prev[cwd] ? { ...prev, [cwd]: { ...prev[cwd], x, y } } : prev))
  }, [])

  // Bring a window to the front of the stack without otherwise changing it.
  const focus = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd] ? { ...prev, [cwd]: { ...prev[cwd], z: nextZ() } } : prev))
  }, [])

  // Hide / minimize both just change what's on screen — the shell keeps
  // running server-side either way. Minimize leaves a chip to jump back in;
  // hide dismisses it entirely (reopen the same folder to get back to it).
  const hide = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd] ? { ...prev, [cwd]: { ...prev[cwd], visible: false, minimized: false } } : prev))
  }, [])

  const minimize = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd] ? { ...prev, [cwd]: { ...prev[cwd], visible: false, minimized: true } } : prev))
  }, [])

  // The only action that actually ends the shell.
  const stop = useCallback((cwd: string) => {
    setSessions(prev => { const n = { ...prev }; delete n[cwd]; return n })
    fetch('/api/terminal/kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd }) }).catch(() => {})
  }, [])

  return { sessions, open, openSplit, restore, hide, minimize, stop, move, focus, clearPendingCommand }
}
