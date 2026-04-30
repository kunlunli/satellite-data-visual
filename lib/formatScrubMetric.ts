/** Same rules as the floating timeline readouts. */
export function formatScrubMetric(n: number | undefined, decimals: number, suffix = '') {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(decimals)}${suffix}`
}
