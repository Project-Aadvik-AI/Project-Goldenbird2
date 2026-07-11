import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'

type Emp = { id: string; full_name: string; emp_code: string | null; department: string | null; designation_id: string | null; profile_id: string | null }
type AssetRow = { id: string; name: string; asset_code: string | null; category: string | null; status: string; location: string | null; assigned_employee_id: string | null }
type Doc = { asset_id: string; doc_type: string; expiry_date: string | null }

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

export default function ProjectResources() {
  const { activeProject } = useProject()
  const navigate = useNavigate()
  const [emps, setEmps] = useState<Emp[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeProject) { setLoading(false); return }
    let alive = true
    ;(async () => {
      setLoading(true)
      // employees assigned to this project (via user_projects → profiles → employees)
      const { data: up } = await supabase.from('user_projects').select('user_id').eq('project_id', activeProject.id)
      const profileIds = ((up as any[]) ?? []).map(x => x.user_id)

      const [{ data: e }, { data: a }, { data: d }, { data: dg }] = await Promise.all([
        profileIds.length
          ? supabase.from('employees').select('id, full_name, emp_code, department, designation_id, profile_id').in('profile_id', profileIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('assets').select('id, name, asset_code, category, status, location, assigned_employee_id')
          .eq('project_id', activeProject.id).eq('archived', false).order('name'),
        supabase.from('asset_documents').select('asset_id, doc_type, expiry_date').not('expiry_date', 'is', null),
        supabase.from('designations').select('id, name'),
      ])
      if (!alive) return
      setEmps((e as Emp[]) ?? [])
      setAssets((a as AssetRow[]) ?? [])
      setDocs((d as Doc[]) ?? [])
      setDesignations((dg as any[]) ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [activeProject?.id])

  const desigOf = (id: string | null) => (id ? designations.find(d => d.id === id)?.name : null) || '—'

  // asset document alerts for THIS project's assets
  const alerts = useMemo(() => {
    const ids = new Set(assets.map(a => a.id))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const expired: string[] = [], soon: string[] = []
    for (const d of docs) {
      if (!ids.has(d.asset_id) || !d.expiry_date) continue
      const exp = new Date(d.expiry_date); exp.setHours(0, 0, 0, 0)
      const n = Math.round((exp.getTime() - today.getTime()) / 86400000)
      const nm = assets.find(a => a.id === d.asset_id)?.name ?? 'Asset'
      if (n < 0) expired.push(`${nm} — ${d.doc_type}`)
      else if (n <= 30) soon.push(`${nm} — ${d.doc_type} (${n}d)`)
    }
    return { expired, soon }
  }, [assets, docs])

  if (!activeProject) return (
    <div className="p-8 text-center text-[#dcc1ae]">Select a project first (use the project switcher at the top).</div>
  )
  if (loading) return <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Project Resources</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Everything assigned to <b className="text-[#e2e2e8]">{activeProject.name}</b> — people and equipment.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Employees" value={emps.length} />
        <K label="Assets" value={assets.length} />
        <K label="In Maintenance" value={assets.filter(a => a.status === 'Under Maintenance').length} tone={assets.some(a => a.status === 'Under Maintenance') ? 'amber' : undefined} />
        <K label="Doc Alerts" value={alerts.expired.length + alerts.soon.length} tone={alerts.expired.length ? 'red' : alerts.soon.length ? 'amber' : undefined} />
      </div>

      {/* Alerts */}
      {(alerts.expired.length > 0 || alerts.soon.length > 0) && (
        <div className="space-y-2 mb-5">
          {alerts.expired.length > 0 && (
            <div className="card p-3 bg-red-500/5 border-red-500/15 flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
              <div className="text-[13px]"><b className="text-red-400">{alerts.expired.length} EXPIRED:</b> <span className="text-[#dcc1ae]">{alerts.expired.slice(0, 4).join(' · ')}</span></div>
            </div>
          )}
          {alerts.soon.length > 0 && (
            <div className="card p-3 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
              <div className="text-[13px]"><b className="text-amber-400">{alerts.soon.length} expiring soon:</b> <span className="text-[#dcc1ae]">{alerts.soon.slice(0, 4).join(' · ')}</span></div>
            </div>
          )}
        </div>
      )}

      {/* Employees */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Assigned Employees</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{emps.length} person(s)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Code', 'Name', 'Designation', 'Department', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {emps.map(e => (
              <tr key={e.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{e.emp_code || '—'}</td>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]" onClick={() => navigate(`/employees/${e.id}`)}>{e.full_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{desigOf(e.designation_id)}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{e.department || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline" onClick={() => navigate(`/employees/${e.id}`)}>Profile</button>
                </td>
              </tr>
            ))}
            {!emps.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No employees assigned. Assign them in Head Office → Projects → Edit.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Assets */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Assigned Assets · Vehicles & Equipment</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{assets.length} item(s)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Code', 'Asset', 'Category', 'Status', 'Location', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {assets.map(a => (
              <tr key={a.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{a.asset_code || '—'}</td>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]" onClick={() => navigate(`/assets/${a.id}`)}>{a.name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{a.category || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                    a.status === 'Under Maintenance' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : a.status === 'Scrap' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{a.status}</span>
                </td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{a.location || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline" onClick={() => navigate(`/assets/${a.id}`)}>Profile</button>
                </td>
              </tr>
            ))}
            {!assets.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No assets assigned. Assign them in Head Office → Projects → Edit.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'red' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[22px] font-bold ${c}`}>{value}</div>
    </div>
  )
}