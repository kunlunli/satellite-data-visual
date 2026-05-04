'use client'

import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Sidebar, { type View } from './Sidebar'
import FileUpload from './FileUpload'
import TrackingPathChart from './TrackingPathChart'
import SkyPlot from './SkyPlot'
import TrackingErrorChart from './TrackingErrorChart'
import AzElPositionChart from './AzElPositionChart'
import RssiChart from './RssiChart'
import { TimezonePicker } from './TimezonePicker'
import type { SatelliteDataRow } from '@/lib/types'
import { parseLogFile, formatFlightTime } from '@/lib/parseData'
import { formatScrubMetric } from '@/lib/formatScrubMetric'
import { exportDashboardPdf } from '@/lib/exportDashboardPdf'
import DashboardPdfSnapshot from '@/components/DashboardPdfSnapshot'
import { TimezoneContext } from '@/lib/timezoneContext'
import { formatWallClock, formatWallClockFull } from '@/lib/formatWallTime'

export default function Dashboard() {
  const [data, setData] = useState<SatelliteDataRow[]>([])
  const [fileName, setFileName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState<View>('dashboard')
  const [mountedViews, setMountedViews] = useState<Record<View, boolean>>({
    dashboard: true,
    azel: false,
    pae: false,
    rssi: false,
  })
  const [loadingView, setLoadingView] = useState<View | null>(null)
  /** Per-tab playback index: only the active tab follows `currentIndex` while stepping (hidden charts stay frozen). */
  const [indexByView, setIndexByView] = useState({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
  const [timelinePanelOpen, setTimelinePanelOpen] = useState(true)
  const pdfSnapshotRef = useRef<HTMLDivElement>(null)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfExportIndex, setPdfExportIndex] = useState(0)
  const [pdfExportPdfPage, setPdfExportPdfPage] = useState({ current: 1, total: 1 })
  const [pdfExportProgress, setPdfExportProgress] = useState({ cur: 0, total: 0 })
  const [pdfRangeModalOpen, setPdfRangeModalOpen] = useState(false)
  /** 1-based sample indices, same numbering as the timeline (1 … N). */
  const [pdfFrameStart, setPdfFrameStart] = useState('1')
  const [pdfFrameEnd, setPdfFrameEnd] = useState('1')
  const [pdfRangeError, setPdfRangeError] = useState('')
  const [timezone, setTimezone] = useState<string | null>(null)

  const t0Us = useMemo(() => (data.length > 0 ? data[0].timestamp : 0), [data])
  const tzCtx = useMemo(() => ({ timezone, t0Us }), [timezone, t0Us])

  const logDate = useMemo(() => {
    if (t0Us === 0) return ''
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(t0Us / 1000))
  }, [t0Us, timezone])

  const openPdfRangeModal = useCallback(() => {
    if (data.length === 0) return
    const n = data.length
    setPdfFrameStart('1')
    setPdfFrameEnd(String(Math.min(n, 20)))
    setPdfRangeError('')
    setPdfRangeModalOpen(true)
  }, [data])

  const closePdfRangeModal = useCallback(() => {
    setPdfRangeModalOpen(false)
    setPdfRangeError('')
  }, [])

  useEffect(() => {
    if (!pdfRangeModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePdfRangeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pdfRangeModalOpen, closePdfRangeModal])

  const runPdfExport = useCallback(
    async (indices: number[]) => {
      if (data.length === 0 || indices.length === 0) return
      const n = indices.length
      if (n > 250) {
        const ok = window.confirm(
          `This will create a ${n}-page PDF (one page per sample in the range). It can take a long time and use a lot of memory. Continue?`,
        )
        if (!ok) return
      }
      setPdfExporting(true)
      setPdfExportIndex(indices[0])
      setPdfExportPdfPage({ current: 1, total: n })
      setPdfExportProgress({ cur: 0, total: n })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise((r) => setTimeout(r, 80))
      const el = pdfSnapshotRef.current
      if (!el) {
        setPdfExporting(false)
        setPdfExportProgress({ cur: 0, total: 0 })
        window.alert('Could not prepare the export view. Try again.')
        return
      }
      const base =
        (fileName && fileName.replace(/\.[^.]+$/, '')) ||
        `telemetry-${new Date().toISOString().slice(0, 10)}`
      try {
        await exportDashboardPdf({
          element: el,
          indices,
          renderFrame: (rowIndex, pdfPage, pdfTotal) => {
            setPdfExportIndex(rowIndex)
            setPdfExportPdfPage({ current: pdfPage, total: pdfTotal })
          },
          baseFileName: base,
          onProgress: (cur, total) => setPdfExportProgress({ cur, total }),
        })
      } catch (e) {
        console.error(e)
        window.alert('PDF export failed. If the log is very long, try a shorter file or another browser.')
      } finally {
        setPdfExporting(false)
        setPdfExportProgress({ cur: 0, total: 0 })
      }
    },
    [data.length, fileName],
  )

  const confirmPdfRangeExport = useCallback(() => {
    if (data.length === 0) return
    const n = data.length
    const rawA = pdfFrameStart.trim()
    const rawB = pdfFrameEnd.trim()
    if (rawA === '' || rawB === '') {
      setPdfRangeError('Enter both a start and an end sample number.')
      return
    }
    const startNum = Number(rawA)
    const endNum = Number(rawB)
    if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
      setPdfRangeError('Sample numbers must be valid integers.')
      return
    }
    const a = Math.trunc(startNum)
    const b = Math.trunc(endNum)
    if (a !== startNum || b !== endNum) {
      setPdfRangeError('Use whole numbers only (no decimals).')
      return
    }
    if (a < 1 || a > n || b < 1 || b > n) {
      setPdfRangeError(`Each number must be between 1 and ${n} (inclusive).`)
      return
    }
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const i0 = lo - 1
    const i1 = hi - 1
    const indices: number[] = []
    for (let i = i0; i <= i1; i++) indices.push(i)
    setPdfRangeModalOpen(false)
    setPdfRangeError('')
    void runPdfExport(indices)
  }, [data, pdfFrameStart, pdfFrameEnd, runPdfExport])

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    setError('')
    try {
      const parsed = await parseLogFile(file)
      setData(parsed)
      setCurrentIndex(0)
      setFileName(file.name)
      setActiveView('dashboard')
      setMountedViews({ dashboard: true, azel: false, pae: false, rssi: false })
      setLoadingView(null)
      setIndexByView({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
      setTimelinePanelOpen(true)
    } catch (e) {
      setError('Failed to parse file. Make sure it is a valid .txt or .log with 15 comma-separated columns.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLoadNew = useCallback(() => {
    setData([])
    setFileName('')
    setActiveView('dashboard')
    setMountedViews({ dashboard: true, azel: false, pae: false, rssi: false })
    setLoadingView(null)
    setIndexByView({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
  }, [])

  const stepTimeline = useCallback((delta: number) => {
    if (data.length === 0) return
    setCurrentIndex((prev) => Math.min(data.length - 1, Math.max(0, prev + delta)))
  }, [data.length])

  const handleViewChange = useCallback((view: View) => {
    if (view !== activeView && !mountedViews[view]) {
      setLoadingView(view)
      window.setTimeout(() => {
        setMountedViews((prev) => ({ ...prev, [view]: true }))
        setLoadingView((curr) => (curr === view ? null : curr))
      }, 0)
    }
    setActiveView(view)
  }, [activeView, mountedViews])

  const hasData = data.length > 0
  const totalMs = hasData ? data[data.length - 1].flightTimeMs : 0
  const currentTime = hasData ? data[currentIndex].flightTimeMs : 0
  const scrubRow = hasData ? data[currentIndex] : undefined

  useEffect(() => {
    setIndexByView((prev) => {
      if (activeView === 'dashboard') return { ...prev, dashboard: currentIndex }
      if (activeView === 'azel') return { ...prev, azel: currentIndex }
      if (activeView === 'pae') return { ...prev, pae: currentIndex }
      return { ...prev, rssi: currentIndex }
    })
  }, [currentIndex, activeView])

  const dashboardPlayIndex = activeView === 'dashboard' ? currentIndex : indexByView.dashboard
  const azelPlayIndex = activeView === 'azel' ? currentIndex : indexByView.azel
  const paePlayIndex = activeView === 'pae' ? currentIndex : indexByView.pae
  const rssiPlayIndex = activeView === 'rssi' ? currentIndex : indexByView.rssi

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 30)
    return () => window.clearTimeout(timer)
  }, [activeView])

  return (
    <TimezoneContext.Provider value={tzCtx}>
    <div className="h-screen flex flex-col">
      {pdfExporting && (
        <div className="pdf-export-overlay" role="status" aria-live="polite">
          <div className="pdf-export-overlay-inner">
            Exporting dashboard PDF
            <div className="pdf-export-overlay-detail">
              Page {pdfExportProgress.cur} / {pdfExportProgress.total}
            </div>
          </div>
        </div>
      )}
      {pdfExporting && (
        <div
          className="pdf-export-offscreen-wrap"
          aria-hidden
          style={{ position: 'fixed', left: 0, top: 0, zIndex: -1, pointerEvents: 'none', width: '100vw' }}
        >
          <DashboardPdfSnapshot
            ref={pdfSnapshotRef}
            data={data}
            index={pdfExportIndex}
            pdfPage={{ current: pdfExportPdfPage.current, total: pdfExportPdfPage.total }}
          />
        </div>
      )}

      {pdfRangeModalOpen && (
        <div
          className="pdf-range-modal-backdrop"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closePdfRangeModal()}
        >
          <div
            className="pdf-range-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-range-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pdf-range-modal-title">Export PDF — sample range</h2>
            <p className="pdf-range-modal-desc">
              Enter the first and last sample by number, using the same 1-based count as the timeline
              (e.g. <span className="font-mono text-[11px]">127 / 5000</span> means sample 127 of 5000).
            </p>
            <div className="pdf-range-modal-field">
              <label htmlFor="pdf-range-start">Start sample number</label>
              <input
                id="pdf-range-start"
                type="number"
                min={1}
                max={hasData ? data.length : 1}
                step={1}
                value={pdfFrameStart}
                onChange={(e) => {
                  setPdfFrameStart(e.target.value)
                  setPdfRangeError('')
                }}
              />
            </div>
            <div className="pdf-range-modal-field">
              <label htmlFor="pdf-range-end">End sample number</label>
              <input
                id="pdf-range-end"
                type="number"
                min={1}
                max={hasData ? data.length : 1}
                step={1}
                value={pdfFrameEnd}
                onChange={(e) => {
                  setPdfFrameEnd(e.target.value)
                  setPdfRangeError('')
                }}
              />
            </div>
            <p className="pdf-range-modal-hint">
              Total samples in this log: {hasData ? data.length : 0}
            </p>
            {pdfRangeError ? <div className="pdf-range-modal-error">{pdfRangeError}</div> : null}
            <div className="pdf-range-modal-actions">
              <button
                type="button"
                className="pdf-range-modal-btn secondary"
                onClick={closePdfRangeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pdf-range-modal-btn primary"
                onClick={confirmPdfRangeExport}
                disabled={pdfExporting}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top header */}
      <header className="app-header z-10 flex shrink-0 items-center gap-4 px-4 py-2">
        <div className="w-40 shrink-0 md:w-48" />
        <div className="flex flex-1 items-center justify-center gap-3">
          <span className="header-wordmark">Intellian</span>
          {logDate && <span className="header-log-date">{logDate}</span>}
        </div>
        <div className="flex w-40 shrink-0 items-center justify-end gap-2 md:w-48">
          {hasData && (
            <TimezonePicker timezone={timezone} onSelect={setTimezone} />
          )}
          {hasData && (
            <button
              type="button"
              className="header-export-pdf-btn"
              onClick={openPdfRangeModal}
              disabled={pdfExporting}
              title="Export dashboard charts as PDF for a range of samples"
            >
              {pdfExporting ? 'Exporting…' : 'Export PDF'}
            </button>
          )}
        </div>
      </header>

      {/* Body: sidebar + main content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          fileName={fileName}
          hasData={hasData}
          onLoadNewFile={handleLoadNew}
        />

        <main
          className={`flex min-h-0 flex-1 flex-col ${
            hasData && activeView !== 'dashboard' ? 'overflow-hidden' : 'overflow-auto'
          }`}
        >
          {hasData && timelinePanelOpen && (
            <div id="timeline-progress-panel" className="timeline-float">
              <div className="timeline-float-header">
                <span className="timeline-float-label">Timeline</span>
                <div className="timeline-float-header-actions">
                  <span className="timeline-float-count">{currentIndex + 1} / {data.length}</span>
                  <button
                    type="button"
                    className="timeline-float-hide-btn"
                    onClick={() => setTimelinePanelOpen(false)}
                    aria-expanded="true"
                    aria-controls="timeline-progress-panel"
                    title="Hide timeline"
                  >
                    Hide
                  </button>
                </div>
              </div>
              <div className="timeline-float-row">
                <span className="timeline-float-time">{formatFlightTime(currentTime)}</span>
                <button
                  type="button"
                  onClick={() => stepTimeline(-1)}
                  disabled={currentIndex <= 0}
                  className="timeline-step-btn"
                  aria-label="Step backward"
                  title="Step backward"
                >
                  ◀
                </button>
                <input
                  type="range"
                  min={0}
                  max={data.length - 1}
                  value={currentIndex}
                  onChange={(e) => setCurrentIndex(Number(e.target.value))}
                />
                <button
                  type="button"
                  onClick={() => stepTimeline(1)}
                  disabled={currentIndex >= data.length - 1}
                  className="timeline-step-btn"
                  aria-label="Step forward"
                  title="Step forward"
                >
                  ▶
                </button>
                <span className="timeline-float-time end">{formatFlightTime(totalMs)}</span>
              </div>
              {scrubRow && (
                <div className="timeline-float-metrics" aria-live="polite">
                  <div className="timeline-float-metric">
                    <span className="timeline-float-metric-label">Azimuth</span>
                    <span className="timeline-float-metric-value accent-az">
                      {formatScrubMetric(scrubRow.cur_az, 3, '°')}
                    </span>
                  </div>
                  <div className="timeline-float-metric">
                    <span className="timeline-float-metric-label">Elevation</span>
                    <span className="timeline-float-metric-value accent-el">
                      {formatScrubMetric(scrubRow.cur_el, 3, '°')}
                    </span>
                  </div>
                  <div className="timeline-float-metric">
                    <span className="timeline-float-metric-label">RSSI</span>
                    <span className="timeline-float-metric-value accent-rssi">
                      {formatScrubMetric(scrubRow.rssi, 1)}
                    </span>
                  </div>
                  <div className="timeline-float-metric">
                    <span className="timeline-float-metric-label">PAE X</span>
                    <span className="timeline-float-metric-value accent-pae-x">
                      {formatScrubMetric(scrubRow.pae_joint_X, 4, '°')}
                    </span>
                  </div>
                  <div className="timeline-float-metric">
                    <span className="timeline-float-metric-label">PAE Y</span>
                    <span className="timeline-float-metric-value accent-pae-y">
                      {formatScrubMetric(scrubRow.pae_joint_Y, 4, '°')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasData && !timelinePanelOpen && (
            <button
              type="button"
              className="timeline-float-show-btn"
              onClick={() => setTimelinePanelOpen(true)}
              aria-expanded="false"
              title="Show timeline"
            >
              Show timeline
            </button>
          )}

          {!hasData ? (
            <div className="upload-screen flex-1 flex flex-col items-center justify-center gap-8 p-8">
              <div className="upload-screen-header">
                <p className="system-badge">INTELLIAN // GROUND CONTROL INTERFACE v2.1</p>
                <h1 className="screen-title">SATELLITE TRACKING<br />VISUALIZER</h1>
                <p className="screen-subtitle">INITIALIZE TELEMETRY ANALYSIS · LOAD CSV LOG FILE</p>
              </div>
              <FileUpload onFile={handleFile} loading={loading} />
              {error && (
                <div className="upload-error-block">
                  <span className="upload-error-tag">ERR</span>
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div
              className={
                activeView === 'dashboard'
                  ? 'p-3'
                  : 'flex min-h-0 flex-1 flex-col overflow-hidden p-3'
              }
            >
              {loadingView === activeView && (
                <div className="loading-chip mb-3 shrink-0 px-3 py-2 text-xs">
                  Loading {activeView.toUpperCase()} view...
                </div>
              )}

              {mountedViews.dashboard && (
                <DashboardView data={data} currentIndex={dashboardPlayIndex} isActive={activeView === 'dashboard'} />
              )}
              {mountedViews.azel && (
                <AzElView data={data} currentIndex={azelPlayIndex} isActive={activeView === 'azel'} />
              )}
              {mountedViews.pae && (
                <PaeView data={data} currentIndex={paePlayIndex} isActive={activeView === 'pae'} />
              )}
              {mountedViews.rssi && (
                <RssiView data={data} currentIndex={rssiPlayIndex} isActive={activeView === 'rssi'} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
    </TimezoneContext.Provider>
  )
}

function FocusedView({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <h2 className="shrink-0 text-sm font-semibold text-white">{title}</h2>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}

type ViewKey = 'azel' | 'pae' | 'rssi'

const CHART_LABELS: Record<ViewKey, string> = {
  azel: 'Az / El Position',
  pae: 'Pointing Accuracy Error',
  rssi: 'RSSI',
}

function CombineBar({
  currentView,
  combined,
  onAdd,
  onRemove,
}: {
  currentView: ViewKey
  combined: ViewKey[]
  onAdd: (v: ViewKey) => void
  onRemove: (v: ViewKey) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const available = (Object.keys(CHART_LABELS) as ViewKey[]).filter(
    (v) => v !== currentView && !combined.includes(v),
  )

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="combine-bar shrink-0">
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          className="combine-charts-btn"
          onClick={() => setOpen((v) => !v)}
          disabled={available.length === 0}
        >
          + Combine Charts
        </button>
        {open && (
          <div ref={dropRef} className="combine-dropdown">
            {available.map((v) => (
              <button
                key={v}
                type="button"
                className="combine-dropdown-item"
                onClick={() => { onAdd(v); setOpen(false) }}
              >
                {CHART_LABELS[v]}
              </button>
            ))}
          </div>
        )}
      </div>
      {combined.map((v) => (
        <span key={v} className="combine-chip">
          {CHART_LABELS[v]}
          <button
            type="button"
            className="combine-chip-remove"
            onClick={() => onRemove(v)}
            aria-label={`Remove ${CHART_LABELS[v]}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}


const DashboardView = memo(function DashboardView({
  data,
  currentIndex,
  isActive,
}: CP & { isActive: boolean }) {
  return (
    <div className={isActive ? 'block' : 'hidden'}>
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
        <div className="grid gap-3 items-stretch lg:grid-cols-[minmax(0,1fr)_320px]">
          <TrackingPathChart data={data} currentIndex={currentIndex} height={300} />
          <SkyPlot data={data} currentIndex={currentIndex} />
        </div>
        <AzElPositionChart data={data} currentIndex={currentIndex} height={360} />
        <TrackingErrorChart data={data} currentIndex={currentIndex} height={400} />
        <RssiChart data={data} currentIndex={currentIndex} height={400} />
      </div>
    </div>
  )
})

const PaeView = memo(function PaeView({
  data,
  currentIndex,
  isActive,
}: CP & { isActive: boolean }) {
  const [combined, setCombined] = useState<ViewKey[]>([])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="pae"
        combined={combined}
        onAdd={(v) => setCombined((p) => [...p, v])}
        onRemove={(v) => setCombined((p) => p.filter((x) => x !== v))}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="Pointing Accuracy Error">
          <PaeFull data={data} currentIndex={currentIndex} combined={combined} />
        </FocusedView>
      </div>
    </div>
  )
})

const RssiView = memo(function RssiView({
  data,
  currentIndex,
  isActive,
}: CP & { isActive: boolean }) {
  const [combined, setCombined] = useState<ViewKey[]>([])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="rssi"
        combined={combined}
        onAdd={(v) => setCombined((p) => [...p, v])}
        onRemove={(v) => setCombined((p) => p.filter((x) => x !== v))}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="RSSI">
          <RssiFull data={data} currentIndex={currentIndex} combined={combined} />
        </FocusedView>
      </div>
    </div>
  )
})

const AzElView = memo(function AzElView({
  data,
  currentIndex,
  isActive,
}: CP & { isActive: boolean }) {
  const [combined, setCombined] = useState<ViewKey[]>([])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="azel"
        combined={combined}
        onAdd={(v) => setCombined((p) => [...p, v])}
        onRemove={(v) => setCombined((p) => p.filter((x) => x !== v))}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="Azimuth & Elevation">
          <AzElFull data={data} currentIndex={currentIndex} combined={combined} />
        </FocusedView>
      </div>
    </div>
  )
})

/* ── Expanded single-chart variants ────────────────────────────────── */

import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
  ReferenceDot,
} from 'recharts'
import { getFlightTimeDomain, sliceByTime } from '@/lib/timeSeriesChartLayout'
import { useChartZoom, type PlotBounds } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'
import { useTimezone } from '@/lib/timezoneContext'

interface CP { data: SatelliteDataRow[]; currentIndex: number }

const FULL_SAMPLE = 4

const FULL_MARGIN = { top: 12, right: 24, bottom: 32, left: 40 }

// FULL_MARGIN + default Recharts YAxis width (60px), no right axis
const FULL_PLOT_BOUNDS: PlotBounds = {
  left: FULL_MARGIN.left + 60,
  right: FULL_MARGIN.right,
  top: FULL_MARGIN.top,
  bottom: FULL_MARGIN.bottom,
}
// AzEl always has a visible right YAxis for elevation (width 60px)
const AZEL_FULL_MARGIN = { ...FULL_MARGIN, right: FULL_MARGIN.right + 60 }
const AZEL_FULL_PLOT_BOUNDS: PlotBounds = {
  left: FULL_MARGIN.left + 60,
  right: FULL_MARGIN.right + 60,
  top: FULL_MARGIN.top,
  bottom: FULL_MARGIN.bottom,
}

// Hidden zero-width axis — gives a series its own independent scale without
// consuming chart space or showing tick labels.
const HIDDEN_AXIS_PROPS = { hide: true, width: 0, domain: ['auto', 'auto'] } as const

function PaeFull({ data, currentIndex, combined }: CP & { combined: ViewKey[] }) {
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, FULL_PLOT_BOUNDS)
  const allChartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0).map((r) => ({
      t: r.flightTimeMs,
      paeX: r.pae_joint_X,
      paeY: r.pae_joint_Y,
      ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
      ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
    })),
    [data, combined],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentPaeX = data[currentIndex]?.pae_joint_X
  const currentPaeY = data[currentIndex]?.pae_joint_Y
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-4 shadow-sm">
      <div ref={containerRef} className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={FULL_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 10 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
            {/* Primary visible axis */}
            <YAxis yAxisId="pae" orientation="left" domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(3)} tick={{ fontSize: 11 }}
              label={{ value: 'PAE (°)', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
            {/* Each combined series gets its own hidden axis for independent scaling */}
            {combined.includes('rssi') && <YAxis yAxisId="rssi" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('azel') && <YAxis yAxisId="az" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('azel') && <YAxis yAxisId="el" {...HIDDEN_AXIS_PROPS} />}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => [v.toFixed(4), name]} />
            <Legend verticalAlign="top" />
            <Line yAxisId="pae" type="monotone" dataKey="paeX" name="PAE X" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line yAxisId="pae" type="monotone" dataKey="paeY" name="PAE Y" stroke="#ea580c" dot={false} strokeWidth={2} isAnimationActive={false} />
            {combined.includes('rssi') && (
              <Line yAxisId="rssi" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && (
              <Line yAxisId="az" type="monotone" dataKey="az" name="Azimuth" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && (
              <Line yAxisId="el" type="monotone" dataKey="el" name="Elevation" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            <ReferenceLine yAxisId="pae" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
            {currentPaeX != null && (
              <ReferenceDot yAxisId="pae" x={currentTime} y={currentPaeX} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
            {currentPaeY != null && (
              <ReferenceDot yAxisId="pae" x={currentTime} y={currentPaeY} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={FULL_PLOT_BOUNDS.left} rightPad={FULL_PLOT_BOUNDS.right} />
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

function RssiFull({ data, currentIndex, combined }: CP & { combined: ViewKey[] }) {
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, FULL_PLOT_BOUNDS)
  const allChartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0).map((r) => ({
      t: r.flightTimeMs,
      rssi: r.rssi,
      ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
      ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
    })),
    [data, combined],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentRssi = data[currentIndex]?.rssi
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-4 shadow-sm">
      <div ref={containerRef} className="min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={FULL_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 10 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
            {/* Primary visible axis */}
            <YAxis yAxisId="rssi" orientation="left" domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 11 }}
              label={{ value: 'RSSI', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
            {/* Independent hidden axes for combined series */}
            {combined.includes('pae') && <YAxis yAxisId="paeX" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('pae') && <YAxis yAxisId="paeY" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('azel') && <YAxis yAxisId="az" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('azel') && <YAxis yAxisId="el" {...HIDDEN_AXIS_PROPS} />}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => [v.toFixed(3), name]} />
            <Legend verticalAlign="top" />
            <Line yAxisId="rssi" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" dot={false} strokeWidth={2} isAnimationActive={false} />
            {combined.includes('pae') && (
              <Line yAxisId="paeX" type="monotone" dataKey="paeX" name="PAE X" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('pae') && (
              <Line yAxisId="paeY" type="monotone" dataKey="paeY" name="PAE Y" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && (
              <Line yAxisId="az" type="monotone" dataKey="az" name="Azimuth" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && (
              <Line yAxisId="el" type="monotone" dataKey="el" name="Elevation" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            <ReferenceLine yAxisId="rssi" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
            {currentRssi != null && (
              <ReferenceDot yAxisId="rssi" x={currentTime} y={currentRssi} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={FULL_PLOT_BOUNDS.left} rightPad={FULL_PLOT_BOUNDS.right} />
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

function AzElFull({ data, currentIndex, combined }: CP & { combined: ViewKey[] }) {
  const { timezone, t0Us } = useTimezone()
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, t0Us, timezone) : formatFlightTime(v), [timezone, t0Us])
  const timeDomain = useMemo(() => getFlightTimeDomain(data), [data])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, AZEL_FULL_PLOT_BOUNDS)
  const allChartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0).map((r) => ({
      t: r.flightTimeMs,
      az: r.cur_az,
      el: r.cur_el,
      ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
      ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
    })),
    [data, combined],
  )
  const chartData = useMemo(() => sliceByTime(allChartData, zoomDomain[0], zoomDomain[1]), [allChartData, zoomDomain])
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  const currentAz = data[currentIndex]?.cur_az
  const currentEl = data[currentIndex]?.cur_el
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-3 shadow-sm">
      <div ref={containerRef} className="min-h-0 w-full flex-1 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={AZEL_FULL_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 10 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
            {/* Primary visible axes: az on left, el on right */}
            <YAxis yAxisId="az" orientation="left" domain={['auto', 'auto']} tick={{ fontSize: 11 }}
              label={{ value: 'Az (°)', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
            <YAxis yAxisId="el" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 11 }}
              label={{ value: 'El (°)', angle: 90, position: 'insideRight', offset: 16, fontSize: 12 }} />
            {/* Independent hidden axes for combined series */}
            {combined.includes('pae') && <YAxis yAxisId="paeX" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('pae') && <YAxis yAxisId="paeY" {...HIDDEN_AXIS_PROPS} />}
            {combined.includes('rssi') && <YAxis yAxisId="rssi" {...HIDDEN_AXIS_PROPS} />}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => [v.toFixed(3), name]} />
            <Legend verticalAlign="top" />
            <Line yAxisId="az" type="monotone" dataKey="az" name="Azimuth" stroke="#2563eb" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line yAxisId="el" type="monotone" dataKey="el" name="Elevation" stroke="#ea580c" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            {combined.includes('pae') && (
              <Line yAxisId="paeX" type="monotone" dataKey="paeX" name="PAE X" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('pae') && (
              <Line yAxisId="paeY" type="monotone" dataKey="paeY" name="PAE Y" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('rssi') && (
              <Line yAxisId="rssi" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            )}
            <ReferenceLine yAxisId="az" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
            {currentAz != null && (
              <ReferenceDot yAxisId="az" x={currentTime} y={currentAz} r={4} fill="#2563eb" stroke="#fff" strokeWidth={1} isFront />
            )}
            {currentEl != null && (
              <ReferenceDot yAxisId="el" x={currentTime} y={currentEl} r={4} fill="#ea580c" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={AZEL_FULL_PLOT_BOUNDS.left} rightPad={AZEL_FULL_PLOT_BOUNDS.right} />
      )}
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}
