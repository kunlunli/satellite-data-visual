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
  SYNCED_RIGHT_Y_AXIS_WIDTH,
  getFlightTimeDomain,
} from '@/lib/timeSeriesChartLayout'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  /** Fixed chart height (dashboard). Ignored when `fill` is true. */
  height?: number
  /** Grow to fill parent height (focused views). */
  fill?: boolean
  /** Show chart title inside the card (off when a page heading already labels the view). */
  showHeading?: boolean
}

const SAMPLE = 4

function AzElPositionChartInner({
  data,
  currentIndex,
  height = 320,
  fill = false,
  showHeading = true,
}: Props) {
  const chartData = useMemo(
    () =>
      data
        .filter((_, i) => i % SAMPLE === 0)
        .map((r) => ({ t: r.flightTimeMs, az: r.cur_az, el: r.cur_el })),
    [data],
  )

  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentAz = data[currentIndex]?.cur_az
  const currentEl = data[currentIndex]?.cur_el
  const showCursor =
    chartData.length > 0 && Number.isFinite(currentTime) && data.length > 0

  const chart = (
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
        yAxisId="az"
        orientation="left"
        width={SYNCED_LEFT_Y_AXIS_WIDTH}
        domain={['auto', 'auto']}
        tick={{ fontSize: 13 }}
        label={{ value: 'Azimuth (°)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 14 }}
      />
      <YAxis
        yAxisId="el"
        orientation="right"
        width={SYNCED_RIGHT_Y_AXIS_WIDTH}
        domain={['auto', 'auto']}
        tick={{ fontSize: 13 }}
        label={{ value: 'Elevation (°)', angle: 90, position: 'insideRight', offset: 10, fontSize: 14 }}
      />
      <Tooltip
        labelFormatter={(v) => formatFlightTime(Number(v))}
        formatter={(v: number, name: string) => [`${v.toFixed(3)}°`, name]}
      />
      <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13 }} />
      <Line
        yAxisId="az"
        type="monotone"
        dataKey="az"
        name="Azimuth"
        stroke="#2563eb"
        dot={false}
        strokeWidth={1.5}
        isAnimationActive={false}
      />
      <Line
        yAxisId="el"
        type="monotone"
        dataKey="el"
        name="Elevation"
        stroke="#ea580c"
        dot={false}
        strokeWidth={1.5}
        isAnimationActive={false}
      />
      {showCursor && (
        <ReferenceLine
          yAxisId="az"
          x={currentTime}
          stroke="#10b981"
          strokeDasharray="4 2"
          strokeWidth={1.5}
        />
      )}
      {showCursor && currentAz != null && Number.isFinite(currentAz) && (
        <ReferenceDot
          yAxisId="az"
          x={currentTime}
          y={currentAz}
          r={4}
          fill="#2563eb"
          stroke="#fff"
          strokeWidth={1}
          isFront
        />
      )}
      {showCursor && currentEl != null && Number.isFinite(currentEl) && (
        <ReferenceDot
          yAxisId="el"
          x={currentTime}
          y={currentEl}
          r={4}
          fill="#ea580c"
          stroke="#fff"
          strokeWidth={1}
          isFront
        />
      )}
    </LineChart>
  )

  if (fill) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white p-3 shadow-sm">
        {showHeading && (
          <h2 className="mb-1 shrink-0 text-center text-xs font-semibold text-gray-600">
            Azimuth &amp; Elevation vs Time
          </h2>
        )}
        <div className={`min-h-0 w-full flex-1 ${showHeading ? '' : 'pt-1'}`}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      {showHeading && (
        <h2 className="mb-2 text-center text-xs font-semibold text-gray-600">
          Azimuth &amp; Elevation vs Time
        </h2>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

const AzElPositionChart = memo(AzElPositionChartInner)
export default AzElPositionChart
