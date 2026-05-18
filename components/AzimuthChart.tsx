'use client'

import { useMemo, useCallback, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'
import { useTimezone } from '@/lib/timezoneContext'
import { formatWallClock, formatWallClockFull } from '@/lib/formatWallTime'
import { makeAutoTimeTicks } from '@/lib/timeSeriesChartLayout'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
}

const SAMPLE = 4

export default function AzimuthChart({ data, currentIndex, height = 200 }: Props) {
  const [showDots, setShowDots] = useState(false)
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])

  const chartData = useMemo(
    () => data
      .filter((_, i) => i % SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, cur: r.cur_az, target: r.target_az })),
    [data],
  )
  const timeTicks = useMemo(
    () => chartData.length > 0 ? makeAutoTimeTicks(chartData[0].t, chartData[chartData.length - 1].t) : [],
    [chartData],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0

  return (
    <div className="relative bg-white rounded-lg p-3 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">Azimuth (deg)</h2>
      <button
        type="button"
        onClick={() => setShowDots((v) => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 24, left: 32 }}>
          <CartesianGrid stroke="#c4c9d4" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={timeTicks}
            tickFormatter={fmtTick} tick={{ fontSize: 13 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -12, fontSize: 14 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 13 }}
            label={{ value: 'deg', angle: 0, position: 'insideTopLeft', fontSize: 14 }} />
          <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]} />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 13 }} />
          <Line type="monotone" dataKey="cur" name="Current AZ" stroke="#3b82f6" dot={showDots ? { r: 4, fill: '#3b82f6', strokeWidth: 0 } : false} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="monotone" dataKey="target" name="Target AZ" stroke="#f97316" dot={showDots ? { r: 4, fill: '#f97316', strokeWidth: 0 } : false} strokeWidth={1.5} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
