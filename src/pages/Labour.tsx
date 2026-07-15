import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import ExportButtons from '../components/ExportButtons'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'

type LabourRow = {
  id: string; date: string; worker_name: string; skill: string | null
  days_present: number; daily_rate: number; wage: number; remark: string | null
  trade: string | null; gender: string | null; labour_type: string | null
  contractor_name: string | null; status: string | null
  overtime_hours: number | null; is_night_shift: boolean | null
  output_qty: number | null; output_unit: string | null
}

const SKILLS = ['Skilled', 'Semi-skilled', 'Unskilled', 'Supervisor']
const TRADES = ['Mason', 'Carpenter', 'Bar Bender', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Helper', 'Others']
const STATUSES = ['Present', 'Half Day', 'Absent', 'Leave']

// Days a status is worth — keeps the wage sheet and the dashboard in agreement.
const STATUS_DAYS: Record<string, number> = { 'Present': 1, 'Half Day': 0.5, 'Absent': 0, 'Leave': 0 }

const STATUS_STYLES: Record<string, string> = {
  Present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Half Day': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  Leave: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
}

export default function Labour() {
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const { can } = useAuth()
  const [rows, setRows] = useState<LabourRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    const _p = activeProject?.id ?? null
    if (!activeProject) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('labour_attendance')
      .select('*').eq('project_id', activeProject.id)
      .order('date', { ascending: false }).limit(500)

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((data as LabourRow[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthRows = rows.filter(r => r.date.startsWith(thisMonth))
  const totalWorkers = new Set(monthRows.map(r => r.worker_name)).size
  const totalWage = monthRows.reduce((s, r) => s + Number(r.wage || 0), 0)

  function statusOf(r: LabourRow) {
    if (r.status && ['Present', 'Half Day', 'Absent', 'Leave'].includes(r.status)) return r.status
    const dp = Number(r.days_present ?? 0)
    return dp >= 1 ? 'Present' : dp > 0 ? 'Half Day' : 'Absent'
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Labour &amp; Wages</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Attendance tracking and wage computation</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/labour-dashboard" className="btn btn-ghost">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>monitoring</span> Dashboard
          </a>
          {can('labour', 'add') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Labour
            </button>
          )}
        </div>
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
            dateField="date"
            rows={rows}
            columns={[
              { header: 'Date', get: r => r.date },
              { header: 'Worker', get: r => r.worker_name },
              { header: 'Trade', get: r => r.trade || '—' },
              { header: 'Skill', get: r => r.skill || '—' },
              { header: 'Type', get: r => r.labour_type || 'Company' },
              { header: 'Contractor', get: r => r.contractor_name || '—' },
              { header: 'Gender', get: r => r.gender || '—' },
              { header: 'Status', get: r => statusOf(r) },
              { header: 'Days Present', get: r => r.days_present },
              { header: 'OT Hours', get: r => Number(r.overtime_hours ?? 0) },
              { header: 'Night Shift', get: r => r.is_night_shift ? 'Yes' : 'No' },
              { header: 'Daily Rate (INR)', get: r => r.daily_rate },
              { header: 'Wage (INR)', get: r => r.wage },
              { header: 'Output', get: r => r.output_qty != null ? `${r.output_qty} ${r.output_unit || ''}`.trim() : '—' },
              { header: 'Remark', get: r => r.remark || '—' },
            ]}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date','Worker','Trade','Skill','Type','Status','Days','Rate/Day','Wage','Remark'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => {
              const st = statusOf(r)
              return (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8] whitespace-nowrap">
                    {r.worker_name}
                    {r.is_night_shift && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">Night</span>}
                  </td>
                  <td className="px-4 py-3 text-[#dcc1ae] whitespace-nowrap">{r.trade || '—'}</td>
                  <td className="px-4 py-3">
                    {r.skill
                      ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">{r.skill}</span>
                      : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#dcc1ae] whitespace-nowrap">
                    {r.labour_type === 'Contractor'
                      ? <span title={r.contractor_name || ''}>Contractor{r.contractor_name ? ` · ${r.contractor_name}` : ''}</span>
                      : 'Company'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[st] || ''}`}>{st}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#e2e2e8]">{Number(r.days_present).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-mono text-[#dcc1ae]">₹{Number(r.daily_rate).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#ffb87b]">₹{Number(r.wage).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
                </tr>
              )
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No attendance records yet.</td></tr>
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
  const [trade, setTrade] = useState('Mason')
  const [skill, setSkill] = useState('Unskilled')
  const [gender, setGender] = useState('Male')
  const [labourType, setLabourType] = useState('Company')
  const [contractor, setContractor] = useState('')
  const [status, setStatus] = useState('Present')
  const [days, setDays] = useState('1')
  const [rate, setRate] = useState('')
  const [ot, setOt] = useState('0')
  const [night, setNight] = useState(false)
  const [outputQty, setOutputQty] = useState('')
  const [outputUnit, setOutputUnit] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const wage = days && rate ? Number(days) * Number(rate) : 0

  // Picking a status sets the day-value automatically (still editable below).
  function pickStatus(s: string) {
    setStatus(s)
    setDays(String(STATUS_DAYS[s] ?? 1))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!worker.trim()) { setErr('Enter worker name'); return }
    if (!rate || Number(rate) <= 0) { setErr('Enter daily rate'); return }
    if (labourType === 'Contractor' && !contractor.trim()) { setErr('Enter the contractor name'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('labour_attendance').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, worker_name: worker.trim(),
      skill, trade, gender,
      labour_type: labourType,
      contractor_name: labourType === 'Contractor' ? contractor.trim() : null,
      status,
      days_present: Number(days), daily_rate: Number(rate),
      overtime_hours: Number(ot) || 0,
      is_night_shift: night,
      output_qty: outputQty ? Number(outputQty) : null,
      output_unit: outputUnit.trim() || null,
      remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Labour Record</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Status">
              <select className="input" value={status} onChange={e => pickStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </L>
            <L label="Worker Name" className="col-span-2">
              <input className="input" value={worker} onChange={e => setWorker(e.target.value)} placeholder="Full name" />
            </L>
            <L label="Trade">
              <select className="input" value={trade} onChange={e => setTrade(e.target.value)}>
                {TRADES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="Skill">
              <select className="input" value={skill} onChange={e => setSkill(e.target.value)}>
                {SKILLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </L>
            <L label="Gender">
              <select className="input" value={gender} onChange={e => setGender(e.target.value)}>
                <option>Male</option><option>Female</option>
              </select>
            </L>
            <L label="Labour Type">
              <select className="input" value={labourType} onChange={e => setLabourType(e.target.value)}>
                <option>Company</option><option>Contractor</option>
              </select>
            </L>
            {labourType === 'Contractor' && (
              <L label="Contractor Name" className="col-span-2">
                <input className="input" value={contractor} onChange={e => setContractor(e.target.value)} placeholder="e.g. ABC Contractors" />
              </L>
            )}
            <L label="Days Present">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={days} onChange={e => setDays(e.target.value)} />
            </L>
            <L label="Daily Rate (₹)">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} />
            </L>
            <L label="Overtime (hours)">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={ot} onChange={e => setOt(e.target.value)} />
            </L>
            <L label="Night Shift">
              <label className="flex items-center gap-2 h-[42px] px-1 cursor-pointer">
                <input type="checkbox" checked={night} onChange={e => setNight(e.target.checked)} className="w-4 h-4 accent-[#ff8f00]" />
                <span className="text-sm text-[#dcc1ae]">Worked night shift</span>
              </label>
            </L>
            <L label="Output Qty (optional)">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={outputQty} onChange={e => setOutputQty(e.target.value)} placeholder="e.g. 12" />
            </L>
            <L label="Output Unit (optional)">
              <input className="input" value={outputUnit} onChange={e => setOutputUnit(e.target.value)} placeholder="e.g. cum, sqm, nos" />
            </L>
            <L label="Wage (auto)" className="col-span-2">
              <div className="input font-mono font-bold text-[#ffb87b]">₹{wage.toLocaleString('en-IN')}</div>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3 sticky bottom-0 bg-[#1B1F2A]">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block mb-3 col-span-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}