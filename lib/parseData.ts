import type { SatelliteDataRow } from './types'

// Columns (0-indexed, comma-separated, no header):
//  0  timestamp            – microseconds since epoch
//  1  cur_joint_Y          – current Y-axis motor angle (deg)
//  2  cur_joint_X          – current X-axis motor angle (deg)
//  3  cur_az               – current azimuth (deg)
//  4  cur_el               – current elevation (deg)
//  5  target_az            – target azimuth (deg)
//  6  target_el            – target elevation (deg)
//  7  pae_joint_Y          – pointing accuracy error Y (deg)
//  8  pae_joint_X          – pointing accuracy error X (deg)
//  9  cs_center_az         – conical scan central azimuth (deg)
// 10  cs_center_el         – conical scan central elevation (deg)
// 11  cs_target_az         – conical scan target azimuth (deg)
// 12  cs_target_el         – conical scan target elevation (deg)
// 13  rssi                 – received signal strength indicator
// 14  tx_enable            – transmit enabled (true/false)

export async function parseLogFile(file: File): Promise<SatelliteDataRow[]> {
  const text = await file.text()
  const lines = text.split(/\r?\n/)

  const rows: SatelliteDataRow[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const cols = line.split(',')
    if (cols.length < 15) continue

    const timestamp = Number(cols[0])
    if (isNaN(timestamp)) continue // skip any header line

    rows.push({
      timestamp,
      cur_joint_Y:  Number(cols[1]),
      cur_joint_X:  Number(cols[2]),
      cur_az:       Number(cols[3]),
      cur_el:       Number(cols[4]),
      target_az:    Number(cols[5]),
      target_el:    Number(cols[6]),
      pae_joint_Y:  Number(cols[7]),
      pae_joint_X:  Number(cols[8]),
      cs_center_az: Number(cols[9]),
      cs_center_el: Number(cols[10]),
      cs_target_az: Number(cols[11]),
      cs_target_el: Number(cols[12]),
      rssi:         Number(cols[13]),
      tx_enable:    cols[14].trim().toLowerCase() === 'true',
      flightTimeMs: 0,
    })
  }

  if (rows.length === 0) throw new Error('No valid data rows found')

  const t0 = rows[0].timestamp
  for (const row of rows) {
    // timestamps are microseconds → convert difference to milliseconds
    row.flightTimeMs = (row.timestamp - t0) / 1000
  }

  return rows
}

export function formatFlightTime(ms: number): string {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const totalSec = Math.floor(abs / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const cs = Math.floor((abs % 1000) / 10)
  return `${sign}${m}m:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}s`
}
