import { useState, useCallback, useEffect, useRef } from 'react'

const ZOOM_IN_FACTOR = 0.5
const ZOOM_OUT_FACTOR = 2.0
const MIN_RANGE_RATIO = 0.005

export interface PlotBounds {
  /** Pixels from left edge of the container to the left edge of the data plot area. */
  left: number
  /** Pixels from right edge of the container to the right edge of the data plot area. */
  right: number
  top: number
  bottom: number
}

/**
 * Provides X-axis zoom state for a Recharts chart.
 * Attach `containerRef` to the div wrapping ResponsiveContainer.
 *
 * Pass `plotBounds` to restrict zoom to the inner plot area — wheel events that land
 * in the axis/margin areas fall through to normal page scroll instead.
 */
export function useChartZoom(fullDomain: [number, number], plotBounds?: PlotBounds) {
  const [domain, setDomain] = useState<[number, number] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const d0 = fullDomain[0]
  const d1 = fullDomain[1]

  useEffect(() => {
    setDomain(null)
  }, [d0, d1])

  const applyZoom = useCallback(
    (factor: number) => {
      setDomain((prev) => {
        const cur = prev ?? [d0, d1]
        const center = (cur[0] + cur[1]) / 2
        const fullRange = d1 - d0
        const newRange = (cur[1] - cur[0]) * factor

        if (factor < 1 && newRange < fullRange * MIN_RANGE_RATIO) return prev

        const half = newRange / 2
        const s = Math.max(d0, center - half)
        const e = Math.min(d1, center + half)

        if (s <= d0 && e >= d1) return null
        return [s, e] as [number, number]
      })
    },
    [d0, d1],
  )

  const zoomIn = useCallback(() => applyZoom(ZOOM_IN_FACTOR), [applyZoom])
  const zoomOut = useCallback(() => applyZoom(ZOOM_OUT_FACTOR), [applyZoom])

  const pan = useCallback(
    (newStart: number) => {
      setDomain((prev) => {
        if (prev === null) return null
        const range = prev[1] - prev[0]
        const clamped = Math.max(d0, Math.min(d1 - range, newStart))
        return [clamped, clamped + range] as [number, number]
      })
    },
    [d0, d1],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      // If plot bounds are specified, only zoom when the cursor is inside the data area.
      // Hovering over axis/margin areas lets the event fall through for page scroll.
      if (plotBounds) {
        const rect = el.getBoundingClientRect()
        const relX = e.clientX - rect.left
        const relY = e.clientY - rect.top
        if (
          relX < plotBounds.left ||
          relX > rect.width - plotBounds.right ||
          relY < plotBounds.top ||
          relY > rect.height - plotBounds.bottom
        ) {
          return
        }
      }

      e.preventDefault()
      if (rafRef.current !== null) return
      const isZoomIn = e.deltaY < 0
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (isZoomIn) zoomIn()
        else zoomOut()
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => {
      el.removeEventListener('wheel', handler)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [zoomIn, zoomOut, plotBounds])

  return {
    domain: (domain ?? [d0, d1]) as [number, number],
    zoomIn,
    zoomOut,
    pan,
    containerRef,
    isZoomed: domain !== null,
  }
}
