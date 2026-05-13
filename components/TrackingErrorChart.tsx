'use client'

import { memo, useMemo, useCallback } from 'react'
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
import { useTimezone } from '@/lib/timezoneContext'
import { formatWallClock, formatWallClockFull } from '@/lib/formatWallTime'
import {
  SYNCED_TIME_CHART_MARGIN,
  SYNCED_LEFT_Y_AXIS_WIDTH,
  SYNCED_CHART_PLOT_BOUNDS,
  getFlightTimeDomain,
  sliceByTime,
  makeTimeTicks,
} from '@/lib/timeSeriesChartLayout'
import { SyncPadRightYAxis } from '@/components/SyncPadRightYAxis'
import { useChartZoom } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
  showHeading?: boolean
  forPdf?: boolean
}

const SAMPLE = 4

function TrackingErrorChartInner({ data, currentIndex, height = 360, showHeading = true, forPdf = false }: Props) {
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, SYNCED_CHART_PLOT_BOUNDS)

  const allChartData = useMemo(
    () => data.filter((_, i) => i % SAMPLE === 0).map((r) => ({ t: r.flightTimeMs, paeX: r.pae_joint_X, paeY: r.pae_joint_Y })),
    [data],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])

  const timeTicks = useMemo(
    () => makeTimeTicks(zoomDomain[0], zoomDomain[1], 10 * 60 * 1000),
    [zoomDomain],
  )

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentPaeX = data[currentIndex]?.pae_joint_X
  const currentPaeY = data[currentIndex]?.pae_joint_Y

  const tickSz = forPdf ? 22 : 14
  const labelSz = forPdf ? 24 : 16
  const axisPad = forPdf ? SYNCED_LEFT_Y_AXIS_WIDTH + 20 : SYNCED_LEFT_Y_AXIS_WIDTH

  return (
    <div className="relative bg-white rounded-lg p-3 shadow-sm">
      {showHeading ? (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
          Pointing Accuracy Error (deg)
        </h2>
      ) : null}
      <div ref={containerRef}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ ...SYNCED_TIME_CHART_MARGIN }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
          <XAxis
            dataKey="t"
            type="number"
            domain={zoomDomain}
            ticks={timeTicks}
            allowDataOverflow
            tickFormatter={fmtTick}
            tick={{ fontSize: tickSz }}
            label={{ value: 'Time', position: 'insideBottom', offset: -12, fontSize: labelSz }}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            width={axisPad}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fontSize: tickSz }}
            label={{ value: 'PAE (°)', angle: 0, position: 'insideTopLeft', dy: -(labelSz + 13), fontSize: labelSz }}
          />
          <SyncPadRightYAxis />
          <Tooltip
            labelFormatter={(v) => fmtTooltip(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(4) + '°', name]}
          />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: tickSz }} />
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
      {isZoomed && (
        <ZoomScrollbar
          fullDomain={timeDomain}
          visibleDomain={zoomDomain}
          onPan={pan}
          leftPad={SYNCED_CHART_PLOT_BOUNDS.left}
          rightPad={SYNCED_CHART_PLOT_BOUNDS.right}
        />
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

const TrackingErrorChart = memo(TrackingErrorChartInner)
export default TrackingErrorChart
