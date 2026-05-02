/** HH:MM:SS in the given IANA timezone — used for axis tick labels. */
export function formatWallClock(flightTimeMs: number, t0Us: number, timezone: string): string {
  const wallMs = t0Us / 1000 + flightTimeMs
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(wallMs))
}

/** YYYY-MM-DD HH:MM:SS — used for tooltip labels. */
export function formatWallClockFull(flightTimeMs: number, t0Us: number, timezone: string): string {
  const wallMs = t0Us / 1000 + flightTimeMs
  const d = new Date(wallMs)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const p: Record<string, string> = {}
  for (const { type, value } of parts) p[type] = value
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}
