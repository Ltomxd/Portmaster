import { useEffect } from 'react'
import { useLang } from '../context/LangContext'
import raccoon from '../assets/raccoon.jpg'

interface Props { port:number|null; processName:string|null; onConfirm:()=>void; onCancel:()=>void }

export function KillDialog({ port, processName, onConfirm, onCancel }: Props) {
  const { T } = useLang()
  useEffect(() => {
    if (port === null) return
    const h = (e: KeyboardEvent) => { if(e.key==='Escape')onCancel(); if(e.key==='Enter')onConfirm() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [port, onConfirm, onCancel])
  if (port === null) return null
  return (
    <div onClick={onCancel} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(3px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', animation:'fadeIn .15s' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid rgba(229,62,62,.3)', borderRadius:12, padding:28, minWidth:380, boxShadow:'0 25px 60px rgba(0,0,0,.6), 0 0 40px rgba(229,62,62,.1)', animation:'slideUp .2s ease' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', border:'1px solid rgba(229,62,62,.4)', flexShrink:0 }}>
            <img src={raccoon} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
          <div style={{ fontWeight:700, fontSize:17 }}>{T('kill_process')}</div>
        </div>
        <div style={{ color:'var(--muted)', fontSize:13, lineHeight:1.7, marginBottom:20 }}>
          {T('port')} <strong style={{ color:'var(--red2)' }}>:{port}</strong>
          {processName && <> — <strong style={{ color:'var(--text)' }}>{processName}</strong></>} {T('kill_confirm_msg')}
        </div>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
          {T('press_enter')} <kbd style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'1px 5px' }}>Enter</kbd> {T('to_confirm')} <kbd style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:3, padding:'1px 5px' }}>Esc</kbd> {T('to_cancel')}
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--muted)', padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:500 }}>{T('cancel')}</button>
          <button onClick={onConfirm} style={{ background:'var(--red-glow)', border:'1px solid rgba(229,62,62,.4)', color:'var(--red2)', padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:600 }}>{T('confirm_kill')}</button>
        </div>
      </div>
    </div>
  )
}
