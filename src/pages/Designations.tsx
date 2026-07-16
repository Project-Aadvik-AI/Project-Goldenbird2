import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Designation = { id: string; name: string; disabled: boolean; created_at: string }

const SEED = [
  'HR', 'HR Executive', 'HR Manager', 'Site Engineer', 'Senior Engineer', 'Junior Engineer',
  'Billing Engineer', 'Quantity Surveyor', 'QA/QC Engineer', 'Planning Engineer', 'Project Manager',
  'Supervisor', 'Foreman', 'Store Keeper', 'Store Incharge', 'Accountant', 'Safety Officer',
  'Surveyor', 'Labour', 'Helper', 'Electrician', 'Welder', 'Mason', 'Carpenter', 'Driver', 'Machine Operator',
]

export default function Designations() {
  const { isAdmin, can } = useAuth()
  const [rows, setRows] = useState<Designation[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<Designation | null>(null)
  const [usage, setUsage] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('designations').select('*').order('name')
    const list = (data as Designation[]) ?? []
    setRows(list)
    // count how many employees use each designation (by designation_id)
    const { data: emps } = await supabase.from('employees').select('designation_id')
    const counts: Record<string, number> = {}
    for (const e of (emps ?? []) as { designation_id: string | null }[]) {
      if (e.designation_id) counts[e.designation_id] = (counts[e.designation_id] ?? 0) + 1
    }
    setUsage(counts)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('designations').insert({ org_id: prof?.org_id, name: name.trim() })
    setBusy(false)
    if (error) { setErr(error.message.includes('duplicate') ? 'This designation already exists.' : error.message); return }
    setName(''); load()
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return
    const { error } = await supabase.from('designations').update({ name: editing.name.trim() }).eq('id', editing.id)
    if (error) { setErr(error.message); return }
    setEditing(null); load()
  }

  async function toggleDisable(d: Designation) {
    await supabase.from('designations').update({ disabled: !d.disabled }).eq('id', d.id)
    load()
  }

  async function del(d: Designation) {
    if ((usage[d.id] ?? 0) > 0) { alert('Cannot delete — employees are using this designation. Disable it instead.'); return }
    if (!confirm(`Delete "${d.name}"?`)) return
    await supabase.from('designations').delete().eq('id', d.id)
    load()
  }

  async function seedDefaults() {
    if (!confirm('Add the standard construction designations? Existing ones will be skipped.')) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const existing = new Set(rows.map(r => r.name.toLowerCase()))
    const toAdd = SEED.filter(s => !existing.has(s.toLowerCase())).map(s => ({ org_id: prof?.org_id, name: s }))
    if (toAdd.length) await supabase.from('designations').insert(toAdd)
    setBusy(false); load()
  }

  if (!isAdmin && !can('designations', 'view')) return <div className="p-8 text-center text-[#dcc1ae]">Only admins can manage designations.</div>

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Designation Master</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Job titles used across the ERP. The Employee form picks from this list.</p>
        </div>
        {rows.length === 0 && <button className="btn btn-ghost" disabled={busy} onClick={seedDefaults}>Add standard designations</button>}
      </div>

      <form onSubmit={add} className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-[220px]">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">New Designation</span>
          <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site Engineer" />
        </label>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add Designation'}</button>
        {rows.length > 0 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={seedDefaults}>+ Standard list</button>}
      </form>
      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Designations</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{rows.length} total</span>
        </div>
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Designation', 'Employees', 'Status', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map(d => (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    {editing?.id === d.id
                      ? <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={{ padding: '4px 8px', fontSize: '13px' }} autoFocus />
                      : <span className={`text-[#e2e2e8] ${d.disabled ? 'opacity-40 line-through' : ''}`}>{d.name}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{usage[d.id] ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {d.disabled
                      ? <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#dcc1ae]/60">Disabled</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Active</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {editing?.id === d.id ? (
                      <>
                        <button className="text-emerald-400 hover:text-emerald-300 mr-3 text-[12px] font-semibold" onClick={saveEdit}>Save</button>
                        <button className="text-[#dcc1ae] hover:text-white text-[12px]" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="text-[#dcc1ae] hover:text-[#e2e2e8] mr-2" title="Edit" onClick={() => setEditing(d)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span></button>
                        <button className="text-amber-400 hover:text-amber-300 mr-2" title={d.disabled ? 'Enable' : 'Disable'} onClick={() => toggleDisable(d)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{d.disabled ? 'visibility' : 'visibility_off'}</span></button>
                        <button className="text-red-400 hover:text-red-300 disabled:opacity-30" title={(usage[d.id] ?? 0) > 0 ? 'In use — disable instead' : 'Delete'} disabled={(usage[d.id] ?? 0) > 0} onClick={() => del(d)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No designations yet. Add one above, or click "Add standard designations".</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-[#dcc1ae]/50 mt-4">Disable a designation to stop it appearing in new employee forms without deleting history. Delete works only when no employee uses it.</p>
    </div>
  )
}