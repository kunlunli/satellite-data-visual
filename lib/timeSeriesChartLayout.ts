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

export function getFlightTimeDomain(data: SatelliteDataRow[]): [number, number] {
  if (data.length === 0) return [0, 1]
  return [data[0].flightTimeMs, data[data.length - 1].flightTimeMs]
}
