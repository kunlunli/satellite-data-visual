'use client'

import { YAxis } from 'recharts'
import { SYNCED_RIGHT_Y_AXIS_WIDTH } from '@/lib/timeSeriesChartLayout'

/**
 * Invisible axis matching the Az/El right Y width so LineCharts with only one
 * data axis get the same inner plot width and X pixel scale as dual-axis charts.
 */
export function SyncPadRightYAxis() {
  return (
    <YAxis
      yAxisId="syncPad"
      orientation="right"
      width={SYNCED_RIGHT_Y_AXIS_WIDTH}
      tick={false}
      axisLine={false}
      tickLine={false}
      domain={[0, 1]}
    />
  )
}
