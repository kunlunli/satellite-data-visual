'use client'

import { useState, useEffect, useRef } from 'react'
import type { PlotBounds } from './useChartZoom'

/**
 * Adds click-and-drag panning to a Recharts container element.
 *
 * The caller must keep xDomainRef and yDomainRef current by assigning on every render
 * (e.g. `xDomainRef.current = zoomAzDomain`). They are read at mousedown time so the
 * listener never holds stale domain values — without this the initial pan position would
 * be wrong after the first re-render caused by a previous pan call.
 *
 * During a drag, visual feedback is provided by applying a CSS translate to the chart's
 * data/grid SVG layers directly — bypassing React state and Recharts re-renders entirely.
 * Axis groups (<g class="recharts-cartesian-axis">) and <defs> are excluded so they remain
 * stationary.
 *
 * Every MID_DRAG_COMMIT_MS milliseconds the current drag position is committed to React
 * state so Recharts re-renders the newly revealed data at the edges. After the re-render
 * the CSS transforms are cleared and the drag origin is reset, so subsequent motion
 * continues smoothly from the newly committed domain with no visual snap or blank edges.
 *
 * The movable elements are collected once at mousedown and reused for every mousemove so
 * querySelectorAll is never called in the hot path.
 *
 * mousemove and mouseup are attached synchronously inside the mousedown handler (not in
 * a separate isDragging-gated effect). This eliminates the gap between mousedown and the
 * first mousemove event that occurred when React's re-render from setIsDragging(true) had
 * to complete before the effect could fire — at high zoom (sample=1) that re-render is
 * noticeably more expensive and caused a visible lurch at drag start.
 */

/**
 * How often (ms) to commit pan state to React during a drag so edge data fills in.
 * Longer = more smooth frames between commits, smaller snap at each commit.
 * Shorter = more frequent data refresh, but commit snaps happen more often.
 */
const MID_DRAG_COMMIT_MS = 300

export function useDragPan(
  containerRef: React.RefObject<HTMLDivElement | null>,
  plotBounds: PlotBounds,
  enabled: boolean,
  xDomainRef: React.MutableRefObject<[number, number]>,
  yDomainRef: React.MutableRefObject<[number, number]>,
  onPanX: (newMin: number) => void,
  onPanY: (newMin: number) => void,
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false)

  // Always-fresh refs — updated synchronously during render, read in event handlers
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const boundsRef = useRef(plotBounds)
  boundsRef.current = plotBounds
  const onPanXRef = useRef(onPanX)
  onPanXRef.current = onPanX
  const onPanYRef = useRef(onPanY)
  onPanYRef.current = onPanY

  // Drag state captured at mousedown
  const dragDataRef = useRef<{
    startX: number; startY: number
    xMin0: number; xRange: number
    yMin0: number; yRange: number
    plotW: number; plotH: number
    /** SVG child layers to translate — excludes <defs> and axis groups. Cached at mousedown. */
    movableEls: Element[]
  } | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  /** Timestamp of last mid-drag commit — reset at mousedown. */
  const lastCommitRef = useRef(0)

  /** Collect the SVG layers that should move during drag (everything except axes and defs). */
  function getMovableEls(container: HTMLDivElement): Element[] {
    const svg = container.querySelector('svg')
    if (!svg) return []
    return Array.from(svg.children).filter(
      (el) => el.tagName !== 'defs' && !el.classList.contains('recharts-cartesian-axis'),
    )
  }

  function clearTransforms(els: Element[]) {
    for (const el of els) (el as HTMLElement).style.transform = ''
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onDown = (e: MouseEvent) => {
      const b = boundsRef.current
      const rect = el.getBoundingClientRect()
      const relX = e.clientX - rect.left
      const relY = e.clientY - rect.top
      const plotW = rect.width - b.left - b.right
      const plotH = rect.height - b.top - b.bottom
      // Only react when pointer is inside the data plot area (not on axes/margins)
      if (relX < b.left || relX > b.left + plotW || relY < b.top || relY > b.top + plotH) return

      // Always show grabbing cursor on click, even when panning is disabled
      setIsDragging(true)

      // Attach move/up immediately so no mouse events are missed while React re-renders
      // from the setIsDragging(true) call above. At high zoom (sample=1) that re-render
      // is expensive; delaying listener attachment until after it caused a visible lurch.
      const onMove = (ev: MouseEvent) => {
        const d = dragDataRef.current
        if (!d) return
        const deltaX = ev.clientX - d.startX
        const deltaY = ev.clientY - d.startY

        // Translate only data/grid layers — axes stay fixed, no React re-render
        const t = `translate(${deltaX}px,${deltaY}px)`
        for (const movEl of d.movableEls) (movEl as HTMLElement).style.transform = t

        // Track the domain values that correspond to the current visual position
        pendingRef.current = {
          x: d.xMin0 - (deltaX / d.plotW) * d.xRange,
          y: d.yMin0 + (deltaY / d.plotH) * d.yRange,
        }

        // Periodically commit the current domain to React so Recharts re-renders and fills
        // in the newly revealed data at the edges of the visible window.
        const now = performance.now()
        if (now - lastCommitRef.current < MID_DRAG_COMMIT_MS) return
        lastCommitRef.current = now

        const p = pendingRef.current
        // Clear transforms and commit the domain without flushSync — React renders
        // asynchronously so this never blocks the input loop. There may be one frame
        // where old data shows at zero transform before React finishes, but at a
        // 300 ms interval the smooth CSS-transform phase dominates.
        clearTransforms(d.movableEls)
        onPanXRef.current(p.x)
        onPanYRef.current(p.y)

        // Re-anchor the drag origin at the current mouse position.
        // Future deltas start at 0 from here so the next CSS translate is relative to the
        // freshly committed domain, not the original mousedown position.
        d.startX = ev.clientX
        d.startY = ev.clientY
        d.xMin0 = p.x
        d.yMin0 = p.y
        pendingRef.current = { x: p.x, y: p.y }
      }

      const onUp = () => {
        // Clear the CSS transforms and commit the new domain in the same synchronous task.
        // The browser cannot paint between these two operations, so the chart transitions
        // directly from "old data + transform" to "new data + no transform" in one frame.
        if (dragDataRef.current) clearTransforms(dragDataRef.current.movableEls)
        const p = pendingRef.current
        if (p) {
          onPanXRef.current(p.x)
          onPanYRef.current(p.y)
          pendingRef.current = null
        }
        dragDataRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        setIsDragging(false)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)

      // Only capture drag data (and prevent text selection) when panning is enabled
      if (!enabledRef.current) return
      const xd = xDomainRef.current
      const yd = yDomainRef.current
      lastCommitRef.current = performance.now()
      dragDataRef.current = {
        startX: e.clientX, startY: e.clientY,
        xMin0: xd[0], xRange: xd[1] - xd[0],
        yMin0: yd[0], yRange: yd[1] - yd[0],
        plotW, plotH,
        movableEls: getMovableEls(el),  // cached once — not re-queried on every mousemove
      }
      e.preventDefault()
    }

    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [containerRef, xDomainRef, yDomainRef])

  return { isDragging }
}
