import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject, Project } from '../lib/project'
import { useAuth } from '../lib/auth'

export default function Projects() {
  const { projects, activeProject, setActiveProject, loading, reload } = useProject()
  const { isAdmin, profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Projects</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Manage all construction projects for this organization</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Project
          </button>
        )}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">All Projects</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{projects.length} total</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Active', 'Name', 'Code', 'Client', 'Contract Value', 'Location', 'Status', 'Start', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {projects.map(p => {
              const isActive = activeProject?.id === p.id
              return (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setActiveProject(p)}
                      className={`w-8 h-8 rounded-full grid place-items-center transition-all ${isActive ? 'bg-[#ff8f00] text-[#0F1115]' : 'bg-white/5 text-[#dcc1ae] hover:bg-white/10'}`}
                      title={isActive ? 'Active project' : 'Set as active'}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: isActive ? "'FILL' 1" : undefined }}>
                        {isActive ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae]">{p.code || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{p.client || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[#e2e2e8]">
                    {p.contract_value != null ? `₹${Number(p.contract_value).toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{p.location || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{p.start_date || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin && (
                      <button
                        onClick={() => { setEditing(p); setShowForm(true) }}
                        className="text-[#dcc1ae] hover:text-[#ffb87b] transition-colors"
                        title="Edit project"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => setDeleting(p)}
                        className="text-[#dcc1ae] hover:text-red-400 transition-colors ml-3"
                        title="Delete project — permanent"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!projects.length && !loading && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
                No projects yet — create your first one to start tracking work.
              </td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <ProjectForm
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await reload() }}
        />
      )}

      {deleting && (
        <DeleteProjectModal
          project={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            if (activeProject?.id === deleting.id) setActiveProject(null)
            setDeleting(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function DeleteProjectModal({ project, onClose, onDeleted }: { project: Project; onClose: () => void; onDeleted: () => void | Promise<void> }) {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const armed = confirmText.trim() === (project.name || '').trim() && !!project.name

  async function run() {
    if (!armed) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('delete_project', { p_project_id: project.id })
    if (error) { setErr(error.message); setBusy(false); return }
    await onDeleted()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-red-500/30 rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-red-400">warning</span>
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Delete project — permanent</h3>
        </div>
        <div className="p-5 space-y-3 text-[13px] text-[#dcc1ae]">
          <p>
            This permanently deletes <span className="font-semibold text-[#e2e2e8]">{project.name}</span> and
            {' '}<span className="text-red-400 font-semibold">all of its data</span> — expenses, attendance, labour, DPR,
            BOQ, billing, measurement books, work orders, purchase requests, vendor bills, stock and documents. This cannot be undone.
          </p>
          <p>
            Company records are <span className="text-emerald-400 font-semibold">kept</span> and simply unlinked from this
            project: employees, assets/vehicles and loans.
          </p>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider">Type the project name to confirm</span>
            <input className="input mt-1" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={project.name || ''} autoFocus />
          </div>
          {err && <div className="text-red-400">{err}</div>}
        </div>
        <div className="p-5 pt-2 flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn flex-[2]"
            style={{ background: armed ? '#ef4444' : 'rgba(239,68,68,0.3)', color: '#fff', cursor: armed && !busy ? 'pointer' : 'not-allowed' }}
            disabled={!armed || busy}
            onClick={run}
          >{busy ? 'Deleting…' : 'Delete this project forever'}</button>
        </div>
      </div>
    </div>
  ), document.body)
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const cls =
    s === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
    s === 'on hold' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
    s === 'completed' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
    'bg-white/5 text-[#dcc1ae] border border-white/10'
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cls}`}>{status || '—'}</span>
}

function ProjectForm({ editing, onClose, onSaved }: { editing: Project | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? '')
  const [code, setCode] = useState(editing?.code ?? '')
  const [client, setClient] = useState(editing?.client ?? '')
  const [contractNo, setContractNo] = useState(editing?.contract_no ?? '')
  const [contractValue, setContractValue] = useState(editing?.contract_value?.toString() ?? '')
  const [location, setLocation] = useState(editing?.location ?? '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? '')
  const [endDate, setEndDate] = useState(editing?.end_date ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Active')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // --- Head Office: attach employees & assets to this project ---
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])
  const [assetList, setAssetList] = useState<{ id: string; name: string; asset_code: string | null; category: string | null }[]>([])
  const [pickedPeople, setPickedPeople] = useState<Set<string>>(new Set())
  const [pickedAssets, setPickedAssets] = useState<Set<string>>(new Set())

  useEffect(() => {
    (async () => {
      const [{ data: pr }, { data: as }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('status', 'active').order('full_name'),
        supabase.from('assets').select('id, name, asset_code, category').eq('archived', false).order('name'),
      ])
      setPeople((pr as any[]) ?? [])
      setAssetList((as as any[]) ?? [])
      if (editing) {
        const [{ data: up }, { data: aa }] = await Promise.all([
          supabase.from('user_projects').select('user_id').eq('project_id', editing.id),
          supabase.from('assets').select('id').eq('project_id', editing.id),
        ])
        setPickedPeople(new Set(((up as any[]) ?? []).map(x => x.user_id)))
        setPickedAssets(new Set(((aa as any[]) ?? []).map(x => x.id)))
      }
    })()
  }, [editing?.id])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Project name is required'); return }
    setBusy(true); setErr(null)

    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      client: client.trim() || null,
      contract_no: contractNo.trim() || null,
      contract_value: contractValue ? Number(contractValue) : null,
      location: location.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status,
    }

    let error
    let projectId = editing?.id ?? ''
    // org_id from the signed-in profile — NEVER an unfiltered .maybeSingle() (returns null when several profiles are visible)
    const prof = { org_id: profile?.org_id }
    if (editing) {
      ({ error } = await supabase.from('projects').update(payload).eq('id', editing.id))
    } else {
      const { data: created, error: insErr } = await supabase.from('projects')
        .insert({ ...payload, org_id: prof?.org_id }).select('id').single()
      error = insErr
      projectId = (created as any)?.id ?? ''
    }
    if (error) { setBusy(false); setErr(error.message); return }

    // --- sync assigned EMPLOYEES (user_projects) ---
    if (projectId) {
      const [{ data: existing }, { data: curAssets }] = await Promise.all([
        supabase.from('user_projects').select('user_id').eq('project_id', projectId),
        supabase.from('assets').select('id').eq('project_id', projectId),
      ])
      const before = new Set(((existing as any[]) ?? []).map(x => x.user_id))
      const toAdd = [...pickedPeople].filter(id => !before.has(id))
      const toRemove = [...before].filter(id => !pickedPeople.has(id))

      // --- sync assigned ASSETS (assets.project_id) ---
      const beforeA = new Set(((curAssets as any[]) ?? []).map(x => x.id))
      const addA = [...pickedAssets].filter(id => !beforeA.has(id))
      const remA = [...beforeA].filter(id => !pickedAssets.has(id))

      // One batched request per operation (was one request PER person/asset —
      // that loop is what made "Saving…" take seconds).
      const ops: PromiseLike<unknown>[] = []
      if (toAdd.length) ops.push(supabase.from('user_projects').insert(toAdd.map(uid => ({ org_id: prof?.org_id, user_id: uid, project_id: projectId }))))
      if (toRemove.length) ops.push(supabase.from('user_projects').delete().eq('project_id', projectId).in('user_id', toRemove))
      if (addA.length) {
        ops.push(supabase.from('assets').update({ project_id: projectId, status: 'Assigned' }).in('id', addA))
        ops.push(supabase.from('asset_assignments').insert(addA.map(aid => ({ org_id: prof?.org_id, asset_id: aid, project_id: projectId }))))
      }
      if (remA.length) ops.push(supabase.from('assets').update({ project_id: null, status: 'Available' }).in('id', remA))
      await Promise.all(ops)
    }

    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Project' : 'New Project'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <L label="Project Name *">
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="NALCO Damanjodi Railway Siding" autoFocus />
          </L>
          <div className="grid grid-cols-2 gap-4">
            <L label="Code"><input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="NALCO-DMJ" /></L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option>Active</option>
                <option>On Hold</option>
                <option>Completed</option>
              </select>
            </L>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <L label="Client"><input className="input" value={client} onChange={e => setClient(e.target.value)} placeholder="RITES" /></L>
            <L label="Contract No."><input className="input" value={contractNo} onChange={e => setContractNo(e.target.value)} /></L>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <L label="Contract Value (₹)">
              <input className="input font-mono" inputMode="decimal" value={contractValue} onChange={e => setContractValue(e.target.value)} placeholder="33550000" />
            </L>
            <L label="Location"><input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Damanjodi, Odisha" /></L>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <L label="Start Date"><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></L>
            <L label="End Date"><input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></L>
          </div>

          {/* ---- Head Office: assign employees & assets ---- */}
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>groups</span>
              <span className="text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wider">Assign Employees</span>
              <span className="text-[11px] text-[#dcc1ae]/50 ml-auto">{pickedPeople.size} selected</span>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.04]">
              {people.map(p => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                  <input type="checkbox" className="accent-[#ff8f00]" checked={pickedPeople.has(p.id)}
                    onChange={() => toggle(pickedPeople, setPickedPeople, p.id)} />
                  <span className="text-[13px] text-[#e2e2e8]">{p.full_name || 'Unnamed'}</span>
                </label>
              ))}
              {!people.length && <div className="px-3 py-3 text-[12px] text-[#dcc1ae]/50">No active staff logins yet.</div>}
            </div>
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">Selected employees will see this project in their dashboard.</p>
          </div>

          <div className="pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>inventory</span>
              <span className="text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wider">Assign Assets</span>
              <span className="text-[11px] text-[#dcc1ae]/50 ml-auto">{pickedAssets.size} selected</span>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.04]">
              {assetList.map(a => (
                <label key={a.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                  <input type="checkbox" className="accent-[#ff8f00]" checked={pickedAssets.has(a.id)}
                    onChange={() => toggle(pickedAssets, setPickedAssets, a.id)} />
                  <span className="text-[13px] text-[#e2e2e8]">{a.name}</span>
                  <span className="text-[11px] text-[#dcc1ae]/50 font-mono ml-auto">{a.asset_code || ''} {a.category ? `· ${a.category}` : ''}</span>
                </label>
              ))}
              {!assetList.length && <div className="px-3 py-3 text-[12px] text-[#dcc1ae]/50">No assets yet — add them in Company Assets.</div>}
            </div>
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">Assigned assets are marked "Assigned" and linked to this project.</p>
          </div>

          {err && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{err}</div>}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create Project')}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}