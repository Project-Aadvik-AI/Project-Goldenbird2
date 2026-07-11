import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import ExportButtons from '../components/ExportButtons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'

export type Asset = {
  id: string; asset_code: string | null; name: string; category: string | null
  company_branch: string | null; project_id: string | null; assigned_employee_id: string | null
  purchase_date: string | null; purchase_cost: number | null; vendor: string | null
  status: string; location: string | null; remarks: string | null; archived: boolean
}

export const CATEGORIES = ['Vehicle', 'Machinery', 'Equipment', 'Tool', 'IT / Laptop', 'Furniture', 'Other']
export const STATUSES = ['Available', 'Assigned', 'Under Maintenance', 'Scrap']

const STATUS_STYLE: Record<string, string> = {
  'Available': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Assigned': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Under Maintenance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Scrap': 'bg-red-500/10 text-red-400 border-red-500/20',
}

export const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export default function Assets() {
  const { can, isAdmin } = useAuth()
  const { projects } = useProject()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Asset[]>([])
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([])
  const [docs, setDocs] = useState<{ asset_id: string; doc_type: string; expiry_date: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)

  // filters
  const [q, setQ] = useState('')
  const [fCat, setFCat] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fProj, setFProj] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: a }, { data: e }, { data: d }] = await Promise.all([
      supabase.from('assets').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, full_name').order('full_name'),
      supabase.from('asset_documents').select('asset_id, doc_type, expiry_date').not('expiry_date', 'is', null),
    ])
    setRows((a as Asset[]) ?? [])
    setEmps((e as { id: string; full_name: string }[]) ?? [])
    setDocs((d as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const nameOfEmp = (id: string | null) => (id ? emps.find(e => e.id === id)?.full_name : null) || '—'
  const nameOfProj = (id: string | null) => (id ? projects.find(p => p.id === id)?.name : null) || '—'

  const filtered = useMemo(() => rows.filter(r => {
    if (!showArchived && r.archived) return false
    if (showArchived && !r.archived) return false
    if (fCat && r.category !== fCat) return false
    if (fStatus && r.status !== fStatus) return false
    if (fProj && r.project_id !== fProj) return false
    const s = q.trim().toLowerCase()
    if (s) {
      const hay = `${r.name} ${r.asset_code ?? ''} ${r.category ?? ''} ${r.location ?? ''} ${r.vendor ?? ''}`.toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  }), [rows, q, fCat, fStatus, fProj, showArchived])

  const kpis = useMemo(() => {
    const live = rows.filter(r => !r.archived)
    return {
      total: live.length,
      value: live.reduce((n, r) => n + Number(r.purchase_cost || 0), 0),
      available: live.filter(r => r.status === 'Available').length,
      assigned: live.filter(r => r.status === 'Assigned').length,
      maint: live.filter(r => r.status === 'Under Maintenance').length,
      scrap: live.filter(r => r.status === 'Scrap').length,
    }
  }, [rows])

  const expiry = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const live = new Set(rows.filter(r => !r.archived).map(r => r.id))
    let expired = 0, soon = 0
    const expiredList: string[] = [], soonList: string[] = []
    for (const d of docs) {
      if (!live.has(d.asset_id) || !d.expiry_date) continue
      const exp = new Date(d.expiry_date); exp.setHours(0, 0, 0, 0)
      const n = Math.round((exp.getTime() - today.getTime()) / 86400000)
      const asset = rows.find(r => r.id === d.asset_id)
      const label = `${asset?.name ?? 'Asset'} — ${d.doc_type}`
      if (n < 0) { expired++; expiredList.push(label) }
      else if (n <= 30) { soon++; soonList.push(`${label} (${n}d)`) }
    }
    return { expired, soon, expiredList, soonList }
  }, [rows, docs])

  async function archive(a: Asset) {
    if (!confirm(`${a.archived ? 'Restore' : 'Archive'} "${a.name}"?`)) return
    await supabase.from('assets').update({ archived: !a.archived }).eq('id', a.id)
    load()
  }
  async function del(a: Asset) {
    if (!confirm(`Permanently delete "${a.name}"? This cannot be undone.\n\nTip: Archive is safer — it keeps the record.`)) return
    const { error } = await supabase.from('assets').delete().eq('id', a.id)
    if (error) { alert('Could not delete: ' + error.message); return }
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Company Assets</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Vehicles, machinery, equipment, tools and IT — with profiles, assignment and documents</p>
        </div>
        <div className="flex gap-2">
          <ExportButtons
            filename="asset-register"
            title="Asset Register"
            rows={filtered}
            columns={[
              { header: 'Code', get: r => r.asset_code || '—' },
              { header: 'Asset', get: r => r.name },
              { header: 'Category', get: r => r.category || '—' },
              { header: 'Status', get: r => r.status },
              { header: 'Assigned To', get: r => nameOfEmp(r.assigned_employee_id) },
              { header: 'Project / Site', get: r => nameOfProj(r.project_id) },
              { header: 'Location', get: r => r.location || '—' },
              { header: 'Vendor', get: r => r.vendor || '—' },
              { header: 'Purchase Date', get: r => r.purchase_date || '—' },
              { header: 'Purchase Cost (INR)', get: r => Number(r.purchase_cost || 0) },
            ]}
          />
          {can('machines', 'create') && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Asset
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <K label="Total Assets" value={kpis.total} />
        <K label="Total Value" value={inr(kpis.value)} small />
        <K label="Available" value={kpis.available} tone="emerald" />
        <K label="Assigned" value={kpis.assigned} tone="blue" />
        <K label="Maintenance" value={kpis.maint} tone="amber" />
        <K label="Scrap" value={kpis.scrap} tone="red" />
      </div>

      {/* Document expiry alerts (org-wide) */}
      {(expiry.expired > 0 || expiry.soon > 0) && (
        <div className="space-y-2 mb-4">
          {expiry.expired > 0 && (
            <div className="card p-3 bg-red-500/5 border-red-500/15 flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
              <div className="text-[13px]">
                <b className="text-red-400">{expiry.expired} EXPIRED document(s):</b>{' '}
                <span className="text-[#dcc1ae]">{expiry.expiredList.slice(0, 5).join(' · ')}{expiry.expiredList.length > 5 ? ` +${expiry.expiredList.length - 5} more` : ''}</span>
              </div>
            </div>
          )}
          {expiry.soon > 0 && (
            <div className="card p-3 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
              <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
              <div className="text-[13px]">
                <b className="text-amber-400">{expiry.soon} expiring in 30 days:</b>{' '}
                <span className="text-[#dcc1ae]">{expiry.soonList.slice(0, 5).join(' · ')}{expiry.soonList.length > 5 ? ` +${expiry.soonList.length - 5} more` : ''}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 mb-4 flex flex-wrap gap-2 items-end">
        <label className="block flex-1 min-w-[200px]">
          <span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">Search</span>
          <input className="input w-full" style={{ padding: '6px 10px', fontSize: '13px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Name, code, vendor, location…" />
        </label>
        <F label="Category">
          <select className="input" style={{ padding: '6px 8px', fontSize: '12px' }} value={fCat} onChange={e => setFCat(e.target.value)}>
            <option value="">All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </F>
        <F label="Status">
          <select className="input" style={{ padding: '6px 8px', fontSize: '12px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="Project / Site">
          <select className="input" style={{ padding: '6px 8px', fontSize: '12px' }} value={fProj} onChange={e => setFProj(e.target.value)}>
            <option value="">All</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </F>
        <button className={`btn ${showArchived ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowArchived(v => !v)}>
          {showArchived ? 'Showing Archived' : 'Show Archived'}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Asset', 'Category', 'Status', 'Assigned To', 'Project / Site', 'Location', 'Cost', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(a => (
                <tr key={a.id} className={`hover:bg-white/[0.02] ${a.archived ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{a.asset_code || '—'}</td>
                  <td className="px-4 py-3 text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]" onClick={() => navigate(`/assets/${a.id}`)}>{a.name}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{a.category || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[a.status] || 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{nameOfEmp(a.assigned_employee_id)}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{nameOfProj(a.project_id)}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{a.location || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{a.purchase_cost ? inr(a.purchase_cost) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button className="text-[#ffb87b] text-xs font-semibold uppercase hover:underline mr-3" onClick={() => navigate(`/assets/${a.id}`)}>View</button>
                    {can('machines', 'edit') && <button className="text-[#dcc1ae] text-xs font-semibold uppercase hover:underline mr-3" onClick={() => { setEditing(a); setShowForm(true) }}>Edit</button>}
                    {isAdmin && <button className="text-amber-400 text-xs font-semibold uppercase hover:underline mr-3" onClick={() => archive(a)}>{a.archived ? 'Restore' : 'Archive'}</button>}
                    {isAdmin && a.archived && <button className="text-red-400 text-xs font-semibold uppercase hover:underline" onClick={() => del(a)}>Delete</button>}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">{showArchived ? 'No archived assets.' : 'No assets yet. Click "Add Asset" to create one.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <AssetForm editing={editing} emps={emps} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function K({ label, value, tone, small }: { label: string; value: number | string; tone?: 'emerald' | 'blue' | 'amber' | 'red'; small?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'blue' ? 'text-blue-400' : tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono font-bold ${c} ${small ? 'text-[15px]' : 'text-[20px]'}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}

// ---------------- Add / Edit form ----------------
function AssetForm({ editing, emps, onClose, onSaved }: {
  editing: Asset | null; emps: { id: string; full_name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const { projects } = useProject()
  const [name, setName] = useState(editing?.name ?? '')
  const [category, setCategory] = useState(editing?.category ?? 'Equipment')
  const [branch, setBranch] = useState(editing?.company_branch ?? '')
  const [projectId, setProjectId] = useState(editing?.project_id ?? '')
  const [empId, setEmpId] = useState(editing?.assigned_employee_id ?? '')
  const [purchaseDate, setPurchaseDate] = useState(editing?.purchase_date ?? '')
  const [cost, setCost] = useState(editing?.purchase_cost != null ? String(editing.purchase_cost) : '')
  const [vendor, setVendor] = useState(editing?.vendor ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Available')
  const [location, setLocation] = useState(editing?.location ?? '')
  const [remarks, setRemarks] = useState(editing?.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Asset name is required.'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      name: name.trim(), category, company_branch: branch || null,
      project_id: projectId || null, assigned_employee_id: empId || null,
      purchase_date: purchaseDate || null, purchase_cost: cost ? Number(cost) : 0,
      vendor: vendor || null, status, location: location || null, remarks: remarks || null,
    }
    // auto-assign status if an employee is picked and status is still Available
    if (empId && status === 'Available') payload.status = 'Assigned'

    if (editing) {
      const { error } = await supabase.from('assets').update(payload).eq('id', editing.id)
      if (error) { setErr(error.message); setBusy(false); return }
      // log assignment change
      if (empId && empId !== editing.assigned_employee_id) {
        const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
        await supabase.from('asset_assignments').insert({ org_id: prof?.org_id, asset_id: editing.id, employee_id: empId, project_id: projectId || null })
      }
    } else {
      const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
      const { data: code } = await supabase.rpc('next_asset_code')
      const { data: created, error } = await supabase.from('assets')
        .insert({ ...payload, org_id: prof?.org_id, asset_code: code ?? null })
        .select('id').single()
      if (error) { setErr(error.message); setBusy(false); return }
      if (empId && created) {
        await supabase.from('asset_assignments').insert({ org_id: prof?.org_id, asset_id: (created as any).id, employee_id: empId, project_id: projectId || null })
      }
    }
    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-2xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{editing ? 'Edit Asset' : 'Add Asset'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <L label="Asset Name *"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="JCB 3DX, Tata Tipper, Dell Laptop…" autoFocus /></L>
          <L label="Category">
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          </L>
          <L label="Status">
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          </L>
          <L label="Company / Branch"><input className="input" value={branch} onChange={e => setBranch(e.target.value)} placeholder="Head Office" /></L>
          <L label="Assigned Project / Site">
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— None —</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </L>
          <L label="Assigned Employee">
            <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">— None —</option>{emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </L>
          <L label="Purchase Date"><input type="date" className="input" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></L>
          <L label="Purchase Cost (INR)"><input className="input mono" inputMode="numeric" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></L>
          <L label="Vendor / Supplier"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></L>
          <L label="Location"><input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Site yard, Store…" /></L>
          <div className="sm:col-span-2">
            <L label="Remarks"><textarea className="input" rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} /></L>
          </div>
        </div>
        {err && <div className="px-5 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2 sticky bottom-0 bg-[#1B1F2A]">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Asset'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}