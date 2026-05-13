'use client'

import { forwardRef, memo } from 'react'
import TrackingPathChart from '@/components/TrackingPathChart'
import SkyPlot from '@/components/SkyPlot'
import TrackingErrorChart from '@/components/TrackingErrorChart'
import AzElPositionChart from '@/components/AzElPositionChart'
import RssiChart from '@/components/RssiChart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { SatelliteDataRow, ViewKey } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'
import { formatScrubMetric } from '@/lib/formatScrubMetric'
import { makeTimeTicks, makeRssiTicks, rssiToDbm } from '@/lib/timeSeriesChartLayout'

export type PdfReportType = 'dashboard' | 'azel' | 'pae' | 'rssi'

export interface DashboardPdfSnapshotProps {
  data: SatelliteDataRow[]
  index: number
  pdfPage?: { current: number; total: number }
  reportType?: PdfReportType
  combined?: ViewKey[]
}

/** Wide canvas; row heights tuned near A4 landscape aspect so PDF scale uses the page. */
const SNAPSHOT_W = 2000

/**
 * Negative spacing pulls chart cards together so the DOM stack is shorter; PDF fit uses a smaller
 * union height and often scales the page larger. Keep moderate to avoid hiding headings.
 */
const PDF_METRICS_UNDERLAP = 10
/** Extra pull-up of the path/sky row under the metrics strip (flex margins don’t collapse). */
const PDF_AFTER_METRICS = 8
const PDF_ROW_OVERLAP = 20
const PDF_PATH_SKY_OVERLAP = 12
const PDF_BOTTOM_PAIR_OVERLAP = 14

const SKY_METRICS_H = 82
const SKY_METRICS_GAP = 6

function PdfSkyMetricsPanel({ row, width }: { row: SatelliteDataRow; width: number }) {
  const cols = [
    { label: 'Azimuth', value: formatScrubMetric(row.cur_az, 3, '°') },
    { label: 'Elevation', value: formatScrubMetric(row.cur_el, 3, '°') },
    { label: 'RSSI', value: formatScrubMetric(rssiToDbm(row.rssi), 2, ' dBm') },
    { label: 'PAE X', value: formatScrubMetric(row.pae_joint_X, 4, '°') },
    { label: 'PAE Y', value: formatScrubMetric(row.pae_joint_Y, 4, '°') },
  ]
  const colW = width / cols.length
  const h = SKY_METRICS_H
  return (
    <svg
      width={width}
      height={h}
      viewBox={`0 0 ${width} ${h}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x={0.5} y={0.5} width={width - 1} height={h - 1} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={3} />
      {cols.map((c, i) => {
        const x = i * colW + 10
        return (
          <g key={c.label}>
            <text
              x={x}
              y={22}
              fontSize={11}
              fontWeight={600}
              fontFamily="system-ui,Segoe UI,sans-serif"
              fill="#6b7280"
              letterSpacing="0.07em"
            >
              {c.label.toUpperCase()}
            </text>
            <text
              x={x}
              y={60}
              fontSize={22}
              fontWeight={700}
              fontFamily="'Segoe UI',system-ui,sans-serif"
              fill="#111827"
            >
              {c.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function PdfTimelineMetricsBarSvg({ row }: { row: SatelliteDataRow }) {
  const cols = [
    { label: 'Azimuth', value: formatScrubMetric(row.cur_az, 3, '°'), color: '#60a5fa' },
    { label: 'Elevation', value: formatScrubMetric(row.cur_el, 3, '°'), color: '#fb923c' },
    { label: 'RSSI', value: formatScrubMetric(rssiToDbm(row.rssi), 2, ' dBm'), color: '#c084fc' },
    { label: 'PAE X', value: formatScrubMetric(row.pae_joint_X, 4, '°'), color: '#60a5fa' },
    { label: 'PAE Y', value: formatScrubMetric(row.pae_joint_Y, 4, '°'), color: '#ea580c' },
  ]
  const w = SNAPSHOT_W
  const colW = w / 5
  return (
    <svg
      width="100%"
      height="26"
      viewBox={`0 0 ${w} 26`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <rect x={0.5} y={0.5} width={w - 1} height={25} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={3} />
      {cols.map((c, i) => {
        const x = i * colW + 10
        return (
          <g key={c.label}>
            <text
              x={x}
              y={9}
              fontSize={7.5}
              fontWeight={600}
              fontFamily="system-ui,Segoe UI,sans-serif"
              fill="#546080"
              letterSpacing="0.06em"
            >
              {c.label.toUpperCase()}
            </text>
            <text
              x={x}
              y={21}
              fontSize={11.5}
              fontWeight={600}
              fontFamily="'Segoe UI',system-ui,sans-serif"
              fill={c.color}
            >
              {c.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const REPORT_LABELS: Record<PdfReportType, string> = {
  dashboard: 'Dashboard',
  azel: 'AZ / EL Position',
  pae: 'Pointing Accuracy Error',
  rssi: 'RSSI',
}

function PdfAzElMetricsBarSvg({ row }: { row: SatelliteDataRow }) {
  const cols = [
    { label: 'Azimuth', value: formatScrubMetric(row.cur_az, 3, '°'), color: '#60a5fa' },
    { label: 'Elevation', value: formatScrubMetric(row.cur_el, 3, '°'), color: '#fb923c' },
    { label: 'Target Az', value: formatScrubMetric(row.target_az, 3, '°'), color: '#93c5fd' },
    { label: 'Target El', value: formatScrubMetric(row.target_el, 3, '°'), color: '#fdba74' },
  ]
  const w = SNAPSHOT_W
  const colW = w / cols.length
  return (
    <svg width="100%" height="26" viewBox={`0 0 ${w} 26`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <rect x={0.5} y={0.5} width={w - 1} height={25} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={3} />
      {cols.map((c, i) => {
        const x = i * colW + 10
        return (
          <g key={c.label}>
            <text x={x} y={9} fontSize={7.5} fontWeight={600} fontFamily="system-ui,Segoe UI,sans-serif" fill="#546080" letterSpacing="0.06em">{c.label.toUpperCase()}</text>
            <text x={x} y={21} fontSize={11.5} fontWeight={600} fontFamily="'Segoe UI',system-ui,sans-serif" fill={c.color}>{c.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PdfPaeMetricsBarSvg({ row }: { row: SatelliteDataRow }) {
  const cols = [
    { label: 'PAE X', value: formatScrubMetric(row.pae_joint_X, 4, '°'), color: '#60a5fa' },
    { label: 'PAE Y', value: formatScrubMetric(row.pae_joint_Y, 4, '°'), color: '#ea580c' },
    { label: 'Azimuth', value: formatScrubMetric(row.cur_az, 3, '°'), color: '#94a3b8' },
    { label: 'Elevation', value: formatScrubMetric(row.cur_el, 3, '°'), color: '#94a3b8' },
  ]
  const w = SNAPSHOT_W
  const colW = w / cols.length
  return (
    <svg width="100%" height="26" viewBox={`0 0 ${w} 26`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <rect x={0.5} y={0.5} width={w - 1} height={25} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={3} />
      {cols.map((c, i) => {
        const x = i * colW + 10
        return (
          <g key={c.label}>
            <text x={x} y={9} fontSize={7.5} fontWeight={600} fontFamily="system-ui,Segoe UI,sans-serif" fill="#546080" letterSpacing="0.06em">{c.label.toUpperCase()}</text>
            <text x={x} y={21} fontSize={11.5} fontWeight={600} fontFamily="'Segoe UI',system-ui,sans-serif" fill={c.color}>{c.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PdfRssiMetricsBarSvg({ row }: { row: SatelliteDataRow }) {
  const cols = [
    { label: 'RSSI', value: formatScrubMetric(rssiToDbm(row.rssi), 2, ' dBm'), color: '#c084fc' },
    { label: 'Azimuth', value: formatScrubMetric(row.cur_az, 3, '°'), color: '#94a3b8' },
    { label: 'Elevation', value: formatScrubMetric(row.cur_el, 3, '°'), color: '#94a3b8' },
    { label: 'PAE X', value: formatScrubMetric(row.pae_joint_X, 4, '°'), color: '#94a3b8' },
  ]
  const w = SNAPSHOT_W
  const colW = w / cols.length
  return (
    <svg width="100%" height="26" viewBox={`0 0 ${w} 26`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <rect x={0.5} y={0.5} width={w - 1} height={25} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={3} />
      {cols.map((c, i) => {
        const x = i * colW + 10
        return (
          <g key={c.label}>
            <text x={x} y={9} fontSize={7.5} fontWeight={600} fontFamily="system-ui,Segoe UI,sans-serif" fill="#546080" letterSpacing="0.06em">{c.label.toUpperCase()}</text>
            <text x={x} y={21} fontSize={11.5} fontWeight={600} fontFamily="'Segoe UI',system-ui,sans-serif" fill={c.color}>{c.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

const STATIC_SAMPLE = 4
const STATIC_MARGIN = { top: 12, right: 24, bottom: 50, left: 90 }
const STATIC_AZEL_MARGIN = { top: 12, right: 90, bottom: 50, left: 90 }
const STATIC_HIDDEN = { hide: true, width: 0, domain: ['auto', 'auto'] as [string, string] }
const PDF_TICK = 22
const PDF_LABEL = 24

function StaticRssiChart({ data, combined, height }: { data: SatelliteDataRow[]; combined: ViewKey[]; height: number }) {
  const chartData = data.filter((_, i) => i % STATIC_SAMPLE === 0).map((r) => ({
    t: r.flightTimeMs,
    rssi: r.rssi,
    ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
    ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
  }))
  let rMin = Infinity, rMax = -Infinity
  for (const r of data) { if (r.rssi < rMin) rMin = r.rssi; if (r.rssi > rMax) rMax = r.rssi }
  const rssiTicks = makeRssiTicks(rMin, rMax)
  const rDomain: [number, number] = rssiTicks.length > 0 ? [rssiTicks[0], rssiTicks[rssiTicks.length - 1]] : [0, 1]
  const timeTicks = chartData.length > 0
    ? makeTimeTicks(chartData[0].t, chartData[chartData.length - 1].t, 10 * 60 * 1000)
    : []
  return (
    <div style={{ background: '#ffffff', borderRadius: 8, padding: 16, boxSizing: 'border-box' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={STATIC_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
          <XAxis dataKey="t" type="number" ticks={timeTicks} tickFormatter={formatFlightTime} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'Flight Time', position: 'insideBottom', offset: -24, fontSize: PDF_LABEL }} />
          <YAxis yAxisId="rssi" orientation="left" width={90} domain={rDomain} ticks={rssiTicks}
            tickFormatter={(v: number) => rssiToDbm(v).toFixed(1)} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'RSSI (dBm)', angle: -90, position: 'insideLeft', offset: 20, fontSize: PDF_LABEL }} />
          {combined.includes('pae') && <YAxis yAxisId="paeX" {...STATIC_HIDDEN} />}
          {combined.includes('pae') && <YAxis yAxisId="paeY" {...STATIC_HIDDEN} />}
          {combined.includes('azel') && <YAxis yAxisId="az" {...STATIC_HIDDEN} />}
          {combined.includes('azel') && <YAxis yAxisId="el" {...STATIC_HIDDEN} />}
          <Line yAxisId="rssi" type="monotone" dataKey="rssi" stroke="#7c3aed" dot={false} strokeWidth={2} isAnimationActive={false} />
          {combined.includes('pae') && <Line yAxisId="paeX" type="monotone" dataKey="paeX" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('pae') && <Line yAxisId="paeY" type="monotone" dataKey="paeY" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('azel') && <Line yAxisId="az" type="monotone" dataKey="az" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('azel') && <Line yAxisId="el" type="monotone" dataKey="el" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StaticPaeChart({ data, combined, height }: { data: SatelliteDataRow[]; combined: ViewKey[]; height: number }) {
  const chartData = data.filter((_, i) => i % STATIC_SAMPLE === 0).map((r) => ({
    t: r.flightTimeMs,
    paeX: r.pae_joint_X,
    paeY: r.pae_joint_Y,
    ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
    ...(combined.includes('azel') ? { az: r.cur_az, el: r.cur_el } : {}),
  }))
  let pMin = Infinity, pMax = -Infinity
  for (const r of data) {
    if (r.pae_joint_X < pMin) pMin = r.pae_joint_X; if (r.pae_joint_X > pMax) pMax = r.pae_joint_X
    if (r.pae_joint_Y < pMin) pMin = r.pae_joint_Y; if (r.pae_joint_Y > pMax) pMax = r.pae_joint_Y
  }
  const pPad = Math.max((pMax - pMin) * 0.05, 0.0001)
  const pDomain: [number, number] = Number.isFinite(pMin) ? [pMin - pPad, pMax + pPad] : [0, 1]
  const timeTicks = chartData.length > 0
    ? makeTimeTicks(chartData[0].t, chartData[chartData.length - 1].t, 10 * 60 * 1000)
    : []
  return (
    <div style={{ background: '#ffffff', borderRadius: 8, padding: 16, boxSizing: 'border-box' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={STATIC_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
          <XAxis dataKey="t" type="number" ticks={timeTicks} tickFormatter={formatFlightTime} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'Flight Time', position: 'insideBottom', offset: -24, fontSize: PDF_LABEL }} />
          <YAxis yAxisId="pae" orientation="left" width={90} domain={pDomain} tickFormatter={(v: number) => v.toFixed(3)} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'PAE (°)', angle: -90, position: 'insideLeft', offset: 20, fontSize: PDF_LABEL }} />
          {combined.includes('rssi') && <YAxis yAxisId="rssi" {...STATIC_HIDDEN} />}
          {combined.includes('azel') && <YAxis yAxisId="az" {...STATIC_HIDDEN} />}
          {combined.includes('azel') && <YAxis yAxisId="el" {...STATIC_HIDDEN} />}
          <Line yAxisId="pae" type="monotone" dataKey="paeX" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line yAxisId="pae" type="monotone" dataKey="paeY" stroke="#2563eb" strokeDasharray="5 3" dot={false} strokeWidth={2} isAnimationActive={false} />
          {combined.includes('rssi') && <Line yAxisId="rssi" type="monotone" dataKey="rssi" stroke="#7c3aed" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('azel') && <Line yAxisId="az" type="monotone" dataKey="az" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('azel') && <Line yAxisId="el" type="monotone" dataKey="el" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StaticAzElChart({ data, combined, height }: { data: SatelliteDataRow[]; combined: ViewKey[]; height: number }) {
  const chartData = data.filter((_, i) => i % STATIC_SAMPLE === 0).map((r) => ({
    t: r.flightTimeMs,
    az: r.cur_az,
    el: r.cur_el,
    ...(combined.includes('pae') ? { paeX: r.pae_joint_X, paeY: r.pae_joint_Y } : {}),
    ...(combined.includes('rssi') ? { rssi: r.rssi } : {}),
  }))
  let azMin = Infinity, azMax = -Infinity, elMin = Infinity, elMax = -Infinity
  for (const r of data) {
    if (r.cur_az < azMin) azMin = r.cur_az; if (r.cur_az > azMax) azMax = r.cur_az
    if (r.cur_el < elMin) elMin = r.cur_el; if (r.cur_el > elMax) elMax = r.cur_el
  }
  const azPad = Math.max((azMax - azMin) * 0.05, 0.1)
  const elPad = Math.max((elMax - elMin) * 0.05, 0.1)
  const azDomain: [number, number] = Number.isFinite(azMin) ? [azMin - azPad, azMax + azPad] : [0, 1]
  const elDomain: [number, number] = Number.isFinite(elMin) ? [elMin - elPad, elMax + elPad] : [0, 1]
  const timeTicks = chartData.length > 0
    ? makeTimeTicks(chartData[0].t, chartData[chartData.length - 1].t, 10 * 60 * 1000)
    : []
  return (
    <div style={{ background: '#ffffff', borderRadius: 8, padding: 16, boxSizing: 'border-box' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={STATIC_AZEL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c4c9d4" />
          <XAxis dataKey="t" type="number" ticks={timeTicks} tickFormatter={formatFlightTime} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'Flight Time', position: 'insideBottom', offset: -24, fontSize: PDF_LABEL }} />
          <YAxis yAxisId="az" orientation="left" width={90} domain={azDomain} tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'Az (°)', angle: -90, position: 'insideLeft', offset: 20, fontSize: PDF_LABEL }} />
          <YAxis yAxisId="el" orientation="right" width={90} domain={elDomain} tickFormatter={(v: number) => v.toFixed(1)} tick={{ fontSize: PDF_TICK }}
            label={{ value: 'El (°)', angle: 90, position: 'insideRight', offset: 20, fontSize: PDF_LABEL }} />
          {combined.includes('pae') && <YAxis yAxisId="paeX" {...STATIC_HIDDEN} />}
          {combined.includes('pae') && <YAxis yAxisId="paeY" {...STATIC_HIDDEN} />}
          {combined.includes('rssi') && <YAxis yAxisId="rssi" {...STATIC_HIDDEN} />}
          <Line yAxisId="az" type="monotone" dataKey="az" stroke="#2563eb" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line yAxisId="el" type="monotone" dataKey="el" stroke="#ea580c" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          {combined.includes('pae') && <Line yAxisId="paeX" type="monotone" dataKey="paeX" stroke="#16a34a" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('pae') && <Line yAxisId="paeY" type="monotone" dataKey="paeY" stroke="#0891b2" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
          {combined.includes('rssi') && <Line yAxisId="rssi" type="monotone" dataKey="rssi" stroke="#7c3aed" strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const DashboardPdfSnapshot = memo(
  forwardRef<HTMLDivElement, DashboardPdfSnapshotProps>(function DashboardPdfSnapshot(
    { data, index, pdfPage, reportType = 'dashboard', combined = [] },
    ref,
  ) {
    const total = data.length
    const t = data[index]?.flightTimeMs ?? 0
    const row = data[index]
    const pdfBit = pdfPage != null ? `PDF ${pdfPage.current}/${pdfPage.total} · ` : ''
    const reportLabel = REPORT_LABELS[reportType]

    const skyInner = 420
    /** Must match `SkyPlot` `compact` gutter (see SkyPlot.tsx) so the cell is not narrower than the SVG. */
    const skyOuterPad = 36
    const skyOuter = skyInner + 2 * skyOuterPad
    const pathH = skyOuter + SKY_METRICS_H + SKY_METRICS_GAP
    const azElH = 340
    const bottomH = 398

    const singleChartH = 920

    return (
      <div
        ref={ref}
        className="pdf-export-snapshot"
        style={{
          width: SNAPSHOT_W,
          maxWidth: '100%',
          background: '#ffffff',
          padding: '0 2px 1px',
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        <div className="pdf-export-header">
          Intellian · {reportLabel} · {pdfBit}sample {index + 1}/{total} · {formatFlightTime(t)}
        </div>

        {reportType === 'dashboard' && (
          <div className="pdf-export-charts" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, overflow: 'visible' }}>
            {row ? (
              <div style={{ marginBottom: -PDF_METRICS_UNDERLAP }}>
                <PdfTimelineMetricsBarSvg row={row} />
              </div>
            ) : null}
            <div
              style={{
                marginTop: row ? -PDF_AFTER_METRICS : 0,
                display: 'grid',
                gridTemplateColumns: `minmax(0, 1fr) ${skyOuter}px`,
                columnGap: 0,
                alignItems: 'stretch',
                overflow: 'visible',
              }}
            >
              <div style={{ minWidth: 0, marginRight: -PDF_PATH_SKY_OVERLAP, position: 'relative', zIndex: 1 }}>
                <TrackingPathChart data={data} currentIndex={index} height={pathH} compactExport />
              </div>
              <div
                className="pdf-sky-cell"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                  gap: SKY_METRICS_GAP, width: skyOuter, minWidth: skyOuter, maxWidth: skyOuter,
                  marginLeft: -PDF_PATH_SKY_OVERLAP, position: 'relative', zIndex: 2, overflow: 'visible',
                }}
              >
                {row && <PdfSkyMetricsPanel row={row} width={skyOuter} />}
                <SkyPlot data={data} currentIndex={index} size={skyInner} compact />
              </div>
            </div>
            <div style={{ marginTop: -PDF_ROW_OVERLAP, position: 'relative', zIndex: 3 }}>
              <AzElPositionChart data={data} currentIndex={index} height={azElH} showHeading forPdf />
            </div>
            <div
              style={{
                marginTop: -PDF_ROW_OVERLAP, position: 'relative', zIndex: 4,
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: 0, alignItems: 'stretch',
              }}
            >
              <div style={{ marginRight: -PDF_BOTTOM_PAIR_OVERLAP, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <TrackingErrorChart data={data} currentIndex={index} height={bottomH} showHeading forPdf />
              </div>
              <div style={{ marginLeft: -PDF_BOTTOM_PAIR_OVERLAP, minWidth: 0, position: 'relative', zIndex: 2 }}>
                <RssiChart data={data} currentIndex={index} height={bottomH} showHeading forPdf />
              </div>
            </div>
          </div>
        )}

        {reportType === 'azel' && (
          <div className="pdf-export-charts" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, overflow: 'visible' }}>
            {row ? (
              <div style={{ marginBottom: -PDF_METRICS_UNDERLAP }}>
                <PdfAzElMetricsBarSvg row={row} />
              </div>
            ) : null}
            <div
              style={{
                marginTop: row ? -PDF_AFTER_METRICS : 0,
                display: 'grid',
                gridTemplateColumns: `minmax(0, 1fr) ${skyOuter}px`,
                columnGap: 0,
                alignItems: 'stretch',
                overflow: 'visible',
              }}
            >
              <div style={{ minWidth: 0, marginRight: -PDF_PATH_SKY_OVERLAP, position: 'relative', zIndex: 1 }}>
                {combined.length > 0 ? (
                  <StaticAzElChart data={data} combined={combined} height={singleChartH} />
                ) : (
                  <AzElPositionChart data={data} currentIndex={index} height={singleChartH} showHeading forPdf />
                )}
              </div>
              <div
                className="pdf-sky-cell"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
                  gap: SKY_METRICS_GAP, width: skyOuter, minWidth: skyOuter, maxWidth: skyOuter,
                  marginLeft: -PDF_PATH_SKY_OVERLAP, position: 'relative', zIndex: 2, overflow: 'visible',
                }}
              >
                {row && <PdfSkyMetricsPanel row={row} width={skyOuter} />}
                <SkyPlot data={data} currentIndex={index} size={skyInner} compact />
              </div>
            </div>
          </div>
        )}

        {reportType === 'pae' && (
          <div className="pdf-export-charts" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, overflow: 'visible' }}>
            {row ? (
              <div style={{ marginBottom: -PDF_METRICS_UNDERLAP }}>
                <PdfPaeMetricsBarSvg row={row} />
              </div>
            ) : null}
            <div style={{ marginTop: row ? -PDF_AFTER_METRICS : 0 }}>
              {combined.length > 0 ? (
                <StaticPaeChart data={data} combined={combined} height={singleChartH} />
              ) : (
                <TrackingErrorChart data={data} currentIndex={index} height={singleChartH} showHeading forPdf />
              )}
            </div>
          </div>
        )}

        {reportType === 'rssi' && (
          <div className="pdf-export-charts" style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0, overflow: 'visible' }}>
            {row ? (
              <div style={{ marginBottom: -PDF_METRICS_UNDERLAP }}>
                <PdfRssiMetricsBarSvg row={row} />
              </div>
            ) : null}
            <div style={{ marginTop: row ? -PDF_AFTER_METRICS : 0 }}>
              {combined.length > 0 ? (
                <StaticRssiChart data={data} combined={combined} height={singleChartH} />
              ) : (
                <RssiChart data={data} currentIndex={index} height={singleChartH} showHeading forPdf />
              )}
            </div>
          </div>
        )}
      </div>
    )
  }),
)

export default DashboardPdfSnapshot
