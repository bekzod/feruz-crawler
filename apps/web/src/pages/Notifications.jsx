import { useEffect, useState } from 'react'
import { api } from '../api.js'
import TableRows from '../TableRows.jsx'

export default function Notifications() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mode, setMode] = useState('all')
  const load = async () => {
    setIsLoading(true)
    try {
      const data = await api.notifications()
      setItems(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => {
    let cancelled = false
    api.notifications()
      .then((data) => {
        if (!cancelled) {
          setItems(data)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])
  if (error) {
    return (
      <section className="page-stack">
        <div className="page-heading">
          <div>
            <span className="eyebrow">New match feed</span>
            <h3>Notifications</h3>
            <p>Review new listing matches and mark handled alerts as read.</p>
          </div>
          <button className="secondary-action" onClick={load}>Retry connection</button>
        </div>
        <div className="notice notice-error">{error}</div>
      </section>
    )
  }

  const visibleItems = mode === 'unread' ? items.filter(({ n }) => !n.readAt) : items
  const unreadCount = items.filter(({ n }) => !n.readAt).length

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">New match feed</span>
          <h3>Notifications</h3>
          <p>{unreadCount.toLocaleString()} unread alerts from matching listings.</p>
        </div>
        <div className="segmented-control" aria-label="notification filter">
          <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>All</button>
          <button className={mode === 'unread' ? 'active' : ''} onClick={() => setMode('unread')}>Unread</button>
        </div>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>When</th><th>Car</th><th>Price</th><th></th></tr></thead>
            <TableRows isLoading={isLoading} colSpan={5} emptyMessage="No notifications.">
              {visibleItems.map(({ n, listing }) => (
                <tr key={n.id} className={n.readAt ? '' : 'row-strong'}>
                  <td><span className={`status-chip ${n.readAt ? 'neutral' : 'warning'}`}>{n.readAt ? 'read' : 'new'}</span></td>
                  <td>{new Date(n.createdAt).toLocaleString()}</td>
                  <td><a href={listing?.url} target="_blank" rel="noreferrer">{listing?.maker} {listing?.model}</a><br /><span className="muted">{listing?.source}</span></td>
                  <td>{listing?.totalPrice == null ? '—' : `¥${listing.totalPrice.toLocaleString()}`}</td>
                  <td>{!n.readAt && <button className="secondary-action compact" onClick={async () => { await api.readNotification(n.id); load() }}>Mark read</button>}</td>
                </tr>
              ))}
            </TableRows>
          </table>
        </div>
      </section>
    </section>
  )
}
