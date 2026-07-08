import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject, Project } from '../lib/project'
import { useAuth } from '../lib/auth'

export default function Projects() {
  const { projects, activeProject, setActiveProject, loading, reload } = useProject()
  const { isAdmin } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)

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
    if (editing) {
      ({ error } = await supabase.from('projects').update(payload).eq('id', editing.id))
    } else {
      const { data: prof } = await supabase.from('profiles').select('org_id').single()
      ;({ error } = await supabase.from('projects').insert({ ...payload, org_id: prof?.org_id }))
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
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