import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useMakerOptions } from '../useMakerOptions.js'
import TableRows from '../TableRows.jsx'

const EMPTY = { name: '', sites: ['goonet', 'carsensor'], enabled: true, telegramChatId: '', criteria: { maker: '', priceMax: '', yearMin: '' } }

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

export default function Presets() {
  const [presets, setPresets] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [singleUrl, setSingleUrl] = useState('')
  const [msg, setMsg] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const makerOptions = useMakerOptions()
  const load = async () => {
    setIsLoading(true)
    try {
      const data = await api.presets()
      setPresets(data)
      setMsg(null)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => {
    let cancelled = false
    api.presets()
      .then((data) => {
        if (!cancelled) setPresets(data)
      })
      .catch((e) => {
        if (!cancelled) setMsg(e.message)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function create() {
    try {
      const criteria = {}
      if (form.criteria.maker) criteria.maker = form.criteria.maker
      if (form.criteria.priceMax) criteria.priceMax = Number(form.criteria.priceMax)
      if (form.criteria.yearMin) criteria.yearMin = Number(form.criteria.yearMin)
      await api.createPreset({ name: form.name, sites: form.sites, enabled: form.enabled, telegramChatId: form.telegramChatId || null, criteria })
      setForm(EMPTY); setMsg(null); load()
    } catch (e) { setMsg(e.message) }
  }

  function toggleSite(site) {
    const sites = form.sites.includes(site)
      ? form.sites.filter((s) => s !== site)
      : [...form.sites, site]
    setForm({ ...form, sites })
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Run control</span>
          <h3>Presets</h3>
          <p>Create scheduled crawls, run them on demand, and keep Telegram delivery visible.</p>
        </div>
        <button className="secondary-action" onClick={load}>Refresh</button>
      </div>

      <section className="panel command-panel">
        <div>
          <span className="eyebrow">Manual crawl</span>
          <h3>Crawl a single listing URL</h3>
          <p>Queue one Goo-net or CarSensor listing without changing scheduled presets.</p>
        </div>
        <div className="command-row">
          <input placeholder="paste goo-net or carsensor listing URL" value={singleUrl} onChange={(e) => setSingleUrl(e.target.value)} />
          <button className="primary-action" onClick={async () => { try { await api.crawlUrl(singleUrl); setSingleUrl(''); setMsg('URL crawl queued.') } catch (e) { setMsg(e.message) } }}>Crawl</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Scheduled discovery</span>
            <h3>New filter preset</h3>
          </div>
        </div>
        <div className="filters">
          <label>
            <span>Name</span>
            <input placeholder="e.g. Toyota under 1.5m" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>Maker</span>
            <select aria-label="maker" value={form.criteria.maker} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, maker: e.target.value } })}>
              {makerOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>Max price</span>
            <input inputMode="numeric" placeholder="1500000" value={form.criteria.priceMax} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, priceMax: e.target.value } })} />
          </label>
          <label>
            <span>Min year</span>
            <input inputMode="numeric" placeholder="2018" value={form.criteria.yearMin} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, yearMin: e.target.value } })} />
          </label>
          <label>
            <span>Telegram chat</span>
            <input placeholder="optional chat id" value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} />
          </label>
          <div className="toggle-group" aria-label="sites">
            {['goonet', 'carsensor'].map((site) => (
              <label key={site} className="toggle-pill">
                <input type="checkbox" checked={form.sites.includes(site)} onChange={() => toggleSite(site)} />
                <span>{site}</span>
              </label>
            ))}
          </div>
          <label className="toggle-pill">
            <input type="checkbox" checked={form.enabled} onChange={() => setForm({ ...form, enabled: !form.enabled })} />
            <span>enabled</span>
          </label>
          <button className="primary-action" onClick={create}>Create</button>
        </div>
      </section>

      {msg && <div className={msg.includes('error') ? 'notice notice-error' : 'notice'}>{msg}</div>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Active schedule</span>
            <h3>{presets.length.toLocaleString()} presets</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Sites</th><th>Criteria</th><th>Telegram</th><th>Status</th><th>Last run</th><th></th></tr></thead>
            <TableRows isLoading={isLoading} colSpan={7} emptyMessage="No presets yet.">
          {presets.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.name}</strong></td>
              <td>{(p.sites || []).join(', ')}</td>
              <td><code className="inline-code">{JSON.stringify(p.criteria ?? {})}</code></td>
              <td>{p.telegramChatId ? <span className="status-chip success">configured</span> : <span className="status-chip neutral">not set</span>}</td>
              <td>
                <label className="toggle-pill">
                  <input type="checkbox" checked={p.enabled} onChange={async () => { await api.updatePreset(p.id, { enabled: !p.enabled }); load() }} />
                  <span>{p.enabled ? 'enabled' : 'paused'}</span>
                </label>
              </td>
              <td>{formatDate(p.lastRunAt)}</td>
              <td>
                <div className="row-actions">
                  <button className="secondary-action compact" onClick={async () => { await api.runPreset(p.id); setMsg('Run queued.') }}>Run now</button>
                  <button className="danger-action compact" onClick={async () => { await api.deletePreset(p.id); load() }}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
            </TableRows>
          </table>
        </div>
      </section>
    </section>
  )
}
