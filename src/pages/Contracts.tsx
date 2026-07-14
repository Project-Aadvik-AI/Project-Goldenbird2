import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'

type Contract = {
  id: string
  project_id: string | null
  title: string
  doc_type: string | null
  party: string | null
  ref_no: string | null
  start_date: string | null
  expiry_date: string | null
  reminder_days: number | null
  file: string | null
  remark: string | null
  created_at: string
}

const TYPES = ['Contract', 'License', 'Insurance', 'GST', 'PF', 'ESI', 'Bank Guarantee', 'Other']

export default function Contracts() {
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const { projects } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [projFilter, setProjFilter] = useState<string>('all')

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    const { data } = await supabase.from('contracts').select('*').order('expiry_date', { ascending: true, nullsFirst: false }).eq('project_id', activeProject?.id ?? '')

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((data as Contract[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  async function del(id: string) {
    if (!confirm('Delete this contract?')) return
    await supabase.from('contracts').delete().eq('id', id)
    load()
  }

  const visible = rows.filter(r => {
    if (typeFilter !== 'All' && r.doc_type !== typeFilter) return false
    if (projFilter !== 'all' && r.project_id !== projFilter) return false
    return true
  })

  const expiringCount = rows.filter(r => {
    if (!r.expiry_date) return false
    const d = daysUntil(r.expiry_date)
    return d >= 0 && d <= (r.reminder_days ?? 30)
  }).length
  const expiredCount = rows.filter(r => r.expiry_date && daysUntil(r.expiry_date) < 0).length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Contracts & Compliance</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            {rows.length} on record ·
            {expiredCount > 0 && <span className="text-red-400 font-semibold"> {expiredCount} expired</span>}
            {expiredCount > 0 && expiringCount > 0 && ' ·'}
            {expiringCount > 0 && <span className="text-amber-400 font-semibold"> {expiringCount} expiring soon</span>}
            {expiredCount === 0 && expiringCount === 0 && <span className="text-emerald-400"> all current</span>}
          </p>
        </div>
        {can('contracts', 'add') && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Contract
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ minWidth: 150 }}>
          <option>All</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input" value={projFilter} onChange={e => setProjFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Title', 'Type', 'Party', 'Ref No', 'Project', 'Start', 'Expiry', 'Days', 'File', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(r => {
              const projName = projects.find(p => p.id === r.project_id)?.name
              const days = r.expiry_date ? daysUntil(r.expiry_date) : null
              const reminder = r.reminder_days ?? 30
              const badgeCls =
                days === null ? 'bg-white/5 text-[#dcc1ae] border border-white/10' :
                days < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                days <= reminder ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              return (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{r.title}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.doc_type || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.party || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{r.ref_no || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{projName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{r.start_date || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#e2e2e8] whitespace-nowrap">{r.expiry_date || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${badgeCls}`}>
                      {days === null ? '—' : days < 0 ? 'Expired' : `${days}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.file
                      ? <PrivateLink bucket="contracts" path={r.file} className="text-[#ffb87b] hover:underline text-xs">Open</PrivateLink>
                      : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {can('contracts', 'edit') && (
                      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => { setEditing(r); setShowForm(true) }}>Edit</button>
                    )}
                    {can('contracts', 'delete') && (
                      <button className="text-red-400 text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => del(r.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!visible.length && !loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No contracts match.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <ContractForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function ContractForm({ editing, onClose, onSaved }: { editing: Contract | null; onClose: () => void; onSaved: () => void }) {
  const { projects, activeProject } = useProject()
  const [title, setTitle] = useState(editing?.title ?? '')
  const [docType, setDocType] = useState(editing?.doc_type ?? 'Contract')
  const [party, setParty] = useState(editing?.party ?? '')
  const [refNo, setRefNo] = useState(editing?.ref_no ?? '')
  const [startDate, setStartDate] = useState(editing?.start_date ?? '')
  const [expiry, setExpiry] = useState(editing?.expiry_date ?? '')
  const [reminderDays, setReminderDays] = useState(String(editing?.reminder_days ?? 30))
  const [projectId, setProjectId] = useState(editing?.project_id ?? activeProject?.id ?? '')
  const [remark, setRemark] = useState(editing?.remark ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErr('Title required'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id

    let fileUrl: string | null = editing?.file ?? null
    if (file) {
      const path = makeObjectPath(orgId, file, 'contracts')
      const { path: stored, error: upErr } = await uploadPrivate('contracts', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      fileUrl = stored ?? null
    }

    const payload: any = {
      title, doc_type: docType, party: party || null, ref_no: refNo || null,
      start_date: startDate || null, expiry_date: expiry || null,
      reminder_days: Number(reminderDays) || 30,
      project_id: projectId || null, remark: remark || null, file: fileUrl,
    }
    if (editing) {
      const { error } = await supabase.from('contracts').update(payload).eq('id', editing.id)
      setBusy(false); if (error) { setErr(error.message); return }
    } else {
      const { error } = await supabase.from('contracts').insert({ ...payload, org_id: orgId, project_id: activeProject?.id ?? null })
      setBusy(false); if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Contract' : 'Add Contract'}</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <L label="Title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. RITES Contract 33.55Cr" /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Type">
              <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="Party"><input className="input" value={party} onChange={e => setParty(e.target.value)} placeholder="RITES, Insurer…" /></L>
            <L label="Ref No"><input className="input mono" value={refNo} onChange={e => setRefNo(e.target.value)} /></L>
            <L label="Project">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">Company-level</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L label="Start Date"><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></L>
            <L label="Expiry Date"><input className="input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></L>
            <L label="Remind (days before)"><input className="input mono" inputMode="numeric" value={reminderDays} onChange={e => setReminderDays(e.target.value)} /></L>
            <L label="File">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 16) : (editing?.file ? 'Replace' : 'Attach')}
              </button>
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
  ), document.body)
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}