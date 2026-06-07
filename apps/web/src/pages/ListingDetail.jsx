import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function ListingDetail({ id, onBack }) {
  const [l, setL] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.listing(id).then(setL).catch((e) => setError(e.message)) }, [id])
  if (error) return <div><button onClick={onBack}>← Back</button><p style={{ color: 'crimson' }}>{error}</p></div>
  if (!l) return <div>Loading…</div>
  const fields = ['maker','model','grade','modelYear','mileageKm','displacementCc','transmission','fuelType','bodyType','drivetrain','color','doors','seats','inspectionUntil','repairHistory','totalPrice','vehiclePrice','prefecture','dealerName']
  return (
    <div>
      <button onClick={onBack}>← Back</button>
      <h2>{l.maker} {l.model} ({l.modelYear})</h2>
      <a href={l.url} target="_blank" rel="noreferrer">Original listing ↗</a>
      <div className="photos">{(l.photos ?? []).slice(0, 8).map((p, i) => <img key={i} src={p} width="160" height="120" alt="" />)}</div>
      <table><tbody>{fields.map((f) => <tr key={f}><th>{f}</th><td>{String(l[f] ?? '')}</td></tr>)}</tbody></table>
      <h3>Price history</h3>
      <ul>{(l.priceHistory ?? []).map((p) => <li key={p.id}>{new Date(p.observedAt).toLocaleString()} — ¥{p.price.toLocaleString()}</li>)}</ul>
      <h3>Original description (Japanese)</h3>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{l.descriptionOriginal}</pre>
    </div>
  )
}
