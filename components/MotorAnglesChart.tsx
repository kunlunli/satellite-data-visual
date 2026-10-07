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
  getDynamicSample,
} from '@/lib/timeSeriesChartLayout'
import { SyncPadRightYAxis } from '@/components/SyncPadRightYAxis'
import { useChartZoom } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'

/** Colors for the X / Y motor angle series, shared with the full and combined charts. */
export const MOTOR_X_COLOR = '#c2410c'
export const MOTOR_Y_COLOR = '#0f766e'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
  showHeading?: boolean
  forPdf?: boolean
}

function MotorAnglesChartInner({ data, currentIndex, height = 360, showHeading = true, forPdf = false }: Props) {
  const [showDots, setShowDots] = useState(false)
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, SYNCED_CHART_PLOT_BOUNDS)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])

  const allChartData = useMemo(
    () => data.filter((_, i) => i % sample === 0).map((r) => ({ t: r.flightTimeMs, motorX: r.cur_joint_X, motorY: r.cur_joint_Y })),
    [data, sample],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])

  const dataInterval = data.length >= 2 ? data[1].flightTimeMs - data[0].flightTimeMs : 500
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval),
    [zoomDomain, sample, dataInterval],
  )
  // Shared domain for both series, from the full log so zooming in time doesn't rescale it.
  const motorDomain = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    for (const r of data) {
      for (const v of [r.cur_joint_X, r.cur_joint_Y]) {
        if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v }
      }
    }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data])

  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentX = data[currentIndex]?.cur_joint_X
  const currentY = data[currentIndex]?.cur_joint_Y

  const tickSz = forPdf ? 22 : 14
  const labelSz = forPdf ? 24 : 16
  const axisPad = forPdf ? SYNCED_LEFT_Y_AXIS_WIDTH + 20 : SYNCED_LEFT_Y_AXIS_WIDTH
  const dot = (fill: string) => showDots ? { r: 4, fill, strokeWidth: 0 } : false as const

  return (
    <div className="relative bg-white rounded-lg p-3 shadow-sm">
      {showHeading ? (
        <h2 className="text-xs font-semibold text-gray-600 text-center mb-2">
          X / Y Motor Angles
          <span className="ml-3 inline-flex items-center gap-1 font-normal">
            <span className="inline-block h-[2px] w-4" style={{ background: MOTOR_X_COLOR }} /> X
          </span>
          <span className="ml-2 inline-flex items-center gap-1 font-normal">
            <span className="inline-block h-[2px] w-4" style={{ background: MOTOR_Y_COLOR }} /> Y
          </span>
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
            domain={motorDomain}
            tickFormatter={(v: number) => v.toFixed(1)}
            tick={{ fontSize: tickSz }}
            label={{ value: 'Motor (°)', angle: 0, position: 'insideTopLeft', dy: -(labelSz + 13), fontSize: labelSz }}
          />
          <SyncPadRightYAxis />
          <Tooltip
            labelFormatter={(v) => fmtTooltip(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]}
          />
          <Line yAxisId="left" type="monotone" dataKey="motorX" name="Motor X" stroke={MOTOR_X_COLOR} dot={dot(MOTOR_X_COLOR)} strokeWidth={1.5} isAnimationActive={false} />
          <Line yAxisId="left" type="monotone" dataKey="motorY" name="Motor Y" stroke={MOTOR_Y_COLOR} dot={dot(MOTOR_Y_COLOR)} strokeWidth={1.5} isAnimationActive={false} />
          <ReferenceLine yAxisId="left" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
          {currentX != null && (
            <ReferenceDot yAxisId="left" x={currentTime} y={currentX} r={4} fill={MOTOR_X_COLOR} stroke="#ffffff" strokeWidth={1} isFront />
          )}
          {currentY != null && (
            <ReferenceDot yAxisId="left" x={currentTime} y={currentY} r={4} fill={MOTOR_Y_COLOR} stroke="#ffffff" strokeWidth={1} isFront />
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

const MotorAnglesChart = memo(MotorAnglesChartInner)
export default MotorAnglesChart
