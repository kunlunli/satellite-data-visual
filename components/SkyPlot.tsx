'use client'

import { useMemo } from 'react'
import type { SatelliteDataRow } from '@/lib/types'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
}

const SIZE = 260
const CX = SIZE / 2
const CY = SIZE / 2
const R = SIZE / 2 - 24
const EL_RINGS = [0, 15, 30, 45, 60, 75, 90]
const AZ_LINES = [0, 45, 90, 135, 180, 225, 270, 315]
const LABELS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

function toXY(az: number, el: number): [number, number] {
  const r = ((90 - el) / 90) * R
  const rad = (az * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}

export default function SkyPlot({ data, currentIndex }: Props) {
  const pathD = useMemo(() => {
    if (data.length === 0) return ''
    const pts = data.map((r) => toXY(r.cur_az, r.cur_el))
    return pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')
  }, [data])

  const targetD = useMemo(() => {
    if (data.length === 0) return ''
    const pts = data.map((r) => toXY(r.target_az, r.target_el))
    return pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(' ')
  }, [data])

  const cur = data[currentIndex]
  const [cx, cy] = cur ? toXY(cur.cur_az, cur.cur_el) : [CX, CY]

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-600 text-center mb-1">
        Sky Plot (Az / El)
      </h2>
      <div className="flex justify-center">
        <svg width={SIZE} height={SIZE} className="overflow-visible">
          {/* Elevation rings */}
          {EL_RINGS.map((el) => {
            const r = ((90 - el) / 90) * R
            return (
              <g key={el}>
                <circle cx={CX} cy={CY} r={r} fill="none" stroke="#d1d5db" strokeWidth={0.8} />
                {el > 0 && el < 90 && (
                  <text x={CX + r + 2} y={CY} fontSize={8} fill="#9ca3af" dominantBaseline="middle">
                    {el}°
                  </text>
                )}
              </g>
            )
          })}

          {/* Azimuth spokes */}
          {AZ_LINES.map((az) => {
            const [x2, y2] = toXY(az, 0)
            const [lx, ly] = toXY(az, -8)
            return (
              <g key={az}>
                <line x1={CX} y1={CY} x2={x2} y2={y2} stroke="#d1d5db" strokeWidth={0.8} />
                <text
                  x={lx}
                  y={ly}
                  fontSize={9}
                  fill="#6b7280"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {LABELS[az]}
                </text>
              </g>
            )
          })}

          {/* Target trajectory */}
          {targetD && (
            <path d={targetD} fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.6} />
          )}

          {/* Actual trajectory */}
          {pathD && (
            <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.85} />
          )}

          {/* Current position dot */}
          {cur && (
            <circle cx={cx} cy={cy} r={5} fill="#10b981" stroke="white" strokeWidth={1.5} />
          )}

          {/* Center zenith dot */}
          <circle cx={CX} cy={CY} r={2} fill="#9ca3af" />
        </svg>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-1">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-5 h-0.5 bg-blue-500" /> Actual
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-5 h-0.5 bg-orange-400" /> Target
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Now
        </span>
      </div>
    </div>
  )
}
