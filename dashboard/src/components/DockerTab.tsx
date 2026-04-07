import { useLang } from '../context/LangContext'
import type { DockerContainer } from '../types'

interface Props { containers: DockerContainer[]; onAction: (name:string, action:'start'|'stop'|'restart')=>void }

export function DockerTab({ containers, onAction }: Props) {
  const { T } = useLang()
  const stateLabel: Record<string,string> = { running:'running', exited:'exited', paused:'paused', restarting:'restarting' }
  const stateColor: Record<string,string> = { running:'var(--green)', exited:'var(--muted)', paused:'var(--yellow)', restarting:'var(--red2)' }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.6px', color:'var(--muted)', textTransform:'uppercase', marginBottom:14 }}>{T('docker')}</div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
            {[T('state'),T('name'),'ID',T('image'),T('ports'),T('uptime'),T('actions')].map(h=>(
              <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:600, letterSpacing:'.5px', color:'var(--muted)', textTransform:'uppercase' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {containers.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}><span style={{ fontSize:28, opacity:.3 }}>🐳</span><span>{T('no_containers')}</span></div>
              </td></tr>
            ) : containers.map(c => {
              const ports = c.ports.filter(p=>p.hostPort).map(p=>`${p.hostPort}→${p.containerPort}`).join(', ') || '—'
              const isRunning = c.state === 'running'
              const sc = stateColor[c.state] ?? 'var(--muted)'
              return (
                <tr key={c.id} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,.02)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
                >
                  <td style={{ padding:'11px 14px' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:sc }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:sc, display:'inline-block', animation:isRunning?'pulse 2s infinite':'none' }} />
                      {stateLabel[c.state] ?? c.state}
                    </span>
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:600 }}>{c.name}</td>
                  <td style={{ padding:'11px 14px', fontFamily:'var(--mono)', fontSize:11, color:'var(--muted)' }}>{c.id}</td>
                  <td style={{ padding:'11px 14px', color:'var(--subtle)', fontSize:12 }}>{c.image?.substring(0,26)}</td>
                  <td style={{ padding:'11px 14px', color:'var(--red2)', fontSize:12, fontFamily:'var(--mono)' }}>{ports}</td>
                  <td style={{ padding:'11px 14px', color:'var(--muted)', fontSize:12 }}>{c.uptime??'—'}</td>
                  <td style={{ padding:'11px 14px', display:'flex', gap:6 }}>
                    {isRunning
                      ? <><Btn label={T('restart')} v="restart" onClick={()=>onAction(c.name,'restart')} /><Btn label={T('stop')} v="stop" onClick={()=>onAction(c.name,'stop')} /></>
                      : <Btn label={T('start')} v="start" onClick={()=>onAction(c.name,'start')} />
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Btn({ label, v, onClick }: { label:string; v:'start'|'stop'|'restart'; onClick:()=>void }) {
  const styles = { start:{c:'var(--green)',b:'rgba(56,217,169,.25)'}, stop:{c:'var(--red2)',b:'rgba(229,62,62,.25)'}, restart:{c:'var(--blue)',b:'rgba(116,185,255,.25)'} }
  const s = styles[v]
  return <button onClick={onClick} style={{ background:'transparent', border:`1px solid ${s.b}`, color:s.c, padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:500 }}>{label}</button>
}
