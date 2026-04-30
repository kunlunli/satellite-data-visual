'use client'

import { forwardRef, memo } from 'react'
import TrackingPathChart from '@/components/TrackingPathChart'
import SkyPlot from '@/components/SkyPlot'
import TrackingErrorChart from '@/components/TrackingErrorChart'
import AzElPositionChart from '@/components/AzElPositionChart'
import RssiChart from '@/components/RssiChart'
import type { SatelliteDataRow } from '@/lib/types'
import { formatFlightTime } from '@/lib/parseData'
import { formatScrubMetric } from '@/lib/formatScrubMetric'

export interface DashboardPdfSnapshotProps {
  data: SatelliteDataRow[]
  index: number
  pdfPage?: { current: number; total: number }
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
    { label: 'RSSI', value: formatScrubMetric(row.rssi, 1) },
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
    { label: 'RSSI', value: formatScrubMetric(row.rssi, 1), color: '#c084fc' },
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

const DashboardPdfSnapshot = memo(
  forwardRef<HTMLDivElement, DashboardPdfSnapshotProps>(function DashboardPdfSnapshot(
    { data, index, pdfPage },
    ref,
  ) {
    const total = data.length
    const t = data[index]?.flightTimeMs ?? 0
    const row = data[index]
    const pdfBit = pdfPage != null ? `PDF ${pdfPage.current}/${pdfPage.total} · ` : ''

    const skyInner = 420
    /** Must match `SkyPlot` `compact` gutter (see SkyPlot.tsx) so the cell is not narrower than the SVG. */
    const skyOuterPad = 36
    const skyOuter = skyInner + 2 * skyOuterPad
    const pathH = skyOuter + SKY_METRICS_H + SKY_METRICS_GAP
    const azElH = 340
    const bottomH = 398

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
          Intellian · Dashboard · {pdfBit}sample {index + 1}/{total} · {formatFlightTime(t)}
        </div>
        <div
          className="pdf-export-charts"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            minWidth: 0,
            overflow: 'visible',
          }}
        >
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
            <div
              style={{
                minWidth: 0,
                marginRight: -PDF_PATH_SKY_OVERLAP,
                position: 'relative',
                zIndex: 1,
              }}
            >
              <TrackingPathChart
                data={data}
                currentIndex={index}
                height={pathH}
                compactExport
              />
            </div>
            <div
              className="pdf-sky-cell"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: SKY_METRICS_GAP,
                width: skyOuter,
                minWidth: skyOuter,
                maxWidth: skyOuter,
                marginLeft: -PDF_PATH_SKY_OVERLAP,
                position: 'relative',
                zIndex: 2,
                overflow: 'visible',
              }}
            >
              {row && <PdfSkyMetricsPanel row={row} width={skyOuter} />}
              <SkyPlot data={data} currentIndex={index} size={skyInner} compact />
            </div>
          </div>

          <div style={{ marginTop: -PDF_ROW_OVERLAP, position: 'relative', zIndex: 3 }}>
            <AzElPositionChart data={data} currentIndex={index} height={azElH} showHeading />
          </div>

          <div
            style={{
              marginTop: -PDF_ROW_OVERLAP,
              position: 'relative',
              zIndex: 4,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              columnGap: 0,
              alignItems: 'stretch',
            }}
          >
            <div style={{ marginRight: -PDF_BOTTOM_PAIR_OVERLAP, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <TrackingErrorChart data={data} currentIndex={index} height={bottomH} showHeading />
            </div>
            <div style={{ marginLeft: -PDF_BOTTOM_PAIR_OVERLAP, minWidth: 0, position: 'relative', zIndex: 2 }}>
              <RssiChart data={data} currentIndex={index} height={bottomH} showHeading />
            </div>
          </div>
        </div>
      </div>
    )
  }),
)

export default DashboardPdfSnapshot
