import { useEffect, useRef, useState, useCallback } from 'react'
import type { Snapshot } from '../types'

const EMPTY: Snapshot = {
  timestamp: '',
  ports: [],
  docker: [],
  pm2: [],
  system: {
    cpu: 0, cores: 1,
    memory: { total: 0, free: 0, used: 0, usedPercent: 0 },
    disk:   { total: 0, used: 0, free: 0, usedPercent: 0 },
    loadAvg: [0, 0, 0],
    uptime: '—', uptimeSeconds: 0, lastUpdated: '—',
  },
  wsl: { isWsl: false, wslVersion: null, distro: null },
  guards: {},
}

type ConnState = 'connecting' | 'connected' | 'reconnecting'

export function usePortmaster() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [connState, setConnState] = useState<ConnState>('connecting')
  const wsRef   = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}`)
    wsRef.current = ws
    ws.onopen    = () => setConnState('connected')
    ws.onmessage = e => { try { setSnapshot(JSON.parse(e.data)) } catch {} }
    ws.onclose   = () => { setConnState('reconnecting'); retryRef.current = setTimeout(() => connect(), 3000) }
    ws.onerror   = () => ws.close()
  }, [])

  useEffect(() => {
    connect()
    return () => { clearTimeout(retryRef.current); wsRef.current?.close() }
  }, [connect])

  const refresh = useCallback(() =>
    fetch('/api/snapshot').then(r => r.json()).then(setSnapshot).catch(() => {}), [])

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

  const createGuard = useCallback(async (payload: { key: string; ports: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }) => {
    const r = await fetch('/api/guards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return r.json()
  }, [])

  const updateGuard = useCallback(async (key: string, payload: { ports?: number[]; autoKill?: boolean; allowedProcesses?: string[]; intervalMs?: number }) => {
    const r = await fetch(`/api/guards/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return r.json()
  }, [])

  const deleteGuard = useCallback(async (key: string) => {
    const r = await fetch(`/api/guards/${encodeURIComponent(key)}`, { method: 'DELETE' })
    return r.json()
  }, [])

  return { snapshot, connState, refresh, killPort, dockerAction, pm2Action, createGuard, updateGuard, deleteGuard }
}
