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
import type { SatelliteDataRow, ViewKey } from '@/lib/types'
import { parseLogFile, formatFlightTime } from '@/lib/parseData'
import { formatScrubMetric } from '@/lib/formatScrubMetric'
import { exportDashboardPdf } from '@/lib/exportDashboardPdf'
import DashboardPdfSnapshot, { type PdfReportType } from '@/components/DashboardPdfSnapshot'
import { TimezoneContext } from '@/lib/timezoneContext'
import { formatWallClock, formatWallClockFull } from '@/lib/formatWallTime'

interface LogEntry {
  id: string
  fileName: string
  data: SatelliteDataRow[]
}

const EMPTY_DATA: SatelliteDataRow[] = []

export default function Dashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeLogId, setActiveLogId] = useState<string | null>(null)
  const [manageLogsOpen, setManageLogsOpen] = useState(false)
  const activeLog = useMemo(() => logs.find((l) => l.id === activeLogId) ?? null, [logs, activeLogId])
  const data = activeLog?.data ?? EMPTY_DATA
  const fileName = activeLog?.fileName ?? ''
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
  const hiddenFileInputRef = useRef<HTMLInputElement>(null)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfExportIndex, setPdfExportIndex] = useState(0)
  const [pdfExportPdfPage, setPdfExportPdfPage] = useState({ current: 1, total: 1 })
  const [pdfExportProgress, setPdfExportProgress] = useState({ cur: 0, total: 0 })
  const [pdfRangeModalOpen, setPdfRangeModalOpen] = useState(false)
  /** 1-based sample indices, same numbering as the timeline (1 … N). */
  const [pdfFrameStart, setPdfFrameStart] = useState('1')
  const [pdfFrameEnd, setPdfFrameEnd] = useState('1')
  const [pdfRangeError, setPdfRangeError] = useState('')
  const [pdfReportType, setPdfReportType] = useState<PdfReportType>('dashboard')
  const [rssiCombined, setRssiCombined] = useState<ViewKey[]>([])
  const [paeCombined, setPaeCombined] = useState<ViewKey[]>([])
  const [azelCombined, setAzelCombined] = useState<ViewKey[]>([])
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

  const PDF_REPORT_SUFFIXES: Record<PdfReportType, string> = {
    dashboard: 'dashboard-snapshots',
    azel: 'azel-report',
    pae: 'pae-report',
    rssi: 'rssi-report',
  }

  const runPdfExport = useCallback(
    async (indices: number[], reportType: PdfReportType) => {
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
          filenameSuffix: PDF_REPORT_SUFFIXES[reportType],
        })
      } catch (e) {
        console.error(e)
        window.alert('PDF export failed. If the log is very long, try a shorter file or another browser.')
      } finally {
        setPdfExporting(false)
        setPdfExportProgress({ cur: 0, total: 0 })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    void runPdfExport(indices, pdfReportType)
  }, [data, pdfFrameStart, pdfFrameEnd, pdfReportType, runPdfExport])

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setLoading(true)
    setError('')
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const parsed = await parseLogFile(file)
            return { ok: true as const, fileName: file.name, data: parsed }
          } catch {
            return { ok: false as const, fileName: file.name }
          }
        })
      )
      type OkResult = { ok: true; fileName: string; data: SatelliteDataRow[] }
      const successes = results.filter((r): r is OkResult => r.ok)
      const failNames = results.filter((r) => !r.ok).map((r) => r.fileName)
      if (successes.length > 0) {
        const newEntries: LogEntry[] = successes.map((r) => ({
          id: crypto.randomUUID(),
          fileName: r.fileName,
          data: r.data,
        }))
        setLogs((prev) => [...prev, ...newEntries])
        const lastId = newEntries[newEntries.length - 1].id
        setActiveLogId(lastId)
        setCurrentIndex(0)
        setActiveView('dashboard')
        setMountedViews({ dashboard: true, azel: false, pae: false, rssi: false })
        setLoadingView(null)
        setIndexByView({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
        setTimelinePanelOpen(true)
        setRssiCombined([]); setPaeCombined([]); setAzelCombined([])
      }
      if (failNames.length > 0) {
        setError(
          failNames.length === 1
            ? `Failed to parse "${failNames[0]}". Make sure it is a valid .txt or .log with 15 comma-separated columns.`
            : `Failed to parse ${failNames.length} files: ${failNames.join(', ')}. Make sure each is a valid .txt or .log with 15 comma-separated columns.`
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleLoadNew = useCallback(() => {
    hiddenFileInputRef.current?.click()
  }, [])

  const switchLog = useCallback((id: string) => {
    setActiveLogId(id)
    setCurrentIndex(0)
    setActiveView('dashboard')
    setMountedViews({ dashboard: true, azel: false, pae: false, rssi: false })
    setIndexByView({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
    setManageLogsOpen(false)
    setRssiCombined([]); setPaeCombined([]); setAzelCombined([])
  }, [])

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => {
      const next = prev.filter((l) => l.id !== id)
      setActiveLogId((cur) => {
        if (cur !== id) return cur
        const newActive = next[next.length - 1]?.id ?? null
        if (!newActive) {
          setCurrentIndex(0)
          setActiveView('dashboard')
          setMountedViews({ dashboard: true, azel: false, pae: false, rssi: false })
          setIndexByView({ dashboard: 0, azel: 0, pae: 0, rssi: 0 })
        }
        setRssiCombined([]); setPaeCombined([]); setAzelCombined([])
        return newActive
      })
      return next
    })
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
  const otherLogs = useMemo(() => logs.filter((l) => l.id !== activeLogId), [logs, activeLogId])
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
            Exporting {pdfReportType === 'dashboard' ? 'Dashboard' : pdfReportType === 'azel' ? 'AZ / EL' : pdfReportType === 'pae' ? 'PAE' : 'RSSI'} PDF
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
            reportType={pdfReportType}
            combined={
              pdfReportType === 'rssi' ? rssiCombined :
              pdfReportType === 'pae' ? paeCombined :
              pdfReportType === 'azel' ? azelCombined :
              undefined
            }
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
            <h2 id="pdf-range-modal-title">Export PDF</h2>
            <div className="pdf-range-modal-field">
              <label>Report type</label>
              <div className="pdf-report-type-group">
                {([
                  { value: 'dashboard', label: 'Dashboard' },
                  { value: 'azel', label: 'AZ / EL' },
                  { value: 'pae', label: 'PAE' },
                  { value: 'rssi', label: 'RSSI' },
                ] as { value: PdfReportType; label: string }[]).map(({ value, label }) => (
                  <label key={value} className={`pdf-report-type-option${pdfReportType === value ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="pdf-report-type"
                      value={value}
                      checked={pdfReportType === value}
                      onChange={() => setPdfReportType(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
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

      {/* Hidden file input for multi-file loading */}
      <input
        ref={hiddenFileInputRef}
        type="file"
        accept=".txt,.log,.csv"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) {
            void handleFiles(files)
            e.target.value = ''
          }
        }}
      />

      {/* Manage Logs modal */}
      {manageLogsOpen && (
        <div
          className="manage-logs-backdrop"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setManageLogsOpen(false)}
        >
          <div
            className="manage-logs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-logs-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="manage-logs-title" className="manage-logs-title">Manage Logs</h2>
            {logs.length === 0 ? (
              <p className="manage-logs-empty">No logs loaded.</p>
            ) : (
              <ul className="manage-logs-list">
                {logs.map((log) => (
                  <li key={log.id} className={`manage-logs-item${log.id === activeLogId ? ' active' : ''}`}>
                    <span className="manage-logs-name" title={log.fileName}>{log.fileName}</span>
                    <div className="manage-logs-actions">
                      {log.id === activeLogId ? (
                        <span className="manage-logs-active-badge">Active</span>
                      ) : (
                        <button
                          type="button"
                          className="manage-logs-btn switch"
                          onClick={() => switchLog(log.id)}
                        >
                          Switch
                        </button>
                      )}
                      <button
                        type="button"
                        className="manage-logs-btn remove"
                        onClick={() => removeLog(log.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="manage-logs-footer">
              <button
                type="button"
                className="manage-logs-close-btn"
                onClick={() => setManageLogsOpen(false)}
              >
                Close
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
          onManageLogs={() => setManageLogsOpen(true)}
          logCount={logs.length}
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
                      {formatScrubMetric(rssiToDbm(scrubRow.rssi), 2, ' dBm')}
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
              <FileUpload onFiles={handleFiles} loading={loading} />
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
                <AzElView data={data} currentIndex={azelPlayIndex} isActive={activeView === 'azel'} otherLogs={otherLogs} fileName={fileName} combined={azelCombined} onCombinedChange={setAzelCombined} />
              )}
              {mountedViews.pae && (
                <PaeView data={data} currentIndex={paePlayIndex} isActive={activeView === 'pae'} otherLogs={otherLogs} fileName={fileName} combined={paeCombined} onCombinedChange={setPaeCombined} />
              )}
              {mountedViews.rssi && (
                <RssiView data={data} currentIndex={rssiPlayIndex} isActive={activeView === 'rssi'} otherLogs={otherLogs} fileName={fileName} combined={rssiCombined} onCombinedChange={setRssiCombined} />
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
  otherLogs,
  fileName,
  combined,
  onCombinedChange,
}: CP & { isActive: boolean; otherLogs: LogEntry[]; fileName?: string; combined: ViewKey[]; onCombinedChange: (v: ViewKey[]) => void }) {
  const [combinedLogIds, setCombinedLogIds] = useState<string[]>([])
  const combinedLogs = useMemo(
    () => combinedLogIds.map((id) => otherLogs.find((l) => l.id === id)).filter((l): l is LogEntry => l !== undefined),
    [combinedLogIds, otherLogs],
  )
  useEffect(() => {
    const ids = new Set(otherLogs.map((l) => l.id))
    setCombinedLogIds((p) => p.filter((id) => ids.has(id)))
  }, [otherLogs])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="pae"
        combined={combined}
        onAdd={(v) => onCombinedChange([...combined, v])}
        onRemove={(v) => onCombinedChange(combined.filter((x) => x !== v))}
      />
      <CombineLogsBar
        otherLogs={otherLogs}
        combinedLogIds={combinedLogIds}
        onAdd={(id) => setCombinedLogIds((p) => [...p, id])}
        onRemove={(id) => setCombinedLogIds((p) => p.filter((x) => x !== id))}
        primaryFileName={fileName}
        primaryColor="#2563eb"
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="Pointing Accuracy Error">
          <PaeFull data={data} currentIndex={currentIndex} combined={combined} combinedLogs={combinedLogs} fileName={fileName} />
        </FocusedView>
      </div>
    </div>
  )
})

const RssiView = memo(function RssiView({
  data,
  currentIndex,
  isActive,
  otherLogs,
  fileName,
  combined,
  onCombinedChange,
}: CP & { isActive: boolean; otherLogs: LogEntry[]; fileName?: string; combined: ViewKey[]; onCombinedChange: (v: ViewKey[]) => void }) {
  const [combinedLogIds, setCombinedLogIds] = useState<string[]>([])
  const combinedLogs = useMemo(
    () => combinedLogIds.map((id) => otherLogs.find((l) => l.id === id)).filter((l): l is LogEntry => l !== undefined),
    [combinedLogIds, otherLogs],
  )
  useEffect(() => {
    const ids = new Set(otherLogs.map((l) => l.id))
    setCombinedLogIds((p) => p.filter((id) => ids.has(id)))
  }, [otherLogs])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="rssi"
        combined={combined}
        onAdd={(v) => onCombinedChange([...combined, v])}
        onRemove={(v) => onCombinedChange(combined.filter((x) => x !== v))}
      />
      <CombineLogsBar
        otherLogs={otherLogs}
        combinedLogIds={combinedLogIds}
        onAdd={(id) => setCombinedLogIds((p) => [...p, id])}
        onRemove={(id) => setCombinedLogIds((p) => p.filter((x) => x !== id))}
        primaryFileName={fileName}
        primaryColor="#7c3aed"
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="RSSI">
          <RssiFull data={data} currentIndex={currentIndex} combined={combined} combinedLogs={combinedLogs} fileName={fileName} />
        </FocusedView>
      </div>
    </div>
  )
})

const AzElView = memo(function AzElView({
  data,
  currentIndex,
  isActive,
  otherLogs,
  fileName,
  combined,
  onCombinedChange,
}: CP & { isActive: boolean; otherLogs: LogEntry[]; fileName?: string; combined: ViewKey[]; onCombinedChange: (v: ViewKey[]) => void }) {
  const [combinedLogIds, setCombinedLogIds] = useState<string[]>([])
  const combinedLogs = useMemo(
    () => combinedLogIds.map((id) => otherLogs.find((l) => l.id === id)).filter((l): l is LogEntry => l !== undefined),
    [combinedLogIds, otherLogs],
  )
  useEffect(() => {
    const ids = new Set(otherLogs.map((l) => l.id))
    setCombinedLogIds((p) => p.filter((id) => ids.has(id)))
  }, [otherLogs])
  return (
    <div className={isActive ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}>
      <CombineBar
        currentView="azel"
        combined={combined}
        onAdd={(v) => onCombinedChange([...combined, v])}
        onRemove={(v) => onCombinedChange(combined.filter((x) => x !== v))}
      />
      <CombineLogsBar
        otherLogs={otherLogs}
        combinedLogIds={combinedLogIds}
        onAdd={(id) => setCombinedLogIds((p) => [...p, id])}
        onRemove={(id) => setCombinedLogIds((p) => p.filter((x) => x !== id))}
        primaryFileName={fileName}
        primaryColor="#2563eb"
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <FocusedView title="Azimuth & Elevation">
          <AzElFull data={data} currentIndex={currentIndex} combined={combined} combinedLogs={combinedLogs} fileName={fileName} />
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
import { sliceByTime, makeZoomAwareTimeTicks, makeRssiTicks, rssiToDbm, getDynamicSample } from '@/lib/timeSeriesChartLayout'
import { useChartZoom, type PlotBounds } from '@/lib/useChartZoom'
import { ZoomControls } from '@/components/ZoomControls'
import { ZoomScrollbar } from '@/components/ZoomScrollbar'
import { useTimezone } from '@/lib/timezoneContext'

interface CP { data: SatelliteDataRow[]; currentIndex: number }


const FULL_MARGIN = { top: 28, right: 24, bottom: 32, left: 40 }

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
const HIDDEN_AXIS_PROPS = { hide: true, width: 0, domain: ['auto', 'auto'] as [string, string] }

const LOG_COLORS = ['#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316']
const logLabel = (log: LogEntry) => log.fileName.replace(/\.[^.]+$/, '').slice(0, 22)

interface LineSpec { key: string; label: string; color: string; dashed?: boolean; dualLine?: boolean }

function LineToggleBar({ lines, hidden, onToggle }: { lines: LineSpec[]; hidden: string[]; onToggle: (k: string) => void }) {
  const primaryLines = lines.filter((l) => !l.key.startsWith('log_'))
  return (
    <div className="line-toggle-bar">
      {primaryLines.map((l) => {
        const isHidden = hidden.includes(l.key)
        return (
          <button
            key={l.key}
            type="button"
            className={`line-toggle-btn${isHidden ? ' off' : ''}`}
            onClick={() => onToggle(l.key)}
            title={isHidden ? `Show ${l.label}` : `Hide ${l.label}`}
          >
            <span className="line-toggle-swatch" style={{ background: isHidden || l.dashed ? 'transparent' : l.color, borderColor: l.color }} />
            {l.label}
          </button>
        )
      })}
    </div>
  )
}

function CombineLogsBar({
  otherLogs,
  combinedLogIds,
  onAdd,
  onRemove,
  primaryFileName,
  primaryColor = '#6b7280',
}: {
  otherLogs: LogEntry[]
  combinedLogIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  primaryFileName?: string
  primaryColor?: string
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

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
          className="combine-logs-btn"
          onClick={() => setOpen((v) => !v)}
          disabled={otherLogs.length === 0}
          title={otherLogs.length === 0 ? 'Load more log files to combine' : undefined}
        >
          + Combine Logs
        </button>
        {open && otherLogs.length > 0 && (
          <div ref={dropRef} className="combine-dropdown">
            {otherLogs.map((l) => {
              const isCombined = combinedLogIds.includes(l.id)
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`combine-dropdown-item${isCombined ? ' selected' : ''}`}
                  onClick={() => isCombined ? onRemove(l.id) : onAdd(l.id)}
                >
                  <span className="combine-dropdown-check">{isCombined ? '✓' : ''}</span>
                  {l.fileName}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {primaryFileName && (
        <span className="combine-chip log-chip primary-log-chip">
          <span className="log-chip-dot" style={{ background: primaryColor }} />
          {primaryFileName.replace(/\.[^.]+$/, '').slice(0, 22)}
        </span>
      )}
      {combinedLogIds.map((id, i) => {
        const log = otherLogs.find((l) => l.id === id)
        if (!log) return null
        const color = LOG_COLORS[i % LOG_COLORS.length]
        return (
          <span key={id} className="combine-chip log-chip">
            <span className="log-chip-dot" style={{ background: color }} />
            {logLabel(log)}
            <button
              type="button"
              className="combine-chip-remove"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${log.fileName}`}
            >
              ×
            </button>
          </span>
        )
      })}
    </div>
  )
}

function LogLineIcon({ color, dual, dashed }: { color: string; dual?: boolean; dashed?: boolean }) {
  if (dual) {
    return (
      <svg width="22" height="14" aria-hidden="true" style={{ flexShrink: 0 }}>
        <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="1" y1="10" x2="21" y2="10" stroke={color} strokeWidth="2" strokeDasharray="5 2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="22" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '5 2' : undefined} strokeLinecap="round" />
    </svg>
  )
}

function ChartLegend({
  primaryLabel,
  primaryColor,
  primaryDualLine,
  lines,
}: {
  primaryLabel: string
  primaryColor: string
  primaryDualLine: boolean
  lines: LineSpec[]
}) {
  const [visible, setVisible] = useState(true)
  const combinedLines = lines.filter((l) => l.key.startsWith('log_'))

  if (!visible) {
    return (
      <button
        type="button"
        className="chart-legend-collapsed"
        onClick={() => setVisible(true)}
        aria-label="Show legend"
        title="Show legend"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
          <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
          <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
          <circle cx="3.5" cy="6" r="1.2" fill="currentColor" />
          <circle cx="3.5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="3.5" cy="18" r="1.2" fill="currentColor" />
        </svg>
      </button>
    )
  }

  return (
    <div className="chart-legend-toggle" aria-label="Log legend">
      <button
        type="button"
        className="clt-hide-btn"
        onClick={() => setVisible(false)}
        aria-label="Hide legend"
        title="Hide legend"
      >
        ×
      </button>
      <div className="clt-row">
        <LogLineIcon color={primaryColor} dual={primaryDualLine} />
        <span className="clt-label">{primaryLabel || 'Active log'}</span>
      </div>
      {combinedLines.map((line) => (
        <div key={line.key} className="clt-row">
          <LogLineIcon color={line.color} dual={line.dualLine} />
          <span className="clt-label">{line.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Returns a function that binary-searches `rows` (sorted by `getT`) for the
 * row whose time is nearest to the queried `t`. Used to merge multi-log series
 * into a single data array so Recharts shows all values in one tooltip.
 */
function makeNearestRowFn<R>(rows: R[], getT: (r: R) => number): (t: number) => R | undefined {
  const sorted = [...rows].sort((a, b) => getT(a) - getT(b))
  return (t: number) => {
    if (sorted.length === 0) return undefined
    let lo = 0, hi = sorted.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (getT(sorted[mid]) < t) lo = mid + 1
      else hi = mid
    }
    if (lo > 0 && Math.abs(getT(sorted[lo - 1]) - t) < Math.abs(getT(sorted[lo]) - t)) lo--
    return sorted[lo]
  }
}

function PaeFull({ data, currentIndex, combined, combinedLogs, fileName = '' }: CP & { combined: ViewKey[]; combinedLogs: LogEntry[]; fileName?: string }) {
  const [showDots, setShowDots] = useState(false)
  const d = (fill: string) => showDots ? { r: 4, fill, strokeWidth: 0 } : false as false
  const { timezone } = useTimezone()
  const useAbsoluteTime = timezone !== null
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, 0, timezone) : formatFlightTime(v), [timezone])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, 0, timezone) : formatFlightTime(v), [timezone])
  const timeDomain = useMemo((): [number, number] => {
    if (useAbsoluteTime) {
      // Combined logs are aligned by flight time, not absolute time, so only
      // use the primary log's absolute range for the x-axis domain.
      if (data.length === 0) return [0, 1]
      return [data[0].timestamp / 1000, data[data.length - 1].timestamp / 1000]
    }
    let maxEnd = data.length > 0 ? data[data.length - 1].flightTimeMs : 0
    for (const log of combinedLogs) { if (log.data.length > 0) maxEnd = Math.max(maxEnd, log.data[log.data.length - 1].flightTimeMs) }
    return [0, maxEnd || 1]
  }, [data, combinedLogs, useAbsoluteTime])
  const paeCombinedRightWidth = (combined.includes('rssi') ? 60 : 0) + (combined.includes('azel') ? 120 : 0)
  const paePlotBounds = useMemo<PlotBounds>(() => ({ ...FULL_PLOT_BOUNDS, right: FULL_MARGIN.right + paeCombinedRightWidth }), [paeCombinedRightWidth])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, paePlotBounds)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])
  const dataInterval = data.length >= 2
    ? (useAbsoluteTime ? (data[1].timestamp - data[0].timestamp) / 1000 : data[1].flightTimeMs - data[0].flightTimeMs)
    : (useAbsoluteTime ? 0.5 : 500)
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval, useAbsoluteTime),
    [zoomDomain, sample, dataInterval, useAbsoluteTime],
  )
  const allChartData = useMemo(() => {
    const getT = (r: SatelliteDataRow) => useAbsoluteTime ? r.timestamp / 1000 : r.flightTimeMs
    // Always index combined logs by flightTimeMs so logs from different calendar
    // dates are aligned by their position in the pass, not absolute timestamp.
    const combinedNNs = combinedLogs.map((log) =>
      makeNearestRowFn(log.data.filter((_, i) => i % sample === 0), (r) => r.flightTimeMs)
    )
    return data.filter((_, i) => i % sample === 0).map((r) => {
      const t = getT(r)
      const row: { t: number; [k: string]: number } = {
        t,
        paeX: r.pae_joint_X,
        paeY: r.pae_joint_Y,
        ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
        ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
      }
      combinedNNs.forEach((nn, i) => {
        const cr = nn(r.flightTimeMs)
        if (cr) { row[`paeX_${i}`] = cr.pae_joint_X; row[`paeY_${i}`] = cr.pae_joint_Y }
      })
      return row
    })
  }, [data, combined, combinedLogs, useAbsoluteTime, sample])
  const chartData = useMemo(() => {
    const [lo, hi] = zoomDomain
    const buf = (hi - lo) * 0.1
    return allChartData.filter((r) => r.t >= lo - buf && r.t <= hi + buf)
  }, [allChartData, zoomDomain])
  // Stable PAE domain from all logs — so hiding one line or adding a combined
  // log doesn't rescale the axis and distort visible line shapes.
  const paeDomain = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) { chk(r.pae_joint_X); chk(r.pae_joint_Y) }
    for (const log of combinedLogs) { for (const r of log.data) { chk(r.pae_joint_X); chk(r.pae_joint_Y) } }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.0001)
    return [min - pad, max + pad]
  }, [data, combinedLogs])
  const rssiOverlayRange_pae = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (r.rssi < min) min = r.rssi; if (r.rssi > max) max = r.rssi }
    return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 }
  }, [data])
  const rssiOverlayTicks_pae = useMemo(() => makeRssiTicks(rssiOverlayRange_pae.min, rssiOverlayRange_pae.max), [rssiOverlayRange_pae])
  const rssiOverlayDomain_pae = useMemo((): [number, number] =>
    rssiOverlayTicks_pae.length === 0 ? [0, 1] : [rssiOverlayTicks_pae[0], rssiOverlayTicks_pae[rssiOverlayTicks_pae.length - 1]],
  [rssiOverlayTicks_pae])
  const azOverlayDomain_pae = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (Number.isFinite(r.cur_az)) { if (r.cur_az < min) min = r.cur_az; if (r.cur_az > max) max = r.cur_az } }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data])
  const elOverlayDomain_pae = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (Number.isFinite(r.cur_el)) { if (r.cur_el < min) min = r.cur_el; if (r.cur_el > max) max = r.cur_el } }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data])
  const paeCombinedChartMargin = useMemo(() => ({ ...FULL_MARGIN, right: FULL_MARGIN.right + paeCombinedRightWidth }), [paeCombinedRightWidth])
  const currentTime = useAbsoluteTime ? (data[currentIndex]?.timestamp ?? 0) / 1000 : (data[currentIndex]?.flightTimeMs ?? 0)
  const currentPaeX = data[currentIndex]?.pae_joint_X
  const currentPaeY = data[currentIndex]?.pae_joint_Y
  const [hiddenLines, setHiddenLines] = useState<string[]>([])
  const toggleLine = useCallback((k: string) => setHiddenLines((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]), [])
  const lines = useMemo<LineSpec[]>(() => {
    const base: LineSpec[] = [
      { key: 'paeX', label: 'PAE X', color: '#2563eb', dashed: false },
      { key: 'paeY', label: 'PAE Y', color: '#2563eb', dashed: true },
    ]
    if (combined.includes('rssi')) base.push({ key: 'rssi', label: 'RSSI', color: '#7c3aed' })
    if (combined.includes('azel')) {
      base.push({ key: 'az', label: 'Azimuth', color: '#16a34a' })
      base.push({ key: 'el', label: 'Elevation', color: '#0891b2' })
    }
    combinedLogs.forEach((log, i) => base.push({ key: `log_${log.id}`, label: logLabel(log), color: LOG_COLORS[i % LOG_COLORS.length], dualLine: true }))
    return base
  }, [combined, combinedLogs])
  useEffect(() => {
    const valid = lines.map((l) => l.key)
    setHiddenLines((p) => p.filter((k) => valid.includes(k)))
  }, [lines])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-4 shadow-sm">
      <LineToggleBar lines={lines} hidden={hiddenLines} onToggle={toggleLine} />
      <div ref={containerRef} className="relative min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={paeCombinedChartMargin}>
            <CartesianGrid stroke="#c4c9d4" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} ticks={timeTicks} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 12 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 13 }} />
            <YAxis yAxisId="pae" orientation="left" domain={paeDomain} tickFormatter={(v: number) => v.toFixed(3)} tick={{ fontSize: 12 }}
              label={{ value: 'PAE (°)', angle: 0, position: 'insideTopLeft', dy: -26, fontSize: 13 }} />
            {combined.includes('rssi') && (
              <YAxis yAxisId="rssiOverlay" orientation="right" width={60} domain={rssiOverlayDomain_pae} ticks={rssiOverlayTicks_pae}
                tickFormatter={(v: number) => rssiToDbm(v).toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'RSSI (dBm)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            {combined.includes('azel') && (
              <YAxis yAxisId="azOverlay" orientation="right" width={60} domain={azOverlayDomain_pae}
                tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'Az (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            {combined.includes('azel') && (
              <YAxis yAxisId="elOverlay" orientation="right" width={60} domain={elOverlayDomain_pae}
                tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'El (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => {
                if (name === 'RSSI') return [rssiToDbm(v).toFixed(2) + ' dBm', name]
                return [v.toFixed(4), name]
              }} />
            {!hiddenLines.includes('paeX') && <Line yAxisId="pae" type="monotone" dataKey="paeX" name="PAE X" stroke="#2563eb" dot={d('#2563eb')} strokeWidth={2} isAnimationActive={false} />}
            {!hiddenLines.includes('paeY') && <Line yAxisId="pae" type="monotone" dataKey="paeY" name="PAE Y" stroke="#2563eb" dot={d('#2563eb')} strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false} />}
            {combined.includes('rssi') && !hiddenLines.includes('rssi') && (
              <Line yAxisId="rssiOverlay" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" strokeDasharray="5 3" dot={d('#7c3aed')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && !hiddenLines.includes('az') && (
              <Line yAxisId="azOverlay" type="monotone" dataKey="az" name="Azimuth" stroke="#16a34a" strokeDasharray="5 3" dot={d('#16a34a')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && !hiddenLines.includes('el') && (
              <Line yAxisId="elOverlay" type="monotone" dataKey="el" name="Elevation" stroke="#0891b2" strokeDasharray="5 3" dot={d('#0891b2')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combinedLogs.flatMap((log, i) => {
              if (hiddenLines.includes(`log_${log.id}`)) return []
              const color = LOG_COLORS[i % LOG_COLORS.length]
              const lbl = logLabel(log)
              return [
                <Line key={`${log.id}_pX`} yAxisId="pae" type="monotone" dataKey={`paeX_${i}`} name={`PAE X · ${lbl}`} stroke={color} dot={d(color)} strokeWidth={1.5} isAnimationActive={false} />,
                <Line key={`${log.id}_pY`} yAxisId="pae" type="monotone" dataKey={`paeY_${i}`} name={`PAE Y · ${lbl}`} stroke={color} dot={d(color)} strokeWidth={1.5} strokeDasharray="5 3" isAnimationActive={false} />,
              ]
            })}
            <ReferenceLine yAxisId="pae" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
            {!hiddenLines.includes('paeX') && currentPaeX != null && (
              <ReferenceDot yAxisId="pae" x={currentTime} y={currentPaeX} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
            {!hiddenLines.includes('paeY') && currentPaeY != null && (
              <ReferenceDot yAxisId="pae" x={currentTime} y={currentPaeY} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
        <ChartLegend primaryLabel={fileName} primaryColor="#2563eb" primaryDualLine lines={lines} />
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={FULL_PLOT_BOUNDS.left} rightPad={paePlotBounds.right} />
      )}
      <button
        type="button"
        onClick={() => setShowDots((v) => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

function RssiFull({ data, currentIndex, combined, combinedLogs, fileName = '' }: CP & { combined: ViewKey[]; combinedLogs: LogEntry[]; fileName?: string }) {
  const [showDots, setShowDots] = useState(false)
  const d = (fill: string) => showDots ? { r: 4, fill, strokeWidth: 0 } : false as false
  const { timezone } = useTimezone()
  const useAbsoluteTime = timezone !== null
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, 0, timezone) : formatFlightTime(v), [timezone])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, 0, timezone) : formatFlightTime(v), [timezone])
  const timeDomain = useMemo((): [number, number] => {
    if (useAbsoluteTime) {
      if (data.length === 0) return [0, 1]
      return [data[0].timestamp / 1000, data[data.length - 1].timestamp / 1000]
    }
    let maxEnd = data.length > 0 ? data[data.length - 1].flightTimeMs : 0
    for (const log of combinedLogs) { if (log.data.length > 0) maxEnd = Math.max(maxEnd, log.data[log.data.length - 1].flightTimeMs) }
    return [0, maxEnd || 1]
  }, [data, combinedLogs, useAbsoluteTime])
  const rssiCombinedRightWidth = (combined.includes('pae') ? 60 : 0) + (combined.includes('azel') ? 120 : 0)
  const rssiPlotBounds = useMemo<PlotBounds>(() => ({ ...FULL_PLOT_BOUNDS, right: FULL_MARGIN.right + rssiCombinedRightWidth }), [rssiCombinedRightWidth])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, rssiPlotBounds)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])
  const dataInterval = data.length >= 2
    ? (useAbsoluteTime ? (data[1].timestamp - data[0].timestamp) / 1000 : data[1].flightTimeMs - data[0].flightTimeMs)
    : (useAbsoluteTime ? 0.5 : 500)
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval, useAbsoluteTime),
    [zoomDomain, sample, dataInterval, useAbsoluteTime],
  )
  const allChartData = useMemo(() => {
    const getT = (r: SatelliteDataRow) => useAbsoluteTime ? r.timestamp / 1000 : r.flightTimeMs
    const combinedNNs = combinedLogs.map((log) =>
      makeNearestRowFn(log.data.filter((_, i) => i % sample === 0), (r) => r.flightTimeMs)
    )
    return data.filter((_, i) => i % sample === 0).map((r) => {
      const t = getT(r)
      const row: { t: number; [k: string]: number } = {
        t,
        rssi: r.rssi,
        ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
        ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
      }
      combinedNNs.forEach((nn, i) => {
        const cr = nn(r.flightTimeMs)
        if (cr) row[`rssi_${i}`] = cr.rssi
      })
      return row
    })
  }, [data, combined, combinedLogs, useAbsoluteTime, sample])
  const chartData = useMemo(() => {
    const [lo, hi] = zoomDomain
    const buf = (hi - lo) * 0.1
    return allChartData.filter((r) => r.t >= lo - buf && r.t <= hi + buf)
  }, [allChartData, zoomDomain])
  const rssiDomain = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) chk(r.rssi)
    for (const log of combinedLogs) for (const r of log.data) chk(r.rssi)
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data, combinedLogs])
  const rssiTicks = useMemo(
    () => makeRssiTicks(rssiDomain[0], rssiDomain[1]),
    [rssiDomain],
  )
  const paeOverlayDomain_rssi = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) { chk(r.pae_joint_X); chk(r.pae_joint_Y) }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.0001)
    return [min - pad, max + pad]
  }, [data])
  const azOverlayDomain_rssi = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (Number.isFinite(r.cur_az)) { if (r.cur_az < min) min = r.cur_az; if (r.cur_az > max) max = r.cur_az } }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data])
  const elOverlayDomain_rssi = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (Number.isFinite(r.cur_el)) { if (r.cur_el < min) min = r.cur_el; if (r.cur_el > max) max = r.cur_el } }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data])
  const rssiCombinedChartMargin = useMemo(() => ({ ...FULL_MARGIN, right: FULL_MARGIN.right + rssiCombinedRightWidth }), [rssiCombinedRightWidth])
  const currentTime = useAbsoluteTime ? (data[currentIndex]?.timestamp ?? 0) / 1000 : (data[currentIndex]?.flightTimeMs ?? 0)
  const currentRssi = data[currentIndex]?.rssi
  const [hiddenLines, setHiddenLines] = useState<string[]>([])
  const toggleLine = useCallback((k: string) => setHiddenLines((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]), [])
  const lines = useMemo<LineSpec[]>(() => {
    const base: LineSpec[] = [{ key: 'rssi', label: 'RSSI', color: '#7c3aed' }]
    if (combined.includes('pae')) {
      base.push({ key: 'paeX', label: 'PAE X', color: '#16a34a' })
      base.push({ key: 'paeY', label: 'PAE Y', color: '#0891b2' })
    }
    if (combined.includes('azel')) {
      base.push({ key: 'az', label: 'Azimuth', color: '#16a34a' })
      base.push({ key: 'el', label: 'Elevation', color: '#0891b2' })
    }
    combinedLogs.forEach((log, i) => base.push({ key: `log_${log.id}`, label: logLabel(log), color: LOG_COLORS[i % LOG_COLORS.length], dualLine: false }))
    return base
  }, [combined, combinedLogs])
  useEffect(() => {
    const valid = lines.map((l) => l.key)
    setHiddenLines((p) => p.filter((k) => valid.includes(k)))
  }, [lines])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-4 shadow-sm">
      <LineToggleBar lines={lines} hidden={hiddenLines} onToggle={toggleLine} />
      <div ref={containerRef} className="relative min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={rssiCombinedChartMargin}>
            <CartesianGrid stroke="#c4c9d4" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} ticks={timeTicks} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 12 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 13 }} />
            <YAxis yAxisId="rssi" orientation="left" domain={rssiDomain} ticks={rssiTicks} tickFormatter={(v: number) => rssiToDbm(v).toFixed(1)} tick={{ fontSize: 12 }}
              label={{ value: 'RSSI (dBm)', angle: 0, position: 'insideTopLeft', dy: -26, fontSize: 13 }} />
            {combined.includes('pae') && (
              <YAxis yAxisId="paeOverlay" orientation="right" width={60} domain={paeOverlayDomain_rssi}
                tickFormatter={(v: number) => v.toFixed(3)} tick={{ fontSize: 12 }}
                label={{ value: 'PAE (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            {combined.includes('azel') && (
              <YAxis yAxisId="azOverlay" orientation="right" width={60} domain={azOverlayDomain_rssi}
                tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'Az (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            {combined.includes('azel') && (
              <YAxis yAxisId="elOverlay" orientation="right" width={60} domain={elOverlayDomain_rssi}
                tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'El (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => [
                name.startsWith('RSSI') ? (rssiToDbm(v).toFixed(2) + ' dBm') : v.toFixed(3),
                name,
              ]} />
            {!hiddenLines.includes('rssi') && <Line yAxisId="rssi" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" dot={d('#7c3aed')} strokeWidth={2} isAnimationActive={false} />}
            {combined.includes('pae') && !hiddenLines.includes('paeX') && (
              <Line yAxisId="paeOverlay" type="monotone" dataKey="paeX" name="PAE X" stroke="#16a34a" strokeDasharray="5 3" dot={d('#16a34a')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('pae') && !hiddenLines.includes('paeY') && (
              <Line yAxisId="paeOverlay" type="monotone" dataKey="paeY" name="PAE Y" stroke="#0891b2" strokeDasharray="5 3" dot={d('#0891b2')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && !hiddenLines.includes('az') && (
              <Line yAxisId="azOverlay" type="monotone" dataKey="az" name="Azimuth" stroke="#16a34a" strokeDasharray="5 3" dot={d('#16a34a')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('azel') && !hiddenLines.includes('el') && (
              <Line yAxisId="elOverlay" type="monotone" dataKey="el" name="Elevation" stroke="#0891b2" strokeDasharray="5 3" dot={d('#0891b2')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combinedLogs.flatMap((log, i) => {
              if (hiddenLines.includes(`log_${log.id}`)) return []
              const color = LOG_COLORS[i % LOG_COLORS.length]
              const lbl = logLabel(log)
              return [
                <Line key={`${log.id}_rssi`} yAxisId="rssi" type="monotone" dataKey={`rssi_${i}`} name={`RSSI · ${lbl}`} stroke={color} dot={d(color)} strokeWidth={1.5} isAnimationActive={false} />,
              ]
            })}
            <ReferenceLine yAxisId="rssi" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
            {!hiddenLines.includes('rssi') && currentRssi != null && (
              <ReferenceDot yAxisId="rssi" x={currentTime} y={currentRssi} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
        <ChartLegend primaryLabel={fileName} primaryColor="#7c3aed" primaryDualLine={false} lines={lines} />
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={FULL_PLOT_BOUNDS.left} rightPad={rssiPlotBounds.right} />
      )}
      <button
        type="button"
        onClick={() => setShowDots((v) => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}

function AzElFull({ data, currentIndex, combined, combinedLogs, fileName = '' }: CP & { combined: ViewKey[]; combinedLogs: LogEntry[]; fileName?: string }) {
  const [showDots, setShowDots] = useState(false)
  const d = (fill: string) => showDots ? { r: 4, fill, strokeWidth: 0 } : false as false
  const { timezone } = useTimezone()
  const useAbsoluteTime = timezone !== null
  const fmtTick = useCallback((v: number) => timezone ? formatWallClock(v, 0, timezone) : formatFlightTime(v), [timezone])
  const fmtTooltip = useCallback((v: number) => timezone ? formatWallClockFull(v, 0, timezone) : formatFlightTime(v), [timezone])
  const timeDomain = useMemo((): [number, number] => {
    if (useAbsoluteTime) {
      if (data.length === 0) return [0, 1]
      return [data[0].timestamp / 1000, data[data.length - 1].timestamp / 1000]
    }
    let maxEnd = data.length > 0 ? data[data.length - 1].flightTimeMs : 0
    for (const log of combinedLogs) { if (log.data.length > 0) maxEnd = Math.max(maxEnd, log.data[log.data.length - 1].flightTimeMs) }
    return [0, maxEnd || 1]
  }, [data, combinedLogs, useAbsoluteTime])
  const azelCombinedRightWidth = (combined.includes('pae') ? 60 : 0) + (combined.includes('rssi') ? 60 : 0)
  const azelPlotBounds = useMemo<PlotBounds>(() => ({ ...AZEL_FULL_PLOT_BOUNDS, right: AZEL_FULL_PLOT_BOUNDS.right + azelCombinedRightWidth }), [azelCombinedRightWidth])
  const { domain: zoomDomain, zoomIn, zoomOut, pan, containerRef, isZoomed } = useChartZoom(timeDomain, azelPlotBounds)
  const sample = useMemo(() => getDynamicSample(zoomDomain, timeDomain), [zoomDomain, timeDomain])
  const dataInterval = data.length >= 2
    ? (useAbsoluteTime ? (data[1].timestamp - data[0].timestamp) / 1000 : data[1].flightTimeMs - data[0].flightTimeMs)
    : (useAbsoluteTime ? 0.5 : 500)
  const timeTicks = useMemo(
    () => makeZoomAwareTimeTicks(zoomDomain[0], zoomDomain[1], sample, dataInterval, useAbsoluteTime),
    [zoomDomain, sample, dataInterval, useAbsoluteTime],
  )
  const allChartData = useMemo(() => {
    const getT = (r: SatelliteDataRow) => useAbsoluteTime ? r.timestamp / 1000 : r.flightTimeMs
    const combinedNNs = combinedLogs.map((log) =>
      makeNearestRowFn(log.data.filter((_, i) => i % sample === 0), (r) => r.flightTimeMs)
    )
    return data.filter((_, i) => i % sample === 0).map((r) => {
      const t = getT(r)
      const row: { t: number; [k: string]: number } = {
        t,
        az: r.cur_az,
        el: r.cur_el,
        ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
        ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
      }
      combinedNNs.forEach((nn, i) => {
        const cr = nn(r.flightTimeMs)
        if (cr) { row[`az_${i}`] = cr.cur_az; row[`el_${i}`] = cr.cur_el }
      })
      return row
    })
  }, [data, combined, combinedLogs, useAbsoluteTime, sample])
  const chartData = useMemo(() => {
    const [lo, hi] = zoomDomain
    const buf = (hi - lo) * 0.1
    return allChartData.filter((r) => r.t >= lo - buf && r.t <= hi + buf)
  }, [allChartData, zoomDomain])
  const azDomain = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) chk(r.cur_az)
    for (const log of combinedLogs) for (const r of log.data) chk(r.cur_az)
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data, combinedLogs])
  const elDomain = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) chk(r.cur_el)
    for (const log of combinedLogs) for (const r of log.data) chk(r.cur_el)
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.1)
    return [min - pad, max + pad]
  }, [data, combinedLogs])
  const paeOverlayDomain_azel = useMemo((): [number, number] => {
    let min = Infinity, max = -Infinity
    const chk = (v: number | undefined) => { if (v != null && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v } }
    for (const r of data) { chk(r.pae_joint_X); chk(r.pae_joint_Y) }
    if (!Number.isFinite(min)) return [0, 1]
    const pad = Math.max((max - min) * 0.05, 0.0001)
    return [min - pad, max + pad]
  }, [data])
  const rssiOverlayRange_azel = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const r of data) { if (r.rssi < min) min = r.rssi; if (r.rssi > max) max = r.rssi }
    return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 }
  }, [data])
  const rssiOverlayTicks_azel = useMemo(() => makeRssiTicks(rssiOverlayRange_azel.min, rssiOverlayRange_azel.max), [rssiOverlayRange_azel])
  const rssiOverlayDomain_azel = useMemo((): [number, number] =>
    rssiOverlayTicks_azel.length === 0 ? [0, 1] : [rssiOverlayTicks_azel[0], rssiOverlayTicks_azel[rssiOverlayTicks_azel.length - 1]],
  [rssiOverlayTicks_azel])
  const azelCombinedChartMargin = useMemo(() => ({ ...AZEL_FULL_MARGIN, right: AZEL_FULL_MARGIN.right + azelCombinedRightWidth }), [azelCombinedRightWidth])
  const currentTime = useAbsoluteTime ? (data[currentIndex]?.timestamp ?? 0) / 1000 : (data[currentIndex]?.flightTimeMs ?? 0)
  const currentAz = data[currentIndex]?.cur_az
  const currentEl = data[currentIndex]?.cur_el
  const [hiddenLines, setHiddenLines] = useState<string[]>([])
  const toggleLine = useCallback((k: string) => setHiddenLines((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]), [])
  const lines = useMemo<LineSpec[]>(() => {
    const base: LineSpec[] = [
      { key: 'az', label: 'Azimuth', color: '#2563eb', dashed: false },
      { key: 'el', label: 'Elevation', color: '#ea580c', dashed: false },
    ]
    if (combined.includes('pae')) {
      base.push({ key: 'paeX', label: 'PAE X', color: '#16a34a' })
      base.push({ key: 'paeY', label: 'PAE Y', color: '#0891b2' })
    }
    if (combined.includes('rssi')) base.push({ key: 'rssi', label: 'RSSI', color: '#7c3aed' })
    combinedLogs.forEach((log, i) => base.push({ key: `log_${log.id}`, label: logLabel(log), color: LOG_COLORS[i % LOG_COLORS.length], dualLine: true }))
    return base
  }, [combined, combinedLogs])
  useEffect(() => {
    const valid = lines.map((l) => l.key)
    setHiddenLines((p) => p.filter((k) => valid.includes(k)))
  }, [lines])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white p-3 shadow-sm">
      <LineToggleBar lines={lines} hidden={hiddenLines} onToggle={toggleLine} />
      <div ref={containerRef} className="relative min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={azelCombinedChartMargin}>
            <CartesianGrid stroke="#c4c9d4" />
            <XAxis dataKey="t" type="number" domain={zoomDomain} ticks={timeTicks} allowDataOverflow
              tickFormatter={fmtTick} tick={{ fontSize: 12 }}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 13 }} />
            <YAxis yAxisId="az" orientation="left" domain={azDomain} tick={{ fontSize: 12 }}
              label={{ value: 'Az (°)', angle: 0, position: 'insideTopLeft', dy: -26, fontSize: 13 }} />
            <YAxis yAxisId="el" orientation="right" width={60} domain={elDomain} tick={{ fontSize: 12 }}
              label={{ value: 'El (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            {combined.includes('pae') && (
              <YAxis yAxisId="paeOverlay" orientation="right" width={60} domain={paeOverlayDomain_azel}
                tickFormatter={(v: number) => v.toFixed(3)} tick={{ fontSize: 12 }}
                label={{ value: 'PAE (°)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            {combined.includes('rssi') && (
              <YAxis yAxisId="rssiOverlay" orientation="right" width={60} domain={rssiOverlayDomain_azel} ticks={rssiOverlayTicks_azel}
                tickFormatter={(v: number) => rssiToDbm(v).toFixed(1)} tick={{ fontSize: 12 }}
                label={{ value: 'RSSI (dBm)', angle: 0, position: 'insideTopRight', dy: -26, fontSize: 13 }} />
            )}
            <Tooltip labelFormatter={(v) => fmtTooltip(Number(v))}
              formatter={(v: number, name: string) => {
                if (name === 'RSSI') return [rssiToDbm(v).toFixed(2) + ' dBm', name]
                return [v.toFixed(3), name]
              }} />
            {!hiddenLines.includes('az') && <Line yAxisId="az" type="monotone" dataKey="az" name="Azimuth" stroke="#2563eb" dot={d('#2563eb')} strokeWidth={1.5} isAnimationActive={false} />}
            {!hiddenLines.includes('el') && <Line yAxisId="el" type="monotone" dataKey="el" name="Elevation" stroke="#ea580c" dot={d('#ea580c')} strokeWidth={1.5} isAnimationActive={false} />}
            {combined.includes('pae') && !hiddenLines.includes('paeX') && (
              <Line yAxisId="paeOverlay" type="monotone" dataKey="paeX" name="PAE X" stroke="#16a34a" strokeDasharray="5 3" dot={d('#16a34a')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('pae') && !hiddenLines.includes('paeY') && (
              <Line yAxisId="paeOverlay" type="monotone" dataKey="paeY" name="PAE Y" stroke="#0891b2" strokeDasharray="5 3" dot={d('#0891b2')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combined.includes('rssi') && !hiddenLines.includes('rssi') && (
              <Line yAxisId="rssiOverlay" type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" strokeDasharray="5 3" dot={d('#7c3aed')} strokeWidth={1.5} isAnimationActive={false} />
            )}
            {combinedLogs.flatMap((log, i) => {
              const color = LOG_COLORS[i % LOG_COLORS.length]
              const lbl = logLabel(log)
              return [
                ...(!hiddenLines.includes('az') ? [<Line key={`${log.id}_az`} yAxisId="az" type="monotone" dataKey={`az_${i}`} name={`Az · ${lbl}`} stroke={color} dot={d(color)} strokeWidth={1.5} isAnimationActive={false} />] : []),
                ...(!hiddenLines.includes('el') ? [<Line key={`${log.id}_el`} yAxisId="el" type="monotone" dataKey={`el_${i}`} name={`El · ${lbl}`} stroke={color} dot={d(color)} strokeWidth={1.5} strokeDasharray="5 3" isAnimationActive={false} />] : []),
              ]
            })}
            <ReferenceLine yAxisId="az" x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1.5} />
            {!hiddenLines.includes('az') && currentAz != null && (
              <ReferenceDot yAxisId="az" x={currentTime} y={currentAz} r={4} fill="#2563eb" stroke="#fff" strokeWidth={1} isFront />
            )}
            {!hiddenLines.includes('el') && currentEl != null && (
              <ReferenceDot yAxisId="el" x={currentTime} y={currentEl} r={4} fill="#ea580c" stroke="#fff" strokeWidth={1} isFront />
            )}
          </LineChart>
        </ResponsiveContainer>
        <ChartLegend primaryLabel={fileName} primaryColor="#2563eb" primaryDualLine={false} lines={lines} />
      </div>
      {isZoomed && (
        <ZoomScrollbar className="shrink-0" fullDomain={timeDomain} visibleDomain={zoomDomain} onPan={pan}
          leftPad={AZEL_FULL_PLOT_BOUNDS.left} rightPad={azelPlotBounds.right} />
      )}
      <button
        type="button"
        onClick={() => setShowDots((v) => !v)}
        className={`absolute top-1.5 right-2 z-10 h-[22px] rounded border px-2 text-[10px] font-medium leading-none shadow-sm ${showDots ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white/90 text-gray-600 hover:bg-gray-50'}`}
      >
        {showDots ? 'Hide dots' : 'Show dots'}
      </button>
      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} />
    </div>
  )
}
