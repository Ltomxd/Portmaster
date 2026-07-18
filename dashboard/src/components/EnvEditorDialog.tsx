import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'

interface Props {
  path: string | null // relative project path, or null when closed
  label: string
  onClose: () => void
}

export function EnvEditorDialog({ path, label, onClose }: Props) {
  const { T } = useLang()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (path === null) return
    setLoading(true); setError(null); setSaved(false)
    fetch(`/api/projects/env?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setContent(d.content ?? ''); else setError(d.error ?? T('env_load_failed')) })
      .catch(() => setError(T('env_load_failed')))
      .finally(() => setLoading(false))
  }, [path, T])

  useEffect(() => {
    if (path === null) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [path, onClose])

  if (path === null) return null

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const r = await fetch('/api/projects/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) })
      const d = await r.json()
      if (d.success) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
      else setError(d.error ?? T('env_save_failed'))
    } catch (e: any) {
      setError(e?.message ?? T('env_save_failed'))
    }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(3px)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .15s' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 20, width: 'min(92vw, 640px)', boxShadow: '0 25px 60px rgba(0,0,0,.6)', animation: 'slideUp .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📝</span> .env — {label}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, padding: '2px 6px' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>{T('env_loading')}…</div>
        ) : (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
            placeholder="KEY=value"
            style={{
              width: '100%', height: '46vh', resize: 'vertical', background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.6, padding: 12, outline: 'none',
            }}
          />
        )}

        {error && <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(229,62,62,.3)', background: 'var(--red-glow)', color: 'var(--red2)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ {T('saved')}</span>}
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>{T('cancel')}</button>
          <button onClick={save} disabled={loading || saving} style={{ background: 'rgba(116,185,255,.15)', border: '1px solid rgba(116,185,255,.4)', color: 'var(--blue)', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, opacity: saving ? .6 : 1 }}>{saving ? '…' : T('save')}</button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10 }}>{T('env_hint')}</div>
      </div>
    </div>
  )
}
