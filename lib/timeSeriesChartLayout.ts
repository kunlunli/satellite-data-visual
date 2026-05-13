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

/**
 * Generates tick values spaced `interval` apart across [lo, hi], always
 * including lo and hi so the axis has labels even when the range is shorter
 * than one interval.  Start/end are omitted only when they would fall within
 * 15 % of the interval from an existing interval-aligned tick (to prevent
 * label collision).
 * Works for both flightTimeMs (interval in ms) and Unix-seconds (interval in s).
 */
export function makeTimeTicks(lo: number, hi: number, interval: number): number[] {
  if (hi <= lo) return [lo, hi]
  if (interval <= 0) return [lo, hi]

  const first = Math.ceil(lo / interval) * interval
  const intervalTicks: number[] = []
  for (let t = first; t <= hi; t += interval) intervalTicks.push(t)

  // No interval ticks fit — just show start and end.
  if (intervalTicks.length === 0) return [lo, hi]

  const minGap = interval * 0.15
  const result: number[] = []

  if (intervalTicks[0] - lo > minGap) result.push(lo)
  result.push(...intervalTicks)
  if (hi - intervalTicks[intervalTicks.length - 1] > minGap) result.push(hi)

  return result
}

/** Convert raw RSSI sensor value to dBm. */
export function rssiToDbm(raw: number): number {
  return raw / 42 - 88.81
}

/**
 * Generates raw-RSSI tick values every 2 dBm.
 * Ticks are placed at round dBm boundaries and converted back to raw so
 * the axis (stored in raw units) labels display as round dBm numbers.
 */
export function makeRssiTicks(minRaw: number, maxRaw: number): number[] {
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return []
  const minDbm = rssiToDbm(minRaw)
  const maxDbm = rssiToDbm(maxRaw)
  const interval = 2 // 2 dBm
  const firstDbm = Math.floor(minDbm / interval) * interval
  const lastDbm = Math.ceil(maxDbm / interval) * interval
  const ticks: number[] = []
  for (let dbm = firstDbm; dbm <= lastDbm; dbm += interval) {
    ticks.push((dbm + 88.81) * 42)
  }
  return ticks
}
