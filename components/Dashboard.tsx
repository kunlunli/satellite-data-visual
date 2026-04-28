'use client'

import { useState, useCallback } from 'react'
import Sidebar, { type View } from './Sidebar'
import FileUpload from './FileUpload'
import MotorAnglesChart from './MotorAnglesChart'
import AzimuthChart from './AzimuthChart'
import ElevationChart from './ElevationChart'
import TrackingErrorChart from './TrackingErrorChart'
import RssiChart from './RssiChart'
import type { SatelliteDataRow } from '@/lib/types'
import { parseLogFile, formatFlightTime } from '@/lib/parseData'

export default function Dashboard() {
  const [data, setData] = useState<SatelliteDataRow[]>([])
  const [fileName, setFileName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeView, setActiveView] = useState<View>('dashboard')

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    setError('')
    try {
      const parsed = await parseLogFile(file)
      setData(parsed)
      setCurrentIndex(0)
      setFileName(file.name)
      setActiveView('dashboard')
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
  }, [])

  const hasData = data.length > 0
  const totalMs = hasData ? data[data.length - 1].flightTimeMs : 0
  const currentTime = hasData ? data[currentIndex].flightTimeMs : 0

  const chartProps = { data, currentIndex }

  return (
    <div className="h-screen flex flex-col">
      {/* Top header */}
      <header className="app-header px-4 py-2 flex items-center gap-4 z-10">
        <div className="w-48 shrink-0" />
        <div className="flex-1">
          <span className="header-wordmark">SAT<span>VIS</span></span>
        </div>
      </header>

      {/* Body: sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          fileName={fileName}
          hasData={hasData}
          onLoadNewFile={handleLoadNew}
        />

        <main className="flex-1 overflow-auto flex flex-col">
          {hasData && (
            <div className="timeline-float">
              <div className="timeline-float-header">
                <span className="timeline-float-label">Timeline</span>
                <span className="timeline-float-count">{currentIndex + 1} / {data.length}</span>
              </div>
              <div className="timeline-float-row">
                <span className="timeline-float-time">{formatFlightTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={data.length - 1}
                  value={currentIndex}
                  onChange={(e) => setCurrentIndex(Number(e.target.value))}
                />
                <span className="timeline-float-time end">{formatFlightTime(totalMs)}</span>
              </div>
            </div>
          )}

          {!hasData ? (
            <div className="upload-screen flex-1 flex flex-col items-center justify-center gap-8 p-8">
              <div className="upload-screen-header">
                <p className="system-badge">SATVIS // GROUND CONTROL INTERFACE v2.1</p>
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
            <div className="p-3">
              {activeView === 'dashboard' && (
                <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <MotorAnglesChart {...chartProps} />
                  <AzimuthChart {...chartProps} />
                  <ElevationChart {...chartProps} />
                  <TrackingErrorChart {...chartProps} />
                  <RssiChart {...chartProps} />
                </div>
              )}

              {activeView === 'motor' && (
                <FocusedView title="Motor Angles">
                  <MotorFull {...chartProps} />
                </FocusedView>
              )}

              {activeView === 'azimuth' && (
                <FocusedView title="Azimuth">
                  <AzimuthFull {...chartProps} />
                </FocusedView>
              )}

              {activeView === 'elevation' && (
                <FocusedView title="Elevation">
                  <ElevationFull {...chartProps} />
                </FocusedView>
              )}

              {activeView === 'pae' && (
                <FocusedView title="Pointing Accuracy Error">
                  <PaeFull {...chartProps} />
                </FocusedView>
              )}

              {activeView === 'rssi' && (
                <FocusedView title="RSSI">
                  <RssiFull {...chartProps} />
                </FocusedView>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function FocusedView({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  )
}

/* ── Expanded single-chart variants ────────────────────────────────── */

import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import { useMemo } from 'react'

interface CP { data: SatelliteDataRow[]; currentIndex: number }

const FULL_SAMPLE = 4

const FULL_MARGIN = { top: 12, right: 24, bottom: 32, left: 40 }

function MotorFull({ data, currentIndex }: CP) {
  const chartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, jointY: r.cur_joint_Y, jointX: r.cur_joint_X })),
    [data],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={chartData} margin={FULL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime} tick={{ fontSize: 10 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
          <Tooltip labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]} />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="jointY" name="Current Y Axis" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="jointX" name="Current X Axis" stroke="#f97316" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function AzimuthFull({ data, currentIndex }: CP) {
  const chartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, cur: r.cur_az, target: r.target_az })),
    [data],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={chartData} margin={FULL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime} tick={{ fontSize: 10 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
          <Tooltip labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]} />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="cur" name="Current AZ" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="target" name="Target AZ" stroke="#f97316" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ElevationFull({ data, currentIndex }: CP) {
  const chartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, cur: r.cur_el, target: r.target_el })),
    [data],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={chartData} margin={FULL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime} tick={{ fontSize: 10 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
          <Tooltip labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(3) + '°', name]} />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="cur" name="Current EL" stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="target" name="Target EL" stroke="#f97316" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PaeFull({ data, currentIndex }: CP) {
  const chartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, paeX: r.pae_joint_X, paeY: r.pae_joint_Y })),
    [data],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={chartData} margin={FULL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime} tick={{ fontSize: 10 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'deg', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
          <Tooltip labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number, name: string) => [v.toFixed(4) + '°', name]} />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="paeX" name="PAE X" stroke="#ef4444" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="paeY" name="PAE Y" stroke="#06b6d4" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function RssiFull({ data, currentIndex }: CP) {
  const chartData = useMemo(
    () => data.filter((_, i) => i % FULL_SAMPLE === 0)
      .map((r) => ({ t: r.flightTimeMs, rssi: r.rssi })),
    [data],
  )
  const currentTime = data[currentIndex]?.flightTimeMs ?? 0
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <ResponsiveContainer width="100%" height={460}>
        <LineChart data={chartData} margin={FULL_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
            tickFormatter={formatFlightTime} tick={{ fontSize: 10 }}
            label={{ value: 'Time', position: 'insideBottom', offset: -16, fontSize: 12 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }}
            label={{ value: 'RSSI', angle: -90, position: 'insideLeft', offset: 16, fontSize: 12 }} />
          <Tooltip labelFormatter={(v) => formatFlightTime(Number(v))}
            formatter={(v: number) => [v.toFixed(1), 'RSSI']} />
          <Line type="monotone" dataKey="rssi" name="RSSI" stroke="#7c3aed" dot={false} strokeWidth={2} isAnimationActive={false} />
          <ReferenceLine x={currentTime} stroke="#10b981" strokeDasharray="4 2" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
