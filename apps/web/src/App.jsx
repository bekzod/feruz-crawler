import { useEffect, useState } from 'react'
import Listings from './pages/Listings.jsx'
import Presets from './pages/Presets.jsx'
import Jobs from './pages/Jobs.jsx'
import Notifications from './pages/Notifications.jsx'
import './App.css'

const TABS = { listings: Listings, presets: Presets, jobs: Jobs, notifications: Notifications }
const DEFAULT_TAB = 'listings'

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
  const Active = TABS[tab]

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
    <div className="app">
      <nav className="nav">
        <h1>feruz-crawler</h1>
        {Object.keys(TABS).map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => selectTab(t)}>{t}</button>
        ))}
      </nav>
      <main><Active /></main>
    </div>
  )
}
