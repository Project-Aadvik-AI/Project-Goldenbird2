import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Bug = {
  id: string; title: string; description: string | null; page: string | null
  severity: string; status: string; reporter_name: string | null; created_at: string
}

const SEV_CLS: Record<string, string> = {
  Low: 'bg-white/5 text-[#dcc1ae] border-white/10',
  Medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  High: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Critical: 'bg-red-500/10 text-red-400 border-red-500/20',
}
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

export default function BugReports() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Bug[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<'Open' | 'Solved' | 'All'>('Open')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('bug_reports').select('*').order('created_at', { ascending: false })
    setRows((data as Bug[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggleSolved(bug: Bug) {
    const next = bug.status === 'Fixed' ? 'Open' : 'Fixed'
    await supabase.from('bug_reports').update({ status: next }).eq('id', bug.id)
    load()
  }
  async function del(id: string) {
    if (!confirm('Delete this bug report?')) return
    await supabase.from('bug_reports').delete().eq('id', id)
    load()
  }

  const visible = useMemo(() => rows.filter(b => {
    if (filter === 'All') return true
    if (filter === 'Solved') return b.status === 'Fixed'
    return b.status !== 'Fixed'   // Open
  }), [rows, filter])

  const openCount = rows.filter(b => b.status !== 'Fixed').length
  const solvedCount = rows.filter(b => b.status === 'Fixed').length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Bug Reports</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">{openCount} open · {solvedCount} solved · testing tracker</p>
        </div>
        <div className="flex gap-2">
          <select className="input" value={filter} onChange={e => setFilter(e.target.value as 'Open' | 'Solved' | 'All')} style={{ minWidth: 110 }}>
            <option>Open</option><option>Solved</option><option>All</option>
          </select>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>bug_report</span> Report Bug
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map(b => {
          const solved = b.status === 'Fixed'
          return (
            <div key={b.id} className={`card p-4 flex items-start gap-3 ${solved ? 'opacity-60' : ''}`}>
              {/* Solved tick */}
              <button
                onClick={() => toggleSolved(b)}
                title={solved ? 'Mark as open' : 'Mark as solved'}
                className={`mt-0.5 w-7 h-7 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${solved ? 'bg-emerald-500 border-emerald-500' : 'border-[#dcc1ae]/50 hover:border-emerald-400 hover:bg-emerald-500/10'}`}
              >
                {solved
                  ? <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>check</span>
                  : <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '16px' }}>check</span>}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[14px] font-semibold text-[#e2e2e8] ${solved ? 'line-through' : ''}`}>{b.title}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEV_CLS[b.severity] || SEV_CLS.Medium}`}>{b.severity}</span>
                  {solved && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Solved</span>}
                </div>
                {b.description && <p className="text-[13px] text-[#dcc1ae] mt-1 whitespace-pre-wrap">{b.description}</p>}
                <div className="text-[11px] text-[#dcc1ae]/60 mt-1.5 flex items-center gap-3 flex-wrap">
                  {b.page && <span className="flex items-center gap-1"><span className="material-symbols-outlined" style={{ fontSize: '13px' }}>web</span>{b.page}</span>}
                  {b.reporter_name && <span>by {b.reporter_name}</span>}
                  <span>{new Date(b.created_at).toLocaleDateString('en-IN')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleSolved(b)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors ${solved ? 'bg-white/5 text-[#dcc1ae] border-white/10 hover:border-[#dcc1ae]' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                >
                  {solved ? 'Reopen' : 'Mark Solved'}
                </button>
                <button className="text-red-400 hover:text-red-300" onClick={() => del(b.id)} title="Delete">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            </div>
          )
        })}
        {!visible.length && !loading && (
          <div className="card p-10 text-center text-[#dcc1ae]/60 text-sm">
            {filter === 'Solved' ? 'No solved bugs yet.' : filter === 'Open' ? 'No open bugs — nice! 🎉' : 'No bugs reported yet.'}
          </div>
        )}
        {loading && <div className="card p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <BugForm reporterName={profile?.full_name ?? null} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}

function BugForm({ reporterName, onClose, onSaved }: { reporterName: string | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [page, setPage] = useState('')
  const [severity, setSeverity] = useState('Medium')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) { setErr('Give the bug a short title'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('bug_reports').insert({
      org_id: prof?.org_id, title, description: description || null, page: page || null,
      severity, status: 'Open', reporter_name: reporterName,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-lg my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Report a Bug</h3>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <Lb label="Title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Export button not working on Store" /></Lb>
          <Lb label="What happened? (steps, what you expected)">
            <textarea className="input" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the bug…" style={{ resize: 'vertical' }} />
          </Lb>
          <div className="grid grid-cols-2 gap-3">
            <Lb label="Page / Where"><input className="input" value={page} onChange={e => setPage(e.target.value)} placeholder="e.g. BOQ, Employees" /></Lb>
            <Lb label="Severity">
              <select className="input" value={severity} onChange={e => setSeverity(e.target.value)}>
                {SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Lb>
          </div>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400 flex-shrink-0">{err}</div>}
        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Submit Bug'}</button>
        </div>
      </div>
    </div>
  ), document.body)
}

function Lb({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}