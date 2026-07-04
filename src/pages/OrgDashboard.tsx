import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { Link } from 'react-router-dom'

type ExpenseRow = { amount: number; project_id: string | null; payment_status: string }
type CorrRow = { status: string }
type ContractRow = { id: string; title: string; project_id: string | null; expiry_date: string | null; reminder_days: number | null; doc_type: string | null; party: string | null }
type DprCountRow = { project_id: string | null }
type LabourRow = { project_id: string | null; worker_name: string }
type MachineRow = { project_id: string | null; status: string; date: string }

type ProjectMetrics = {
  totalSpend: number
  openPRs: number
  dprEntries: number
  workers: number
  runningMachines: number
}

export default function OrgDashboard() {
  const { projects, setActiveProject } = useProject()
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [corr, setCorr] = useState<CorrRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [dpr, setDpr] = useState<DprCountRow[]>([])
  const [labour, setLabour] = useState<LabourRow[]>([])
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [prs, setPRs] = useState<{ project_id: string | null; status: string }[]>([])
  const [staffCount, setStaffCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      setLoading(true)
      const [
        { data: exp }, { data: co }, { data: ct },
        { data: dp }, { data: lb }, { data: mc }, { data: pr },
        { count: staff },
      ] = await Promise.all([
        supabase.from('expenses').select('amount, project_id, payment_status'),
        supabase.from('correspondence').select('status'),
        supabase.from('contracts').select('id, title, project_id, expiry_date, reminder_days, doc_type, party'),
        supabase.from('dpr').select('project_id'),
        supabase.from('labour_attendance').select('project_id, worker_name'),
        supabase.from('machine_status').select('project_id, status, date'),
        supabase.from('purchase_requests').select('project_id, status'),
        supabase.from('employees').select('*', { count: 'exact', head: true }),
      ])
      if (cancelled) return
      setExpenses((exp as ExpenseRow[]) ?? [])
      setCorr((co as CorrRow[]) ?? [])
      setContracts((ct as ContractRow[]) ?? [])
      setDpr((dp as DprCountRow[]) ?? [])
      setLabour((lb as LabourRow[]) ?? [])
      setMachines((mc as MachineRow[]) ?? [])
      setPRs((pr as { project_id: string | null; status: string }[]) ?? [])
      setStaffCount(staff ?? 0)
      setLoading(false)
    }
    loadAll()
    return () => { cancelled = true }
  }, [])

  const totalSpend = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalCredit = expenses.filter(e => (e.payment_status || '').toLowerCase().includes('credit'))
    .reduce((s, e) => s + Number(e.amount || 0), 0)
  const activeProjects = projects.filter(p => p.status === 'Active').length
  const pendingLetters = corr.filter(c => c.status === 'Open').length
  const today = new Date().toISOString().slice(0, 10)
  const todayISO = new Date(today)

  const expiringSoon = contracts.filter(c => {
    if (!c.expiry_date) return false
    const days = daysUntil(c.expiry_date, todayISO)
    return days <= (c.reminder_days ?? 30) && days >= 0
  }).sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))

  const expired = contracts.filter(c => c.expiry_date && daysUntil(c.expiry_date, todayISO) < 0)

  const perProject: Record<string, ProjectMetrics> = {}
  for (const p of projects) perProject[p.id] = { totalSpend: 0, openPRs: 0, dprEntries: 0, workers: 0, runningMachines: 0 }
  for (const e of expenses) if (e.project_id && perProject[e.project_id]) perProject[e.project_id].totalSpend += Number(e.amount || 0)
  for (const p of prs) if (p.project_id && perProject[p.project_id] && p.status === 'Open') perProject[p.project_id].openPRs += 1
  for (const d of dpr) if (d.project_id && perProject[d.project_id]) perProject[d.project_id].dprEntries += 1
  const workersByProj: Record<string, Set<string>> = {}
  for (const l of labour) {
    if (!l.project_id) continue
    if (!workersByProj[l.project_id]) workersByProj[l.project_id] = new Set()
    workersByProj[l.project_id].add(l.worker_name)
  }
  for (const pid of Object.keys(workersByProj)) if (perProject[pid]) perProject[pid].workers = workersByProj[pid].size
  for (const m of machines) if (m.project_id && perProject[m.project_id] && m.status === 'Running' && m.date === today) perProject[m.project_id].runningMachines += 1

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Organization Dashboard</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Real-time overview across all projects · {today}</p>
        </div>
        <Link to="/projects" className="btn btn-ghost self-start sm:self-auto">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>domain</span>
          Manage Projects
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi label="Total Spend" value={inr(totalSpend)} sub={`${expenses.length} entries`} icon="account_balance_wallet" accent="emerald" />
        <Kpi label="Active Projects" value={String(activeProjects)} sub={`${projects.length} total`} icon="domain" accent="sky" />
        <Kpi label="On Credit" value={inr(totalCredit)} sub="unpaid amount" icon="history_edu" accent="purple" />
        <Kpi label="Staff" value={String(staffCount)} sub="employees on record" icon="groups" accent="amber" />
        <Kpi label="Pending Letters" value={String(pendingLetters)} sub="open correspondence" icon="mail" accent="red" />
      </div>

      <MyTasksWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Projects Overview</span>
            <span className="text-[11px] text-[#dcc1ae]/60">{projects.length} projects</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Project','Status','Spend','Open PRs','DPR','Workers','Running','Open'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {projects.map(p => {
                const m = perProject[p.id]
                return (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#e2e2e8]">{p.name}</div>
                      {p.code && <div className="text-[10px] font-mono uppercase tracking-wider text-[#dcc1ae]/60">{p.code}</div>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{m ? `₹${Math.round(m.totalSpend).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{m?.openPRs ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{m?.dprEntries ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{m?.workers ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{m?.runningMachines ?? 0}</td>
                    <td className="px-4 py-3">
                      <Link to="/project" onClick={() => setActiveProject(p)} className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline">
                        Open →
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {!projects.length && !loading && (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <div className="text-[#dcc1ae]/60 text-sm mb-3">No projects yet.</div>
                  <Link to="/projects" className="btn btn-primary inline-flex">
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                    Create First Project
                  </Link>
                </td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>

        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>schedule</span>
            <span className="text-sm font-semibold text-[#e2e2e8]">Expiring Soon</span>
            <span className="ml-auto text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider">
              {expiringSoon.length + expired.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-80">
            {expired.map(c => {
              const projName = projects.find(p => p.id === c.project_id)?.name
              return (
                <div key={c.id} className="px-4 py-3 border-b border-white/5 hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">{c.title}</div>
                      <div className="text-[10px] text-[#dcc1ae]/60 truncate">
                        {c.doc_type ? c.doc_type : 'Contract'}{projName ? ` · ${projName}` : ''}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap flex-shrink-0">
                      Expired
                    </span>
                  </div>
                </div>
              )
            })}
            {expiringSoon.map(c => {
              const days = daysUntil(c.expiry_date!, todayISO)
              const projName = projects.find(p => p.id === c.project_id)?.name
              return (
                <div key={c.id} className="px-4 py-3 border-b border-white/5 hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">{c.title}</div>
                      <div className="text-[10px] text-[#dcc1ae]/60 truncate">
                        {c.doc_type ? c.doc_type : 'Contract'}{projName ? ` · ${projName}` : ''}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap flex-shrink-0">
                      {days}d
                    </span>
                  </div>
                </div>
              )
            })}
            {!expired.length && !expiringSoon.length && !loading && (
              <div className="p-6 text-center text-[#dcc1ae]/60 text-sm">
                Nothing expires within the reminder window.
              </div>
            )}
          </div>
          <div className="border-t border-white/5">
            <Link to="/contracts" className="block px-4 py-2.5 text-[11px] font-semibold text-[#ffb87b] hover:bg-white/5 uppercase tracking-wider">
              View all contracts →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

type MyTask = { id: string; title: string; priority: string; status: string; due_date: string | null }

function MyTasksWidget() {
  const [rows, setRows] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user.id
      if (!uid) { setLoading(false); return }
      const { data } = await supabase.from('tasks')
        .select('id, title, priority, status, due_date')
        .eq('assigned_to', uid)
        .neq('status', 'Done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(6)
      if (!cancelled) { setRows((data as MyTask[]) ?? []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  const pStyle: Record<string, string> = {
    Urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
    High: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Low: 'bg-white/5 text-[#dcc1ae] border-white/10',
  }

  if (!loading && !rows.length) return null

  return (
    <div className="card overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>task_alt</span>
        <span className="text-sm font-semibold text-[#e2e2e8]">My Open Tasks</span>
        <span className="ml-auto text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider">{rows.length}</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {rows.map(t => {
          const overdue = t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now()
          return (
            <Link key={t.id} to="/tasks" className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02]">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${pStyle[t.priority] || ''}`}>{t.priority}</span>
              <span className="flex-1 text-[13px] text-[#e2e2e8] truncate">{t.title}</span>
              <span className={`text-[11px] font-mono ${overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]/60'}`}>{t.due_date || '—'}{overdue ? ' · OVERDUE' : ''}</span>
            </Link>
          )
        })}
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: string; accent: 'emerald' | 'sky' | 'purple' | 'amber' | 'red' }) {
  const colorMap: Record<string, { bar: string; text: string }> = {
    emerald: { bar: 'kpi-emerald', text: 'text-emerald-400' },
    sky:     { bar: 'kpi-sky',     text: 'text-sky-400' },
    purple:  { bar: 'kpi-purple',  text: 'text-purple-400' },
    amber:   { bar: 'kpi-amber',   text: 'text-[#ffb87b]' },
    red:     { bar: 'kpi-red',     text: 'text-red-400' },
  }
  const c = colorMap[accent]
  return (
    <div className={`card ${c.bar} p-4 h-28 flex flex-col justify-between relative overflow-hidden group`}>
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider leading-tight">{label}</span>
        <span className={`material-symbols-outlined ${c.text} opacity-60`} style={{ fontSize: '18px' }}>{icon}</span>
      </div>
      <div>
        <div className={`font-mono text-[20px] font-bold leading-tight ${c.text}`}>{value}</div>
        <div className="text-[10px] text-[#dcc1ae]/60 mt-0.5 truncate">{sub}</div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const cls =
    s === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
    s === 'on hold' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
    s === 'completed' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
    'bg-white/5 text-[#dcc1ae] border border-white/10'
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${cls}`}>{status || '—'}</span>
}

function daysUntil(dateStr: string, today: Date): number {
  const d = new Date(dateStr)
  const diff = d.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function inr(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}