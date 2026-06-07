import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Jobs() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const load = () => api.jobs().then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>
  if (!data) return <div>Loading…</div>
  return (
    <div>
      {['discovery', 'listing'].map((q) => (
        <section key={q} className="card">
          <h3>{q} queue</h3>
          <pre>{JSON.stringify(data[q], null, 2)}</pre>
          <h4>Recent failures</h4>
          <ul>
            {(data[`${q}_failed`] ?? []).map((j) => (
              <li key={j.id}>#{j.id} {j.name}: {j.reason} <span>{JSON.stringify(j.data)}</span></li>
            ))}
            {(data[`${q}_failed`] ?? []).length === 0 && <li>none</li>}
          </ul>
        </section>
      ))}
    </div>
  )
}
