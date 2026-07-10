import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink, PrivateImage } from '../components/PrivateFile'

type Employee = {
  id: string
  emp_code: string | null
  full_name: string
  designation: string | null
  department: string | null
  phone: string | null
  email: string | null
  address: string | null
  aadhaar: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  qualification: string | null
  monthly_salary: number | null
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
const DOC_TYPES = ['Offer Letter', 'Degree / Qualification', 'Aadhaar', 'ID Proof', 'Contract', 'Certificate', 'Medical', 'License', 'Other']

export default function Employees() {
  const { projects } = useProject()
  const { can, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [creds, setCreds] = useState<{ name: string; username: string; password: string; emailed: boolean } | null>(null)
  const [creatingLogin, setCreatingLogin] = useState<string | null>(null)

  async function createLogin(r: Employee) {
    if (!r.email) { alert('This employee has no email. Add an email first (needed for login).'); return }
    if (!confirm(`Create a login account for ${r.full_name} (${r.email})?\nA temporary password will be generated.`)) return
    setCreatingLogin(r.id)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      const { data, error } = await supabase.functions.invoke('create-employee-login', {
        body: { employee_id: r.id, email: r.email, full_name: r.full_name, employee_code: r.emp_code },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (error) { alert('Failed: ' + error.message); return }
      if ((data as any)?.error) { alert('Failed: ' + (data as any).error); return }
      setCreds({ name: r.full_name, username: (data as any).username, password: (data as any).temp_password, emailed: !!(data as any).emailed })
      load()
    } catch (e) {
      alert('Failed: ' + String(e))
    } finally { setCreatingLogin(null) }
  }

  async function deleteEmployee(r: Employee) {
    // safety: check for linked history that would be orphaned
    const [{ count: attC }, { count: payC }, { count: advC }] = await Promise.all([
      supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('employee_id', r.id),
      supabase.from('employee_payments').select('id', { count: 'exact', head: true }).eq('employee_id', r.id),
      supabase.from('advances').select('id', { count: 'exact', head: true }).eq('employee_id', r.id),
    ])
    const hist = (attC ?? 0) + (payC ?? 0) + (advC ?? 0)
    const warn = hist > 0
      ? `\n\nWARNING: This employee has ${attC ?? 0} attendance, ${payC ?? 0} payment, and ${advC ?? 0} advance record(s). Deleting will also remove those. Consider setting status to Inactive instead.`
      : ''
    if (!confirm(`Delete employee "${r.full_name}" (${r.emp_code || 'no code'})?${warn}\n\nThis cannot be undone.`)) return
    // delete dependent records first (no cascade guaranteed), then the employee
    await Promise.all([
      supabase.from('attendance').delete().eq('employee_id', r.id),
      supabase.from('employee_payments').delete().eq('employee_id', r.id),
      supabase.from('advances').delete().eq('employee_id', r.id),
      supabase.from('employee_documents').delete().eq('employee_id', r.id),
    ])
    const { error } = await supabase.from('employees').delete().eq('id', r.id)
    if (error) { alert('Could not delete: ' + error.message); return }
    load()
  }
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [managingDocs, setManagingDocs] = useState<Employee | null>(null)
  const [filter, setFilter] = useState<'All' | 'Active' | 'Inactive'>('Active')
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('employees').select('*').order('full_name')
    setRows((data as Employee[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const q = query.trim().toLowerCase()
  const visible = rows
    .filter(r => filter === 'All' ? true : r.status === filter)
    .filter(r => {
      if (!q) return true
      return [r.full_name, r.emp_code, r.phone, r.designation, r.department]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Employees</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Company-wide staff directory · {query || filter !== 'All' ? `${visible.length} of ${rows.length}` : `${rows.length}`} on record</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#dcc1ae]/50 pointer-events-none z-10" style={{ fontSize: '18px' }}>search</span>
            <input
              className="input w-full sm:w-64"
              style={{ paddingLeft: '2.4rem', paddingRight: '2rem' }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, code, phone…"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#dcc1ae]/50 hover:text-[#e2e2e8]">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            )}
          </div>
          <select className="input" value={filter} onChange={e => setFilter(e.target.value as 'All' | 'Active' | 'Inactive')} style={{ minWidth: 120 }}>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {r.photo
                        ? <PrivateImage bucket="employee-docs" path={r.photo} alt={r.full_name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        : <span className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-[#dcc1ae] flex-shrink-0">{r.full_name.slice(0, 2).toUpperCase()}</span>}
                      <span className="text-[#e2e2e8] font-semibold">{r.full_name}</span>
                    </div>
                  </td>
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
                    <button className="text-[#e2e2e8] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => navigate(`/employees/${r.id}`)}>View</button>
                    <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => setManagingDocs(r)}>Docs</button>
                    {can('hr', 'edit') && (
                      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => { setEditing(r); setShowForm(true) }}>Edit</button>
                    )}
                    {isAdmin && (
                      <button className="text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3 disabled:opacity-40" disabled={creatingLogin === r.id} onClick={() => createLogin(r)}>{creatingLogin === r.id ? '…' : 'Create Login'}</button>
                    )}
                    {isAdmin && (
                      <button className="text-red-400 text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => deleteEmployee(r)}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!visible.length && !loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">{query ? `No employees match "${query}".` : 'No employees yet — add your first.'}</td></tr>
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
      {creds && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setCreds(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '22px' }}>key</span>
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Login created for {creds.name}</h3>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mb-4">{creds.emailed ? 'Credentials were emailed to the employee. ' : 'Email was not sent — copy and share these securely. '}They must change this password on first login.</p>
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 mb-4 space-y-2">
              <div className="flex items-center justify-between"><span className="text-[11px] text-[#dcc1ae]/60 uppercase">Username</span><span className="font-mono text-[#e2e2e8]">{creds.username}</span></div>
              <div className="flex items-center justify-between"><span className="text-[11px] text-[#dcc1ae]/60 uppercase">Temp Password</span><span className="font-mono text-[#e2e2e8]">{creds.password}</span></div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => { navigator.clipboard.writeText(`Username: ${creds.username}\nPassword: ${creds.password}`); }}>Copy</button>
              <button className="btn btn-primary flex-1" onClick={() => setCreds(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeForm({ editing, onClose, onSaved }: { editing: Employee | null; onClose: () => void; onSaved: () => void }) {
  const { projects } = useProject()
  const [fullName, setFullName] = useState(editing?.full_name ?? '')
  const [designation, setDesignation] = useState(editing?.designation ?? '')
  const [designationId, setDesignationId] = useState<string>((editing as any)?.designation_id ?? '')
  const [desigOptions, setDesigOptions] = useState<{ id: string; name: string }[]>([])
  const [department, setDepartment] = useState(editing?.department ?? 'Site')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [email, setEmail] = useState(editing?.email ?? '')
  const [address, setAddress] = useState(editing?.address ?? '')
  const [aadhaar, setAadhaar] = useState(editing?.aadhaar ?? '')
  const [emergencyContact, setEmergencyContact] = useState(editing?.emergency_contact ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(editing?.emergency_phone ?? '')
  const [qualification, setQualification] = useState(editing?.qualification ?? '')
  const [monthlySalary, setMonthlySalary] = useState(editing?.monthly_salary != null ? String(editing.monthly_salary) : '')
  const [joinDate, setJoinDate] = useState(editing?.join_date ?? '')
  const [exitDate, setExitDate] = useState(editing?.exit_date ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Active')
  const [projectId, setProjectId] = useState(editing?.project_id ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [existingPhoto] = useState(editing?.photo ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('designations').select('id, name').eq('disabled', false).order('name')
      setDesigOptions((data as { id: string; name: string }[]) ?? [])
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()

    // upload photo if a new one was chosen
    let photoPath = existingPhoto
    if (photoFile) {
      const ppath = makeObjectPath(prof?.org_id, photoFile, 'employees/photos')
      const { path: stored, error: upErr } = await uploadPrivate('employee-docs', ppath, photoFile)
      if (upErr) { setErr('Photo upload failed: ' + upErr); setBusy(false); return }
      photoPath = stored ?? existingPhoto
    }

    const payload: Record<string, unknown> = {
      full_name: fullName,
      designation: designation || null,
      designation_id: designationId || null,
      department: department || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      aadhaar: aadhaar || null,
      emergency_contact: emergencyContact || null,
      emergency_phone: emergencyPhone || null,
      qualification: qualification || null,
      monthly_salary: monthlySalary ? Number(monthlySalary) : null,
      join_date: joinDate || null,
      exit_date: exitDate || null,
      status,
      project_id: projectId || null,
      photo: photoPath || null,
    }

    if (editing) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) { setErr(error.message); return }
    } else {
      // auto-generate Employee ID: <FirstInitial><LastInitial><JoinYY><seq>  e.g. AS260001
      const parts = fullName.trim().split(/\s+/)
      const first = parts[0] ?? ''
      const last = parts.length > 1 ? parts[parts.length - 1] : ''
      const { data: code, error: codeErr } = await supabase.rpc('next_employee_code', {
        p_first: first, p_last: last, p_join_date: joinDate || new Date().toISOString().slice(0, 10),
      })
      if (codeErr) { setErr('Could not generate Employee ID: ' + codeErr.message); setBusy(false); return }
      payload.employee_code = code
      payload.emp_code = code  // keep legacy column in sync so existing screens still show it
      const { error } = await supabase.from('employees').insert({ ...payload, org_id: prof?.org_id })
      setBusy(false)
      if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Employee' : 'Add Employee'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {/* Photo + code */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              {photoFile
                ? <img src={URL.createObjectURL(photoFile)} alt="preview" className="w-full h-full object-cover" />
                : existingPhoto
                  ? <PrivateImage bucket="employee-docs" path={existingPhoto} alt="photo" className="w-full h-full object-cover" />
                  : <span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '28px' }}>person</span>}
            </div>
            <div>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => photoRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_camera</span>
                {photoFile ? 'Change photo' : 'Upload photo'}
              </button>
              <div className="text-[11px] font-mono text-[#dcc1ae]/60 mt-1.5">
                {editing?.emp_code ?? 'Code auto-generated (AAD-…)'}
              </div>
            </div>
          </div>
          <div className="mb-4 text-[11px] text-[#dcc1ae]/70 bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
            Tip: after saving, use the <span className="text-[#ffb87b] font-semibold">Docs</span> button on the employee row to upload the Aadhaar card, offer letter, degree certificate and other files.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Full Name *"><input className="input" value={fullName} onChange={e => setFullName(e.target.value)} /></L>
            <L label="Designation">
              <select className="input" value={designationId} onChange={e => {
                setDesignationId(e.target.value)
                const opt = desigOptions.find(o => o.id === e.target.value)
                setDesignation(opt?.name ?? '')
              }}>
                <option value="">— Select —</option>
                {desigOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                {editing?.designation && !desigOptions.some(o => o.name === editing.designation) && (
                  <option value="">{editing.designation} (old)</option>
                )}
              </select>
            </L>
            <L label="Department">
              <select className="input" value={department} onChange={e => setDepartment(e.target.value)}>
                {DEPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </L>
            <L label="Qualification"><input className="input" value={qualification} onChange={e => setQualification(e.target.value)} placeholder="B.Tech Civil, ITI…" /></L>
            <L label="Phone"><input className="input mono" inputMode="numeric" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" /></L>
            <L label="Email"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></L>
            <L label="Aadhaar No."><input className="input mono" inputMode="numeric" maxLength={12} value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit number" /></L>
            <L label="Monthly Salary (INR)"><input className="input mono" inputMode="numeric" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="e.g. 25000" /></L>
            <L label="Emergency Contact"><input className="input" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="Name" /></L>
            <L label="Emergency Phone"><input className="input mono" inputMode="numeric" maxLength={10} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" /></L>
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
        {err && <div className="px-5 pb-2 text-sm text-red-400 flex-shrink-0">{err}</div>}
        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Employee'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function DocsDrawer({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [docs, setDocs] = useState<EmpDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [docType, setDocType] = useState('Offer Letter')
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

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Documents · {employee.full_name}</h3>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">Offer letter, degree, Aadhaar, licenses etc.</p>
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
            <L label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Offer Letter 2026, B.Tech…" /></L>
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
  ), document.body)
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