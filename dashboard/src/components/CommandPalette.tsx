import { useEffect, useMemo, useRef, useState } from 'react'
import { useLang } from '../context/LangContext'
import type { PortInfo } from '../types'
import type { TKey } from '../i18n'

type Tab = 'overview' | 'docker' | 'pm2' | 'guard' | 'projects' | 'favorites'

const TAB_DEFS: { id: Tab; icon: string; labelKey: TKey }[] = [
  { id: 'overview', icon: '⌂', labelKey: 'overview' },
  { id: 'docker', icon: '🐳', labelKey: 'docker' },
  { id: 'pm2', icon: '⟳', labelKey: 'pm2' },
  { id: 'guard', icon: '⬡', labelKey: 'guard' },
  { id: 'projects', icon: '📁', labelKey: 'projects_title' },
  { id: 'favorites', icon: '★', labelKey: 'favorites_title' },
]

interface Props {
  ports: PortInfo[]
  onKill: (port: number, process: string | null) => void
  favoriteProjects: Set<string>
  onOpenTerminal: (cwd: string, label: string) => void
  onSetTab: (tab: Tab) => void
}

interface Item {
  id: string
  icon: string
  title: string
  subtitle?: string
  run: () => void
}

// A global Cmd/Ctrl+K launcher — search ports, favorite projects, and
// navigation in one box instead of hunting across tabs. Self-contained: it
// owns its own open/close state via a window keydown listener, so mounting
// it once in App.tsx is the entire integration.
export function CommandPalette({ ports, onKill, favoriteProjects, onOpenTerminal, onSetTab }: Props) {
  const { T, lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()

    const nav: Item[] = TAB_DEFS.map(t => ({ id: `tab:${t.id}`, icon: t.icon, title: `${T('go_to')} ${T(t.labelKey)}`, run: () => onSetTab(t.id) }))

    const portItems: Item[] = ports
      .filter(p => !q || String(p.port).includes(q) || (p.process ?? '').toLowerCase().includes(q) || String(p.pid ?? '').includes(q))
      .slice(0, 8)
      .map(p => ({ id: `kill:${p.port}`, icon: '🗑', title: `${T('kill_port_cmd')} :${p.port}`, subtitle: p.process ?? undefined, run: () => onKill(p.port, p.process) }))

    const favItems: Item[] = [...favoriteProjects].slice(0, 6).map(f => {
      const label = f.split('/').filter(Boolean).pop() ?? f
      return { id: `term:${f}`, icon: '🖳', title: `${T('open_terminal_cmd')} ${label}`, subtitle: f, run: () => onOpenTerminal(f, label) }
    })

    const langItem: Item = { id: 'lang', icon: '🌐', title: lang === 'en' ? 'Switch to Español' : 'Switch to English', run: () => setLang(lang === 'en' ? 'es' : 'en') }

    const all = [...nav, ...portItems, ...favItems, langItem]
    if (!q) return all
    return all.filter(i => i.title.toLowerCase().includes(q) || (i.subtitle ?? '').toLowerCase().includes(q))
  }, [query, ports, favoriteProjects, lang, T, onKill, onOpenTerminal, onSetTab, setLang])

  const run = (item: Item) => { item.run(); setOpen(false) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[selected]) run(items[selected]) }
  }

  if (!open) return null

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', animation: 'fadeIn .12s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, width: 'min(92vw, 560px)', boxShadow: '0 25px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(0) }}
          onKeyDown={onKeyDown}
          placeholder={T('command_palette_placeholder')}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', padding: '14px 16px', fontSize: 14, outline: 'none' }}
        />
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('no_results')}</div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.id}
                onClick={() => run(item)}
                onMouseEnter={() => setSelected(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: i === selected ? 'var(--surface3)' : 'transparent' }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  {item.subtitle && <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subtitle}</div>}
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 14 }}>
          <span>↑↓ {T('cmd_nav')}</span><span>↵ {T('cmd_select')}</span><span>Esc {T('cmd_close')}</span>
        </div>
      </div>
    </div>
  )
}
