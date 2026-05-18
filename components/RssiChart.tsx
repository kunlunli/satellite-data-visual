'use client'

import { memo, useMemo, useCallback, useState } from 'react'
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
import { useTimezone } from '@/lib/timezoneContext'
import { formatWallClock, formatWallClockFull } from '@/lib/formatWallTime'
import {
  SYNCED_TIME_CHART_MARGIN,
  SYNCED_LEFT_Y_AXIS_WIDTH,
  SYNCED_CHART_PLOT_BOUNDS,
  getFlightTimeDomain,
  sliceByTime,
  makeZoomAwareTimeTicks,
  makeRssiTicks,
  rssiToDbm,
  getDynamicSample,
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

function RssiChartInner({ data, currentIndex, height = 360, showHeading = true, forPdf = false }: Props) {
  const [showDots, setShowDots] = useState(false)
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, SYNCED_CHART_PLOT_BOUNDS)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])

  const allChartData = useMemo(
    () => data.filter((_, i) => i % sample === 0).map((r) => ({ t: r.flightTimeMs, rssi: r.rssi })),
    [data, sample],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])

  const dataInterval = data.length >= 2 ? data[1].flightTimeMs - data[0].flightTimeMs : 500
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval),
    [zoomDomain, sample, dataInterval],
  )
  const rssiRange = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const d of allChartData) { if (d.rssi < min) min = d.rssi; if (d.rssi > max) max = d.rssi }
    return { min, max }
  }, [allChartData])
  const rssiTicks = useMemo(
    () => makeRssiTicks(rssiRange.min, rssiRange.max),
    [rssiRange],
  )
  const rssiDomain = useMemo((): [number, number] => {
    if (rssiTicks.length === 0) return [0, 1]
    return [rssiTicks[0], rssiTicks[rssiTicks.length - 1]]
  }, [rssiTicks])

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentRssi = data[currentIndex]?.rssi

  const tickSz = forPdf ? 22 : 14
  const labelSz = forPdf ? 24 : 16
  const axisPad = forPdf ? SYNCED_LEFT_Y_AXIS_WIDTH + 20 : SYNCED_LEFT_Y_AXIS_WIDTH

  return (
    <div className="relative bg-white rounded-lg p-3 shadow-sm">
      {showHeading ? (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
          RSSI over Time
        </h2>
      ) : null}
      <div ref={containerRef}>
      <ResponsiveContainer width="100%" height={height}>
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
            yAxisId="left"
            orientation="left"
            width={axisPad}
            domain={rssiDomain}
            ticks={rssiTicks}
            tickFormatter={(v: number) => rssiToDbm(v).toFixed(1)}
            tick={{ fontSize: tickSz }}
            label={{ value: 'RSSI (dBm)', angle: 0, position: 'insideTopLeft', dy: -(labelSz + 13), fontSize: labelSz }}
          />
          <SyncPadRightYAxis />
          <Tooltip
            labelFormatter={(v) => fmtTooltip(Number(v))}
            formatter={(v: number) => [rssiToDbm(v).toFixed(2) + ' dBm', 'RSSI']}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="rssi"
            stroke="#7c3aed"
            dot={showDots ? { r: 4, fill: '#7c3aed', strokeWidth: 0 } : false}
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
      {isZoomed && (
        <ZoomScrollbar
          fullDomain={timeDomain}
          visibleDomain={zoomDomain}
          onPan={pan}
          leftPad={SYNCED_CHART_PLOT_BOUNDS.left}
          rightPad={SYNCED_CHART_PLOT_BOUNDS.right}
        />
      )}
      <button
        type="button"
        onClick={() => setShowDots((v) => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

const RssiChart = memo(RssiChartInner)
export default RssiChart
