import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Notifications() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const load = () => api.notifications().then((d) => { setItems(d); setError(null) }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>
  return (
    <table>
      <thead><tr><th>When</th><th>Car</th><th>Price</th><th></th></tr></thead>
      <tbody>
        {items.map(({ n, listing }) => (
          <tr key={n.id} style={{ fontWeight: n.readAt ? 'normal' : 'bold' }}>
            <td>{new Date(n.createdAt).toLocaleString()}</td>
            <td><a href={listing?.url} target="_blank" rel="noreferrer">{listing?.maker} {listing?.model}</a></td>
            <td>{listing?.totalPrice?.toLocaleString()}</td>
            <td>{!n.readAt && <button onClick={async () => { await api.readNotification(n.id); load() }}>Mark read</button>}</td>
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan="4">No notifications.</td></tr>}
      </tbody>
    </table>
  )
}
