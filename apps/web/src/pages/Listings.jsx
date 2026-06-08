import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useMakerOptions } from '../useMakerOptions.js'
import ListingDetail from './ListingDetail.jsx'
import TableRows from '../TableRows.jsx'

const DEFAULT_FILTERS = { maker: '', priceMax: '', status: 'active' }

export default function Listings() {
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const makerOptions = useMakerOptions()

  async function load(nextFilters = filters) {
    setIsLoading(true)
    try {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(nextFilters).filter(([, v]) => v)))
      const data = await api.listings(`?${qs}`)
      setRows(data.rows)
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
        const qs = new URLSearchParams(Object.fromEntries(Object.entries(DEFAULT_FILTERS).filter(([, v]) => v)))
        const data = await api.listings(`?${qs}`)
        if (!cancelled) {
          setRows(data.rows)
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

  if (selected) return <ListingDetail id={selected} onBack={() => setSelected(null)} />

  return (
    <div>
      <div className="filters">
        <select aria-label="maker" value={filters.maker} onChange={(e) => setFilters({ ...filters, maker: e.target.value })}>
          {makerOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
        </select>
        <input placeholder="max price" value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="active">active</option><option value="sold_removed">sold</option><option value="">all</option>
        </select>
        <button onClick={load}>Search</button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <table>
        <thead><tr><th>Source</th><th>Maker</th><th>Model</th><th>Year</th><th>Price</th><th>Mileage</th><th>Status</th></tr></thead>
        <TableRows isLoading={isLoading} colSpan={7} emptyMessage="No listings yet.">
          {rows.map((r) => (
            <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer' }}>
              <td>{r.source}</td><td>{r.maker}</td><td>{r.model}</td><td>{r.modelYear}</td>
              <td>{r.totalPrice?.toLocaleString()}</td><td>{r.mileageKm?.toLocaleString()}</td><td>{r.status}</td>
            </tr>
          ))}
        </TableRows>
      </table>
    </div>
  )
}
