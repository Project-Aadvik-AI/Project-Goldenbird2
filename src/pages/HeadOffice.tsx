import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject, type Project } from '../lib/project'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default function HeadOffice() {
  const { isAdmin } = useAuth()
  const { projects, setActiveProject } = useProject()
  const navigate = useNavigate()
  const [staffByProject, setStaffByProject] = useState<Record<string, number>>({})
  const [assetsByProject, setAssetsByProject] = useState<Record<string, number>>({})
  const [totals, setTotals] = useState({ employees: 0, assets: 0 })
  const [boqByProject, setBoqByProject] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: up }, { data: as }, { count: empCount }, { count: assetCount }, { data: boqs }] = await Promise.all([
        supabase.from('user_projects').select('project_id'),
        supabase.from('assets').select('project_id').eq('archived', false),
        supabase.from('employees').select('id', { count: 'exact', head: true }),
        supabase.from('assets').select('id', { count: 'exact', head: true }).eq('archived', false),
        supabase.from('boqs').select('id, project_id'),
      ])

      // BOQ value per project = sum of that project's BOQ item amounts
      const boqList = ((boqs as any[]) ?? []).filter(b => b.project_id)
      const bp: Record<string, number> = {}
      if (boqList.length) {
        const { data: items } = await supabase.from('boq_items').select('boq_id, amount')
        const boqToProject: Record<string, string> = {}
        for (const b of boqList) boqToProject[b.id] = b.project_id
        for (const it of ((items as any[]) ?? [])) {
          const pid = boqToProject[it.boq_id]
          if (!pid) continue
          bp[pid] = Math.round(((bp[pid] ?? 0) + Number(it.amount || 0)) * 100) / 100
        }
      }
      setBoqByProject(bp)
      const sp: Record<string, number> = {}
      for (const r of ((up as any[]) ?? [])) if (r.project_id) sp[r.project_id] = (sp[r.project_id] ?? 0) + 1
      const ap: Record<string, number> = {}
      for (const r of ((as as any[]) ?? [])) if (r.project_id) ap[r.project_id] = (ap[r.project_id] ?? 0) + 1
      setStaffByProject(sp); setAssetsByProject(ap)
      setTotals({ employees: empCount ?? 0, assets: assetCount ?? 0 })
      setLoading(false)
    })()
  }, [projects.length])

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const active = projects.filter(p => p.status === 'Active').length
    const completed = projects.filter(p => p.status === 'Completed').length
    // delayed = past end date but not completed
    const delayed = projects.filter(p => {
      if (p.status === 'Completed' || !p.end_date) return false
      return new Date(p.end_date) < today
    }).length
    const value = projects.reduce((n, p) => n + Number(p.contract_value || 0), 0)
    const boqValue = Object.values(boqByProject).reduce((a, b) => a + b, 0)
    const assignedStaff = Object.values(staffByProject).reduce((a, b) => a + b, 0)
    const assignedAssets = Object.values(assetsByProject).reduce((a, b) => a + b, 0)
    return { total: projects.length, active, completed, delayed, value, boqValue, assignedStaff, assignedAssets }
  }, [projects, staffByProject, assetsByProject, boqByProject])

  function openProject(p: Project) {
    setActiveProject(p)     // makes every module (BOQ, DPR, Billing…) scope to this project
    navigate('/project')    // the project workspace
  }

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Head Office is restricted to administrators.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Head Office</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Company-wide control — projects, people and assets. Open any project to work inside it.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <K label="Total Projects" value={stats.total} />
        <K label="Active" value={stats.active} tone="emerald" />
        <K label="Completed" value={stats.completed} tone="blue" />
        <K label="Delayed" value={stats.delayed} tone={stats.delayed ? 'red' : undefined} />
        <K label="Employees" value={totals.employees} />
        <K label="Assets" value={totals.assets} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <QA icon="add_business" label="Create Project" onClick={() => navigate('/projects')} />
        <QA icon="person_add" label="Add Employee" onClick={() => navigate('/employees')} />
        <QA icon="inventory" label="Add Asset" onClick={() => navigate('/assets')} />
        <QA icon="badge" label="Designations" onClick={() => navigate('/designations')} />
        <QA icon="lock" label="Permissions" onClick={() => navigate('/permissions')} />
        <QA icon="summarize" label="Company Reports" onClick={() => navigate('/reports')} />
      </div>

      {/* Projects */}
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">All Projects</span>
          <span className="text-[11px] text-[#dcc1ae]/60">
            Contract: <b className="text-[#e2e2e8] font-mono">{inr(stats.value)}</b>
            <span className="mx-2 text-[#dcc1ae]/30">·</span>
            BOQ: <b className="text-[#e2e2e8] font-mono">{inr(stats.boqValue)}</b>
          </span>
        </div>
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Project', 'Client', 'Status', 'Employees', 'Assets', 'Contract Value', 'BOQ Value', 'Variance', 'End Date', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {projects.map(p => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const delayed = p.status !== 'Completed' && p.end_date && new Date(p.end_date) < today
                return (
                  <tr key={p.id} className={`hover:bg-white/[0.02] ${delayed ? 'bg-red-500/[0.04]' : ''}`}>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{p.code || '—'}</td>
                    <td className="px-4 py-3 text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]" onClick={() => openProject(p)}>{p.name}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{p.client || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                        p.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : p.status === 'Completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{p.status}</span>
                      {delayed && <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/20">Delayed</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{staffByProject[p.id] ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{assetsByProject[p.id] ?? 0}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8] whitespace-nowrap">{p.contract_value ? inr(p.contract_value) : <span className="text-[#dcc1ae]/40">not set</span>}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8] whitespace-nowrap">{boqByProject[p.id] ? inr(boqByProject[p.id]) : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {(() => {
                        const c = Number(p.contract_value || 0), b = boqByProject[p.id] ?? 0
                        if (!c || !b) return <span className="text-[#dcc1ae]/40">—</span>
                        const diff = Math.round((b - c) * 100) / 100
                        if (Math.abs(diff) < 1) return <span className="text-emerald-400">Matches</span>
                        const pct = Math.round((diff / c) * 1000) / 10
                        return <span className={diff > 0 ? 'text-amber-400' : 'text-blue-400'}>{diff > 0 ? '+' : ''}{inr(diff)} ({pct > 0 ? '+' : ''}{pct}%)</span>
                      })()}
                    </td>
                    <td className={`px-4 py-3 font-mono text-[12px] whitespace-nowrap ${delayed ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>{p.end_date || '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => openProject(p)}>Open</button>
                    </td>
                  </tr>
                )
              })}
              {!projects.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No projects yet. Click "Create Project" above.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-[#dcc1ae]/50 mt-4">
        Opening a project switches your workspace to it — BOQ, DPR, Billing, Tasks, Expenses and every other module then works inside that project.
      </p>
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: number | string; tone?: 'emerald' | 'blue' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'blue' ? 'text-blue-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[22px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function QA({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: '13px' }} onClick={onClick}>
      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{icon}</span>{label}
    </button>
  )
}