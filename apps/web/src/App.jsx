import { useState } from 'react'
import Listings from './pages/Listings.jsx'
import Presets from './pages/Presets.jsx'
import Jobs from './pages/Jobs.jsx'
import Notifications from './pages/Notifications.jsx'
import './App.css'

const TABS = { listings: Listings, presets: Presets, jobs: Jobs, notifications: Notifications }

export default function App() {
  const [tab, setTab] = useState('listings')
  const Active = TABS[tab]
  return (
    <div className="app">
      <nav className="nav">
        <h1>feruz-crawler</h1>
        {Object.keys(TABS).map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <main><Active /></main>
    </div>
  )
}
