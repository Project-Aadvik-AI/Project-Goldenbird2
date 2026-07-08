import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Employee = { id: string; full_name: string }
type Leave = {
  id: string; employee_id: string; leave_type: string
  from_date: string; to_date: string; days: number | null
  reason: string | null; status: string; created_at: string
}
type Holiday = { id: string; date: string; name: string | null }

const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid']

export default function Leaves() {
  const [tab, setTab] = useState<'leaves' | 'holidays'>('leaves')

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Leave & Holidays</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Requests and the annual holiday list</p>
        </div>
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          <button className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tab === 'leaves' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setTab('leaves')}>Leave Requests</button>
          <button className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tab === 'holidays' ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setTab('holidays')}>Holidays</button>
        </div>
      </div>

      {tab === 'leaves' ? <LeavesTab /> : <HolidaysTab />}
    </div>
  )
}

function LeavesTab() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Leave[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending')

  async function load() {
    setLoading(true)
    const [{ data: lv }, { data: emp }] = await Promise.all([
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name').eq('status', 'Active').order('full_name'),
    ])
    setRows((lv as Leave[]) ?? [])
    setEmployees((emp as Employee[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(id: string, status: 'Approved' | 'Rejected') {
    await supabase.from('leave_requests').update({ status }).eq('id', id)
    load()
  }

  const visible = rows.filter(r => filter === 'All' ? true : r.status === filter)
  const nameOf = (id: string) => employees.find(e => e.id === id)?.full_name || '—'

  return (
    <>
      <div className="flex justify-between mb-3 gap-2 flex-wrap">
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {(['Pending', 'Approved', 'Rejected', 'All'] as const).map(f => (
            <button key={f} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${filter === f ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        {can('hr', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Request
          </button>
        )}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{nameOf(r.employee_id)}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.leave_type}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.from_date}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.to_date}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.days ?? '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae] max-w-[240px] truncate">{r.reason || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    r.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    r.status === 'Rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.status === 'Pending' && can('hr', 'edit') && (
                    <>
                      <button className="text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => act(r.id, 'Approved')}>Approve</button>
                      <button className="text-red-400 text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => act(r.id, 'Rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!visible.length && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No leave requests.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <LeaveForm employees={employees} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </>
  )
}

function LeaveForm({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const [empId, setEmpId] = useState(employees[0]?.id ?? '')
  const [type, setType] = useState('Casual')
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const days = (() => {
    if (!from || !to) return 0
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24) + 1
    return Math.max(0, Math.round(diff))
  })()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!empId) { setErr('Pick an employee'); return }
    if (!from || !to) { setErr('Enter dates'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('leave_requests').insert({
      org_id: prof?.org_id, employee_id: empId, leave_type: type,
      from_date: from, to_date: to, days, reason: reason || null, status: 'Pending',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">New Leave Request</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Employee">
              <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </L>
            <L label="Type">
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="From"><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></L>
            <L label="To"><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></L>
          </div>
          <div className="text-[12px] text-[#dcc1ae]/80 mb-3">Duration: <span className="font-mono font-bold text-[#ffb87b]">{days} day{days === 1 ? '' : 's'}</span></div>
          <L label="Reason"><input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional" /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Submit'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function HolidaysTab() {
  const [rows, setRows] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('holidays').select('*').order('date')
    setRows((data as Holiday[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from('holidays').insert({ org_id: prof?.org_id, date, name: name || null })
    setBusy(false); setDate(''); setName(''); load()
  }

  async function del(id: string) {
    if (!confirm('Delete this holiday?')) return
    await supabase.from('holidays').delete().eq('id', id)
    load()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <form onSubmit={add} className="card p-5 h-fit">
        <h3 className="text-sm font-bold text-[#e2e2e8] mb-3">Add Holiday</h3>
        <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
        <L label="Name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Republic Day" /></L>
        <button className="btn btn-primary w-full mt-2" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button>
      </form>
      <div className="card overflow-hidden lg:col-span-2">
        <div className="px-4 py-3 border-b border-white/5 text-sm font-semibold text-[#e2e2e8]">Holidays · {rows.length}</div>
        <div className="divide-y divide-white/[0.05]">
          {rows.map(h => (
            <div key={h.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>event</span>
              <div className="flex-1">
                <div className="font-mono text-[13px] text-[#e2e2e8]">{h.date}</div>
                <div className="text-[11px] text-[#dcc1ae]">{h.name || '—'}</div>
              </div>
              <button className="text-red-400 hover:text-red-300" onClick={() => del(h.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
              </button>
            </div>
          ))}
          {!rows.length && !loading && (
            <div className="p-10 text-center text-[#dcc1ae]/60 text-sm">No holidays yet.</div>
          )}
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}