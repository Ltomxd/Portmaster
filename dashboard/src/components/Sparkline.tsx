import { useRef, useState } from 'react'

export interface SparklinePoint { t: number; v: number }

interface Props {
  data: SparklinePoint[]
  color: string
  height?: number
  formatValue?: (v: number) => string
}

const VB_W = 240

// A single-series trend line — no legend needed (the card title already
// names what's plotted). Anchored to a zero floor rather than the data's
// own min, so a flat-low reading doesn't look like a full-height swing.
export function Sparkline({ data, color, height = 34, formatValue }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--muted)' }}>…</div>
  }

  const max = Math.max(...data.map(d => d.v), 1)
  const range = Math.max(max, 1)

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * VB_W,
    y: height - (d.v / range) * (height - 4) - 2,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L0,${height} Z`

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = ((e.clientX - rect.left) / rect.width) * VB_W
    let nearest = 0, best = Infinity
    points.forEach((p, i) => { const d = Math.abs(p.x - relX); if (d < best) { best = d; nearest = i } })
    setHoverIdx(nearest)
  }

  const hp = hoverIdx != null ? points[hoverIdx] : null
  const hd = hoverIdx != null ? data[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hp && (
          <>
            <line x1={hp.x} y1={0} x2={hp.x} y2={height} stroke="var(--border2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={hp.x} cy={hp.y} r={3} fill={color} stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hp && hd && (
        <div style={{
          position: 'absolute', top: -6, left: `${(hp.x / VB_W) * 100}%`, transform: 'translate(-50%, -100%)',
          background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 6, padding: '3px 7px',
          fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, color: 'var(--text)',
        }}>
          <strong>{formatValue ? formatValue(hd.v) : hd.v}</strong>
          <span style={{ color: 'var(--muted)', marginLeft: 5 }}>{new Date(hd.t).toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  )
}
