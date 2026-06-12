import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useMakerOptions } from '../useMakerOptions.js'
import ListingDetail from './ListingDetail.jsx'
import TableRows from '../TableRows.jsx'

const DEFAULT_FILTERS = { maker: '', priceMax: '', status: 'active' }

function formatNumber(value) {
  return value == null ? '—' : Number(value).toLocaleString()
}

function formatYen(value) {
  return value == null ? '—' : `¥${Number(value).toLocaleString()}`
}

function statusTone(status) {
  return status === 'active' ? 'success' : 'neutral'
}

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
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Inventory review</span>
          <h3>Listings</h3>
          <p>Scan translated listing data, spot price movement, and open the original source when needed.</p>
        </div>
        <button className="secondary-action" onClick={() => load()}>Refresh</button>
      </div>

      <section className="panel">
        <div className="filters">
          <label>
            <span>Maker</span>
            <select aria-label="maker" value={filters.maker} onChange={(e) => setFilters({ ...filters, maker: e.target.value })}>
              {makerOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Max price</span>
            <input inputMode="numeric" placeholder="e.g. 1500000" value={filters.priceMax} onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })} />
          </label>
          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="active">active</option><option value="sold_removed">sold removed</option><option value="">all</option>
            </select>
          </label>
          <button className="primary-action" onClick={() => load()}>Search</button>
          <button className="secondary-action" onClick={() => { setFilters(DEFAULT_FILTERS); load(DEFAULT_FILTERS) }}>Reset</button>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Results</span>
            <h3>{rows.length.toLocaleString()} listings loaded</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Car</th><th>Source</th><th>Year</th><th>Price</th><th>Mileage</th><th>Location</th><th>Status</th><th></th></tr></thead>
            <TableRows isLoading={isLoading} colSpan={8} emptyMessage="No listings match these filters.">
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="listing-cell">
                  {r.photos?.[0] ? <img src={r.photos[0]} alt="" /> : <span className="photo-empty">No photo</span>}
                  <div>
                    <strong>{r.maker} {r.model}</strong>
                    <span>{r.grade || r.dealerName || 'No grade listed'}</span>
                  </div>
                </div>
              </td>
              <td>{r.source}</td>
              <td>{r.modelYear || '—'}</td>
              <td>{formatYen(r.totalPrice)}</td>
              <td>{r.mileageKm == null ? '—' : `${formatNumber(r.mileageKm)} km`}</td>
              <td>{r.prefecture || '—'}</td>
              <td><span className={`status-chip ${statusTone(r.status)}`}>{r.status}</span></td>
              <td><button className="secondary-action compact" onClick={() => setSelected(r.id)}>Review</button></td>
            </tr>
          ))}
            </TableRows>
          </table>
        </div>
      </section>
    </section>
  )
}
