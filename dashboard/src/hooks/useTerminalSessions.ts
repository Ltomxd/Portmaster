import { useCallback, useEffect, useRef, useState } from 'react'

export interface TerminalSessionMeta {
  cwd: string
  label: string
  visible: boolean
  minimized: boolean
  pendingCommand?: string
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
export function useTerminalSessions() {
  const [sessions, setSessions] = useState<Record<string, TerminalSessionMeta>>({})
  // Guards the sync-to-storage effect below from firing (with an empty
  // `sessions`) before hydration below has had a chance to read what was
  // there — otherwise the very first render's empty state would wipe out
  // the persisted list moments before the async restore check completes.
  const hydratedRef = useRef(false)

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
          for (const s of restored) if (!next[s.cwd]) next[s.cwd] = { cwd: s.cwd, label: s.label, visible: false, minimized: true }
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

  const demoteVisible = (prev: Record<string, TerminalSessionMeta>, keep: string) => {
    const demote = (s: TerminalSessionMeta) => (s.visible && !s.minimized ? { ...s, visible: false, minimized: true } : s)
    return Object.fromEntries(Object.entries(prev).map(([k, s]) => [k, k === keep ? s : demote(s)]))
  }

  const open = useCallback((cwd: string, label: string, pendingCommand?: string) => {
    setSessions(prev => {
      const others = demoteVisible(prev, cwd)
      return { ...others, [cwd]: { cwd, label, visible: true, minimized: false, pendingCommand } }
    })
  }, [])

  // Opens alongside whatever's currently the primary visible session
  // instead of replacing it, capped at two side by side — anything else
  // that was visible gets tucked back into the tray.
  const openSplit = useCallback((cwd: string, label: string) => {
    setSessions(prev => {
      const visibleEntries = Object.entries(prev).filter(([k, s]) => k !== cwd && s.visible)
      const keepKey = visibleEntries.length ? visibleEntries[visibleEntries.length - 1][0] : null
      const next: Record<string, TerminalSessionMeta> = {}
      for (const [k, s] of Object.entries(prev)) {
        if (k === cwd) continue
        next[k] = k === keepKey ? { ...s, visible: true, minimized: false } : (s.visible && !s.minimized ? { ...s, visible: false, minimized: true } : s)
      }
      next[cwd] = { cwd, label, visible: true, minimized: false }
      return next
    })
  }, [])

  const clearPendingCommand = useCallback((cwd: string) => {
    setSessions(prev => (prev[cwd]?.pendingCommand ? { ...prev, [cwd]: { ...prev[cwd], pendingCommand: undefined } } : prev))
  }, [])

  const restore = useCallback((cwd: string) => {
    setSessions(prev => {
      if (!prev[cwd]) return prev
      const others = demoteVisible(prev, cwd)
      return { ...others, [cwd]: { ...prev[cwd], visible: true, minimized: false } }
    })
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

  return { sessions, open, openSplit, restore, hide, minimize, stop, clearPendingCommand }
}
