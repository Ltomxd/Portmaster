import { useEffect, useRef, useState, useCallback } from 'react'
import type { Snapshot, GuardStatus } from '../types'

const LOCAL_GUARDS_KEY = 'portmaster.local.guards.v1'

const EMPTY: Snapshot = {
  timestamp: '',
  ports: [],
  docker: [],
  pm2: [],
  system: {
    cpu: 0, cores: 1,
    memory: { total: 0, free: 0, used: 0, usedPercent: 0 },
    disk: { total: 0, used: 0, free: 0, usedPercent: 0 },
    loadAvg: [0, 0, 0],
    uptime: '—', uptimeSeconds: 0, lastUpdated: '—',
  },
  wsl: { isWsl: false, wslVersion: null, distro: null },
  guards: {},
}

type ConnState = 'connecting' | 'connected' | 'reconnecting'

type GuardPayload = { key: string; ports: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }

function loadLocalGuards(): Record<string, GuardStatus> {
  try {
    const raw = localStorage.getItem(LOCAL_GUARDS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function usePortmaster() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const [localGuards, setLocalGuards] = useState<Record<string, GuardStatus>>(() => loadLocalGuards())
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout>>()
  const localGuardsRef = useRef(localGuards)

  useEffect(() => {
    localGuardsRef.current = localGuards
    try { localStorage.setItem(LOCAL_GUARDS_KEY, JSON.stringify(localGuards)) } catch {}
  }, [localGuards])

  const applyLocalGuards = useCallback((raw: Snapshot): Snapshot => {
    return { ...raw, guards: { ...raw.guards, ...localGuardsRef.current } }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}`)
    wsRef.current = ws
    ws.onopen = () => setConnState('connected')
    ws.onmessage = e => {
      try { setSnapshot(applyLocalGuards(JSON.parse(e.data))) } catch {}
    }
    ws.onclose = () => { setConnState('reconnecting'); retryRef.current = setTimeout(() => connect(), 3000) }
    ws.onerror = () => ws.close()
  }, [applyLocalGuards])

  useEffect(() => {
    connect()
    return () => { clearTimeout(retryRef.current); wsRef.current?.close() }
  }, [connect])

  const refresh = useCallback(() =>
    fetch('/api/snapshot').then(r => r.json()).then((s: Snapshot) => setSnapshot(applyLocalGuards(s))).catch(() => {}), [applyLocalGuards])

  const safeJson = async (r: Response) => {
    try { return await r.json() } catch { return { success: false, error: `HTTP ${r.status}` } }
  }

  const createLocalGuard = useCallback((payload: GuardPayload) => {
    const guard: GuardStatus = {
      running: true,
      recentEvents: [{ type: 'port_appeared', port: payload.ports[0], info: null, timestamp: new Date().toISOString() }],
      ports: payload.ports,
      autoKill: Boolean(payload.autoKill),
      allowedProcesses: payload.allowedProcesses ?? [],
      intervalMs: payload.intervalMs ?? 1500,
    }
    setLocalGuards(prev => ({ ...prev, [payload.key]: guard }))
  }, [])

  const killPort = useCallback(async (port: number) => {
    const r = await fetch(`/api/ports/${port}/kill`, { method: 'POST' })
    return r.json()
  }, [])

  const dockerAction = useCallback(async (name: string, action: string) => {
    const r = await fetch(`/api/docker/${name}/${action}`, { method: 'POST' })
    return r.json()
  }, [])

  const pm2Action = useCallback(async (name: string, action: string) => {
    const r = await fetch(`/api/pm2/${name}/${action}`, { method: 'POST' })
    return r.json()
  }, [])

  const createGuard = useCallback(async (payload: GuardPayload) => {
    try {
      const r = await fetch('/api/guards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await safeJson(r)
      if (!r.ok) {
        if (r.status === 404) {
          createLocalGuard(payload)
          return { success: true, local: true }
        }
        return { success: false, error: data.error ?? `HTTP ${r.status}` }
      }
      return data
    } catch (e: any) {
      createLocalGuard(payload)
      return { success: true, local: true, warning: e?.message ?? 'Network fallback' }
    }
  }, [createLocalGuard])

  const updateGuard = useCallback(async (key: string, payload: Partial<GuardPayload>) => {
    try {
      const r = await fetch(`/api/guards/${encodeURIComponent(key)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await safeJson(r)
      if (!r.ok) {
        if (r.status === 404 && localGuardsRef.current[key]) {
          setLocalGuards(prev => ({ ...prev, [key]: { ...prev[key], ...payload } }))
          return { success: true, local: true }
        }
        return { success: false, error: data.error ?? `HTTP ${r.status}` }
      }
      return data
    } catch (e: any) {
      if (localGuardsRef.current[key]) {
        setLocalGuards(prev => ({ ...prev, [key]: { ...prev[key], ...payload } }))
        return { success: true, local: true }
      }
      return { success: false, error: e?.message ?? 'Network error' }
    }
  }, [])

  const deleteGuard = useCallback(async (key: string) => {
    try {
      const r = await fetch(`/api/guards/${encodeURIComponent(key)}`, { method: 'DELETE' })
      const data = await safeJson(r)
      if (!r.ok) {
        if (r.status === 404 && localGuardsRef.current[key]) {
          setLocalGuards(prev => { const n = { ...prev }; delete n[key]; return n })
          refresh()
          return { success: true, local: true }
        }
        return { success: false, error: data.error ?? `HTTP ${r.status}` }
      }
      return data
    } catch (e: any) {
      if (localGuardsRef.current[key]) {
        setLocalGuards(prev => { const n = { ...prev }; delete n[key]; return n })
        refresh()
        return { success: true, local: true }
      }
      return { success: false, error: e?.message ?? 'Network error' }
    }
  }, [refresh])

  return { snapshot, connState, refresh, killPort, dockerAction, pm2Action, createGuard, updateGuard, deleteGuard }
}
