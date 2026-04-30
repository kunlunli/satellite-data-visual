'use client'

import { memo, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'
import {
  SYNCED_TIME_CHART_MARGIN,
  SYNCED_LEFT_Y_AXIS_WIDTH,
  getFlightTimeDomain,
} from '@/lib/timeSeriesChartLayout'
import { SyncPadRightYAxis } from '@/components/SyncPadRightYAxis'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
  showHeading?: boolean
}

const SAMPLE = 4

function TrackingErrorChartInner({ data, currentIndex, height = 360, showHeading = true }: Props) {
  const chartData = useMemo(
    () =>
      data
        .filter((_, i) => i % SAMPLE === 0)
        .map((r) => ({ t: r.flightTimeMs, paeX: r.pae_joint_X, paeY: r.pae_joint_Y })),
    [data],
  )

  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentPaeX = data[currentIndex]?.pae_joint_X
  const currentPaeY = data[currentIndex]?.pae_joint_Y

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      {showHeading ? (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
          Pointing Accuracy Error (deg)
        </h2>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ ...SYNCED_TIME_CHART_MARGIN }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="t"
            type="number"
            domain={timeDomain}
            allowDataOverflow
            tickFormatter={formatFlightTime}
            tick={{ fontSize: 13 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -12, fontSize: 14 }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            width={SYNCED_LEFT_Y_AXIS_WIDTH}
            domain={['auto', 'auto']}
            tick={{ fontSize: 13 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 12, fontSize: 14 }}
          />
          <SyncPadRightYAxis />
          <Tooltip
            labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(4) + '°', name]}
          />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
          <Line yAxisId="left" type="monotone" dataKey="paeX" name="PAE X" stroke="#2563eb" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line yAxisId="left" type="monotone" dataKey="paeY" name="PAE Y" stroke="#ea580c" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <ReferenceLine yAxisId="left" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
          {currentPaeX != null && (
            <ReferenceDot
              yAxisId="left"
              x={currentTime}
              y={currentPaeX}
              r={4}
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth={1}
              isFront
            />
          )}
          {currentPaeY != null && (
            <ReferenceDot
              yAxisId="left"
              x={currentTime}
              y={currentPaeY}
              r={4}
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth={1}
              isFront
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const TrackingErrorChart = memo(TrackingErrorChartInner)
export default TrackingErrorChart
