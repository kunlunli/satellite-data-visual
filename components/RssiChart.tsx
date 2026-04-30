'use client'

import { memo, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

function RssiChartInner({ data, currentIndex, height = 360, showHeading = true }: Props) {
  const chartData = useMemo(
    () =>
      data
        .filter((_, i) => i % SAMPLE === 0)
        .map((r) => ({ t: r.flightTimeMs, rssi: r.rssi })),
    [data],
  )

  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentRssi = data[currentIndex]?.rssi

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm">
      {showHeading ? (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
          RSSI over Time
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
            label={{ value: 'rssi', angle: -90, position: 'insideLeft', offset: 12, fontSize: 14 }}
          />
          <SyncPadRightYAxis />
          <Tooltip
            labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number) => [v.toFixed(1), 'RSSI']}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="rssi"
            stroke="#7c3aed"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          <ReferenceLine yAxisId="left" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
          {currentRssi != null && (
            <ReferenceDot
              yAxisId="left"
              x={currentTime}
              y={currentRssi}
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

const RssiChart = memo(RssiChartInner)
export default RssiChart
