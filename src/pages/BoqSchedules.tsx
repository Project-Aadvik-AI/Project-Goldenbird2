import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Schedule = { id: string; name: string; schedule_no: string | null; disabled: boolean }

export default function BoqSchedules() {
  const { isAdmin, can } = useAuth()
  const [rows, setRows] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [no, setNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [usage, setUsage] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('boq_schedule_master').select('*').order('schedule_no').order('name')
    const list = (data as Schedule[]) ?? []
    setRows(list)
    // count how many BOQ items use each schedule (by matching category text to name)
    const { data: items } = await supabase.from('boq_items').select('category')
    const counts: Record<string, number> = {}
    for (const it of (items ?? []) as { category: string | null }[]) {
      const c = (it.category ?? '').trim()
      if (c) counts[c] = (counts[c] ?? 0) + 1
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
    const { error } = await supabase.from('boq_schedule_master').insert({ org_id: prof?.org_id, name: name.trim(), schedule_no: no.trim() || null })
    setBusy(false)
    if (error) { setErr(error.message.includes('duplicate') ? 'This schedule already exists.' : error.message); return }
    setName(''); setNo(''); load()
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return
    const { error } = await supabase.from('boq_schedule_master').update({ name: editing.name.trim(), schedule_no: editing.schedule_no?.trim() || null }).eq('id', editing.id)
    if (error) { setErr(error.message); return }
    setEditing(null); load()
  }

  async function toggleDisable(s: Schedule) {
    await supabase.from('boq_schedule_master').update({ disabled: !s.disabled }).eq('id', s.id)
    load()
  }

  async function del(s: Schedule) {
    if ((usage[s.name] ?? 0) > 0) { alert('Cannot delete — BOQ items use this schedule. Disable it instead.'); return }
    if (!confirm(`Delete schedule "${s.name}"?`)) return
    await supabase.from('boq_schedule_master').delete().eq('id', s.id)
    load()
  }

  if (!isAdmin && !can('boq_schedules', 'view')) return <div className="p-8 text-center text-[#dcc1ae]">Only admins can manage schedules.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Schedule Master</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Standard schedules (e.g. Schedule A – Earthwork). BOQ item forms pick from this list, keeping schedules consistent across all BOQs.</p>
      </div>

      <form onSubmit={add} className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <label className="block" style={{ width: 120 }}>
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">No.</span>
          <input className="input w-full mono" value={no} onChange={e => setNo(e.target.value)} placeholder="A" />
        </label>
        <label className="block flex-1 min-w-[240px]">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Schedule Name</span>
          <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Schedule A - Earthwork in Formation & Cutting" />
        </label>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add Schedule'}</button>
      </form>
      {err && <div className="text-sm text-red-400 mb-3">{err}</div>}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Schedules</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{rows.length} total</span>
        </div>
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['No.', 'Schedule', 'Items using', 'Status', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map(s => (
                <tr key={s.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">
                    {editing?.id === s.id
                      ? <input className="input mono" style={{ padding: '3px 6px', fontSize: '12px', width: 60 }} value={editing.schedule_no ?? ''} onChange={e => setEditing({ ...editing, schedule_no: e.target.value })} />
                      : (s.schedule_no || '—')}
                  </td>
                  <td className="px-4 py-2.5">
                    {editing?.id === s.id
                      ? <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={{ padding: '4px 8px', fontSize: '13px' }} autoFocus />
                      : <span className={`text-[#e2e2e8] ${s.disabled ? 'opacity-40 line-through' : ''}`}>{s.name}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{usage[s.name] ?? 0}</td>
                  <td className="px-4 py-2.5">
                    {s.disabled
                      ? <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#dcc1ae]/60">Disabled</span>
                      : <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Active</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {editing?.id === s.id ? (
                      <>
                        <button className="text-emerald-400 hover:text-emerald-300 mr-3 text-[12px] font-semibold" onClick={saveEdit}>Save</button>
                        <button className="text-[#dcc1ae] hover:text-white text-[12px]" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="text-[#dcc1ae] hover:text-[#e2e2e8] mr-2" title="Edit" onClick={() => setEditing(s)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span></button>
                        <button className="text-amber-400 hover:text-amber-300 mr-2" title={s.disabled ? 'Enable' : 'Disable'} onClick={() => toggleDisable(s)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{s.disabled ? 'visibility' : 'visibility_off'}</span></button>
                        <button className="text-red-400 hover:text-red-300 disabled:opacity-30" title={(usage[s.name] ?? 0) > 0 ? 'In use — disable instead' : 'Delete'} disabled={(usage[s.name] ?? 0) > 0} onClick={() => del(s)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No schedules yet. Add one above. (Existing BOQ categories were auto-imported by the setup SQL.)</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-[#dcc1ae]/50 mt-4">This is a consistency list — BOQ items still store the schedule name. Renaming here does not rename existing items (that's a future upgrade). Use it so new items always pick from the same clean list.</p>
    </div>
  )
}