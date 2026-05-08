'use client'

import { useCallback, useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  loading: boolean
}

const SEGMENT_COUNT = 12

export default function FileUpload({ onFiles, loading }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  return (
    <label
      className="upload-terminal"
      data-dragging={dragging}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="ut-scanlines" aria-hidden="true" />
      <div className="ut-scan-line" aria-hidden="true" />
      <span className="ut-corner tl" aria-hidden="true" />
      <span className="ut-corner tr" aria-hidden="true" />
      <span className="ut-corner bl" aria-hidden="true" />
      <span className="ut-corner br" aria-hidden="true" />
      <div className="ut-led" aria-hidden="true" />
      <div className="ut-id" aria-hidden="true">DTI-7α</div>

      {loading ? (
        <div className="ut-loading">
          <div className="ut-bar">
            {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
              <div
                key={i}
                className="ut-seg"
                style={{ animationDelay: `${i * 0.09}s` }}
              />
            ))}
          </div>
          <p className="ut-loading-text">
            PARSING TELEMETRY DATA<span className="ut-cursor">_</span>
          </p>
          <p className="ut-sub">VALIDATING COLUMN SCHEMA · MAPPING ROWS</p>
        </div>
      ) : (
        <div className="ut-idle">
          <svg
            className="ut-icon"
            viewBox="0 0 60 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Upload arrow */}
            <line x1="30" y1="28" x2="30" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <polyline points="23,18 30,10 37,18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Data package */}
            <rect x="11" y="32" width="38" height="22" stroke="currentColor" strokeWidth="1.5" />
            {/* Data scan lines inside package */}
            <line x1="17" y1="40" x2="43" y2="40" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
            <line x1="17" y1="46" x2="37" y2="46" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
            {/* Corner bracket marks on package */}
            <path d="M11 37 L11 32 L16 32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" fill="none" />
            <path d="M44 32 L49 32 L49 37" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" fill="none" />
            <path d="M11 49 L11 54 L16 54" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" fill="none" />
            <path d="M49 49 L49 54 L44 54" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" fill="none" />
          </svg>

          <p className="ut-headline">
            {dragging ? 'RELEASE TO TRANSFER' : 'UPLOAD DATA PACKAGE'}
          </p>
          <p className="ut-subtext">
            {dragging
              ? 'INCOMING FEED DETECTED — READY TO INGEST'
              : 'DRAG .TXT / .LOG FILES OR CLICK TO BROWSE'}
          </p>
          <p className="ut-spec">
            FORMAT: CSV LOG (.txt / .log) · 15 COLUMNS · TIMESTAMP, AZ, EL, PAE, CS, RSSI, TX
          </p>
        </div>
      )}

      <input type="file" accept=".txt,.log,.csv" multiple className="hidden" onChange={handleChange} />
    </label>
  )
}
