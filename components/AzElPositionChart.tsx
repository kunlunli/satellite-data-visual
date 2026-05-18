'use client'

import { memo, useMemo, useCallback, useState } from 'react'
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
  SYNCED_RIGHT_Y_AXIS_WIDTH,
  SYNCED_CHART_PLOT_BOUNDS,
  getFlightTimeDomain,
  sliceByTime,
  makeZoomAwareTimeTicks,
  getDynamicSample,
} from '@/lib/timeSeriesChartLayout'
import { useChartZoom } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  /** Fixed chart height (dashboard). Ignored when `fill` is true. */
  height?: number
  /** Grow to fill parent height (focused views). */
  fill?: boolean
  /** Show chart title inside the card (off when a page heading already labels the view). */
  showHeading?: boolean
  forPdf?: boolean
}

function AzElPositionChartInner({
  data,
  currentIndex,
  height = 320,
  fill = false,
  showHeading = true,
  forPdf = false,
}: Props) {
  const [showDots, setShowDots] = useState(false)
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, SYNCED_CHART_PLOT_BOUNDS)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])

  const allChartData = useMemo(
    () => data.filter((_, i) => i % sample === 0).map((r) => ({ t: r.flightTimeMs, az: r.cur_az, el: r.cur_el })),
    [data, sample],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])

  const dataInterval = data.length >= 2 ? data[1].flightTimeMs - data[0].flightTimeMs : 500
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval),
    [zoomDomain, sample, dataInterval],
  )

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentAz = data[currentIndex]?.cur_az
  const currentEl = data[currentIndex]?.cur_el
  const showCursor =
    chartData.length > 0 && Number.isFinite(currentTime) && data.length > 0

  const tickSz = forPdf ? 22 : 14
  const labelSz = forPdf ? 24 : 16
  const axisPad = forPdf ? SYNCED_LEFT_Y_AXIS_WIDTH + 20 : SYNCED_LEFT_Y_AXIS_WIDTH
  const axisPadR = forPdf ? SYNCED_RIGHT_Y_AXIS_WIDTH + 20 : SYNCED_RIGHT_Y_AXIS_WIDTH

  const chart = (
    <LineChart data={chartData} margin={{ ...SYNCED_TIME_CHART_MARGIN }}>
      <CartesianGrid stroke="#c4c9d4" />
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
        yAxisId="az"
        orientation="left"
        width={axisPad}
        domain={['auto', 'auto']}
        tickFormatter={(v: number) => v.toFixed(1)}
        tick={{ fontSize: tickSz }}
        label={{ value: 'Azimuth (°)', angle: 0, position: 'insideTopLeft', dy: -(labelSz + 13), fontSize: labelSz }}
      />
      <YAxis
        yAxisId="el"
        orientation="right"
        width={axisPadR}
        domain={['auto', 'auto']}
        tickFormatter={(v: number) => v.toFixed(1)}
        tick={{ fontSize: tickSz }}
        label={{ value: 'Elevation (°)', angle: 0, position: 'insideTopRight', dy: -(labelSz + 13), fontSize: labelSz }}
      />
      <Tooltip
        labelFormatter={(v) => fmtTooltip(Number(v))}
        formatter={(v: number, name: string) => [`${v.toFixed(3)}°`, name]}
      />
      <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: tickSz }} />
      <Line
        yAxisId="az"
        type="monotone"
        dataKey="az"
        name="Azimuth"
        stroke="#2563eb"
        dot={showDots ? { r: 4, fill: '#2563eb', strokeWidth: 0 } : false}
        strokeWidth={1.5}
        isAnimationActive={false}
      />
      <Line
        yAxisId="el"
        type="monotone"
        dataKey="el"
        name="Elevation"
        stroke="#ea580c"
        dot={showDots ? { r: 4, fill: '#ea580c', strokeWidth: 0 } : false}
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

  const dotsBtn = (
    <button
      type="button"
      onClick={() => setShowDots((v) => !v)}
      className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
    >
      {showDots ? 'Hide dots' : 'Show dots'}
    </button>
  )

  if (fill) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-white p-3 shadow-sm">
        {showHeading && (
          <h2 className="mb-1 shrink-0 text-center text-xs font-semibold text-gray-600">
            Azimuth &amp; Elevation vs Time
          </h2>
        )}
        <div ref={containerRef} className={`min-h-0 w-full flex-1 ${showHeading ? '' : 'pt-1'}`}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
        {isZoomed && (
          <ZoomScrollbar
            className="shrink-0"
            fullDomain={timeDomain}
            visibleDomain={zoomDomain}
            onPan={pan}
            leftPad={SYNCED_CHART_PLOT_BOUNDS.left}
            rightPad={SYNCED_CHART_PLOT_BOUNDS.right}
          />
        )}
        {dotsBtn}
        <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
      </div>
    )
  }

  return (
    <div className="relative rounded-lg bg-white p-3 shadow-sm">
      {showHeading && (
        <h2 className="mb-2 text-center text-xs font-semibold text-gray-600">
          Azimuth &amp; Elevation vs Time
        </h2>
      )}
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={height}>
          {chart}
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
      {dotsBtn}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

const AzElPositionChart = memo(AzElPositionChartInner)
export default AzElPositionChart
