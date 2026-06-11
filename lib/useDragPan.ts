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
 * The listener is attached once (stable deps) so it never tears down mid-drag.
 */
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
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)

  // Mousedown listener — stable (only re-attaches if containerRef changes)
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

      // Only capture drag data (and prevent text selection) when panning is enabled
      if (!enabledRef.current) return
      const xd = xDomainRef.current
      const yd = yDomainRef.current
      dragDataRef.current = {
        startX: e.clientX, startY: e.clientY,
        xMin0: xd[0], xRange: xd[1] - xd[0],
        yMin0: yd[0], yRange: yd[1] - yd[0],
        plotW, plotH,
      }
      e.preventDefault()
    }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [containerRef, xDomainRef, yDomainRef])

  // Mousemove + mouseup — only active while a drag is in progress
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const d = dragDataRef.current
      if (!d) return
      // Compute absolute offset from drag-start in domain units
      pendingRef.current = {
        x: d.xMin0 - ((e.clientX - d.startX) / d.plotW) * d.xRange,
        y: d.yMin0 + ((e.clientY - d.startY) / d.plotH) * d.yRange,
      }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const p = pendingRef.current
          if (!p) return
          pendingRef.current = null
          onPanXRef.current(p.x)
          onPanYRef.current(p.y)
        })
      }
    }
    const onUp = () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      const p = pendingRef.current
      if (p) { onPanXRef.current(p.x); onPanYRef.current(p.y); pendingRef.current = null }
      dragDataRef.current = null
      setIsDragging(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [isDragging])

  return { isDragging }
}
