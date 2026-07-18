import { useCallback, useEffect, useState } from 'react'

// Favorites live server-side (~/.portmaster/config.json) so they're the
// same regardless of which browser/tab you're using — same pattern as the
// saved projects root.
export function useFavorites() {
  const [favoritePorts, setFavoritePorts] = useState<Set<number>>(new Set())
  const [favoriteProjects, setFavoriteProjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/favorites').then(r => r.json()).then(d => {
      if (d.success) {
        setFavoritePorts(new Set(d.ports ?? []))
        setFavoriteProjects(new Set(d.projects ?? []))
      }
    }).catch(() => {})
  }, [])

  const toggleFavoritePort = useCallback((port: number) => {
    setFavoritePorts(prev => {
      const next = new Set(prev)
      if (next.has(port)) next.delete(port); else next.add(port)
      return next
    })
    fetch(`/api/favorites/ports/${port}`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.success) setFavoritePorts(new Set(d.ports)) })
      .catch(() => {})
  }, [])

  const toggleFavoriteProject = useCallback((path: string) => {
    setFavoriteProjects(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
    fetch('/api/favorites/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) })
      .then(r => r.json())
      .then(d => { if (d.success) setFavoriteProjects(new Set(d.projects)) })
      .catch(() => {})
  }, [])

  return { favoritePorts, favoriteProjects, toggleFavoritePort, toggleFavoriteProject }
}
