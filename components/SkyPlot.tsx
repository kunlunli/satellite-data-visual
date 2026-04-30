'use client'

import { memo, useMemo } from 'react'
import type { SatelliteDataRow } from '@/lib/types'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  /** Square plot size in px (default 300). */
  size?: number
  /** Minimal padding and legend for dense / PDF layouts. */
  compact?: boolean
}

const EL_RINGS = [0, 15, 30, 45, 60, 75, 90]
const AZ_LINES = [0, 45, 90, 135, 180, 225, 270, 315]

function SkyPlotInner({ data, currentIndex, size = 300, compact = false }: Props) {
  const layout = useMemo(() => {
    /** Extra space so az/el spoke labels (e.g. 315°) are not clipped at the SVG edge. */
    const gutter = compact ? 36 : 26
    const CX = gutter + size / 2
    const CY = gutter + size / 2
    const pad = Math.max(18, Math.round(34 * (size / 300)))
    const R = size / 2 - pad
    const svgW = size + 2 * gutter
    const svgH = size + 2 * gutter
    return { CX, CY, R, svgW, svgH, inner: size, gutter }
  }, [size, compact])

  const pathD = useMemo(() => {
    if (data.length === 0) return ''
    const { CX, CY, R } = layout
    const toXY = (az: number, el: number): [number, number] => {
      const r = ((90 - el) / 90) * R
      const rad = (az * Math.PI) / 180
      return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
    }
    const pts = data.map((r) => toXY(r.cur_az, r.cur_el))
    return pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')
  }, [data, layout])

  const cur = data[currentIndex]
  const [cx, cy] = useMemo(() => {
    if (!cur) return [layout.CX, layout.CY] as [number, number]
    const r = ((90 - cur.cur_el) / 90) * layout.R
    const rad = (cur.cur_az * Math.PI) / 180
    return [layout.CX + r * Math.sin(rad), layout.CY - r * Math.cos(rad)] as [number, number]
  }, [cur, layout])

  const { CX, CY, R, svgW, svgH } = layout
  const labelFs = compact ? 7 : 8
  /** Compact PDF: keep spoke labels inside gutter; non-compact can be larger. */
  const spokeFs = compact ? 8 : 12

  const toXY = (az: number, el: number): [number, number] => {
    const r = ((90 - el) / 90) * R
    const rad = (az * Math.PI) / 180
    return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm ${compact ? 'p-1' : 'p-3'}`}>
      {!compact && (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-1">
          Sky Plot (Az / El)
        </h2>
      )}
      <div className="flex justify-center" style={{ overflow: 'visible' }}>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="overflow-visible" style={{ overflow: 'visible' }}>
          {EL_RINGS.map((el) => {
            const r = ((90 - el) / 90) * R
            return (
              <g key={el}>
                <circle cx={CX} cy={CY} r={r} fill="none" stroke="#d1d5db" strokeWidth={0.4} />
                {el > 0 && el < 90 && (
                  <text x={CX} y={CY - r + 11} fontSize={labelFs} fill="#6b7280" textAnchor="middle">
                    {el}°
                  </text>
                )}
              </g>
            )
          })}

          {AZ_LINES.map((az) => {
            const [x2, y2] = toXY(az, 0)
            /** Labels slightly inside the horizon so PDF/vector export does not clip past SVG bounds. */
            const [lx, ly] = toXY(az, 12)
            return (
              <g key={az}>
                <line x1={CX} y1={CY} x2={x2} y2={y2} stroke="#d1d5db" strokeWidth={0.4} />
                <text
                  x={lx}
                  y={ly}
                  fontSize={spokeFs}
                  fill="#6b7280"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {az}°
                </text>
              </g>
            )
          })}

          {pathD && (
            <path d={pathD} fill="none" stroke="#2563eb" strokeWidth={2} opacity={0.95} />
          )}

          {cur && (
            <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="white" strokeWidth={1} />
          )}

          <circle cx={CX} cy={CY} r={2} fill="#9ca3af" />
        </svg>
      </div>

      {!compact && (
        <div className="flex justify-center gap-4 mt-1">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block w-5 h-0.5 bg-blue-600" /> Track
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Current
          </span>
        </div>
      )}
    </div>
  )
}

const SkyPlot = memo(SkyPlotInner)
export default SkyPlot
