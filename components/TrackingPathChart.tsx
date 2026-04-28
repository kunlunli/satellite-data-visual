'use client'

import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
}

const SAMPLE = 4

export default function TrackingPathChart({ data, currentIndex, height = 240 }: Props) {
  const actualData = useMemo(
    () => data.filter((_, i) => i % SAMPLE === 0).map((r) => ({ az: r.cur_az, el: r.cur_el })),
    [data],
  )
  const targetData = useMemo(
    () => data.filter((_, i) => i % SAMPLE === 0).map((r) => ({ az: r.target_az, el: r.target_el })),
    [data],
  )
  const currentPoint = useMemo(
    () => data[currentIndex] ? [{ az: data[currentIndex].cur_az, el: data[currentIndex].cur_el }] : [],
    [data, currentIndex],
  )

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">Tracking Path (AZ / EL)</h2>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 4, right: 16, bottom: 28, left: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="az" type="number" name="Azimuth" domain={['auto', 'auto']}
            tick={{ fontSize: 9 }}
            label={{ value: 'Azimuth (deg)', position: 'insideBottom', offset: -14, fontSize: 11 }} />
          <YAxis dataKey="el" type="number" name="Elevation" domain={['auto', 'auto']}
            tick={{ fontSize: 10 }}
            label={{ value: 'Elevation (deg)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11 }} />
          <Tooltip formatter={(v: number) => v.toFixed(3) + '°'} />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11 }} />
          <Scatter
            name="Actual"
            data={actualData}
            fill="#3b82f6"
            line={{ stroke: '#3b82f6', strokeWidth: 1.5 }}
            lineJointType="monotone"
            shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={1.5} fill="#3b82f6" opacity={0.5} />}
            isAnimationActive={false}
          />
          <Scatter
            name="Target"
            data={targetData}
            fill="#f97316"
            line={{ stroke: '#f97316', strokeWidth: 1.5 }}
            lineJointType="monotone"
            shape={(props: any) => <circle cx={props.cx} cy={props.cy} r={1.5} fill="#f97316" opacity={0.5} />}
            isAnimationActive={false}
          />
          <Scatter
            name="Current"
            data={currentPoint}
            fill="#10b981"
            shape={(props: any) => (
              <circle cx={props.cx} cy={props.cy} r={5} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
            )}
            isAnimationActive={false}
            legendType="none"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
