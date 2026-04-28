'use client'

import type { SatelliteDataRow } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'

interface Props {
  data: SatelliteDataRow[]
  currentIndex: number
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-mono font-semibold ${color ?? 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

export default function StatsPanel({ data, currentIndex }: Props) {
  const r = data[currentIndex]
  if (!r) return null

  const pae = Math.sqrt(r.pae_joint_X ** 2 + r.pae_joint_Y ** 2)

  return (
    <div className="bg-white rounded-lg p-3 shadow-sm text-sm">
      <div className="border-b border-gray-100 pb-2 mb-2">
        <StatRow label="Drone timestamp" value={r.timestamp.toString()} />
        <StatRow label="Flight time" value={formatFlightTime(r.flightTimeMs)} />
      </div>
      <div className="border-b border-gray-100 pb-2 mb-2">
        <StatRow label="Joint X angle" value={`${r.cur_joint_X.toFixed(3)}°`} color="text-orange-600" />
        <StatRow label="Joint Y angle" value={`${r.cur_joint_Y.toFixed(3)}°`} color="text-blue-600" />
      </div>
      <div className="border-b border-gray-100 pb-2 mb-2">
        <StatRow label="Flight AZ" value={`${r.target_az.toFixed(3)}°`} color="text-orange-500" />
        <StatRow label="Flight EL" value={`${r.target_el.toFixed(3)}°`} color="text-orange-500" />
        <StatRow label="KAA AZ" value={`${r.cur_az.toFixed(3)}°`} color="text-blue-500" />
        <StatRow label="KAA EL" value={`${r.cur_el.toFixed(3)}°`} color="text-blue-500" />
      </div>
      <div>
        <StatRow label="PAE" value={`${pae.toFixed(4)}°`} color="text-red-500" />
        <StatRow label="RSSI" value={r.rssi.toFixed(1)} color="text-purple-600" />
      </div>
    </div>
  )
}
