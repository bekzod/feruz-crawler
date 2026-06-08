import { useEffect, useState } from 'react'
import { api } from '../api.js'
import ListingDetail from './ListingDetail.jsx'

export default function Listings() {
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({ maker: '', priceMax: '', status: 'active' })
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    try {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const data = await api.listings(`?${qs}`)
      setRows(data.rows)
      setError(null)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { load() }, [])

  if (selected) return <ListingDetail id={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="filters">
        <input placeholder="maker" value={filters.maker} onChange={(e) => setFilters({ ...filters, maker: e.target.value })} />
        <input placeholder="max price" value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="active">active</option><option value="sold_removed">sold</option><option value="">all</option>
        </select>
        <button onClick={load}>Search</button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <table>
        <thead><tr><th>Source</th><th>Maker</th><th>Model</th><th>Year</th><th>Price</th><th>Mileage</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer' }}>
              <td>{r.source}</td><td>{r.maker}</td><td>{r.model}</td><td>{r.modelYear}</td>
              <td>{r.totalPrice?.toLocaleString()}</td><td>{r.mileageKm?.toLocaleString()}</td><td>{r.status}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="7">No listings yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
