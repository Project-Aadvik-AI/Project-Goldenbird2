import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

type LabourRow = {
  id: string; date: string; worker_name: string; skill: string | null
  days_present: number; daily_rate: number; wage: number; remark: string | null
}

const SKILLS = ['Skilled', 'Semi-skilled', 'Unskilled', 'Supervisor']

export default function Labour() {
  const { activeProject } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<LabourRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!activeProject) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('labour_attendance')
      .select('*').eq('project_id', activeProject.id)
      .order('date', { ascending: false }).limit(500)
    setRows((data as LabourRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthRows = rows.filter(r => r.date.startsWith(thisMonth))
  const totalWorkers = new Set(monthRows.map(r => r.worker_name)).size
  const totalWage = monthRows.reduce((s, r) => s + Number(r.wage || 0), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Labour & Wages</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Attendance tracking and wage computation</p>
        </div>
        {can('labour', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Attendance
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card kpi-sky p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Workers This Month</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-sky-400">{totalWorkers}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">unique workers</div>
          </div>
        </div>
        <div className="card kpi-purple p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Wage Bill This Month</span>
          <div>
            <div className="font-mono text-[22px] font-bold leading-none text-purple-400">₹{Math.round(totalWage).toLocaleString('en-IN')}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">total wages</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">Attendance Records</span>
          <ExportButtons
            filename="labour_wages"
            title="Labour & Wages"
            headers={['Date', 'Worker', 'Skill', 'Days', 'Rate (INR)', 'Wage (INR)', 'Remark']}
            rows={rows.map(r => [r.date, r.worker_name, r.skill || '—', r.days_present, r.daily_rate, r.wage, r.remark || '—'])}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date','Worker','Skill','Days','Rate/Day','Wage','Remark'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.worker_name}</td>
                <td className="px-4 py-3">
                  {r.skill
                    ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">{r.skill}</span>
                    : <span className="text-[#dcc1ae]/40">—</span>}
                </td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{Number(r.days_present).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 font-mono text-[#dcc1ae]">₹{Number(r.daily_rate).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 font-mono font-bold text-[#ffb87b]">₹{Number(r.wage).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No attendance records yet.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <LabourForm projectId={activeProject.id} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function LabourForm({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [worker, setWorker] = useState('')
  const [skill, setSkill] = useState('Unskilled')
  const [days, setDays] = useState('1')
  const [rate, setRate] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const wage = days && rate ? Number(days) * Number(rate) : 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!worker.trim()) { setErr('Enter worker name'); return }
    if (!rate || Number(rate) <= 0) { setErr('Enter daily rate'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('labour_attendance').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, worker_name: worker.trim(),
      skill, days_present: Number(days), daily_rate: Number(rate),
      remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Attendance</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Skill">
              <select className="input" value={skill} onChange={e => setSkill(e.target.value)}>
                {SKILLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </L>
            <L label="Worker Name" className="col-span-2">
              <input className="input" value={worker} onChange={e => setWorker(e.target.value)} placeholder="Full name" />
            </L>
            <L label="Days Present">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={days} onChange={e => setDays(e.target.value)} />
            </L>
            <L label="Daily Rate (₹)">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} />
            </L>
            <L label="Wage (auto)" className="col-span-2">
              <div className="input font-mono font-bold text-[#ffb87b]">₹{wage.toLocaleString('en-IN')}</div>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function L({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block mb-3 col-span-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}