'use client'

import { useCallback, useRef } from 'react'

interface Props {
  fullDomain: [number, number]
  visibleDomain: [number, number]
  onPan: (newMin: number) => void
  topPad?: number
  bottomPad?: number
  className?: string
}

export function VerticalScrollbar({
  fullDomain,
  visibleDomain,
  onPan,
  topPad = 0,
  bottomPad = 0,
  className = '',
}: Props) {
  const [d0, d1] = fullDomain
  const [vs, ve] = visibleDomain
  const fullRange = d1 - d0
  const visibleRange = ve - vs

  // Chart Y-axis: higher elevation = top. Thumb top% represents distance from top (highest el).
  const thumbTopPct = fullRange > 0 ? ((d1 - ve) / fullRange) * 100 : 0
  const thumbHeightPct = fullRange > 0 ? Math.max(4, (visibleRange / fullRange) * 100) : 100

  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const pendingPanRef = useRef<number | null>(null)
  const onPanRef = useRef(onPan)
  onPanRef.current = onPan

  const onTrackMouseDown = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return
      ev.preventDefault()
      ev.stopPropagation()

      const rect = trackRef.current.getBoundingClientRect()
      const clickFraction = (ev.clientY - rect.top) / rect.height
      const thumbTopFraction = (d1 - ve) / fullRange
      const thumbBottomFraction = (d1 - vs) / fullRange

      let anchorMin: number
      if (clickFraction < thumbTopFraction || clickFraction > thumbBottomFraction) {
        const clickEl = d1 - clickFraction * fullRange
        anchorMin = Math.max(d0, Math.min(d1 - visibleRange, clickEl - visibleRange / 2))
        onPanRef.current(anchorMin)
      } else {
        anchorMin = vs
      }

      const startY = ev.clientY

      const onMove = (moveEv: MouseEvent) => {
        // Drag down → reveal lower elevation values
        const deltaY = moveEv.clientY - startY
        pendingPanRef.current = anchorMin - (deltaY / rect.height) * fullRange

        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            if (pendingPanRef.current !== null) {
              onPanRef.current(pendingPanRef.current)
              pendingPanRef.current = null
            }
            rafRef.current = null
          })
        }
      }

      const onUp = () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        if (pendingPanRef.current !== null) {
          onPanRef.current(pendingPanRef.current)
          pendingPanRef.current = null
        }
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [d0, d1, vs, ve, fullRange, visibleRange],
  )

  return (
    <div
      className={`h-full select-none flex flex-col ${className}`}
      style={{ paddingTop: topPad, paddingBottom: bottomPad }}
    >
      <div
        ref={trackRef}
        className="flex-1 relative rounded-full bg-gray-200 cursor-grab mx-auto"
        style={{ width: 6 }}
        onMouseDown={onTrackMouseDown}
      >
        <div
          className="absolute inset-x-0 rounded-full bg-gray-400 hover:bg-gray-500 transition-colors"
          style={{ top: `${thumbTopPct}%`, height: `${thumbHeightPct}%` }}
        />
      </div>
    </div>
  )
}
