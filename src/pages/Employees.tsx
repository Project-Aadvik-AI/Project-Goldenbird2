import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'

type Employee = {
  id: string
  emp_code: string | null
  full_name: string
  designation: string | null
  department: string | null
  phone: string | null
  email: string | null
  address: string | null
  join_date: string | null
  exit_date: string | null
  status: string
  project_id: string | null
  photo: string | null
}

type EmpDoc = {
  id: string
  employee_id: string
  doc_type: string | null
  title: string | null
  file: string | null
  expiry_date: string | null
  created_at: string
}

const DEPTS = ['Site', 'Accounts', 'Admin', 'Stores', 'HR', 'Other']
const DOC_TYPES = ['ID Proof', 'Contract', 'Certificate', 'Medical', 'License', 'Other']

export default function Employees() {
  const { projects } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [managingDocs, setManagingDocs] = useState<Employee | null>(null)
  const [filter, setFilter] = useState<'All' | 'Active' | 'Inactive'>('Active')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('full_name')
    setRows((data as Employee[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = rows.filter(r => filter === 'All' ? true : r.status === filter)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Employees</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Company-wide staff directory · {rows.length} on record</p>
        </div>
        <div className="flex gap-2">
          <select className="input" value={filter} onChange={e => setFilter(e.target.value as any)} style={{ minWidth: 120 }}>
            <option>Active</option><option>Inactive</option><option>All</option>
          </select>
          {can('hr', 'add') && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Employee
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Code', 'Name', 'Designation', 'Dept', 'Project', 'Phone', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(r => {
              const projName = projects.find(p => p.id === r.project_id)?.name
              return (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{r.emp_code || '—'}</td>
                  <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{r.full_name}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.designation || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.department || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{projName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{r.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${r.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-[#dcc1ae] border border-white/10'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => setManagingDocs(r)}>Docs</button>
                    {can('hr', 'edit') && (
                      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => { setEditing(r); setShowForm(true) }}>Edit</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!visible.length && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No employees yet — add your first.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <EmployeeForm
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
      {managingDocs && (
        <DocsDrawer employee={managingDocs} onClose={() => setManagingDocs(null)} />
      )}
    </div>
  )
}

function EmployeeForm({ editing, onClose, onSaved }: { editing: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { projects } = useProject()
  const [empCode, setEmpCode] = useState(editing?.emp_code ?? '')
  const [fullName, setFullName] = useState(editing?.full_name ?? '')
  const [designation, setDesignation] = useState(editing?.designation ?? '')
  const [department, setDepartment] = useState(editing?.department ?? 'Site')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [joinDate, setJoinDate] = useState(editing?.join_date ?? '')
  const [exitDate, setExitDate] = useState(editing?.exit_date ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Active')
  const [projectId, setProjectId] = useState(editing?.project_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    const payload: any = {
      emp_code: empCode || null,
      full_name: fullName,
      designation: designation || null,
      department: department || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      join_date: joinDate || null,
      exit_date: exitDate || null,
      status,
      project_id: projectId || null,
    }
    if (editing) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) { setErr(error.message); return }
    } else {
      const { data: prof } = await supabase.from('profiles').select('org_id').single()
      const { error } = await supabase.from('employees').insert({ ...payload, org_id: prof?.org_id })
      setBusy(false)
      if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Employee' : 'Add Employee'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Emp Code"><input className="input mono" value={empCode} onChange={e => setEmpCode(e.target.value)} /></L>
            <L label="Full Name *"><input className="input" value={fullName} onChange={e => setFullName(e.target.value)} /></L>
            <L label="Designation"><input className="input" value={designation} onChange={e => setDesignation(e.target.value)} /></L>
            <L label="Department">
              <select className="input" value={department} onChange={e => setDepartment(e.target.value)}>
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </L>
            <L label="Phone"><input className="input mono" value={phone} onChange={e => setPhone(e.target.value)} /></L>
            <L label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></L>
            <L label="Join Date"><input className="input" type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} /></L>
            <L label="Exit Date"><input className="input" type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} /></L>
            <L label="Project Posting">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option>Active</option><option>Inactive</option>
              </select>
            </L>
          </div>
          <L label="Address"><input className="input" value={address} onChange={e => setAddress(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function DocsDrawer({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [docs, setDocs] = useState<EmpDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [docType, setDocType] = useState('ID Proof')
  const [title, setTitle] = useState('')
  const [expiry, setExpiry] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employee_documents').select('*')
      .eq('employee_id', employee.id).order('created_at', { ascending: false })
    setDocs((data as EmpDoc[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [employee.id])

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setErr('Select a file'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const path = makeObjectPath(prof?.org_id, file, `employees/${employee.id}`)
    const { path: stored, error: upErr } = await uploadPrivate('employee-docs', path, file)
    if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
    const { error } = await supabase.from('employee_documents').insert({
      org_id: prof?.org_id, employee_id: employee.id,
      doc_type: docType, title: title || file.name,
      file: stored, expiry_date: expiry || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setTitle(''); setExpiry(''); setFile(null)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('employee_documents').delete().eq('id', id)
    load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-2xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Documents · {employee.full_name}</h3>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">Upload IDs, contracts, licenses etc.</p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={upload} className="p-5 border-b border-white/5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Type">
              <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Aadhaar, PAN, etc." /></L>
            <L label="Expiry (optional)"><input className="input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></L>
            <L label="File">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 20) : 'Choose file'}
              </button>
            </L>
          </div>
          {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
          <button className="btn btn-primary w-full mt-3" disabled={busy}>{busy ? 'Uploading…' : 'Upload Document'}</button>
        </form>
        <div className="p-5">
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">On file · {docs.length}</div>
          <div className="space-y-2">
            {docs.map(d => {
              const days = d.expiry_date ? daysUntil(d.expiry_date) : null
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                  <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>description</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">{d.title || d.doc_type || 'Untitled'}</div>
                    <div className="text-[10px] text-[#dcc1ae]/60">
                      {d.doc_type}
                      {d.expiry_date ? ` · Expires ${d.expiry_date}` : ''}
                    </div>
                  </div>
                  {days !== null && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${days < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : days <= 30 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {days < 0 ? 'Expired' : `${days}d`}
                    </span>
                  )}
                  {d.file && <PrivateLink bucket="employee-docs" path={d.file} className="btn btn-ghost" >Open</PrivateLink>}
                  <button className="text-red-400 hover:text-red-300" onClick={() => del(d.id)}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                  </button>
                </div>
              )
            })}
            {!docs.length && !loading && (
              <div className="text-[#dcc1ae]/60 text-sm py-4 text-center">No documents yet.</div>
            )}
            {loading && <div className="text-[#dcc1ae] text-sm py-4 text-center">Loading…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 col-span-1">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}