import type { Toast } from '../hooks/useToast'
export function ToastList({ toasts, onDismiss }: { toasts:Toast[]; onDismiss:(id:number)=>void }) {
  if (!toasts.length) return null
  return (
    <div style={{ position:'fixed', bottom:20, right:20, zIndex:300, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} onClick={()=>onDismiss(t.id)} style={{
          background:'var(--surface)', borderRadius:8, padding:'10px 16px', fontSize:13, minWidth:260,
          cursor:'pointer', display:'flex', alignItems:'center', gap:10, animation:'slideIn .2s ease',
          boxShadow:'0 4px 20px rgba(0,0,0,.4)',
          borderLeft:`3px solid ${t.type==='success'?'var(--green)':t.type==='error'?'var(--red2)':'var(--blue)'}`,
          border:`1px solid var(--border2)`,
        }}>
          <span>{t.type==='success'?'✓':t.type==='error'?'✗':'ℹ'}</span>{t.message}
        </div>
      ))}
    </div>
  )
}
