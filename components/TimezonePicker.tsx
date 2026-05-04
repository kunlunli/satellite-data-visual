'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

const TIMEZONE_LIST = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Fiji',
]

interface Props {
  timezone: string | null
  onSelect: (tz: string | null) => void
}

export function TimezonePicker({ timezone, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const localTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return TIMEZONE_LIST
    return TIMEZONE_LIST.filter((tz) => tz.toLowerCase().includes(q))
  }, [search])

  useEffect(() => {
    if (open) {
      setSearch('')
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        setDropPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
      }
      setTimeout(() => searchRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  const pick = (tz: string | null) => {
    onSelect(tz)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`header-tz-btn${timezone !== null ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Select time zone for chart X-axes"
      >
        TIME ZONE
      </button>

      {open && dropPos && (
        <div
          ref={dropdownRef}
          className="tz-dropdown"
          style={{ top: dropPos.top, right: dropPos.right }}
          role="dialog"
          aria-modal="true"
          aria-label="Select time zone"
        >
          <h2 className="tz-modal-title">Time Zone</h2>

          <div className="tz-special-row">
            <button
              type="button"
              className={`tz-special-btn${timezone === null ? ' selected' : ''}`}
              onClick={() => pick(null)}
            >
              Flight Time
              <span className="tz-special-sub">elapsed</span>
            </button>
            <button
              type="button"
              className={`tz-special-btn${timezone === localTz ? ' selected' : ''}`}
              onClick={() => pick(localTz)}
            >
              Local
              <span className="tz-special-sub">{localTz}</span>
            </button>
          </div>

          <input
            ref={searchRef}
            type="text"
            className="tz-search"
            placeholder="Search timezones…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="tz-list">
            {filtered.length === 0 && (
              <p className="tz-empty">No matches</p>
            )}
            {filtered.map((tz) => (
              <button
                key={tz}
                type="button"
                className={`tz-option${timezone === tz ? ' selected' : ''}`}
                onClick={() => pick(tz)}
              >
                {tz.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
