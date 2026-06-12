import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import {
  countUnreadNotifications,
  flattenFailedJobs,
  summarizeJobs,
  summarizeListings,
  summarizePresets,
} from '../dashboard.js'

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString()
}

function formatYen(value) {
  return value == null ? '—' : `¥${Number(value).toLocaleString()}`
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

function StatusMetric({ label, value, tone = 'neutral', detail }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export default function Overview({ onNavigate }) {
  const [jobs, setJobs] = useState(null)
  const [presets, setPresets] = useState([])
  const [notifications, setNotifications] = useState([])
  const [listings, setListings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function load() {
    setIsLoading(true)
    try {
      const [jobsData, presetsData, notificationsData, listingsData] = await Promise.all([
        api.jobs(),
        api.presets(),
        api.notifications(),
        api.listings('?status=active&limit=8'),
      ])
      setJobs(jobsData)
      setPresets(presetsData)
      setNotifications(notificationsData)
      setListings(listingsData.rows ?? [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      try {
        const [jobsData, presetsData, notificationsData, listingsData] = await Promise.all([
          api.jobs(),
          api.presets(),
          api.notifications(),
          api.listings('?status=active&limit=8'),
        ])
        if (!cancelled) {
          setJobs(jobsData)
          setPresets(presetsData)
          setNotifications(notificationsData)
          setListings(listingsData.rows ?? [])
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadInitial()
    return () => { cancelled = true }
  }, [])

  const jobSummary = useMemo(() => summarizeJobs(jobs), [jobs])
  const presetSummary = useMemo(() => summarizePresets(presets), [presets])
  const listingSummary = useMemo(() => summarizeListings(listings), [listings])
  const failedJobs = useMemo(() => flattenFailedJobs(jobs).slice(0, 5), [jobs])
  const unreadCount = countUnreadNotifications(notifications)
  const activePreset = presets.find((preset) => preset.enabled)
  const healthTitle = error
    ? 'Backend connection needs attention'
    : jobSummary.hasFailures
      ? 'Crawler needs attention'
      : 'Crawler is operating normally'

  async function runPreset(id) {
    try {
      await api.runPreset(id)
      setMessage('Preset run queued.')
      await load()
    } catch (e) {
      setMessage(e.message)
    }
  }

  if (isLoading) {
    return (
      <section className="page-stack">
        <div className="hero-panel">
          <span className="spinner" aria-label="Loading dashboard" role="status" />
          <span>Loading command center...</span>
        </div>
      </section>
    )
  }

  return (
    <section className="page-stack">
      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <section className="hero-panel">
        <div>
          <span className="eyebrow">Live crawler state</span>
          <h3>{healthTitle}</h3>
          <p>{error ? 'The command center is reachable, but live crawler data could not be loaded.' : 'Monitor queues, act on failures, run presets, and review fresh listings from one place.'}</p>
        </div>
        <div className="hero-actions">
          <button className="secondary-action" onClick={load}>Refresh</button>
          <button className="primary-action" onClick={() => onNavigate('presets')}>Create preset</button>
        </div>
      </section>

      <section className="metric-grid">
        <StatusMetric label="Active jobs" value={jobSummary.active} tone="info" detail={`${jobSummary.waiting} waiting`} />
        <StatusMetric label="Failed jobs" value={jobSummary.failed} tone={jobSummary.failed ? 'danger' : 'success'} detail="across both queues" />
        <StatusMetric label="Unread alerts" value={unreadCount} tone={unreadCount ? 'warning' : 'success'} detail="new matches" />
        <StatusMetric label="Enabled presets" value={presetSummary.enabled} tone="info" detail={`${presetSummary.paused} paused`} />
        <StatusMetric label="Active listings" value={listingSummary.active} tone="neutral" detail={`${listingSummary.sold} sold removed`} />
      </section>

      <section className="overview-grid">
        <div className="panel panel-large">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Triage</span>
              <h3>Recent failures</h3>
            </div>
            <button className="link-button" onClick={() => onNavigate('jobs')}>Open jobs</button>
          </div>
          {failedJobs.length ? (
            <div className="issue-list">
              {failedJobs.map((job) => (
                <div className="issue-row" key={`${job.queue}-${job.id}`}>
                  <span className="status-chip danger">{job.queue}</span>
                  <div>
                    <strong>#{job.id} {job.name}</strong>
                    <p>{job.reason || 'No failure reason recorded.'}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No failed crawler jobs right now.</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Run control</span>
              <h3>Active preset</h3>
            </div>
            <button className="link-button" onClick={() => onNavigate('presets')}>Manage</button>
          </div>
          {activePreset ? (
            <div className="preset-focus">
              <strong>{activePreset.name}</strong>
              <dl>
                <div><dt>Sites</dt><dd>{(activePreset.sites ?? []).join(', ') || '—'}</dd></div>
                <div><dt>Last run</dt><dd>{formatDate(activePreset.lastRunAt)}</dd></div>
                <div><dt>Telegram</dt><dd>{activePreset.telegramChatId ? 'Configured' : 'Not set'}</dd></div>
              </dl>
              <button className="primary-action full-width" onClick={() => runPreset(activePreset.id)}>Run now</button>
            </div>
          ) : (
            <div className="empty-state">No enabled preset yet.</div>
          )}
        </div>
      </section>

      <section className="overview-grid">
        <div className="panel panel-large">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Inventory</span>
              <h3>Fresh active listings</h3>
            </div>
            <button className="link-button" onClick={() => onNavigate('listings')}>Open listings</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Car</th><th>Source</th><th>Year</th><th>Price</th><th>Mileage</th><th>Status</th></tr>
              </thead>
              <tbody>
                {listings.length ? listings.map((listing) => (
                  <tr key={listing.id}>
                    <td><strong>{listing.maker} {listing.model}</strong><br /><span className="muted">{listing.grade || listing.prefecture}</span></td>
                    <td>{listing.source}</td>
                    <td>{listing.modelYear || '—'}</td>
                    <td>{formatYen(listing.totalPrice)}</td>
                    <td>{listing.mileageKm == null ? '—' : `${formatNumber(listing.mileageKm)} km`}</td>
                    <td><span className="status-chip success">{listing.status}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="table-state">No active listings loaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Alerts</span>
              <h3>Latest notifications</h3>
            </div>
            <button className="link-button" onClick={() => onNavigate('notifications')}>Open feed</button>
          </div>
          <div className="feed-list">
            {notifications.slice(0, 5).map(({ n, listing }) => (
              <div className="feed-row" key={n.id}>
                <span className={`status-dot ${n.readAt ? 'neutral' : 'warning'}`} />
                <div>
                  <strong>{listing?.maker} {listing?.model}</strong>
                  <p>{formatYen(listing?.totalPrice)} · {formatDate(n.createdAt)}</p>
                </div>
              </div>
            ))}
            {notifications.length === 0 && <div className="empty-state">No notifications yet.</div>}
          </div>
        </div>
      </section>
    </section>
  )
}
