'use client'

import { useCallback, useRef } from 'react'

interface Props {
  fullDomain: [number, number]
  visibleDomain: [number, number]
  onPan: (newStart: number) => void
  /** Pixels from the left edge of the scrollbar container to the start of the plot area. */
  leftPad?: number
  /** Pixels from the right edge of the scrollbar container to the end of the plot area. */
  rightPad?: number
  className?: string
}

export function ZoomScrollbar({
  fullDomain,
  visibleDomain,
  onPan,
  leftPad = 0,
  rightPad = 0,
  className = '',
}: Props) {
  const [d0, d1] = fullDomain
  const [vs, ve] = visibleDomain
  const fullRange = d1 - d0
  const visibleRange = ve - vs

  const thumbLeftPct = ((vs - d0) / fullRange) * 100
  const thumbWidthPct = Math.max(2, (visibleRange / fullRange) * 100)

  const trackRef = useRef<HTMLDivElement>(null)
  // RAF throttle: store latest pending pan value; one state update per animation frame.
  const rafRef = useRef<number | null>(null)
  const pendingPanRef = useRef<number | null>(null)
  // Keep a stable ref to onPan so the RAF callback always calls the current version.
  const onPanRef = useRef(onPan)
  onPanRef.current = onPan

  const onTrackMouseDown = useCallback(
    (ev: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return
      ev.preventDefault()

      const rect = trackRef.current.getBoundingClientRect()
      const clickFraction = (ev.clientX - rect.left) / rect.width
      const thumbStartFraction = (vs - d0) / fullRange
      const thumbEndFraction = (ve - d0) / fullRange

      // Click outside the thumb → jump so the thumb centers on the click point
      let anchorStart: number
      if (clickFraction < thumbStartFraction || clickFraction > thumbEndFraction) {
        const clickDomain = d0 + clickFraction * fullRange
        anchorStart = Math.max(d0, Math.min(d1 - visibleRange, clickDomain - visibleRange / 2))
        onPanRef.current(anchorStart)
      } else {
        anchorStart = vs
      }

      const startX = ev.clientX

      const onMove = (moveEv: MouseEvent) => {
        // Always update the pending value with the latest mouse position.
        const deltaX = moveEv.clientX - startX
        pendingPanRef.current = anchorStart + (deltaX / rect.width) * fullRange

        // Schedule at most one state update per animation frame.
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
        // Flush any pending update immediately on release.
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
      className={`select-none pt-1.5 pb-1 ${className}`}
      style={{ paddingLeft: leftPad, paddingRight: rightPad }}
    >
      <div
        ref={trackRef}
        className="relative h-[6px] rounded-full bg-gray-200 cursor-grab"
        onMouseDown={onTrackMouseDown}
      >
        <div
          className="absolute top-0 h-full rounded-full bg-gray-400 hover:bg-gray-500 transition-colors"
          style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
        />
      </div>
    </div>
  )
}
