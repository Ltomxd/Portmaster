import { useCallback, useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../types'
import { computeConflicts } from '../components/ConflictDialog'

type ToastFn = (message: string, kind?: 'success' | 'error' | 'info') => void

// Diffs consecutive snapshots for three things worth interrupting the user
// for: a Guard actually firing, a managed process disappearing, and a port
// conflict that wasn't there a moment ago. Always raises an in-app toast;
// also fires a real browser Notification (so it's visible even if the tab
// isn't focused) once permission has been granted.
export function useNotifications(snapshot: Snapshot, toast: ToastFn) {
  const prevRef = useRef<Snapshot | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  )

  const requestPermission = useCallback(() => {
    if (typeof Notification === 'undefined') return
    Notification.requestPermission().then(setPermission).catch(() => {})
  }, [])

  const notify = useCallback((title: string, body: string, kind: 'success' | 'error' | 'info' = 'info') => {
    toast(`${title} — ${body}`, kind)
    if (permission === 'granted' && typeof Notification !== 'undefined') {
      try { new Notification(title, { body }) } catch {}
    }
  }, [permission, toast])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = snapshot
    if (!prev) return // nothing to diff against yet

    for (const [key, g] of Object.entries(snapshot.guards)) {
      const prevCount = prev.guards[key]?.recentEvents?.length ?? 0
      const newEvents = (g.recentEvents ?? []).slice(prevCount)
      for (const ev of newEvents) {
        if (ev.type !== 'port_killed') continue // the only type that means the Guard actually acted
        notify('🛡 Guard', `Killed an unauthorized process on :${ev.port}${ev.info?.process ? ` (${ev.info.process})` : ''}`, 'error')
      }
    }

    for (const [portStr, pid] of Object.entries(prev.managed)) {
      if (pid != null && snapshot.managed[Number(portStr)] == null) {
        notify('⚠ Process stopped', `The managed process on :${portStr} is no longer running`, 'error')
      }
    }

    const prevConflictPorts = new Set(computeConflicts(prev.ports).map(c => c.port))
    for (const c of computeConflicts(snapshot.ports)) {
      if (!prevConflictPorts.has(c.port)) notify('⚠ Port conflict', `Port :${c.port} now has more than one owner`, 'error')
    }
  }, [snapshot, notify])

  return { permission, requestPermission }
}
