'use client'

interface ZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
}

export function ZoomControls({ onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div className="absolute bottom-2 left-2 z-10 flex gap-0.5">
      <button
        type="button"
        onClick={onZoomOut}
        className="h-[22px] rounded border border-gray-300 bg-white/90 px-2 text-[10px] font-medium leading-none text-gray-600 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        title="Zoom out"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className="h-[22px] rounded border border-gray-300 bg-white/90 px-2 text-[10px] font-medium leading-none text-gray-600 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        title="Zoom in"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  )
}
