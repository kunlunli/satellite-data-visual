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
 *
 * Scroll-wheel zoom is anchored at the cursor position (the data value under the
 * cursor stays pinned). Button zoom (+/−) is anchored at the visible center (frac=0.5).
 */
export function useChartZoom(fullDomain: [number, number], plotBounds?: PlotBounds, minAbsoluteRange?: number) {
  const [domain, setDomain] = useState<[number, number] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const d0 = fullDomain[0]
  const d1 = fullDomain[1]

  useEffect(() => {
    setDomain(null)
  }, [d0, d1])

  // centerFraction: 0 = left edge, 1 = right edge, 0.5 = center of current view.
  // The data value at that fraction of the current window is kept fixed after zoom.
  const applyZoom = useCallback(
    (factor: number, centerFraction = 0.5) => {
      setDomain((prev) => {
        const cur = prev ?? [d0, d1]
        const curRange = cur[1] - cur[0]
        const fullRange = d1 - d0
        const newRange = curRange * factor

        const minRange = minAbsoluteRange != null ? minAbsoluteRange : fullRange * MIN_RANGE_RATIO
        const clampedRange = factor < 1 ? Math.max(newRange, minRange) : newRange

        // Anchor: the domain value that sits under the cursor (or view center for buttons)
        const anchor = cur[0] + centerFraction * curRange

        // Place anchor at the same fraction of the new window
        let s = anchor - centerFraction * clampedRange
        let e = anchor + (1 - centerFraction) * clampedRange

        // Shift window to stay within bounds before hard-clamping
        if (s < d0) { e = Math.min(d1, e + (d0 - s)); s = d0 }
        if (e > d1) { s = Math.max(d0, s - (e - d1)); e = d1 }

        if (s <= d0 && e >= d1) return null
        return [s, e] as [number, number]
      })
    },
    [d0, d1, minAbsoluteRange],
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
      const rect = el.getBoundingClientRect()
      const relX = e.clientX - rect.left
      const relY = e.clientY - rect.top

      // If plot bounds are specified, only zoom when the cursor is inside the data area.
      // Hovering over axis/margin areas lets the event fall through for page scroll.
      if (plotBounds) {
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

      // Compute mouse position as a fraction (0–1) of the data plot area so the
      // data value under the cursor stays pinned while scrolling to zoom.
      let centerFraction = 0.5
      if (plotBounds) {
        const plotWidth = rect.width - plotBounds.left - plotBounds.right
        if (plotWidth > 0) {
          centerFraction = Math.max(0, Math.min(1, (relX - plotBounds.left) / plotWidth))
        }
      }

      const capturedFraction = centerFraction
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        applyZoom(isZoomIn ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR, capturedFraction)
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
  }, [applyZoom, plotBounds])

  return {
    domain: (domain ?? [d0, d1]) as [number, number],
    zoomIn,
    zoomOut,
    pan,
    containerRef,
    isZoomed: domain !== null,
  }
}
