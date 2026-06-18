'use client'

import { memo, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { SatelliteDataRow } from '@/lib/types'
import { getDynamicSample, sliceByTime, azWindowToTimeDomain } from '@/lib/timeSeriesChartLayout'
import { useChartZoom, type PlotBounds } from '@/lib/useChartZoom'
import { useDragPan } from '@/lib/useDragPan'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'
import { VerticalScrollbar } from '@/components/VerticalScrollbar'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
  height?: number
}

// Azimuth is non-monotonic for the conical scan series — never filter by azimuth value
// or it breaks the connecting line. Recharts' SVG clipPath handles visual clipping.
const NO_SHAPE = () => <></>
const DOT_SHAPE = (props: unknown) => {
  const { cx, cy, fill } = props as { cx?: number; cy?: number; fill?: string }
  if (cx == null || cy == null) return <></>
  return <circle cx={cx} cy={cy} r={3.5} fill={fill ?? 'currentColor'} />
}

function ConicalScanChartInner({ data, currentIndex, height = 300 }: Props) {
  const [showDots, setShowDots] = useState(false)

  const azDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 360]
    let min = Infinity, max = -Infinity
    for (const r of data) {
      for (const v of [r.cs_target_az, r.cs_center_az, r.target_az]) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    const range = max - min
    const pad = Math.max(range * 0.05, 1)
    return [min - pad, max + pad]
  }, [data])

  const elevationDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1]
    let min = Infinity, max = -Infinity
    for (const r of data) {
      for (const v of [r.cs_target_el, r.cs_center_el, r.target_el]) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    const range = max - min
    const pad = Math.max(range * 0.12, 0.25)
    return [min - pad, max + pad]
  }, [data])

  const plotBounds: PlotBounds = { left: 32 + 60, right: 16, top: 4, bottom: 28 }
  const { domain: zoomAzDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(azDomain, plotBounds, 0.5)

  const [azMin, azMax] = zoomAzDomain
  const sample = useMemo(() => getDynamicSample(zoomAzDomain, azDomain), [zoomAzDomain, azDomain])

  const allCsPathData = useMemo(() => {
    const out: { az: number; el: number; t: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].cs_target_az, el: data[i].cs_target_el, t: data[i].flightTimeMs })
    return out
  }, [data, sample])

  const allCsCenterData = useMemo(() => {
    const out: { az: number; el: number; t: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].cs_center_az, el: data[i].cs_center_el, t: data[i].flightTimeMs })
    return out
  }, [data, sample])

  const allSatPathData = useMemo(() => {
    const out: { az: number; el: number; t: number }[] = []
    for (let i = 0; i < data.length; i += sample)
      out.push({ az: data[i].target_az, el: data[i].target_el, t: data[i].flightTimeMs })
    return out
  }, [data, sample])

  // target_az is monotonic with time → binary-search allSatPathData (sorted by az) to find
  // the time range for the visible azimuth window. O(log n) vs the prior O(n) linear scan.
  const visibleTimeDomain = useMemo<[number, number]>(() => {
    const fallback: [number, number] = [allSatPathData[0]?.t ?? 0, allSatPathData[allSatPathData.length - 1]?.t ?? 0]
    if (!isZoomed || allSatPathData.length === 0) return fallback
    const buf = (azMax - azMin) * 0.1
    return azWindowToTimeDomain(allSatPathData, azMin - buf, azMax + buf) ?? fallback
  }, [allSatPathData, isZoomed, azMin, azMax])

  const csPathData = useMemo(
    () => isZoomed ? sliceByTime(allCsPathData, visibleTimeDomain[0], visibleTimeDomain[1]) : allCsPathData,
    [allCsPathData, isZoomed, visibleTimeDomain],
  )
  const csCenterData = useMemo(
    () => isZoomed ? sliceByTime(allCsCenterData, visibleTimeDomain[0], visibleTimeDomain[1]) : allCsCenterData,
    [allCsCenterData, isZoomed, visibleTimeDomain],
  )
  const satPathData = useMemo(
    () => isZoomed ? sliceByTime(allSatPathData, visibleTimeDomain[0], visibleTimeDomain[1]) : allSatPathData,
    [allSatPathData, isZoomed, visibleTimeDomain],
  )

  const [fullElMin, fullElMax] = elevationDomain

  // Refs so zoomedElevationDomain only updates when zoom LEVEL changes, not on pan.
  const prevZoomSizeRef = useRef<number | null>(null)
  const cachedElDomainRef = useRef<[number, number] | null>(null)
  // Tracks the midpoint of the last displayed Y window (including any Y pan) so that
  // changing the zoom level re-centres on the user's current view rather than jumping
  // back to the satellite path centre. Null when not zoomed → first zoom falls back to
  // the satellite-path data scan.
  const currentYCenterRef = useRef<number | null>(null)

  // Tight Y window: show only the top series in the visible X range.
  // Uses visibleTimeDomain (from monotonic target_az) instead of azimuth-value filtering
  // so non-monotonic cs_target_az/cs_center_az don't inflate the elevation range.
  const zoomedElevationDomain = useMemo<[number, number]>(() => {
    const curSize = zoomAzDomain[1] - zoomAzDomain[0]

    if (!isZoomed) {
      prevZoomSizeRef.current = null
      cachedElDomainRef.current = null
      return [fullElMin, fullElMax]
    }

    // Same zoom level → panning only; keep Y window unchanged
    if (
      cachedElDomainRef.current !== null &&
      prevZoomSizeRef.current !== null &&
      Math.abs(prevZoomSizeRef.current - curSize) < 1e-9
    ) {
      return cachedElDomainRef.current
    }

    if (data.length === 0) {
      prevZoomSizeRef.current = curSize
      cachedElDomainRef.current = [fullElMin, fullElMax]
      return [fullElMin, fullElMax]
    }

    const half = Math.max(curSize / 2, 0.25)  // Y window = X window, min 0.5°

    // When the zoom level changes, reuse the midpoint of the current Y window so the
    // user's view doesn't jump. Only scan satellite-path data on the very first zoom
    // (currentYCenterRef.current === null, i.e. just left the unzoomed state).
    let center: number
    if (currentYCenterRef.current !== null) {
      center = currentYCenterRef.current
    } else {
      const [tMin, tMax] = visibleTimeDomain
      let s3Min = Infinity, s3Max = -Infinity
      for (const row of data) {
        if (row.flightTimeMs >= tMin && row.flightTimeMs <= tMax) {
          if (row.target_el < s3Min) s3Min = row.target_el
          if (row.target_el > s3Max) s3Max = row.target_el
        }
      }
      center = isFinite(s3Min) && isFinite(s3Max)
        ? (s3Min + s3Max) / 2
        : (fullElMin + fullElMax) / 2
    }

    const result: [number, number] = [center - half, center + half]

    prevZoomSizeRef.current = curSize
    cachedElDomainRef.current = result
    return result
  }, [data, isZoomed, visibleTimeDomain, zoomAzDomain, fullElMin, fullElMax])

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

  const dragXDomainRef = useRef<[number, number]>(zoomAzDomain)
  dragXDomainRef.current = zoomAzDomain
  const dragYDomainRef = useRef<[number, number]>(yDomain)
  dragYDomainRef.current = yDomain
  const { isDragging } = useDragPan(
    containerRef, plotBounds, isZoomed,
    dragXDomainRef, dragYDomainRef, pan, panY,
  )

  return (
    <div className="relative bg-white rounded-lg shadow-sm p-3 flex flex-col">
      <h2 className="font-semibold text-gray-600 text-center text-xs mb-2">
        Conical Scan Path vs Target
      </h2>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 4, right: 16, bottom: 28, left: 32 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
            <XAxis
              dataKey="az"
              type="number"
              name="Azimuth"
              domain={zoomAzDomain}
              allowDataOverflow
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fontSize: 13 }}
              label={{ value: 'Azimuth (deg)', position: 'insideBottom', offset: -14, fontSize: 14 }}
            />
            <YAxis
              width={60}
              dataKey="el"
              type="number"
              name="Elevation"
              domain={isZoomed ? yDomain : elevationDomain}
              allowDataOverflow={isZoomed}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fontSize: 13 }}
              label={{ value: 'Elevation (deg)', angle: 0, position: 'insideTopLeft', fontSize: 12, dy: 20, dx: 4 }}
            />
            <Tooltip cursor={{ stroke: '#9ca3af', strokeDasharray: '4 3' }} />
            <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 13 }} />
            <Scatter
              name="Conical Scan Path"
              data={csPathData}
              fill="#8b5cf6"
              line={{ stroke: '#8b5cf6', strokeWidth: 1.2, strokeDasharray: '6 4' }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
            <Scatter
              name="Conical Scan Centered Path"
              data={csCenterData}
              fill="#10b981"
              line={{ stroke: '#10b981', strokeWidth: 1.2, strokeDasharray: '4 4' }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
            <Scatter
              name="Satellite Path"
              data={satPathData}
              fill="#f97316"
              line={{ stroke: '#f97316', strokeWidth: 1.4 }}
              lineJointType="linear"
              shape={showDots ? DOT_SHAPE : NO_SHAPE}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
        {isZoomed && (
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
      {isZoomed && (
        <ZoomScrollbar
          fullDomain={azDomain}
          visibleDomain={zoomAzDomain}
          onPan={pan}
          leftPad={plotBounds.left}
          rightPad={plotBounds.right}
        />
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
      <button
        type="button"
        onClick={() => setShowDots(v => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
    </div>
  )
}

const ConicalScanChart = memo(ConicalScanChartInner)
export default ConicalScanChart
