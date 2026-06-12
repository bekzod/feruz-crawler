import { useState } from 'react'
import Overview from './pages/Overview.jsx'
import Listings from './pages/Listings.jsx'
import Presets from './pages/Presets.jsx'
import Jobs from './pages/Jobs.jsx'
import Notifications from './pages/Notifications.jsx'
import './App.css'

const TABS = {
  overview: { label: 'Overview', Component: Overview },
  listings: { label: 'Listings', Component: Listings },
  presets: { label: 'Presets', Component: Presets },
  jobs: { label: 'Jobs', Component: Jobs },
  notifications: { label: 'Notifications', Component: Notifications },
}

export default function App() {
  const [tab, setTab] = useState('overview')
  const { label, Component: Active } = TABS[tab]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">FC</span>
          <div>
            <h1>feruz-crawler</h1>
            <p>Japan listing ops</p>
          </div>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {Object.entries(TABS).map(([key, item]) => (
            <button key={key} className={key === tab ? 'active' : ''} onClick={() => setTab(key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot healthy" />
          <span>Command center</span>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Operations</span>
            <h2>{label}</h2>
          </div>
          <div className="topbar-actions">
            <span className="system-pill">API / Worker</span>
            <button className="secondary-action" onClick={() => setTab('jobs')}>View queues</button>
            <button className="primary-action" onClick={() => setTab('presets')}>Run preset</button>
          </div>
        </header>
        <Active onNavigate={setTab} />
      </main>
    </div>
  )
}
