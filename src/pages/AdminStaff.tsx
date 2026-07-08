import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'

type Staff = {
  id: string
  full_name: string | null
  role: string
  status: string
  is_admin: boolean
  created_at: string
}

type Perm = {
  module: string
  can_view: boolean
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
}

const MODULES = [
  { key: 'expenses', label: 'Daily Expenses' },
  { key: 'store', label: 'Store IN/OUT' },
  { key: 'machines', label: 'Machine Status' },
  { key: 'dpr', label: 'Daily Progress' },
  { key: 'labour', label: 'Labour & Wages' },
  { key: 'purchase_requests', label: 'Purchase Requests' },
  { key: 'purchase', label: 'Purchase Team (WO from PR)' },
  { key: 'work_orders', label: 'Work Orders' },
  { key: 'drawings', label: 'Drawings' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'vendor_bills', label: 'Vendor Bills' },
  { key: 'reports', label: 'Reports' },
  { key: 'hr', label: 'HR (Employees, Attendance)' },
  { key: 'documents', label: 'Documents' },
  { key: 'correspondence', label: 'Correspondence' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'masters', label: 'Master Data' },
] as const

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  disabled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function AdminStaff() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Staff | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles')
      .select('id, full_name, role, status, is_admin, created_at')
      .order('created_at', { ascending: false })
    setRows((data as Staff[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (!isAdmin) return <NotAdmin />

  async function setStatus(id: string, status: string) {
    await supabase.from('profiles').update({ status }).eq('id', id)
    load()
  }

  async function toggleAdmin(row: Staff) {
    if (!confirm(row.is_admin ? 'Remove admin rights from this user?' : 'Grant admin rights?')) return
    await supabase.from('profiles').update({ is_admin: !row.is_admin }).eq('id', row.id)
    load()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Staff & Permissions</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Approve joiners, set what each person can access · {rows.length} total</p>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Name', 'Role', 'Status', 'Joined', 'Admin', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{r.full_name || <span className="italic text-[#dcc1ae]/60">Unnamed</span>}</td>
                <td className="px-4 py-3 text-[#dcc1ae] capitalize">{r.role}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[r.status] || 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{r.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleAdmin(r)} className={`text-xs font-semibold uppercase tracking-wider hover:underline ${r.is_admin ? 'text-[#ffb87b]' : 'text-[#dcc1ae]/60'}`}>
                    {r.is_admin ? 'Admin' : 'Grant'}
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.status === 'pending' && (
                    <button onClick={() => setStatus(r.id, 'active')} className="text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3">Approve</button>
                  )}
                  {r.status === 'active' && (
                    <button onClick={() => setStatus(r.id, 'disabled')} className="text-red-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3">Disable</button>
                  )}
                  {r.status === 'disabled' && (
                    <button onClick={() => setStatus(r.id, 'active')} className="text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3">Re-enable</button>
                  )}
                  <button onClick={() => setEditing(r)} className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline">Permissions</button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No staff yet.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {editing && <PermsDrawer user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PermsDrawer({ user, onClose }: { user: Staff; onClose: () => void }) {
  const { projects } = useProject()
  const [perms, setPerms] = useState<Record<string, Perm>>({})
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: p }, { data: up }] = await Promise.all([
      supabase.from('user_permissions').select('module, can_view, can_add, can_edit, can_delete').eq('user_id', user.id),
      supabase.from('user_projects').select('project_id').eq('user_id', user.id),
    ])
    const map: Record<string, Perm> = {}
    for (const m of MODULES) {
      map[m.key] = { module: m.key, can_view: false, can_add: false, can_edit: false, can_delete: false }
    }
    for (const row of (p as Perm[]) ?? []) map[row.module] = row
    setPerms(map)
    setAssigned(new Set(((up as { project_id: string }[]) ?? []).map(x => x.project_id)))
    setLoading(false)
  }
  useEffect(() => { load() }, [user.id])

  function togglePerm(mod: string, field: keyof Omit<Perm, 'module'>) {
    setPerms(cur => ({ ...cur, [mod]: { ...cur[mod], [field]: !cur[mod][field] } }))
  }

  function toggleProject(pid: string) {
    setAssigned(cur => {
      const next = new Set(cur)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
  }

  async function save() {
    setSaving(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const orgId = prof?.org_id
    if (!orgId) { setSaving(false); return }

    const rows = MODULES.map(m => ({
      user_id: user.id,
      org_id: orgId,
      module: m.key,
      can_view: perms[m.key].can_view,
      can_add: perms[m.key].can_add,
      can_edit: perms[m.key].can_edit,
      can_delete: perms[m.key].can_delete,
    }))
    await supabase.from('user_permissions').upsert(rows, { onConflict: 'user_id,module' })

    const { data: existing } = await supabase.from('user_projects').select('project_id').eq('user_id', user.id)
    const existingIds = new Set(((existing as { project_id: string }[]) ?? []).map(r => r.project_id))
    const toAdd = [...assigned].filter(p => !existingIds.has(p))
    const toRemove = [...existingIds].filter(p => !assigned.has(p))
    if (toAdd.length) {
      await supabase.from('user_projects').insert(toAdd.map(project_id => ({ user_id: user.id, project_id, org_id: orgId })))
    }
    for (const pid of toRemove) {
      await supabase.from('user_projects').delete().eq('user_id', user.id).eq('project_id', pid)
    }
    setSaving(false)
    onClose()
  }

  function setAllForModule(mod: string, value: boolean) {
    setPerms(cur => ({
      ...cur,
      [mod]: { module: mod, can_view: value, can_add: value, can_edit: value, can_delete: value },
    }))
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-3xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{user.full_name || 'Staff'}</h3>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">Set which modules and projects this person can access</p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#dcc1ae]">Loading…</div>
        ) : (
          <>
            <div className="p-5 border-b border-white/5">
              <h4 className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">Module Permissions</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">
                      <th className="text-left pb-2">Module</th>
                      <th className="text-center pb-2 px-2">View</th>
                      <th className="text-center pb-2 px-2">Add</th>
                      <th className="text-center pb-2 px-2">Edit</th>
                      <th className="text-center pb-2 px-2">Delete</th>
                      <th className="text-right pb-2 px-2">Bulk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {MODULES.map(m => {
                      const p = perms[m.key]
                      return (
                        <tr key={m.key} className="hover:bg-white/[0.02]">
                          <td className="py-2 pr-2 text-[#e2e2e8] whitespace-nowrap">{m.label}</td>
                          {(['can_view', 'can_add', 'can_edit', 'can_delete'] as const).map(f => (
                            <td key={f} className="text-center px-2">
                              <input type="checkbox" className="accent-[#ff8f00] w-4 h-4"
                                checked={p[f]} onChange={() => togglePerm(m.key, f)} />
                            </td>
                          ))}
                          <td className="text-right px-2 whitespace-nowrap">
                            <button className="text-[10px] text-[#ffb87b] uppercase tracking-wider hover:underline mr-2" onClick={() => setAllForModule(m.key, true)}>All</button>
                            <button className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider hover:underline" onClick={() => setAllForModule(m.key, false)}>None</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 border-b border-white/5">
              <h4 className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">Projects Assigned · {assigned.size}/{projects.length}</h4>
              {projects.length === 0 && (
                <div className="text-[12px] text-[#dcc1ae]/60">No projects yet — create some in Admin › Projects.</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] cursor-pointer">
                    <input type="checkbox" className="accent-[#ff8f00] w-4 h-4"
                      checked={assigned.has(p.id)} onChange={() => toggleProject(p.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">{p.name}</div>
                      {p.code && <div className="text-[10px] font-mono text-[#dcc1ae]/60 uppercase">{p.code}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-5 flex gap-3 sticky bottom-0 bg-[#1B1F2A] border-t border-white/5">
              <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary flex-[2]" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Permissions'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body)
}

function NotAdmin() {
  return (
    <div className="card p-8 text-center max-w-md mx-auto mt-8">
      <div className="w-12 h-12 rounded-full bg-red-500/10 grid place-items-center mx-auto mb-3 border border-red-500/20">
        <span className="material-symbols-outlined text-red-400" style={{ fontSize: '24px' }}>lock</span>
      </div>
      <h2 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Admin only</h2>
      <p className="text-sm text-[#dcc1ae]">You need admin rights to see this page.</p>
    </div>
  )
}