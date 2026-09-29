import * as XLSX from 'xlsx'
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

const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm']

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return EXCEL_EXTENSIONS.some((ext) => name.endsWith(ext))
}

// Splits a single CSV line into fields, honoring double-quoted fields that
// may themselves contain commas (e.g. "1,234").
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

async function readRows(file: File): Promise<(string | number)[][]> {
  if (isExcelFile(file)) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return []
    return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    })
  }

  const text = await file.text()
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => splitCsvLine(line))
}

// Some log exports (e.g. "ActualValuesLogFile*.csv") use a wall-clock
// "MM:SS.s" (or "HH:MM:SS.s") timestamp instead of raw epoch microseconds,
// and omit the trailing tx_enable column entirely. Returns total seconds
// within the clock's own cycle, or null if the string isn't a clock value.
function parseClockSeconds(raw: string): number | null {
  const parts = raw.split(':')
  if (parts.length === 2) {
    const m = Number(parts[0])
    const s = Number(parts[1])
    if (isNaN(m) || isNaN(s)) return null
    return m * 60 + s
  }
  if (parts.length === 3) {
    const h = Number(parts[0])
    const m = Number(parts[1])
    const s = Number(parts[2])
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null
    return h * 3600 + m * 60 + s
  }
  return null
}

// Minimum columns without the optional trailing tx_enable field.
const MIN_COLUMNS = 14

export async function parseLogFile(file: File): Promise<SatelliteDataRow[]> {
  const allRows = await readRows(file)

  const rows: SatelliteDataRow[] = []

  // Tracks wraparound of clock-format timestamps (e.g. minutes rolling
  // over from 59 back to 00 across a multi-hour log).
  let clockOffsetSeconds = 0
  let prevClockSeconds: number | null = null

  for (const cols of allRows) {
    if (!cols || cols.length < MIN_COLUMNS) continue

    const rawTimestamp = String(cols[0]).trim()
    let timestamp: number

    if (rawTimestamp.includes(':')) {
      const clockSeconds = parseClockSeconds(rawTimestamp)
      if (clockSeconds === null) continue // skip any header line
      if (prevClockSeconds !== null && clockSeconds < prevClockSeconds - 5) {
        clockOffsetSeconds += 3600 // clock wrapped around (e.g. 59:59 -> 00:00)
      }
      prevClockSeconds = clockSeconds
      timestamp = (clockOffsetSeconds + clockSeconds) * 1_000_000 // convert to microseconds
    } else {
      const parsed = Number(rawTimestamp)
      if (isNaN(parsed)) continue // skip any header line
      timestamp = parsed
    }

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
      tx_enable:    cols.length > 14 ? String(cols[14]).trim().toLowerCase() === 'true' : false,
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
