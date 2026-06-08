import { useEffect, useState } from 'react'
import { api } from '../api.js'
import TableRows from '../TableRows.jsx'

export default function Notifications() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
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
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>
  return (
    <table>
      <thead><tr><th>When</th><th>Car</th><th>Price</th><th></th></tr></thead>
      <TableRows isLoading={isLoading} colSpan={4} emptyMessage="No notifications.">
        {items.map(({ n, listing }) => (
          <tr key={n.id} style={{ fontWeight: n.readAt ? 'normal' : 'bold' }}>
            <td>{new Date(n.createdAt).toLocaleString()}</td>
            <td><a href={listing?.url} target="_blank" rel="noreferrer">{listing?.maker} {listing?.model}</a></td>
            <td>{listing?.totalPrice?.toLocaleString()}</td>
            <td>{!n.readAt && <button onClick={async () => { await api.readNotification(n.id); load() }}>Mark read</button>}</td>
          </tr>
        ))}
      </TableRows>
    </table>
  )
}
