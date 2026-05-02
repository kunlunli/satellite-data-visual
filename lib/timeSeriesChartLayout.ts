import type { SatelliteDataRow } from '@/lib/types'

/** Shared margins so dashboard time-series charts align their X (time) scale in screen space. */
export const SYNCED_TIME_CHART_MARGIN = {
  top: 36,
  right: 56,
  bottom: 28,
  left: 20,
} as const

/**
 * Fixed Y-axis band width (both sides). Wide enough for Azimuth integers and PAE decimals
 * so Recharts does not shrink/grow the cartesian area differently per chart.
 */
export const SYNCED_LEFT_Y_AXIS_WIDTH = 72

/** Right axis (Az / El elevation) + same width reserved on single-axis charts via SyncPadRightYAxis. */
export const SYNCED_RIGHT_Y_AXIS_WIDTH = 72

/**
 * Pixel insets from each edge of the ResponsiveContainer to the actual plot area.
 * Used by useChartZoom to restrict wheel-zoom to the inner data area only.
 */
export const SYNCED_CHART_PLOT_BOUNDS = {
  left:   SYNCED_TIME_CHART_MARGIN.left  + SYNCED_LEFT_Y_AXIS_WIDTH,  // 20 + 72 = 92
  right:  SYNCED_TIME_CHART_MARGIN.right + SYNCED_RIGHT_Y_AXIS_WIDTH, // 56 + 72 = 128
  top:    SYNCED_TIME_CHART_MARGIN.top,    // 36
  bottom: SYNCED_TIME_CHART_MARGIN.bottom, // 28
} as const

/**
 * Binary-search slice of a time-sorted array to the visible window [start, end].
 * O(log n) boundary search + O(k) slice — much faster than a linear filter on pan.
 * Includes a 10% buffer on each side so lines connect at the viewport edges.
 */
export function sliceByTime<T extends { t: number }>(
  sorted: T[],
  start: number,
  end: number,
): T[] {
  if (sorted.length === 0) return sorted
  const buf = (end - start) * 0.1
  const lo = start - buf
  const hi = end + buf

  let left = 0
  let right = sorted.length
  while (left < right) {
    const mid = (left + right) >> 1
    if (sorted[mid].t < lo) left = mid + 1
    else right = mid
  }
  const from = Math.max(0, left - 1)

  let endIdx = from
  while (endIdx < sorted.length && sorted[endIdx].t <= hi) endIdx++

  return sorted.slice(from, endIdx + 1)
}

export function getFlightTimeDomain(data: SatelliteDataRow[]): [number, number] {
  if (data.length === 0) return [0, 1]
  return [data[0].flightTimeMs, data[data.length - 1].flightTimeMs]
}
