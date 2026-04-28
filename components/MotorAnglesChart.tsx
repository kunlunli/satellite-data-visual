'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
}

const SAMPLE = 4

export default function MotorAnglesChart({ data, currentIndex }: Props) {
  const chartData = useMemo(
    () =>
      data
        .filter((_, i) => i % SAMPLE === 0)
        .map((r) => ({ t: r.flightTimeMs, jointX: r.cur_joint_X, jointY: r.cur_joint_Y })),
    [data],
  )

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
        Motor Angles (deg)
      </h2>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 24, left: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime}
            tick={{ fontSize: 9 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -12, fontSize: 11 }}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 12, fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]}
          />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="jointX" name="Joint X" stroke="#f97316" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="monotone" dataKey="jointY" name="Joint Y" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
