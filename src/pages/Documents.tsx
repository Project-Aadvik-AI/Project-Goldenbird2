import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'

type Doc = {
  id: string
  project_id: string | null
  category: string | null
  title: string
  file: string | null
  remark: string | null
  created_at: string
}

const CATEGORIES = ['Drawings', 'Bills', 'Photos', 'Reports', 'Approvals', 'Tender', 'Other']

export default function Documents() {
  const { activeProject } = useProject()
  const { projects } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [projFilter, setProjFilter] = useState<string>('all')
  const [catFilter, setCatFilter] = useState<string>('All')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*').order('created_at', { ascending: false }).eq('project_id', activeProject?.id ?? '')
    setRows((data as Doc[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = rows.filter(r => {
    if (projFilter === 'company' && r.project_id) return false
    if (projFilter !== 'all' && projFilter !== 'company' && r.project_id !== projFilter) return false
    if (catFilter !== 'All' && r.category !== catFilter) return false
    return true
  })

  async function del(id: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('documents').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Document Vault</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Drawings, bills, approvals — filed by project</p>
        </div>
        {can('documents', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span> Upload
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select className="input" value={projFilter} onChange={e => setProjFilter(e.target.value)} style={{ minWidth: 180 }}>
          <option value="all">All Projects</option>
          <option value="company">Company-level (no project)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ minWidth: 150 }}>
          <option>All</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Title', 'Category', 'Project', 'Uploaded', 'Remark', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(r => {
              const projName = projects.find(p => p.id === r.project_id)?.name
              return (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-[#e2e2e8] font-semibold">
                    {r.file
                      ? <PrivateLink bucket="documents" path={r.file} className="hover:text-[#ffb87b]">{r.title}</PrivateLink>
                      : r.title}
                  </td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.category || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{projName || <span className="text-[#dcc1ae]/50 italic">Company</span>}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{r.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-[#dcc1ae] max-w-[200px] truncate">{r.remark || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.file && <PrivateLink bucket="documents" path={r.file} className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline mr-3">Open</PrivateLink>}
                    {can('documents', 'delete') && (
                      <button className="text-red-400 text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => del(r.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!visible.length && !loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No documents match.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <DocForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function DocForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { projects, activeProject } = useProject()
  const [projectId, setProjectId] = useState(activeProject?.id ?? '')
  const [category, setCategory] = useState('Drawings')
  const [title, setTitle] = useState('')
  const [remark, setRemark] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setErr('Choose a file'); return }
    if (!title.trim()) { setErr('Title is required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const scope = projectId || 'company'
    const path = makeObjectPath(prof?.org_id, file, scope)
    const { path: stored, error: upErr } = await uploadPrivate('documents', path, file)
    if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
    const { error } = await supabase.from('documents').insert({
      org_id: prof?.org_id, project_id: projectId || null,
      category, title, remark: remark || null, file: stored,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Upload Document</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Project">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">Company-level</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L label="Category">
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </L>
          </div>
          <L label="Title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NALCO Track Plan Rev 3" /></L>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
          <L label="File *">
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
              {file ? file.name.slice(0, 30) : 'Choose file'}
            </button>
          </L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}