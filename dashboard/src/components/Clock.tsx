import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'

const STORAGE_KEY = 'portmaster:clock24h'

function defaultIs24h(): boolean {
  try {
    // hourCycle isn't in TS's ES2020 Intl types yet, though every real
    // engine has supported it for years.
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string }
    return opts.hourCycle === 'h23' || opts.hourCycle === 'h24'
  } catch { return true }
}

function loadIs24h(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === null ? defaultIs24h() : raw === 'true'
  } catch { return defaultIs24h() }
}

// Auto-detects the browser's own timezone (Intl already knows it — no need
// to ask or guess) and ticks every second off a single shared timer.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function Clock() {
  const { T } = useLang()
  const [now, setNow] = useState(() => new Date())
  const [is24h, setIs24h] = useState(loadIs24h)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const toggle = () => {
    setIs24h(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }

  const timeStr = new Intl.DateTimeFormat(undefined, {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !is24h,
  }).format(now)

  return (
    <button
      onClick={toggle}
      title={`${timeZone} — ${T('clock_toggle_hint')}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600,
        letterSpacing: '.3px', cursor: 'pointer',
      }}
    >
      <span style={{ opacity: .6 }}>🕐</span>
      {timeStr}
    </button>
  )
}
