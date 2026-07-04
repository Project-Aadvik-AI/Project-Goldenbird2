import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'

type Letter = {
  id: string
  project_id: string | null
  direction: string
  ref_no: string | null
  letter_date: string
  party: string | null
  subject: string | null
  mode: string | null
  file: string | null
  status: string
  remark: string | null
  created_at: string
}

const MODES = ['Post', 'Email', 'Hand', 'Courier']

export default function Correspondence() {
  const { projects } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Letter | null>(null)
  const [dirFilter, setDirFilter] = useState<'All' | 'Inward' | 'Outward'>('All')
  const [projFilter, setProjFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Open' | 'Replied' | 'Closed'>('All')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('correspondence').select('*')
      .order('letter_date', { ascending: false })
    setRows((data as Letter[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = rows.filter(r => {
    if (dirFilter !== 'All' && r.direction !== dirFilter) return false
    if (statusFilter !== 'All' && r.status !== statusFilter) return false
    if (projFilter !== 'all' && r.project_id !== projFilter) return false
    return true
  })

  async function setStatus(id: string, status: string) {
    await supabase.from('correspondence').update({ status }).eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Correspondence Register</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Inward and outward letters · {rows.length} on record</p>
        </div>
        {can('correspondence', 'add') && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Letter
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {(['All', 'Inward', 'Outward'] as const).map(d => (
            <button key={d} className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${dirFilter === d ? 'bg-[#ff8f00]/20 text-[#ffb87b]' : 'text-[#dcc1ae]'}`} onClick={() => setDirFilter(d)}>{d}</button>
          ))}
        </div>
        <select className="input" value={projFilter} onChange={e => setProjFilter(e.target.value)} style={{ minWidth: 160 }}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ minWidth: 130 }}>
          <option>All</option><option>Open</option><option>Replied</option><option>Closed</option>
        </select>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Direction', 'Ref No', 'Date', 'Party', 'Subject', 'Mode', 'Project', 'Scan', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map(r => {
              const projName = projects.find(p => p.id === r.project_id)?.name
              return (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${r.direction === 'Inward' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {r.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#e2e2e8]">{r.ref_no || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">{r.letter_date}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.party || '—'}</td>
                  <td className="px-4 py-3 text-[#e2e2e8] max-w-[240px] truncate">{r.subject || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.mode || '—'}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{projName || '—'}</td>
                  <td className="px-4 py-3">
                    {r.file
                      ? <PrivateLink bucket="correspondence" path={r.file} className="text-[#ffb87b] hover:underline text-xs">Open</PrivateLink>
                      : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select className="input" style={{ padding: '4px 6px', fontSize: '11px', minWidth: 90 }}
                      value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
                      <option>Open</option><option>Replied</option><option>Closed</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {can('correspondence', 'edit') && (
                      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => { setEditing(r); setShowForm(true) }}>Edit</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!visible.length && !loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No letters match.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <LetterForm editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function LetterForm({ editing, onClose, onSaved }: { editing: Letter | null; onClose: () => void; onSaved: () => void }) {
  const { projects, activeProject } = useProject()
  const [direction, setDirection] = useState(editing?.direction ?? 'Inward')
  const [refNo, setRefNo] = useState(editing?.ref_no ?? '')
  const [date, setDate] = useState(editing?.letter_date ?? new Date().toISOString().slice(0, 10))
  const [party, setParty] = useState(editing?.party ?? '')
  const [subject, setSubject] = useState(editing?.subject ?? '')
  const [mode, setMode] = useState(editing?.mode ?? 'Email')
  const [projectId, setProjectId] = useState(editing?.project_id ?? activeProject?.id ?? '')
  const [status, setStatus] = useState(editing?.status ?? 'Open')
  const [remark, setRemark] = useState(editing?.remark ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() && !refNo.trim()) { setErr('Enter a subject or ref no'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id

    let fileUrl: string | null = editing?.file ?? null
    if (file) {
      const path = makeObjectPath(orgId, file, direction.toLowerCase())
      const { path: stored, error: upErr } = await uploadPrivate('correspondence', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      fileUrl = stored ?? null
    }

    const payload: any = {
      direction, ref_no: refNo || null, letter_date: date,
      party: party || null, subject: subject || null, mode: mode || null,
      project_id: projectId || null, status, remark: remark || null, file: fileUrl,
    }
    if (editing) {
      const { error } = await supabase.from('correspondence').update(payload).eq('id', editing.id)
      setBusy(false); if (error) { setErr(error.message); return }
    } else {
      const { error } = await supabase.from('correspondence').insert({ ...payload, org_id: orgId })
      setBusy(false); if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Letter' : 'New Letter'}</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Direction">
              <select className="input" value={direction} onChange={e => setDirection(e.target.value)}>
                <option>Inward</option><option>Outward</option>
              </select>
            </L>
            <L label="Ref No"><input className="input mono" value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="AAD/OUT/001" /></L>
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Mode">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </L>
            <L label={direction === 'Inward' ? 'From' : 'To'}>
              <input className="input" value={party} onChange={e => setParty(e.target.value)} placeholder="RITES, NALCO…" />
            </L>
            <L label="Project">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">—</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option>Open</option><option>Replied</option><option>Closed</option>
              </select>
            </L>
            <L label="Scan (upload)">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 16) : (editing?.file ? 'Replace scan' : 'Attach scan')}
              </button>
            </L>
          </div>
          <L label="Subject"><input className="input" value={subject} onChange={e => setSubject(e.target.value)} /></L>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
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

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}