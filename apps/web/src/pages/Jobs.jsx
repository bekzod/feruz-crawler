import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { flattenFailedJobs, summarizeJobs } from '../dashboard.js'

function QueuePanel({ name, counts }) {
  return (
    <div className="queue-panel">
      <div className="queue-title">
        <h4>{name}</h4>
        <span className={`status-chip ${counts?.failed ? 'danger' : 'success'}`}>
          {counts?.failed ? `${counts.failed} failed` : 'healthy'}
        </span>
      </div>
      <div className="queue-stats">
        <div><span>Active</span><strong>{counts?.active ?? 0}</strong></div>
        <div><span>Waiting</span><strong>{counts?.waiting ?? 0}</strong></div>
        <div><span>Delayed</span><strong>{counts?.delayed ?? 0}</strong></div>
        <div><span>Completed</span><strong>{counts?.completed ?? 0}</strong></div>
      </div>
    </div>
  )
}

export default function Jobs() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const load = () => api.jobs().then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])

  async function retry(queue, id) {
    try {
      await api.retryJob(queue, id)
      setMessage(`Retry queued for ${queue} job #${id}.`)
      load()
    } catch (e) {
      setMessage(e.message)
    }
  }

  if (error) {
    return (
      <section className="page-stack">
        <div className="page-heading">
          <div>
            <span className="eyebrow">Queue operations</span>
            <h3>Jobs</h3>
            <p>Discovery finds listing URLs; listing jobs fetch, translate, and upsert each car.</p>
          </div>
          <button className="secondary-action" onClick={load}>Retry connection</button>
        </div>
        <div className="notice notice-error">{error}</div>
      </section>
    )
  }
  if (!data) return <div className="table-state"><span className="spinner" aria-label="Loading jobs" role="status" /> Loading jobs...</div>

  const summary = summarizeJobs(data)
  const failedJobs = flattenFailedJobs(data)

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Queue operations</span>
          <h3>Jobs</h3>
          <p>Discovery finds listing URLs; listing jobs fetch, translate, and upsert each car.</p>
        </div>
        <button className="secondary-action" onClick={load}>Refresh</button>
      </div>

      {message && <div className="notice">{message}</div>}

      <section className="metric-grid">
        <div className="metric metric-info"><span>Active</span><strong>{summary.active}</strong><small>currently running</small></div>
        <div className="metric metric-neutral"><span>Waiting</span><strong>{summary.waiting}</strong><small>queued work</small></div>
        <div className="metric metric-warning"><span>Delayed</span><strong>{summary.delayed}</strong><small>scheduled retries</small></div>
        <div className={`metric ${summary.failed ? 'metric-danger' : 'metric-success'}`}><span>Failed</span><strong>{summary.failed}</strong><small>needs triage</small></div>
      </section>

      <section className="queue-grid">
        <QueuePanel name="Discovery queue" counts={data.discovery} />
        <QueuePanel name="Listing queue" counts={data.listing} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Triage</span>
            <h3>Recent failures</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Queue</th><th>Job</th><th>Reason</th><th>Payload</th><th></th></tr></thead>
            <tbody>
              {failedJobs.map((job) => (
                <tr key={`${job.queue}-${job.id}`}>
                  <td><span className="status-chip danger">{job.queue}</span></td>
                  <td><strong>#{job.id}</strong><br /><span className="muted">{job.name}</span></td>
                  <td>{job.reason || '—'}</td>
                  <td><code className="inline-code">{JSON.stringify(job.data ?? {})}</code></td>
                  <td><button className="secondary-action compact" onClick={() => retry(job.queue, job.id)}>Retry</button></td>
                </tr>
              ))}
              {failedJobs.length === 0 && <tr><td className="table-state" colSpan={5}>No failed jobs.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
