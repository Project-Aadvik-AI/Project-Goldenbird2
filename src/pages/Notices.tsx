import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

type Notice = {
  id: string; title: string; body: string | null; priority: string; audience: string
  publish_date: string; expiry_date: string | null
  ack_required: boolean; allow_comments: boolean; status: string
  published_at: string | null; created_by_name: string | null
  is_read: boolean; read_at: string | null
  is_acked: boolean; acked_at: string | null
  attachment_count: number; comment_count: number; is_expired: boolean
}
type Attachment = { id: string; file_name: string; file_path: string; mime_type: string | null }
type Comment = { id: string; comment: string; created_at: string; profiles: { full_name: string } | null }
type Track = {
  profile_id: string; recipient_name: string
  has_read: boolean; read_at: string | null
  has_acked: boolean; acked_at: string | null; ack_note: string | null
}

const PRIORITY_STYLE: Record<string, string> = {
  'Urgent': 'bg-red-500/10 text-red-400 border-red-500/25',
  'Important': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Normal': 'bg-white/5 text-[#dcc1ae] border-white/10',
}
const STATUS_STYLE: Record<string, string> = {
  'Draft': 'bg-white/5 text-[#dcc1ae]/70 border-white/10',
  'Published': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Archived': 'bg-white/5 text-[#dcc1ae]/40 border-white/10',
}

const stripHtml = (s: string | null) =>
  (s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export default function Notices() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Notice | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [track, setTrack] = useState<Notice | null>(null)
  const [q, setQ] = useState('')
  const [fPriority, setFPriority] = useState('')
  const [tab, setTab] = useState<'unread' | 'all' | 'mine'>('unread')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('my_notices').select('*')
      .order('priority')                       // Urgent first alphabetically? no — sort below
      .order('publish_date', { ascending: false })
    setRows((data as Notice[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const rank = (p: string) => p === 'Urgent' ? 0 : p === 'Important' ? 1 : 2
    let list = rows.filter(n => {
      if (!isAdmin && n.status !== 'Published') return false
      if (n.is_expired && tab !== 'all') return false
      if (fPriority && n.priority !== fPriority) return false
      const s = q.trim().toLowerCase()
      if (s && !`${n.title} ${stripHtml(n.body)}`.toLowerCase().includes(s)) return false
      if (tab === 'unread') return !n.is_read
      if (tab === 'mine') return isAdmin && n.status === 'Draft'
      return true
    })
    return list.sort((a, b) =>
      rank(a.priority) - rank(b.priority) ||
      b.publish_date.localeCompare(a.publish_date))
  }, [rows, tab, q, fPriority, isAdmin])

  const unread = rows.filter(n => n.status === 'Published' && !n.is_read && !n.is_expired).length
  const needsAck = rows.filter(n =>
    n.status === 'Published' && n.ack_required && !n.is_acked && !n.is_expired).length

  async function openNotice(n: Notice) {
    setOpen(n)
    if (!n.is_read) {
      await supabase.rpc('mark_notice_read', { p_notice: n.id })
      setRows(p => p.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
  }

  async function publish(n: Notice) {
    if (!confirm(`Publish "${n.title}"?\n\nEveryone it is addressed to will be notified.`)) return
    const { data, error } = await supabase.rpc('publish_notice', { p_notice: n.id })
    if (error) { alert('Could not publish:\n\n' + error.message); return }
    alert(`Published. ${data ?? 0} people notified.`)
    load()
  }

  async function archive(n: Notice) {
    if (!confirm(`Archive "${n.title}"?`)) return
    await supabase.from('notices').update({ status: 'Archived' }).eq('id', n.id)
    load()
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Notice Board</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            {isAdmin
              ? 'Publish notices to everyone, a site, a department, a role, or named people.'
              : 'Notices addressed to you, your site, your department and your role.'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>campaign</span> New Notice
          </button>
        )}
      </div>

      {needsAck > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>task_alt</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{needsAck} notice(s) need your acknowledgement</b>
            <span className="text-[#dcc1ae]"> — open them and confirm you have read them.</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-4">
        {(['unread', 'all', ...(isAdmin ? ['mine'] as const : [])] as const).map(k => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {k === 'unread' ? `Unread (${unread})` : k === 'all' ? 'All Notices' : 'My Drafts'}
          </button>
        ))}
        <input className="input ml-2" style={{ maxWidth: 220, padding: '6px 10px', fontSize: '13px' }}
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search notices…" />
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }}
          value={fPriority} onChange={e => setFPriority(e.target.value)}>
          <option value="">All priorities</option>
          {['Urgent', 'Important', 'Normal'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <div className="space-y-3">
          {visible.map(n => (
            <div key={n.id}
              className={`card p-4 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                !n.is_read && n.status === 'Published' ? 'border-l-2 border-l-[#ff8f00]' : ''} ${
                n.is_expired ? 'opacity-50' : ''}`}
              onClick={() => openNotice(n)}>
              <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined mt-0.5 ${
                  n.priority === 'Urgent' ? 'text-red-400'
                  : n.priority === 'Important' ? 'text-amber-400' : 'text-[#dcc1ae]/50'}`}
                  style={{ fontSize: '20px' }}>
                  {n.priority === 'Urgent' ? 'priority_high' : 'campaign'}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[14px] ${!n.is_read ? 'font-bold text-[#e2e2e8]' : 'font-semibold text-[#dcc1ae]'}`}>
                      {n.title}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLE[n.priority]}`}>
                      {n.priority}
                    </span>
                    {isAdmin && n.status !== 'Published' && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLE[n.status]}`}>
                        {n.status}
                      </span>
                    )}
                    {n.ack_required && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        n.is_acked ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                   : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {n.is_acked ? '✓ acknowledged' : 'ack required'}
                      </span>
                    )}
                    {n.is_expired && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae]/50 border-white/10">
                        expired
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] text-[#dcc1ae]/80 mt-1 line-clamp-2">
                    {stripHtml(n.body).slice(0, 180)}{stripHtml(n.body).length > 180 ? '…' : ''}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[#dcc1ae]/50">
                    <span>{n.publish_date}</span>
                    {n.created_by_name && <span>· {n.created_by_name}</span>}
                    <span>· to {n.audience === 'All' ? 'everyone' : n.audience.toLowerCase()}</span>
                    {n.attachment_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        · <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>attach_file</span>
                        {n.attachment_count}
                      </span>
                    )}
                    {n.comment_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        · <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>comment</span>
                        {n.comment_count}
                      </span>
                    )}
                    {n.expiry_date && <span>· expires {n.expiry_date}</span>}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {n.status === 'Draft' && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                        onClick={() => publish(n)}>Publish</button>
                    )}
                    {n.status === 'Published' && (
                      <>
                        <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline"
                          onClick={() => setTrack(n)}>Who read</button>
                        <button className="text-[#dcc1ae] text-[11px] font-semibold uppercase hover:underline"
                          onClick={() => archive(n)}>Archive</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!visible.length && (
            <div className="card p-10 text-center text-[#dcc1ae]/60 text-sm">
              {tab === 'unread' ? 'Nothing unread.' : 'No notices.'}
            </div>
          )}
        </div>
      )}

      {open && <NoticeDetail n={open} onClose={() => { setOpen(null); load() }} />}
      {showForm && <NoticeForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {track && <TrackingModal n={track} onClose={() => setTrack(null)} />}
    </div>
  )
}

// =====================================================================
//  READ A NOTICE
// =====================================================================
function NoticeDetail({ n, onClose }: { n: Notice; onClose: () => void }) {
  const [atts, setAtts] = useState<Attachment[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [comment, setComment] = useState('')
  const [ackNote, setAckNote] = useState('')
  const [acked, setAcked] = useState(n.is_acked)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('notice_attachments').select('*').eq('notice_id', n.id),
      supabase.from('notice_comments').select('*, profiles(full_name)')
        .eq('notice_id', n.id).order('created_at'),
    ])
    setAtts((a as Attachment[]) ?? [])
    setComments((c as any[]) ?? [])
  }
  useEffect(() => { load() }, [n.id])

  async function ack() {
    setBusy(true)
    const { error } = await supabase.rpc('acknowledge_notice', {
      p_notice: n.id, p_note: ackNote || null,
    })
    setBusy(false)
    if (error) { alert(error.message); return }
    setAcked(true)
  }

  async function addComment() {
    if (!comment.trim()) return
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) return
    const { data: prof } = await supabase
      .from('profiles').select('org_id').eq('id', uid).maybeSingle()
    const { error } = await supabase.from('notice_comments').insert({
      org_id: prof?.org_id, notice_id: n.id,
      profile_id: uid, comment: comment.trim(),
    })
    if (error) { alert(error.message); return }
    setComment(''); load()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className={`px-5 py-4 border-b border-white/[0.06] ${
          n.priority === 'Urgent' ? 'bg-red-500/[0.06]' : n.priority === 'Important' ? 'bg-amber-500/[0.04]' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLE[n.priority]}`}>
                  {n.priority}
                </span>
                {n.ack_required && !acked && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                    acknowledgement required
                  </span>
                )}
              </div>
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mt-1.5">{n.title}</h3>
              <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
                {n.publish_date}
                {n.created_by_name && ` · ${n.created_by_name}`}
                {n.expiry_date && ` · expires ${n.expiry_date}`}
              </p>
            </div>
            <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="text-[14px] text-[#dcc1ae] leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: n.body ?? '' }} />

          {atts.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
                Attachments ({atts.length})
              </div>
              <div className="space-y-1.5">
                {atts.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[13px]">
                    <span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '16px' }}>
                      {a.mime_type?.startsWith('image') ? 'image' : 'description'}
                    </span>
                    <PrivateLink bucket="notice-files" path={a.file_path} className="text-[#ffb87b] hover:underline">
                      {a.file_name}
                    </PrivateLink>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* acknowledge */}
          {n.ack_required && (
            <div className={`mt-5 pt-4 border-t border-white/[0.06] ${acked ? '' : ''}`}>
              {acked ? (
                <div className="flex items-center gap-2 text-[13px] text-emerald-400">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
                  You acknowledged this notice.
                </div>
              ) : (
                <>
                  <div className="text-[12px] text-amber-400 mb-2">
                    This notice requires your acknowledgement.
                  </div>
                  <input className="input mb-2" value={ackNote} onChange={e => setAckNote(e.target.value)}
                    placeholder="Optional note…" />
                  <button className="btn btn-primary w-full" disabled={busy} onClick={ack}>
                    {busy ? 'Saving…' : 'I have read and understood this'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* comments */}
          {n.allow_comments && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
                Comments ({comments.length})
              </div>
              <div className="space-y-2 mb-3">
                {comments.map(c => (
                  <div key={c.id} className="rounded-lg bg-white/[0.03] p-2.5">
                    <div className="text-[11px] text-[#dcc1ae]/60">
                      {c.profiles?.full_name ?? 'Someone'} · {new Date(c.created_at).toLocaleString('en-IN')}
                    </div>
                    <div className="text-[13px] text-[#e2e2e8] mt-0.5">{c.comment}</div>
                  </div>
                ))}
                {!comments.length && <div className="text-[12px] text-[#dcc1ae]/40">No comments yet.</div>}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1" value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Add a comment…" onKeyDown={e => e.key === 'Enter' && addComment()} />
                <button className="btn btn-ghost" onClick={addComment} disabled={!comment.trim()}>Post</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

// =====================================================================
//  CREATE A NOTICE
// =====================================================================
function NoticeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { projects } = useProject()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [audience, setAudience] = useState('All')
  const [publishDate, setPublishDate] = useState(new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState('')
  const [ackReq, setAckReq] = useState(false)
  const [allowComments, setAllowComments] = useState(true)
  const [files, setFiles] = useState<File[]>([])

  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([])

  const [pickProjects, setPickProjects] = useState<Set<string>>(new Set())
  const [pickDesigs, setPickDesigs] = useState<Set<string>>(new Set())
  const [pickDepts, setPickDepts] = useState<Set<string>>(new Set())
  const [pickPeople, setPickPeople] = useState<Set<string>>(new Set())

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: e }, { data: p }] = await Promise.all([
        supabase.from('designations').select('id, name').eq('disabled', false).order('name'),
        supabase.from('employees').select('department').not('department', 'is', null),
        supabase.from('profiles').select('id, full_name').eq('status', 'active').order('full_name'),
      ])
      setDesignations((d as any[]) ?? [])
      setDepartments([...new Set(((e as any[]) ?? [])
        .map(x => (x.department ?? '').trim()).filter(Boolean))].sort())
      setPeople((p as any[]) ?? [])
    })()
  }, [])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const targetCount =
    audience === 'Projects' ? pickProjects.size :
    audience === 'Roles' ? pickDesigs.size :
    audience === 'Departments' ? pickDepts.size :
    audience === 'Employees' ? pickPeople.size : 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErr('The notice needs a title.'); return }
    if (audience !== 'All' && targetCount === 0) {
      setErr(`Select at least one ${audience.toLowerCase().replace(/s$/, '')}.`); return
    }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) { setErr('Not signed in.'); setBusy(false); return }

    // IMPORTANT: filter by the user's own id.
    // An admin can see every profile in the org, so an unfiltered
    // .maybeSingle() returns null and org_id ends up undefined.
    const { data: prof } = await supabase
      .from('profiles').select('org_id').eq('id', uid).maybeSingle()
    if (!prof?.org_id) { setErr('Could not resolve your organization.'); setBusy(false); return }

    const { data: n, error: nErr } = await supabase.from('notices').insert({
      org_id: prof?.org_id, title: title.trim(), body: body || null,
      priority, audience, publish_date: publishDate,
      expiry_date: expiryDate || null,
      ack_required: ackReq, allow_comments: allowComments,
      status: 'Draft', created_by: uid,
    }).select('id').single()
    if (nErr) { setErr(nErr.message); setBusy(false); return }

    const nid = (n as any).id

    // audience rows
    const aud: any[] = []
    if (audience === 'Projects') pickProjects.forEach(id => aud.push({ org_id: prof?.org_id, notice_id: nid, project_id: id }))
    if (audience === 'Roles') pickDesigs.forEach(id => aud.push({ org_id: prof?.org_id, notice_id: nid, designation_id: id }))
    if (audience === 'Departments') pickDepts.forEach(d => aud.push({ org_id: prof?.org_id, notice_id: nid, department: d }))
    if (audience === 'Employees') pickPeople.forEach(id => aud.push({ org_id: prof?.org_id, notice_id: nid, profile_id: id }))
    if (aud.length) {
      const { error } = await supabase.from('notice_audience').insert(aud)
      if (error) { setErr(error.message); setBusy(false); return }
    }

    // attachments
    for (const f of files) {
      const path = makeObjectPath(prof?.org_id, f, 'notices')
      const { path: stored, error: upErr } = await uploadPrivate('notice-files', path, f)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      await supabase.from('notice_attachments').insert({
        org_id: prof?.org_id, notice_id: nid,
        file_name: f.name, file_path: stored, file_size: f.size,
        mime_type: f.type, uploaded_by: uid,
      })
    }

    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New Notice</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <F label="Title *">
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Site shutdown on 15 August" autoFocus />
          </F>

          <F label="Notice">
            <textarea className="input" rows={6} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Write the notice here. Basic HTML is supported — <b>bold</b>, <br> for a line break, <ul><li>lists</li></ul>." />
          </F>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <F label="Priority">
              <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                {['Normal', 'Important', 'Urgent'].map(p => <option key={p}>{p}</option>)}
              </select>
            </F>
            <F label="Publish Date">
              <input type="date" className="input" value={publishDate} onChange={e => setPublishDate(e.target.value)} />
            </F>
            <F label="Expiry Date">
              <input type="date" className="input" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </F>
            <F label="Send To">
              <select className="input" value={audience}
                onChange={e => { setAudience(e.target.value) }}>
                <option value="All">Everyone</option>
                <option value="Projects">Selected sites / projects</option>
                <option value="Departments">Selected departments</option>
                <option value="Roles">Selected roles</option>
                <option value="Employees">Named people</option>
              </select>
            </F>
          </div>

          {/* audience picker */}
          {audience !== 'All' && (
            <div className="pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">
                  {audience === 'Projects' ? 'Sites / Projects'
                    : audience === 'Departments' ? 'Departments'
                    : audience === 'Roles' ? 'Roles' : 'People'}
                </span>
                <span className="text-[11px] text-[#dcc1ae]/50">{targetCount} selected</span>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.04]">
                {audience === 'Projects' && projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" className="accent-[#ff8f00]" checked={pickProjects.has(p.id)}
                      onChange={() => toggle(pickProjects, setPickProjects, p.id)} />
                    <span className="text-[13px] text-[#e2e2e8]">{p.name}</span>
                  </label>
                ))}
                {audience === 'Departments' && departments.map(d => (
                  <label key={d} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" className="accent-[#ff8f00]" checked={pickDepts.has(d)}
                      onChange={() => toggle(pickDepts, setPickDepts, d)} />
                    <span className="text-[13px] text-[#e2e2e8]">{d}</span>
                  </label>
                ))}
                {audience === 'Roles' && designations.map(d => (
                  <label key={d.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" className="accent-[#ff8f00]" checked={pickDesigs.has(d.id)}
                      onChange={() => toggle(pickDesigs, setPickDesigs, d.id)} />
                    <span className="text-[13px] text-[#e2e2e8]">{d.name}</span>
                  </label>
                ))}
                {audience === 'Employees' && people.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] cursor-pointer">
                    <input type="checkbox" className="accent-[#ff8f00]" checked={pickPeople.has(p.id)}
                      onChange={() => toggle(pickPeople, setPickPeople, p.id)} />
                    <span className="text-[13px] text-[#e2e2e8]">{p.full_name || 'Unnamed'}</span>
                  </label>
                ))}
                {audience === 'Departments' && !departments.length && (
                  <div className="px-3 py-3 text-[12px] text-[#dcc1ae]/50">
                    No departments found on any employee record.
                  </div>
                )}
              </div>
            </div>
          )}

          <F label="Attachments">
            <input type="file" multiple className="input"
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={e => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && (
              <p className="text-[11px] text-[#dcc1ae]/60 mt-1">
                {files.length} file(s): {files.map(f => f.name).join(', ')}
              </p>
            )}
          </F>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={ackReq}
                onChange={e => setAckReq(e.target.checked)} />
              Acknowledgement required
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
              <input type="checkbox" className="accent-[#ff8f00]" checked={allowComments}
                onChange={e => setAllowComments(e.target.checked)} />
              Allow comments
            </label>
          </div>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          Saved as a draft. Publish it from the list — that is when people are notified.
        </p>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  WHO HAS READ IT  (admin)
// =====================================================================
function TrackingModal({ n, onClose }: { n: Notice; onClose: () => void }) {
  const [rows, setRows] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('notice_tracking').select('*')
        .eq('notice_id', n.id).order('recipient_name')
      setRows((data as Track[]) ?? [])
      setLoading(false)
    })()
  }, [n.id])

  const read = rows.filter(r => r.has_read).length
  const acked = rows.filter(r => r.has_acked).length

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Who has read this</h3>
            <p className="text-[12px] text-[#dcc1ae]">{n.title}</p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <K label="Recipients" value={String(rows.length)} />
            <K label="Read" value={`${read} / ${rows.length}`} tone="emerald" />
            {n.ack_required && <K label="Acknowledged" value={`${acked} / ${rows.length}`}
              tone={acked < rows.length ? 'amber' : 'emerald'} />}
          </div>

          <div className="flex justify-end mb-2">
            <ExportButtons filename="notice-tracking" title={`Notice — ${n.title}`} rows={rows}
              columns={[
                { header: 'Recipient', get: (r: any) => r.recipient_name || '—' },
                { header: 'Read', get: (r: any) => (r.has_read ? 'Yes' : 'No') },
                { header: 'Read At', get: (r: any) => r.read_at || '—' },
                { header: 'Acknowledged', get: (r: any) => (r.has_acked ? 'Yes' : 'No') },
                { header: 'Acknowledged At', get: (r: any) => r.acked_at || '—' },
                { header: 'Note', get: (r: any) => r.ack_note || '—' },
              ]} />
          </div>

          {loading ? <div className="text-[#dcc1ae] text-sm">Loading…</div> : (
            <div className="rounded-lg border border-white/[0.08] overflow-hidden max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e] sticky top-0"><tr>
                  {['Recipient', 'Read', n.ack_required ? 'Acknowledged' : ''].filter(Boolean).map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {rows.map(r => (
                    <tr key={r.profile_id} className={!r.has_read ? 'bg-amber-500/[0.04]' : ''}>
                      <td className="px-3 py-2 text-[#e2e2e8]">{r.recipient_name || '—'}</td>
                      <td className="px-3 py-2">
                        {r.has_read
                          ? <span className="text-emerald-400 text-[12px]">
                              ✓ {r.read_at ? new Date(r.read_at).toLocaleDateString('en-IN') : ''}
                            </span>
                          : <span className="text-amber-400 text-[12px]">not yet</span>}
                      </td>
                      {n.ack_required && (
                        <td className="px-3 py-2">
                          {r.has_acked
                            ? <span className="text-emerald-400 text-[12px]">
                                ✓ {r.acked_at ? new Date(r.acked_at).toLocaleDateString('en-IN') : ''}
                                {r.ack_note && <div className="text-[10px] text-[#dcc1ae]/60">{r.ack_note}</div>}
                              </span>
                            : <span className="text-amber-400 text-[12px]">pending</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[17px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}