'use client'

import { memo, useMemo, useRef, useState, useEffect, useCallback, useId } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Customized,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { getDynamicSample, sliceByTime, azWindowToTimeDomain } from '@/lib/timeSeriesChartLayout'
import { useChartZoom, type PlotBounds } from '@/lib/useChartZoom'
import { useDragPan } from '@/lib/useDragPan'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'
import { VerticalScrollbar } from '@/components/VerticalScrollbar'

type LineKey = 'actual' | 'cs_path' | 'cs_center'

const LINE_DEFS: { key: LineKey; label: string; color: string; dashArray?: string }[] = [
  { key: 'actual',    label: 'Antenna Pointing',      color: '#3b82f6' },
  { key: 'cs_path',   label: 'Satellite Look Angle',  color: '#8b5cf6', dashArray: '6 4' },
  { key: 'cs_center', label: 'Conical Scan Center',   color: '#10b981', dashArray: '4 4' },
]

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
  /** Tighter card + larger plot margins so PDF / small widths do not clip the AZ/EL trace. */
  compactExport?: boolean
  /** Called with the original data-array index when the user clicks a data point. */
  onIndexClick?: (idx: number) => void
}

function PathZoomTooltip({
  active, payload, data, visibleLines,
}: {
  active?: boolean
  payload?: any[]
  data: SatelliteDataRow[]
  visibleLines: Set<LineKey>
  [key: string]: any
}) {
  if (!active || !payload || payload.length === 0) return null

  const hovered = payload[0]?.payload as { idx?: number } | undefined
  const idx = hovered?.idx
  if (idx == null || idx < 0 || idx >= data.length) return null

  const point = data[idx]

  // Mini sparkline for Antenna Pointing only (cs circles are too noisy)
  const showSparkline = visibleLines.has('actual')
  let sparklineEl: React.ReactNode = null

  if (showSparkline) {
    const start = Math.max(0, idx - 6)
    const end = Math.min(data.length - 1, idx + 6)
    const windowRows = data.slice(start, end + 1)
    const w = 180, h = 80, p = 10
    const xDen = Math.max(1, end - start)

    const allEls = windowRows.map((r) => r.cur_el)
    const minEl = Math.min(...allEls)
    const maxEl = Math.max(...allEls)
    const yPad = Math.max((maxEl - minEl) * 0.15, 0.15)
    const yMin = minEl - yPad
    const yMax = maxEl + yPad
    const yDen = Math.max(0.001, yMax - yMin)

    const toX = (i: number) => p + ((i - start) / xDen) * (w - 2 * p)
    const toY = (el: number) => h - p - ((el - yMin) / yDen) * (h - 2 * p)

    const actualPath = windowRows
      .map((r, li) => `${li === 0 ? 'M' : 'L'}${toX(start + li).toFixed(2)},${toY(r.cur_el).toFixed(2)}`)
      .join(' ')
    const hoverX = toX(idx)

    sparklineEl = (
      <svg width={w} height={h}>
        <rect x={0} y={0} width={w} height={h} fill="white" />
        <path d={actualPath} fill="none" stroke="#3b82f6" strokeWidth={1.2} strokeDasharray="6 4" />
        <line x1={hoverX} y1={p} x2={hoverX} y2={h - p} stroke="#9ca3af" strokeDasharray="3 3" />
        <circle cx={hoverX} cy={toY(point.cur_el)} r={3} fill="#3b82f6" />
      </svg>
    )
  }

  return (
    <div className="rounded border border-gray-300 bg-white/95 shadow-lg p-2 text-[11px]">
      <div className="font-semibold text-gray-700 mb-1">Zoomed View</div>
      {sparklineEl}
      <div className={`${showSparkline ? 'mt-1' : ''} text-gray-700`}>
        {visibleLines.has('actual') && (
          <div><span className="text-blue-600 font-medium">Antenna Pointing</span>: AZ {point.cur_az.toFixed(3)}°, EL {point.cur_el.toFixed(3)}°</div>
        )}
        {visibleLines.has('cs_path') && (
          <div><span className="font-medium" style={{ color: '#8b5cf6' }}>Satellite Look Angle</span>: AZ {point.cs_target_az.toFixed(3)}°, EL {point.cs_target_el.toFixed(3)}°</div>
        )}
        {visibleLines.has('cs_center') && (
          <div><span className="font-medium" style={{ color: '#10b981' }}>Conical Scan Center</span>: AZ {point.cs_center_az.toFixed(3)}°, EL {point.cs_center_el.toFixed(3)}°</div>
        )}
      </div>
    </div>
  )
}


const NO_SHAPE = () => <></>
// Small dot that doesn't visually thicken the connecting line.
// Recharts passes cx, cy, and the series fill as props to the shape renderer.
const DOT_SHAPE = (props: unknown) => {
  const { cx, cy, fill } = props as { cx?: number; cy?: number; fill?: string }
  if (cx == null || cy == null) return <></>
  return <circle cx={cx} cy={cy} r={3.5} fill={fill ?? 'currentColor'} />
}

function TrackingPathChartInner({ data, currentIndex, height = 240, compactExport = false, onIndexClick }: Props) {
  const [visibleLines, setVisibleLines] = useState<Set<LineKey>>(new Set(['actual'] as LineKey[]))
  const toggleLine = useCallback((key: LineKey) => setVisibleLines((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }), [])

  // AZ domain from ALL series — stable across visibility toggles so zoom range doesn't jump
  const azDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 360]
    let min = Infinity, max = -Infinity
    for (const r of data) {
      for (const v of [r.cur_az, r.target_az, r.cs_target_az, r.cs_center_az]) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    const range = max - min
    const pad = Math.max(range * 0.05, 1)
    return [min - pad, max + pad]
  }, [data])

  // chartMargin (non-export) = { top: 4, right: 16, bottom: 28, left: 32 } + left Y-axis ~60px
  const pathPlotBounds: PlotBounds = { left: 32 + 60, right: 16, top: 4, bottom: 28 }
  const [showDots, setShowDots] = useState(false)
  const [showDelta, setShowDelta] = useState(false)
  // Unique SVG marker ID — avoids conflicts when multiple chart instances are in the DOM
  const rawId = useId()
  const deltaMarkerId = `tdelta-${rawId.replace(/:/g, '')}`
  const { domain: zoomAzDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(azDomain, compactExport ? undefined : pathPlotBounds, 1.4)
  const [azDomMin, azDomMax] = zoomAzDomain
  const sample = useMemo(() => getDynamicSample(zoomAzDomain, azDomain), [zoomAzDomain, azDomain])

  // target_az is monotonic with time — used as the time reference for slicing.
  // cur_az is NOT monotonic (antenna oscillates during conical scan), so it cannot
  // be used for azWindowToTimeDomain's binary search.
  const allTargetData = useMemo(() => {
    const out: { az: number; t: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].target_az, t: data[i].flightTimeMs })
    return out
  }, [data, sample])

  const allActualData = useMemo(() => {
    const out: { az: number; el: number; t: number; idx: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].cur_az, el: data[i].cur_el, t: data[i].flightTimeMs, idx: i })
    return out
  }, [data, sample])

  // cs series are non-monotonic in AZ — never filter by az value, only slice by time
  const allCsPathData = useMemo(() => {
    const out: { az: number; el: number; t: number; idx: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].cs_target_az, el: data[i].cs_target_el, t: data[i].flightTimeMs, idx: i })
    return out
  }, [data, sample])

  const allCsCenterData = useMemo(() => {
    const out: { az: number; el: number; t: number; idx: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].cs_center_az, el: data[i].cs_center_el, t: data[i].flightTimeMs, idx: i })
    return out
  }, [data, sample])

  // Time domain derived from target_az (truly monotonic) — used to slice all series consistently.
  // Binary-search is O(log n); runs on every pan/zoom frame so the reference must be monotonic.
  const visibleTimeDomain = useMemo<[number, number]>(() => {
    const fallback: [number, number] = [allTargetData[0]?.t ?? 0, allTargetData[allTargetData.length - 1]?.t ?? 0]
    if (!isZoomed || allTargetData.length === 0) return fallback
    const buf = (azDomMax - azDomMin) * 0.1
    return azWindowToTimeDomain(allTargetData, azDomMin - buf, azDomMax + buf) ?? fallback
  }, [allTargetData, isZoomed, azDomMin, azDomMax])

  const actualData = useMemo(
    () => isZoomed ? sliceByTime(allActualData, visibleTimeDomain[0], visibleTimeDomain[1]) : allActualData,
    [allActualData, isZoomed, visibleTimeDomain],
  )
  const csPathData = useMemo(
    () => isZoomed ? sliceByTime(allCsPathData, visibleTimeDomain[0], visibleTimeDomain[1]) : allCsPathData,
    [allCsPathData, isZoomed, visibleTimeDomain],
  )
  const csCenterData = useMemo(
    () => isZoomed ? sliceByTime(allCsCenterData, visibleTimeDomain[0], visibleTimeDomain[1]) : allCsCenterData,
    [allCsCenterData, isZoomed, visibleTimeDomain],
  )

  // EL domain from ALL series — stable across visibility toggles
  const elevationDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1]
    let min = Infinity, max = -Infinity
    for (const r of data) {
      for (const v of [r.cur_el, r.target_el, r.cs_target_el, r.cs_center_el]) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    const range = max - min
    const pad = Math.max(range * 0.12, 0.25)
    return [min - pad, max + pad]
  }, [data])

  const [fullElMin, fullElMax] = elevationDomain
  const prevZoomSizeRef = useRef<number | null>(null)
  const cachedElDomainRef = useRef<[number, number] | null>(null)
  const prevVisibleLinesRef = useRef<string>('')
  // Tracks the midpoint of the last displayed Y window so zoom level changes re-centre
  // on the user's current view rather than jumping back to the satellite path centre.
  // Null when unzoomed → first zoom falls back to the satellite-path data scan.
  const currentYCenterRef = useRef<number | null>(null)
  // Tooltip hover state tracked in refs so onClick can check without a re-render
  const tooltipActiveRef = useRef(false)
  const tooltipIdxRef = useRef<number | null>(null)

  const zoomedElevationDomain = useMemo<[number, number]>(() => {
    const curSize = zoomAzDomain[1] - zoomAzDomain[0]
    const visibleKey = Array.from(visibleLines).sort().join(',')

    if (!isZoomed) {
      prevZoomSizeRef.current = null
      cachedElDomainRef.current = null
      prevVisibleLinesRef.current = ''
      return [fullElMin, fullElMax]
    }

    // Same zoom level and same visible lines → panning only, keep Y window unchanged
    if (
      cachedElDomainRef.current !== null &&
      prevZoomSizeRef.current !== null &&
      Math.abs(prevZoomSizeRef.current - curSize) < 1e-9 &&
      prevVisibleLinesRef.current === visibleKey
    ) {
      return cachedElDomainRef.current
    }

    if (data.length === 0) {
      prevZoomSizeRef.current = curSize
      prevVisibleLinesRef.current = visibleKey
      cachedElDomainRef.current = [fullElMin, fullElMax]
      return [fullElMin, fullElMax]
    }

    // Scale Y proportionally to the X zoom ratio so the Y range at maximum zoom-in
    // is always 0.5° regardless of how wide the full AZ domain is.
    const fullAzRange = Math.max(azDomain[1] - azDomain[0], 1e-6)
    const xZoomRatio = curSize / fullAzRange
    const half = Math.max(0.125, (fullElMax - fullElMin) / 2 * xZoomRatio)

    // Preserve the current Y center when zoom level or visible lines change so the
    // user's view doesn't jump. Only scan satellite-path data on the very first zoom
    // (currentYCenterRef.current === null, i.e. just left the unzoomed state).
    let center: number
    if (currentYCenterRef.current !== null) {
      center = currentYCenterRef.current
    } else {
      const [tMin, tMax] = visibleTimeDomain
      let satMin = Infinity, satMax = -Infinity
      for (const row of data) {
        if (row.flightTimeMs >= tMin && row.flightTimeMs <= tMax) {
          if (row.target_el < satMin) satMin = row.target_el
          if (row.target_el > satMax) satMax = row.target_el
        }
      }
      center = isFinite(satMin) ? (satMin + satMax) / 2 : (fullElMin + fullElMax) / 2
    }

    const result: [number, number] = [center - half, center + half]

    prevZoomSizeRef.current = curSize
    prevVisibleLinesRef.current = visibleKey
    cachedElDomainRef.current = result
    return result
  }, [data, isZoomed, visibleTimeDomain, zoomAzDomain, azDomain, fullElMin, fullElMax, visibleLines])

  const [zoomedElMin, zoomedElMax] = zoomedElevationDomain
  const [yPanStart, setYPanStart] = useState<number | null>(null)
  useEffect(() => { setYPanStart(null) }, [zoomedElMin, zoomedElMax])

  const yDomain = useMemo<[number, number]>(() => {
    if (yPanStart === null) return [zoomedElMin, zoomedElMax]
    const range = zoomedElMax - zoomedElMin
    const clamped = Math.max(fullElMin, Math.min(fullElMax - range, yPanStart))
    return [clamped, clamped + range] as [number, number]
  }, [yPanStart, zoomedElMin, zoomedElMax, fullElMin, fullElMax])

  // Keep currentYCenterRef in sync with whatever Y window is actually displayed
  // (includes any Y pan offset). Null when unzoomed so the next zoom starts fresh.
  currentYCenterRef.current = isZoomed ? (yDomain[0] + yDomain[1]) / 2 : null

  const panY = useCallback((newMin: number) => { setYPanStart(newMin) }, [])

  // Always-fresh domain refs for drag-to-pan (read at mousedown, not at effect-setup time)
  const dragXDomainRef = useRef<[number, number]>(zoomAzDomain)
  dragXDomainRef.current = zoomAzDomain
  const dragYDomainRef = useRef<[number, number]>(yDomain)
  dragYDomainRef.current = yDomain
  const { isDragging } = useDragPan(
    containerRef, pathPlotBounds, isZoomed && !compactExport,
    dragXDomainRef, dragYDomainRef, pan, panY,
  )

  const currentActualPoint = useMemo(
    () => (data[currentIndex] ? [{ az: data[currentIndex].cur_az, el: data[currentIndex].cur_el }] : []),
    [data, currentIndex],
  )
  const chartMargin = compactExport
    ? { top: 2, right: 44, bottom: 22, left: 28 }
    : { top: 4, right: 16, bottom: 28, left: 32 }

  return (
    <div className={`relative bg-white rounded-lg shadow-sm ${compactExport ? 'p-1 pdf-path-chart' : 'p-3 flex flex-col flex-1 min-h-0'}`}>
      <h2 className={`font-semibold text-gray-600 text-center ${compactExport ? 'text-[10px] mb-1' : 'text-xs mb-2'}`}>
        Tracking Path (AZ / EL)
      </h2>

      {/* Line selection toggle row */}
      {!compactExport && (
        <div className="flex flex-wrap gap-1 mb-2">
          {LINE_DEFS.map((def) => {
            const on = visibleLines.has(def.key)
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => toggleLine(def.key)}
                className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  on
                    ? 'border-gray-300 bg-white text-gray-700 shadow-sm'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                }`}
              >
                <svg width="16" height="6" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <line
                    x1="0" y1="3" x2="16" y2="3"
                    stroke={on ? def.color : '#d1d5db'}
                    strokeWidth="2"
                    strokeDasharray={def.dashArray}
                    strokeLinecap="round"
                  />
                </svg>
                {def.label}
              </button>
            )
          })}
        </div>
      )}

      <div
        ref={compactExport ? undefined : containerRef}
        className={compactExport ? undefined : 'flex-1 min-h-0 relative'}
        style={!compactExport ? { cursor: isDragging ? 'grabbing' : 'grab' } : undefined}
      >
      <ResponsiveContainer width="100%" height={compactExport ? height : '100%'} className={compactExport ? 'pdf-recharts-fill' : undefined}>
        <ScatterChart
          margin={chartMargin}
          onClick={!compactExport && onIndexClick ? () => {
            if (tooltipActiveRef.current && tooltipIdxRef.current != null) {
              onIndexClick(tooltipIdxRef.current)
            }
          } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
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
            width={60}
            dataKey="el"
            type="number"
            name="Elevation"
            domain={isZoomed && !compactExport ? yDomain : elevationDomain}
            allowDataOverflow={isZoomed && !compactExport}
            padding={compactExport ? { top: 8, bottom: 8 } : undefined}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fontSize: 13 }}
            label={{ value: 'Elevation (deg)', angle: 0, position: 'insideTopLeft', fontSize: 12, dy: 20, dx: 4 }}
          />
          <Tooltip
            cursor={{ stroke: '#9ca3af', strokeDasharray: '4 3' }}
            content={(props: any) => {
              tooltipActiveRef.current = !!(props.active && props.payload?.length > 0)
              tooltipIdxRef.current = props.active && props.payload?.[0]
                ? ((props.payload[0].payload as { idx?: number }).idx ?? null)
                : null
              return <PathZoomTooltip {...props} data={data} visibleLines={visibleLines} />
            }}
          />
          {!compactExport && (
            <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 13 }} />
          )}
          {(compactExport || visibleLines.has('actual')) && (
            <Scatter
              name="Antenna Pointing"
              data={actualData}
              fill="#3b82f6"
              line={{ stroke: '#3b82f6', strokeWidth: 1.2 }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
          )}
          {!compactExport && visibleLines.has('cs_path') && (
            <Scatter
              name="Satellite Look Angle"
              data={csPathData}
              fill="#8b5cf6"
              line={{ stroke: '#8b5cf6', strokeWidth: 1.2, strokeDasharray: '6 4' }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
          )}
          {!compactExport && visibleLines.has('cs_center') && (
            <Scatter
              name="Conical Scan Center"
              data={csCenterData}
              fill="#10b981"
              line={{ stroke: '#10b981', strokeWidth: 1.2, strokeDasharray: '4 4' }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
          )}
          <Scatter
            name="Current Position"
            data={currentActualPoint}
            fill="#ef4444"
            shape="circle"
            line={false}
            isAnimationActive={false}
          />
          {showDelta && !compactExport && (
            <Customized component={(props: any) => {
              const xAxis = props.xAxisMap && (Object.values(props.xAxisMap)[0] as any)
              const yAxis = props.yAxisMap && (Object.values(props.yAxisMap)[0] as any)
              const offset = props.offset
              if (!xAxis?.scale || !yAxis?.scale || !offset) return null
              const row = data[currentIndex]
              if (!row) return null
              const x1 = xAxis.scale(row.cs_target_az)
              const y1 = yAxis.scale(row.cs_target_el)
              const x2 = xAxis.scale(row.cur_az)
              const y2 = yAxis.scale(row.cur_el)
              const dx = x2 - x1, dy = y2 - y1
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist < 4) return null
              // Shorten the shaft so the stroke doesn't show through the arrowhead body
              const ARROW = 16
              const ux = dx / dist, uy = dy / dist
              const sx2 = x2 - ux * ARROW, sy2 = y2 - uy * ARROW
              const clipId = `${deltaMarkerId}-clip`
              return (
                <g>
                  <defs>
                    <clipPath id={clipId}>
                      <rect x={offset.left} y={offset.top} width={offset.width} height={offset.height} />
                    </clipPath>
                    <marker
                      id={deltaMarkerId}
                      viewBox="0 0 16 12"
                      refX="16" refY="6"
                      markerUnits="userSpaceOnUse"
                      markerWidth="16" markerHeight="12"
                      orient="auto"
                    >
                      <polygon points="0 0, 16 6, 0 12" fill="#ef4444" />
                    </marker>
                  </defs>
                  <g clipPath={`url(#${clipId})`}>
                    <line x1={x1} y1={y1} x2={sx2} y2={sy2} stroke="#ef4444" strokeWidth={2} />
                    <line x1={sx2} y1={sy2} x2={x2} y2={y2} stroke="#ef4444" strokeWidth={2} markerEnd={`url(#${deltaMarkerId})`} />
                  </g>
                </g>
              )
            }} />
          )}
        </ScatterChart>
      </ResponsiveContainer>
      {!compactExport && isZoomed && (
        <div className="absolute inset-y-0 right-0 w-[10px]">
          <VerticalScrollbar
            fullDomain={elevationDomain}
            visibleDomain={yDomain}
            onPan={panY}
            topPad={24}
            bottomPad={28}
          />
        </div>
      )}
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
      {!compactExport && (
        <div className="absolute top-1.5 right-2 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowDots(v => !v)}
            className={`h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
          >
            {showDots ? 'Hide dots' : 'Show dots'}
          </button>
          <button
            type="button"
            onClick={() => setShowDelta(v => {
              if (!v) {
                // Ensure Satellite Look Angle line is visible so the arrow start is shown
                setVisibleLines(prev => {
                  if (prev.has('cs_path')) return prev
                  const next = new Set(prev)
                  next.add('cs_path')
                  return next
                })
              }
              return !v
            })}
            className={`h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDelta ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
          >
            {showDelta ? 'Hide delta' : 'Show tracking delta'}
          </button>
        </div>
      )}
    </div>
  )
}

const TrackingPathChart = memo(TrackingPathChartInner)
export default TrackingPathChart
