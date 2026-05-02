'use client'

import { memo, useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { useChartZoom, type PlotBounds } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
  /** Tighter card + larger plot margins so PDF / small widths do not clip the AZ/EL trace. */
  compactExport?: boolean
}

function PathZoomTooltip({ active, payload, data }: { active?: boolean; payload?: any[]; data: SatelliteDataRow[] }) {
  if (!active || !payload || payload.length === 0) return null

  const hovered = payload[0]?.payload as { idx?: number } | undefined
  const idx = hovered?.idx
  if (idx == null || idx < 0 || idx >= data.length) return null

  const point = data[idx]

  const start = Math.max(0, idx - 6)
  const end = Math.min(data.length - 1, idx + 6)
  const windowRows = data.slice(start, end + 1)
  const w = 180
  const h = 80
  const p = 10
  const xDen = Math.max(1, end - start)
  const minEl = Math.min(...windowRows.flatMap((r) => [r.cur_el, r.target_el]))
  const maxEl = Math.max(...windowRows.flatMap((r) => [r.cur_el, r.target_el]))
  const yPad = Math.max((maxEl - minEl) * 0.15, 0.15)
  const yMin = minEl - yPad
  const yMax = maxEl + yPad
  const yDen = Math.max(0.001, yMax - yMin)

  const toX = (i: number) => p + ((i - start) / xDen) * (w - 2 * p)
  const toY = (el: number) => h - p - ((el - yMin) / yDen) * (h - 2 * p)

  const actualPath = windowRows
    .map((r, localI) => `${localI === 0 ? 'M' : 'L'}${toX(start + localI).toFixed(2)},${toY(r.cur_el).toFixed(2)}`)
    .join(' ')
  const targetPath = windowRows
    .map((r, localI) => `${localI === 0 ? 'M' : 'L'}${toX(start + localI).toFixed(2)},${toY(r.target_el).toFixed(2)}`)
    .join(' ')
  const hoverX = toX(idx)
  const hoverActualY = toY(point.cur_el)
  const hoverTargetY = toY(point.target_el)

  return (
    <div className="rounded border border-gray-300 bg-white/95 shadow-lg p-2 text-[11px]">
      <div className="font-semibold text-gray-700 mb-1">Zoomed View</div>
      <svg width={w} height={h}>
        <rect x={0} y={0} width={w} height={h} fill="white" />
        <path d={actualPath} fill="none" stroke="#3b82f6" strokeWidth={1.2} strokeDasharray="6 4" />
        <path d={targetPath} fill="none" stroke="#f97316" strokeWidth={1.4} strokeDasharray="4 4" />
        <line x1={hoverX} y1={p} x2={hoverX} y2={h - p} stroke="#9ca3af" strokeDasharray="3 3" />
        <circle cx={hoverX} cy={hoverActualY} r={3} fill="#3b82f6" />
        <circle cx={hoverX} cy={hoverTargetY} r={3.5} fill="#f97316" stroke="#fff" strokeWidth={0.8} />
      </svg>
      <div className="mt-1 text-gray-700">
        <div><span className="text-blue-600 font-medium">Actual</span>: AZ {point.cur_az.toFixed(3)}°, EL {point.cur_el.toFixed(3)}°</div>
        <div><span className="text-orange-600 font-medium">Target</span>: AZ {point.target_az.toFixed(3)}°, EL {point.target_el.toFixed(3)}°</div>
      </div>
    </div>
  )
}

/** Cap scatter points so Recharts can repaint quickly on each step (shape is preserved; hover idx stays real). */
const SCATTER_POINT_CAP = 2800

function buildScatterSeries(
  data: SatelliteDataRow[],
  pick: (r: SatelliteDataRow) => { az: number; el: number },
) {
  const n = data.length
  if (n === 0) return []
  const step = Math.max(1, Math.ceil(n / SCATTER_POINT_CAP))
  const out: { az: number; el: number; idx: number }[] = []
  for (let i = 0; i < n; i += step) {
    const r = data[i]
    const { az, el } = pick(r)
    out.push({ az, el, idx: i })
  }
  const last = n - 1
  if (out.length === 0 || out[out.length - 1].idx !== last) {
    const r = data[last]
    const { az, el } = pick(r)
    out.push({ az, el, idx: last })
  }
  return out
}

function TrackingPathChartInner({ data, currentIndex, height = 240, compactExport = false }: Props) {
  const azDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 360]
    let minAz = Infinity
    let maxAz = -Infinity
    for (const r of data) {
      if (r.cur_az < minAz) minAz = r.cur_az
      if (r.target_az < minAz) minAz = r.target_az
      if (r.cur_az > maxAz) maxAz = r.cur_az
      if (r.target_az > maxAz) maxAz = r.target_az
    }
    const range = maxAz - minAz
    const pad = Math.max(range * 0.05, 1)
    return [minAz - pad, maxAz + pad]
  }, [data])
  // chartMargin (non-export) = { top: 4, right: 16, bottom: 28, left: 32 } + left Y-axis ~60px
  const pathPlotBounds: PlotBounds = { left: 32 + 60, right: 16, top: 4, bottom: 28 }
  const { domain: zoomAzDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(azDomain, compactExport ? undefined : pathPlotBounds)

  const allActualData = useMemo(
    () => buildScatterSeries(data, (r) => ({ az: r.cur_az, el: r.cur_el })),
    [data],
  )
  const allTargetData = useMemo(
    () => buildScatterSeries(data, (r) => ({ az: r.target_az, el: r.target_el })),
    [data],
  )
  const actualData = allActualData
  const targetData = allTargetData
  const elevationDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1]

    let minEl = Number.POSITIVE_INFINITY
    let maxEl = Number.NEGATIVE_INFINITY

    for (const row of data) {
      if (row.cur_el < minEl) minEl = row.cur_el
      if (row.target_el < minEl) minEl = row.target_el
      if (row.cur_el > maxEl) maxEl = row.cur_el
      if (row.target_el > maxEl) maxEl = row.target_el
    }

    const range = maxEl - minEl
    const pad = Math.max(range * 0.12, 0.25)
    return [minEl - pad, maxEl + pad]
  }, [data])
  const currentActualPoint = useMemo(
    () => (data[currentIndex] ? [{ az: data[currentIndex].cur_az, el: data[currentIndex].cur_el }] : []),
    [data, currentIndex],
  )
  const chartMargin = compactExport
    ? { top: 2, right: 44, bottom: 22, left: 28 }
    : { top: 4, right: 16, bottom: 28, left: 32 }

  return (
    <div className={`relative bg-white rounded-lg shadow-sm ${compactExport ? 'p-1 pdf-path-chart' : 'p-3 flex flex-col'}`}>
      <h2 className={`font-semibold text-gray-600 text-center ${compactExport ? 'text-[10px] mb-1' : 'text-xs mb-2'}`}>
        Tracking Path (AZ / EL)
      </h2>
      <div ref={compactExport ? undefined : containerRef} className={compactExport ? undefined : 'flex-1 min-h-0'}>
      <ResponsiveContainer width="100%" height={compactExport ? height : '100%'} className={compactExport ? 'pdf-recharts-fill' : undefined}>
        <ScatterChart margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="az"
            type="number"
            name="Azimuth"
            domain={compactExport ? ['auto', 'auto'] : zoomAzDomain}
            allowDataOverflow={!compactExport}
            padding={compactExport ? { left: 10, right: 28 } : undefined}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fontSize: 13 }}
            label={{ value: 'Azimuth (deg)', position: 'insideBottom', offset: -14, fontSize: 14 }}
          />
          <YAxis
            dataKey="el"
            type="number"
            name="Elevation"
            domain={elevationDomain}
            padding={compactExport ? { top: 8, bottom: 8 } : undefined}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fontSize: 13 }}
            label={{ value: 'Elevation (deg)', angle: 0, position: 'insideTopLeft', fontSize: 12, dy: 20, dx: 4 }}
          />
          <Tooltip
            cursor={{ stroke: '#9ca3af', strokeDasharray: '4 3' }}
            content={<PathZoomTooltip data={data} />}
          />
          {!compactExport && (
            <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 13 }} />
          )}
          <Scatter
            name="Actual"
            data={actualData}
            fill="#3b82f6"
            fillOpacity={0}
            line={{ stroke: '#3b82f6', strokeWidth: 1.2, strokeDasharray: '6 4' }}
            lineJointType="linear"
            shape="circle"
            isAnimationActive={false}
          />
          <Scatter
            name="Target"
            data={targetData}
            fill="#f97316"
            fillOpacity={0}
            line={{ stroke: '#f97316', strokeWidth: 1.2, strokeDasharray: '4 4' }}
            lineJointType="linear"
            shape="circle"
            isAnimationActive={false}
          />
          <Scatter
            name="Current Position"
            data={currentActualPoint}
            fill="#ef4444"
            shape="circle"
            line={false}
            isAnimationActive={false}
          />
        </ScatterChart>
      </ResponsiveContainer>
      </div>
      {!compactExport && isZoomed && (
        <ZoomScrollbar
          fullDomain={azDomain}
          visibleDomain={zoomAzDomain}
          onPan={pan}
          leftPad={pathPlotBounds.left}
          rightPad={pathPlotBounds.right}
        />
      )}
      {!compactExport && <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />}
    </div>
  )
}

const TrackingPathChart = memo(TrackingPathChartInner)
export default TrackingPathChart
