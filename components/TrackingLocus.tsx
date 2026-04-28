'use client'

import { useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
}

const SAMPLE = 4

export default function TrackingLocus({ data, currentIndex }: Props) {
  const actualData = useMemo(
    () => data.filter((_, i) => i % SAMPLE === 0).map((r) => ({ x: r.cur_az, y: r.cur_el })),
    [data],
  )
  const targetData = useMemo(
    () => data.filter((_, i) => i % SAMPLE === 0).map((r) => ({ x: r.target_az, y: r.target_el })),
    [data],
  )

  const cur = data[currentIndex]

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
        Instantaneous Tracking Locus
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            name="Azimuth"
            label={{ value: 'Azimuth (deg)', position: 'insideBottom', offset: -12, fontSize: 11 }}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(2)}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={['auto', 'auto']}
            name="Elevation"
            label={{ value: 'Elevation (deg)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11 }}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v.toFixed(2)}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number) => v.toFixed(4) + '°'}
          />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11 }} />
          <Scatter name="Actual (KAA)" data={actualData} fill="#3b82f6" opacity={0.7} r={1.5} isAnimationActive={false} />
          <Scatter name="Target (Flight)" data={targetData} fill="#f97316" opacity={0.7} r={1.5} isAnimationActive={false} />
          {cur && (
            <ReferenceDot
              x={cur.cur_az}
              y={cur.cur_el}
              r={5}
              fill="#10b981"
              stroke="white"
              strokeWidth={1.5}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
