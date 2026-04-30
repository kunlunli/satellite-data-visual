'use client'

export type View = 'dashboard' | 'azel' | 'pae' | 'rssi'

interface NavItem {
  id: View
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
      </svg>
    ),
  },
  {
    id: 'azel',
    label: 'AZ / EL',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      </svg>
    ),
  },
  {
    id: 'pae',
    label: 'PAE',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="7" x2="12" y2="3" />
        <line x1="17" y1="12" x2="21" y2="12" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="7" y1="12" x2="3" y2="12" />
      </svg>
    ),
  },
  {
    id: 'rssi',
    label: 'RSSI',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 18h2V9H3zM7 18h2V6H7zM11 18h2V3h-2zM15 18h2V9h-2zM19 18h2v-5h-2z" />
      </svg>
    ),
  },
]

interface Props {
  activeView: View
  onViewChange: (v: View) => void
  fileName: string
  hasData: boolean
  onLoadNewFile: () => void
}

export default function Sidebar({ activeView, onViewChange, fileName, hasData, onLoadNewFile }: Props) {
  return (
    <aside className="app-sidebar w-48 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="sidebar-logo-area">
        <svg
          style={{ color: 'var(--amber)', width: 18, height: 18, flexShrink: 0 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="3" x2="12" y2="8" />
          <line x1="12" y1="16" x2="12" y2="21" />
          <line x1="3" y1="12" x2="8" y2="12" />
          <line x1="16" y1="12" x2="21" y2="12" />
        </svg>
        <span className="sidebar-logo-text">Intellian</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3">
        <p className="sidebar-section-label">// Views</p>
        {NAV_ITEMS.map((item) => {
          const active = hasData && activeView === item.id
          const disabled = !hasData
          return (
            <button
              key={item.id}
              onClick={() => !disabled && onViewChange(item.id)}
              disabled={disabled}
              className={`sidebar-nav-item${active ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {fileName && (
          <p className="sidebar-filename" title={fileName}>{fileName}</p>
        )}
        <button onClick={onLoadNewFile} className="sidebar-load-btn">
          <svg style={{ width: 12, height: 12, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 12l-4-4m0 0l-4 4m4-4v12" />
          </svg>
          Load new file
        </button>
      </div>
    </aside>
  )
}
