import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useMakerOptions } from '../useMakerOptions.js'
import TableRows from '../TableRows.jsx'

const EMPTY = { name: '', sites: ['goonet', 'carsensor'], enabled: true, telegramChatId: '', criteria: { maker: '', priceMax: '', yearMin: '' } }

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

  return (
    <div>
      <section className="card">
        <h3>Crawl a single URL</h3>
        <input style={{ width: '60%' }} placeholder="paste goo-net or carsensor listing URL" value={singleUrl} onChange={(e) => setSingleUrl(e.target.value)} />
        <button onClick={async () => { try { await api.crawlUrl(singleUrl); setSingleUrl(''); setMsg('Queued') } catch (e) { setMsg(e.message) } }}>Crawl</button>
      </section>

      <section className="card">
        <h3>New filter preset</h3>
        <div className="filters">
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select aria-label="maker" value={form.criteria.maker} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, maker: e.target.value } })}>
            {makerOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
          <input placeholder="max price" value={form.criteria.priceMax} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, priceMax: e.target.value } })} />
          <input placeholder="min year" value={form.criteria.yearMin} onChange={(e) => setForm({ ...form, criteria: { ...form.criteria, yearMin: e.target.value } })} />
          <input placeholder="telegram chat id" value={form.telegramChatId} onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })} />
          <button onClick={create}>Create</button>
        </div>
      </section>

      {msg && <p>{msg}</p>}

      <table>
        <thead><tr><th>Name</th><th>Sites</th><th>Enabled</th><th>Last run</th><th></th></tr></thead>
        <TableRows isLoading={isLoading} colSpan={5} emptyMessage="No presets yet.">
          {presets.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{(p.sites || []).join(', ')}</td>
              <td><input type="checkbox" checked={p.enabled} onChange={async () => { await api.updatePreset(p.id, { enabled: !p.enabled }); load() }} /></td>
              <td>{p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : '—'}</td>
              <td>
                <button onClick={async () => { await api.runPreset(p.id); setMsg('Run queued') }}>Run now</button>
                <button onClick={async () => { await api.deletePreset(p.id); load() }}>Delete</button>
              </td>
            </tr>
          ))}
        </TableRows>
      </table>
    </div>
  )
}
