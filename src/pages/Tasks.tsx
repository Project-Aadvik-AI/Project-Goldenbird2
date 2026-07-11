import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'

type Task = {
  id: string
  project_id: string | null
  title: string
  description: string | null
  assigned_to: string | null
  assigned_by: string | null
  priority: string
  due_date: string | null
  status: string
  completed_at: string | null
  created_at: string
}

type Comment = { id: string; task_id: string; user_id: string | null; comment: string; created_at: string }
type Person = { id: string; full_name: string | null }

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
const STATUSES = ['Open', 'In Progress', 'Blocked', 'Done'] as const

const PRIORITY_STYLES: Record<string, string> = {
  Urgent: 'bg-red-500/10 text-red-400 border-red-500/20',
  High: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Low: 'bg-white/5 text-[#dcc1ae] border-white/10',
}

const STATUS_STYLES: Record<string, string> = {
  Open: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
  Done: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

export default function Tasks() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'mine' | 'assigned' | 'perf'>('mine')
  const [tasks, setTasks] = useState<Task[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ])
    setTasks((t as Task[]) ?? [])
    setPeople((p as Person[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const uid = user?.id
  const mine = tasks.filter(t => t.assigned_to === uid)
  const byMe = tasks.filter(t => t.assigned_by === uid)
  const nameOf = (id: string | null) => (id ? people.find(p => p.id === id)?.full_name : null) || '—'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Tasks</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Assign work, track progress, review performance</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_task</span> Assign Task
        </button>
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/10">
        {(['mine', 'assigned', 'perf'] as const).map(k => (
          <button key={k} className={`px-4 py-2.5 font-semibold text-sm border-b-2 -mb-px ${tab === k ? 'border-[#ff8f00] text-[#ffb87b]' : 'border-transparent text-[#dcc1ae] hover:text-[#e2e2e8]'}`} onClick={() => setTab(k)}>
            {k === 'mine' ? `My Tasks (${mine.filter(t => t.status !== 'Done').length})` : k === 'assigned' ? `Assigned by me (${byMe.length})` : 'Team Performance'}
          </button>
        ))}
      </div>

      {tab === 'mine' && <TaskTable rows={mine} nameOf={nameOf} onOpen={setOpenTask} onChanged={load} whoLabel="From" whoOf={t => nameOf(t.assigned_by)} />}
      {tab === 'assigned' && <TaskTable rows={byMe} nameOf={nameOf} onOpen={setOpenTask} onChanged={load} whoLabel="Assignee" whoOf={t => nameOf(t.assigned_to)} />}
      {tab === 'perf' && <Performance tasks={byMe} people={people} />}

      {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}

      {showForm && <AssignForm people={people} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {openTask && <TaskDetail task={openTask} nameOf={nameOf} onClose={() => setOpenTask(null)} onChanged={load} />}
    </div>
  )
}

function TaskTable({ rows, onOpen, onChanged, whoLabel, whoOf }: {
  rows: Task[]; nameOf: (id: string | null) => string
  onOpen: (t: Task) => void; onChanged: () => void
  whoLabel: string; whoOf: (t: Task) => string
}) {
  async function setStatus(t: Task, status: string) {
    const patch: any = { status }
    if (status === 'Done') patch.completed_at = new Date().toISOString()
    else patch.completed_at = null
    await supabase.from('tasks').update(patch).eq('id', t.id)
    onChanged()
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]">
          <tr>
            {['Priority', 'Title', whoLabel, 'Due', 'Status', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(t => {
            const overdue = t.due_date && t.status !== 'Done' && isOverdue(t.due_date)
            const isOpen = t.status === 'Open'
            return (
              <tr key={t.id} className={`hover:bg-white/[0.02] ${isOpen ? 'bg-red-500/[0.06] border-l-2 border-l-red-500' : ''}`}>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLES[t.priority] || ''}`}>{t.priority}</span>
                </td>
                <td className="px-4 py-3 text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]" onClick={() => onOpen(t)}>{t.title}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{whoOf(t)}</td>
                <td className={`px-4 py-3 font-mono text-[12px] whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                  {t.due_date || '—'}{overdue ? ' · OVERDUE' : ''}
                </td>
                <td className="px-4 py-3">
                  <select className="input" style={{ padding: '4px 6px', fontSize: '11px', minWidth: 110 }}
                    value={t.status} onChange={e => setStatus(t, e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => onOpen(t)}>Open</button>
                </td>
              </tr>
            )
          })}
          {!rows.length && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">Nothing here.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Performance({ tasks, people }: { tasks: Task[]; people: Person[] }) {
  const map = new Map<string, { name: string; open: number; done: number; onTime: number; late: number }>()
  for (const t of tasks) {
    if (!t.assigned_to) continue
    const name = people.find(p => p.id === t.assigned_to)?.full_name || 'Unknown'
    const cur = map.get(t.assigned_to) ?? { name, open: 0, done: 0, onTime: 0, late: 0 }
    if (t.status === 'Done') {
      cur.done += 1
      if (t.due_date && t.completed_at) {
        const dueEnd = new Date(t.due_date + 'T23:59:59')
        const doneAt = new Date(t.completed_at)
        if (doneAt <= dueEnd) cur.onTime += 1; else cur.late += 1
      } else cur.onTime += 1
    } else cur.open += 1
    map.set(t.assigned_to, cur)
  }
  const rows = [...map.values()].sort((a, b) => (b.done + b.open) - (a.done + a.open))

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]">
          <tr>
            {['Person', 'Open', 'Done', 'On-time', 'Late', 'On-time %'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const pct = r.done > 0 ? Math.round(r.onTime / r.done * 100) : 0
            return (
              <tr key={r.name} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-[#e2e2e8] font-semibold">{r.name}</td>
                <td className="px-4 py-3 font-mono text-[#dcc1ae]">{r.open}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.done}</td>
                <td className="px-4 py-3 font-mono text-emerald-400">{r.onTime}</td>
                <td className="px-4 py-3 font-mono text-red-400">{r.late}</td>
                <td className="px-4 py-3 font-mono">
                  <span className={pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'}>{r.done ? `${pct}%` : '—'}</span>
                </td>
              </tr>
            )
          })}
          {!rows.length && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No tasks assigned yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function AssignForm({ people, onClose, onSaved }: { people: Person[]; onClose: () => void; onSaved: () => void }) {
  const { projects, activeProject } = useProject()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(activeProject?.id ?? '')
  const [priority, setPriority] = useState('Medium')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [meName, setMeName] = useState<string>('')
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser()
      if (!u?.user) return
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', u.user.id).maybeSingle()
      setMeName((p as any)?.full_name || u.user.email || 'You')
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !assignedTo) { setErr('Title and assignee are required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id
    const { data: uinfo } = await supabase.auth.getUser()
    const assignerId = uinfo?.user?.id ?? null
    const { data: inserted, error } = await supabase.from('tasks').insert({
      org_id: orgId, project_id: projectId || null,
      title, description: description || null,
      assigned_to: assignedTo,
      assigned_by: assignerId,          // ← record WHO assigned it
      priority, due_date: dueDate || null,
      status: 'Open',
    }).select('id').single()
    if (error) { setErr(error.message); setBusy(false); return }
    await supabase.from('notifications').insert({
      org_id: orgId, user_id: assignedTo, type: 'info',
      title: `New task: ${title}`,
      body: description ? description.slice(0, 200) : null,
      link: `/tasks?open=${(inserted as any).id}`,
    })
    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Assign Task</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          <L label="Title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></L>
          <L label="Description"><textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} /></L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Assigned By">
              <div className="input flex items-center gap-2 opacity-80" style={{ cursor: 'default' }}>
                <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '16px' }}>person</span>
                <span className="text-[#e2e2e8]">{meName || 'You'}</span>
              </div>
            </L>
            <L label="Assign To *">
              <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">— pick —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </L>
            <L label="Priority">
              <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </L>
            <L label="Project">
              <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">— none —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </L>
            <L label="Due Date"><input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></L>
          </div>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Assigning…' : 'Assign & Notify'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function TaskDetail({ task, nameOf, onClose, onChanged }: {
  task: Task; nameOf: (id: string | null) => string
  onClose: () => void; onChanged: () => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at')
    setComments((data as Comment[]) ?? [])
  }
  useEffect(() => { load() }, [task.id])

  async function post(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    await supabase.from('task_comments').insert({
      org_id: prof?.org_id, task_id: task.id, comment: text.trim(),
    })
    setText(''); setBusy(false); load()
  }

  const overdue = task.due_date && task.status !== 'Done' && isOverdue(task.due_date)

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-start justify-between">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{task.title}</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLES[task.priority] || ''}`}>{task.priority}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[task.status] || ''}`}>{task.status}</span>
              {task.due_date && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${overdue ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  Due {task.due_date}
                </span>
              )}
            </div>
          </div>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 border-b border-white/5 space-y-2">
          {task.description && <p className="text-sm text-[#e2e2e8] whitespace-pre-wrap">{task.description}</p>}
          <div className="text-[11px] text-[#dcc1ae]/60">Assigned by <strong className="text-[#dcc1ae]">{nameOf(task.assigned_by)}</strong> to <strong className="text-[#dcc1ae]">{nameOf(task.assigned_to)}</strong> on {task.created_at.slice(0, 10)}</div>
        </div>
        <div className="p-5 border-b border-white/5">
          <h4 className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">Comments · {comments.length}</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {comments.map(c => (
              <div key={c.id} className="p-2 rounded bg-white/[0.03] border border-white/[0.05]">
                <div className="text-[10px] text-[#dcc1ae]/60">{nameOf(c.user_id)} · {c.created_at.slice(0, 16).replace('T', ' ')}</div>
                <div className="text-sm text-[#e2e2e8] whitespace-pre-wrap">{c.comment}</div>
              </div>
            ))}
            {!comments.length && <div className="text-sm text-[#dcc1ae]/60">No comments yet.</div>}
          </div>
        </div>
        <form onSubmit={post} className="p-5 flex gap-2">
          <input className="input flex-1" value={text} onChange={e => setText(e.target.value)} placeholder="Write a comment…" />
          <button className="btn btn-primary" disabled={busy || !text.trim()}>Post</button>
        </form>
      </div>
    </div>
  ), document.body)
}

function isOverdue(due: string) {
  const d = new Date(due + 'T23:59:59')
  return d.getTime() < Date.now()
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}