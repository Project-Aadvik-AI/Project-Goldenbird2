import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

type MachineRow = {
  id: string; date: string; machine: string; type: string | null; status: string
  activity: string | null; operator: string | null; reason: string | null
  meter_reading: number | null; run_unit: string | null; run_since_last: number | null
}

type MasterMachine = { name: string; type: string | null }

export default function Machines() {
  const { activeProject } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<MachineRow[]>([])
  const [masters, setMasters] = useState<MasterMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!activeProject) { setRows([]); setMasters([]); setLoading(false); return }
    setLoading(true)
    const [{ data: ledger }, { data: mm }] = await Promise.all([
      supabase.from('machine_status').select('*')
        .eq('project_id', activeProject.id)
        .order('date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('m_machines').select('name, type').order('name'),
    ])
    setRows((ledger as MachineRow[]) ?? [])
    setMasters((mm as MasterMachine[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  const today = rows.filter(r => r.date === new Date().toISOString().slice(0, 10))
  const running = today.filter(r => r.status === 'Running').length
  const idle = today.filter(r => r.status === 'Idle').length
  const breakdown = today.filter(r => r.status === 'Breakdown').length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Machine Status</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Daily equipment snapshot and run tracking</p>
        </div>
        {can('machines', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Entry
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card kpi-emerald p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Running Today</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-emerald-400">{running}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">machines</div>
          </div>
        </div>
        <div className="card kpi-amber p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Idle Today</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-[#ffb87b]">{idle}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">machines</div>
          </div>
        </div>
        <div className="card kpi-red p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Breakdown</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-red-400">{breakdown}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">machines</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">Status Log</span>
          <ExportButtons
            filename="machine_status"
            title="Machine Status Log"
            headers={['Date', 'Machine', 'Type', 'Status', 'Activity', 'Operator', 'Meter', 'Run Unit', 'Reason']}
            rows={rows.map(r => [r.date, r.machine, r.type || '—', r.status, r.activity || '—', r.operator || '—', r.meter_reading ?? '—', r.run_unit || '—', r.reason || '—'])}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date','Machine','Type','Status','Activity','Operator','Meter','Run Since Last','Reason'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3 font-semibold text-[#e2e2e8] whitespace-nowrap">{r.machine}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.type || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    r.status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    r.status === 'Idle' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.activity || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.operator || '—'}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.meter_reading != null ? r.meter_reading.toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.run_since_last != null ? `${r.run_since_last} ${r.run_unit || ''}` : '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.reason || '—'}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No entries yet — add your first entry.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <MachineForm
          projectId={activeProject.id}
          masters={masters}
          allRows={rows}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

function MachineForm({
  projectId, masters, allRows, onClose, onSaved
}: { projectId: string; masters: MasterMachine[]; allRows: MachineRow[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [machine, setMachine] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('Running')
  const [activity, setActivity] = useState('')
  const [operator, setOperator] = useState('')
  const [reason, setReason] = useState('')
  const [meter, setMeter] = useState('')
  const [runUnit, setRunUnit] = useState('Hrs')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const m = masters.find(m => m.name.toLowerCase() === machine.toLowerCase())
    if (m?.type) setType(m.type)
  }, [machine, masters])

  const lastReading = allRows
    .filter(r => r.machine.toLowerCase() === machine.toLowerCase() && r.meter_reading != null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.meter_reading ?? null

  const autoRun = meter && lastReading != null ? Number(meter) - lastReading : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!machine.trim()) { setErr('Enter machine name'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('machine_status').insert({
      org_id: prof?.org_id, project_id: projectId, date, machine: machine.trim(), type: type || null,
      status, activity: status === 'Running' ? (activity || null) : null,
      operator: operator || null,
      reason: status === 'Breakdown' ? (reason || null) : null,
      meter_reading: meter ? Number(meter) : null,
      run_unit: meter ? runUnit : null,
      run_since_last: autoRun != null && autoRun >= 0 ? autoRun : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Machine Status</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="flex gap-2 mb-4">
            {(['Running','Idle','Breakdown'] as const).map(s => (
              <button key={s} type="button"
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-colors border ${status === s
                  ? s === 'Running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : s === 'Idle' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-transparent text-[#dcc1ae] border-white/10 hover:bg-white/5'}`}
                onClick={() => setStatus(s)}>{s}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Machine">
              <input className="input" value={machine} onChange={e => setMachine(e.target.value)} list="machine-list" placeholder="e.g. JCB-01" />
              <datalist id="machine-list">{masters.map(m => <option key={m.name} value={m.name} />)}</datalist>
            </L>
            <L label="Type"><input className="input" value={type} onChange={e => setType(e.target.value)} placeholder="Excavator, Tipper…" /></L>
            <L label="Operator"><input className="input" value={operator} onChange={e => setOperator(e.target.value)} /></L>
            <L label="Meter Reading">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={meter} onChange={e => setMeter(e.target.value)} />
              {autoRun != null && autoRun >= 0 && (
                <div className="text-[11px] text-[#ffb87b] mt-1">Auto: {autoRun} {runUnit} since last</div>
              )}
            </L>
            <L label="Unit">
              <select className="input" value={runUnit} onChange={e => setRunUnit(e.target.value)}>
                <option>Hrs</option><option>Km</option><option>Trips</option>
              </select>
            </L>
            {status === 'Running' && (
              <L label="Activity" className="col-span-2">
                <input className="input" value={activity} onChange={e => setActivity(e.target.value)} placeholder="Earthwork, Loading…" />
              </L>
            )}
            {status === 'Breakdown' && (
              <L label="Reason for Breakdown" className="col-span-2">
                <input className="input" value={reason} onChange={e => setReason(e.target.value)} />
              </L>
            )}
          </div>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Entry'}</button>
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