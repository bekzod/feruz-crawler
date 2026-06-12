import { useEffect, useState } from 'react'
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
const DEFAULT_TAB = 'overview'

function readTabFromUrl() {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return Object.hasOwn(TABS, tab) ? tab : DEFAULT_TAB
}

function writeTabToUrl(tab, { replace = false } = {}) {
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)

  const method = replace ? 'replaceState' : 'pushState'
  window.history[method](null, '', url)
}

export default function App() {
  const [tab, setTab] = useState(readTabFromUrl)
  const { label, Component: Active } = TABS[tab]

  useEffect(() => {
    writeTabToUrl(readTabFromUrl(), { replace: true })

    function handlePopState() {
      setTab(readTabFromUrl())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function selectTab(nextTab) {
    if (nextTab === tab) return
    writeTabToUrl(nextTab)
    setTab(nextTab)
  }

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
            <button key={key} className={key === tab ? 'active' : ''} onClick={() => selectTab(key)}>
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
            <button className="secondary-action" onClick={() => selectTab('jobs')}>View queues</button>
            <button className="primary-action" onClick={() => selectTab('presets')}>Run preset</button>
          </div>
        </header>
        <Active onNavigate={selectTab} />
      </main>
    </div>
  )
}
