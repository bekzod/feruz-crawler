import { useEffect, useState } from 'react'
import { api } from '../api.js'

function labelize(field) {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

function formatValue(field, value) {
  if (value == null || value === '') return '—'
  if (['totalPrice', 'vehiclePrice'].includes(field)) return `¥${Number(value).toLocaleString()}`
  if (field === 'mileageKm') return `${Number(value).toLocaleString()} km`
  if (field === 'displacementCc') return `${Number(value).toLocaleString()} cc`
  return String(value)
}

export default function ListingDetail({ id, onBack }) {
  const [l, setL] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.listing(id).then(setL).catch((e) => setError(e.message)) }, [id])
  if (error) return <section className="page-stack"><button className="secondary-action compact" onClick={onBack}>Back</button><div className="notice notice-error">{error}</div></section>
  if (!l) return <div className="table-state"><span className="spinner" aria-label="Loading listing detail" role="status" /> Loading listing...</div>
  const fields = ['maker','model','grade','modelYear','mileageKm','displacementCc','transmission','fuelType','bodyType','drivetrain','color','doors','seats','inspectionUntil','repairHistory','totalPrice','vehiclePrice','prefecture','dealerName']
  return (
    <section className="page-stack">
      <div className="detail-hero">
        <button className="secondary-action compact" onClick={onBack}>Back</button>
        <div>
          <span className="eyebrow">Listing detail</span>
          <h3>{l.maker} {l.model} {l.modelYear ? `(${l.modelYear})` : ''}</h3>
          <p>{l.grade || l.dealerName || 'Translated crawler record'}</p>
        </div>
        <a className="primary-action as-link" href={l.url} target="_blank" rel="noreferrer">Open original</a>
      </div>

      {(l.photos ?? []).length > 0 && (
        <div className="photos">{l.photos.slice(0, 8).map((p, i) => <img key={i} src={p} width="160" height="120" alt="" />)}</div>
      )}

      <section className="overview-grid">
        <div className="panel panel-large">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Structured fields</span>
              <h3>Translated parameters</h3>
            </div>
          </div>
          <div className="fact-grid">
            {fields.map((f) => (
              <div key={f} className="fact-row">
                <span>{labelize(f)}</span>
                <strong>{formatValue(f, l[f])}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Pricing</span>
              <h3>Price history</h3>
            </div>
          </div>
          <div className="timeline">
            {(l.priceHistory ?? []).map((p) => (
              <div className="timeline-row" key={p.id}>
                <span className="status-dot info" />
                <div>
                  <strong>¥{p.price.toLocaleString()}</strong>
                  <p>{new Date(p.observedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {(l.priceHistory ?? []).length === 0 && <div className="empty-state">No price changes recorded.</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Source text</span>
            <h3>Original description Japanese</h3>
          </div>
        </div>
        <pre className="description-block">{l.descriptionOriginal || 'No original description stored.'}</pre>
      </section>
    </section>
  )
}
