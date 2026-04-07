import raccoon from '../assets/raccoon.jpg'
import { useLang } from '../context/LangContext'
import type { WslInfo } from '../types'

type Tab = 'overview' | 'docker' | 'pm2' | 'guard'

interface Props {
  activeTab: Tab
  onTabChange: (t: Tab) => void
  counts: Record<Tab, number>
  wsl: WslInfo
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ activeTab, onTabChange, counts, wsl, isOpen = false, onClose }: Props) {
  const { lang, setLang, T } = useLang()

  const nav: { id: Tab; icon: string; label: string }[] = [
    { id: 'overview', icon: '⌂', label: T('overview') },
    { id: 'docker', icon: '🐳', label: T('docker') },
    { id: 'pm2', icon: '⟳', label: T('pm2') },
    { id: 'guard', icon: '⬡', label: T('guard') },
  ]

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid var(--red)',
            animation: 'raccoonGlow 3s ease-in-out infinite',
            flexShrink: 0,
          }}>
            <img src={raccoon} alt="Portmaster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-.3px', color: 'var(--text)' }}>Portmaster</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>by Ltomxd</div>
          </div>
        </div>

        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {nav.map(item => {
            const active = activeTab === item.id
            return (
              <button key={item.id} onClick={() => onTabChange(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                background: active ? 'var(--red-glow)' : 'transparent',
                border: active ? '1px solid rgba(229,62,62,.3)' : '1px solid transparent',
                color: active ? 'var(--red2)' : 'var(--muted)',
                fontSize: 13, fontWeight: active ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
              }}
              >
                <span style={{ fontSize: 14, opacity: active ? 1 : .5 }}>{item.icon}</span>
                {item.label}
                {counts[item.id] > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                    background: active ? 'rgba(229,62,62,.2)' : 'var(--surface3)',
                    color: active ? 'var(--red2)' : 'var(--muted)',
                    border: `1px solid ${active ? 'rgba(229,62,62,.35)' : 'var(--border)'}`,
                    padding: '1px 7px', borderRadius: 10,
                  }}>
                    {counts[item.id]}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Language / Idioma
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['en', 'es'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: lang === l ? 'var(--red-glow)' : 'var(--surface2)',
                border: `1px solid ${lang === l ? 'rgba(229,62,62,.4)' : 'var(--border)'}`,
                color: lang === l ? 'var(--red2)' : 'var(--muted)',
              }}>
                {l === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
              </button>
            ))}
          </div>

          {wsl.isWsl && (
            <div style={{
              marginTop: 10, fontSize: 11, padding: '5px 10px', borderRadius: 6, textAlign: 'center',
              background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', color: '#f59e0b',
            }}>
              ⊞ WSL{wsl.wslVersion} Active
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
