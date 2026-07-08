import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'

type Folder = {
  id: string
  project_id: string | null
  name: string
  parent_id: string | null
}

type Drawing = {
  id: string
  project_id: string | null
  folder_id: string | null
  drawing_no: string | null
  title: string | null
  discipline: string | null
  revision: string
  status: string
  file: string | null
  remark: string | null
  created_at: string
}

const DISCIPLINES = ['Civil', 'Structural', 'Electrical', 'Mechanical', 'Architectural', 'Other']
const STATUSES = ['For Approval', 'Approved', 'Superseded']

const STATUS_STYLES: Record<string, string> = {
  Approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'For Approval': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Superseded: 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
}

export default function Drawings() {
  const { activeProject } = useProject()
  const { can, isAdmin } = useAuth()
  const [folders, setFolders] = useState<Folder[]>([])
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFolderForm, setShowFolderForm] = useState<{ parent: string | null } | null>(null)
  const [showDrawingForm, setShowDrawingForm] = useState<{ existing?: Drawing } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const canAdd = can('drawings', 'add') || isAdmin
  const canDelete = can('drawings', 'delete') || isAdmin

  async function load() {
    if (!activeProject) { setFolders([]); setDrawings([]); setLoading(false); return }
    setLoading(true)
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase.from('drawing_folders').select('*').eq('project_id', activeProject.id).order('name'),
      supabase.from('drawings').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
    ])
    setFolders((f as Folder[]) ?? [])
    setDrawings((d as Drawing[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  const tree = useMemo(() => buildTree(folders), [folders])

  const visibleDrawings = drawings.filter(d => d.folder_id === activeFolder)
  const grouped = groupByDrawingNo(visibleDrawings)

  async function deleteFolder(id: string) {
    if (!confirm('Delete this folder and everything inside it?')) return
    await supabase.from('drawing_folders').delete().eq('id', id)
    if (activeFolder === id) setActiveFolder(null)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Drawings</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Folder tree with revision history · {drawings.length} drawings</p>
        </div>
        <div className="flex gap-2">
          {canAdd && (
            <>
              <button className="btn btn-ghost" onClick={() => setShowFolderForm({ parent: activeFolder })}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>create_new_folder</span> Folder
              </button>
              <button className="btn btn-primary" onClick={() => setShowDrawingForm({})}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span> Upload
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card overflow-hidden lg:col-span-1">
          <div className="px-4 py-3 border-b border-white/5 text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Folders</div>
          <div className="p-2 max-h-[600px] overflow-y-auto">
            <button className={`w-full text-left px-3 py-2 rounded text-sm ${activeFolder === null ? 'bg-[#ff8f00]/10 text-[#ffb87b]' : 'text-[#dcc1ae] hover:bg-white/5'}`}
              onClick={() => setActiveFolder(null)}>
              <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: '16px' }}>folder_special</span>
              Root
            </button>
            {tree.map(node => (
              <FolderNode key={node.id} node={node} depth={0} activeId={activeFolder} onPick={setActiveFolder}
                onAddChild={id => setShowFolderForm({ parent: id })}
                onDelete={canDelete ? deleteFolder : null} />
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e2e2e8]">
                {activeFolder ? folders.find(f => f.id === activeFolder)?.name : 'Root'} · {grouped.length}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]">
                <tr>
                  {['Drawing No', 'Title', 'Discipline', 'Rev', 'Status', 'File', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {grouped.map(g => {
                  const latest = g.latest
                  const older = g.revisions.filter(r => r.id !== latest.id)
                  const isOpen = expanded === g.key
                  return (
                    <Fragment key={g.key}>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-[13px] text-[#e2e2e8]">{latest.drawing_no || '—'}</td>
                        <td className="px-4 py-3 text-[#e2e2e8]">{latest.title || '—'}</td>
                        <td className="px-4 py-3 text-[#dcc1ae]">{latest.discipline || '—'}</td>
                        <td className="px-4 py-3 font-mono text-[#ffb87b] font-bold">{latest.revision}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[latest.status] || ''}`}>
                            {latest.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {latest.file
                            ? <PrivateLink bucket="drawings" path={latest.file} className="text-[#ffb87b] hover:underline text-xs">Open</PrivateLink>
                            : <span className="text-[#dcc1ae]/40">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {canAdd && (
                            <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => setShowDrawingForm({ existing: latest })}>New Rev</button>
                          )}
                          {older.length > 0 && (
                            <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => setExpanded(isOpen ? null : g.key)}>
                              {isOpen ? 'Hide' : `${older.length} old`}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && older.map(o => (
                        <tr key={o.id} className="bg-black/20">
                          <td className="px-4 py-2 pl-8 text-[12px] font-mono text-[#dcc1ae]/70">{o.drawing_no || '—'}</td>
                          <td className="px-4 py-2 text-[12px] text-[#dcc1ae]/70">{o.title || '—'}</td>
                          <td className="px-4 py-2 text-[12px] text-[#dcc1ae]/70">{o.discipline || '—'}</td>
                          <td className="px-4 py-2 text-[12px] font-mono text-[#dcc1ae]/70">{o.revision}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[o.status] || ''}`}>{o.status}</span></td>
                          <td className="px-4 py-2">
                            {o.file
                              ? <PrivateLink bucket="drawings" path={o.file} className="text-[#ffb87b]/70 hover:underline text-xs">Open</PrivateLink>
                              : <span className="text-[#dcc1ae]/40">—</span>}
                          </td>
                          <td className="px-4 py-2 text-[10px] text-[#dcc1ae]/50">{o.created_at.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                {!grouped.length && !loading && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No drawings in this folder.</td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
          </div>
        </div>
      </div>

      {showFolderForm && (
        <FolderForm parentId={showFolderForm.parent} projectId={activeProject.id}
          onClose={() => setShowFolderForm(null)} onSaved={() => { setShowFolderForm(null); load() }} />
      )}
      {showDrawingForm && (
        <DrawingForm existing={showDrawingForm.existing} folderId={activeFolder} projectId={activeProject.id}
          onClose={() => setShowDrawingForm(null)} onSaved={() => { setShowDrawingForm(null); load() }} />
      )}
    </div>
  )
}

type TreeNode = Folder & { children: TreeNode[] }
function buildTree(folders: Folder[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const f of folders) map.set(f.id, { ...f, children: [] })
  const roots: TreeNode[] = []
  for (const n of map.values()) {
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(n)
    else roots.push(n)
  }
  return roots
}

function FolderNode({ node, depth, activeId, onPick, onAddChild, onDelete }: {
  node: TreeNode; depth: number; activeId: string | null
  onPick: (id: string) => void; onAddChild: (id: string) => void
  onDelete: ((id: string) => void) | null
}) {
  const [open, setOpen] = useState(depth < 2)
  return (
    <div>
      <div className={`group flex items-center gap-1 pr-2 rounded ${activeId === node.id ? 'bg-[#ff8f00]/10' : 'hover:bg-white/5'}`} style={{ paddingLeft: 6 + depth * 12 }}>
        {node.children.length > 0 ? (
          <button className="text-[#dcc1ae]" onClick={() => setOpen(o => !o)}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{open ? 'expand_more' : 'chevron_right'}</span>
          </button>
        ) : <span style={{ width: 16 }} />}
        <button className={`flex-1 text-left py-1.5 text-sm ${activeId === node.id ? 'text-[#ffb87b] font-semibold' : 'text-[#dcc1ae]'}`}
          onClick={() => onPick(node.id)}>
          <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: '14px' }}>folder</span>
          {node.name}
        </button>
        <button className="opacity-0 group-hover:opacity-100 text-[#dcc1ae]" title="Add subfolder" onClick={() => onAddChild(node.id)}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
        </button>
        {onDelete && (
          <button className="opacity-0 group-hover:opacity-100 text-red-400" title="Delete folder" onClick={() => onDelete(node.id)}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
          </button>
        )}
      </div>
      {open && node.children.map(c => (
        <FolderNode key={c.id} node={c} depth={depth + 1} activeId={activeId} onPick={onPick} onAddChild={onAddChild} onDelete={onDelete} />
      ))}
    </div>
  )
}

type Group = { key: string; latest: Drawing; revisions: Drawing[] }
function groupByDrawingNo(rows: Drawing[]): Group[] {
  const map = new Map<string, Drawing[]>()
  for (const r of rows) {
    const key = r.drawing_no ? r.drawing_no.trim().toUpperCase() : `__${r.id}`
    ;(map.get(key) ?? map.set(key, []).get(key)!).push(r)
  }
  const groups: Group[] = []
  for (const [key, list] of map) {
    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    groups.push({ key, latest: list[0], revisions: list })
  }
  return groups.sort((a, b) => (b.latest.created_at || '').localeCompare(a.latest.created_at || ''))
}

function FolderForm({ parentId, projectId, onClose, onSaved }: {
  parentId: string | null; projectId: string
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('drawing_folders').insert({
      org_id: prof?.org_id, project_id: projectId, name: name.trim(), parent_id: parentId,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-sm p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-3">New Folder</h3>
        <input className="input mb-2" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Structural" />
        {err && <div className="text-sm text-red-400 mb-2">{err}</div>}
        <div className="flex gap-2 mt-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-1" disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function DrawingForm({ existing, folderId, projectId, onClose, onSaved }: {
  existing?: Drawing; folderId: string | null; projectId: string
  onClose: () => void; onSaved: () => void
}) {
  const [drawingNo, setDrawingNo] = useState(existing?.drawing_no ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [discipline, setDiscipline] = useState(existing?.discipline ?? 'Civil')
  const [revision, setRevision] = useState(existing ? nextRev(existing.revision) : 'R0')
  const [status, setStatus] = useState('For Approval')
  const [remark, setRemark] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!drawingNo.trim()) { setErr('Drawing number required'); return }
    if (!file && !existing) { setErr('Choose a file'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()

    let fileUrl: string | null = null
    if (file) {
      const tag = `${drawingNo.trim().replace(/\W+/g, '_')}_${revision}`
      const path = makeObjectPath(prof?.org_id, file, `${projectId}/${tag}`)
      const { path: stored, error: upErr } = await uploadPrivate('drawings', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      fileUrl = stored ?? null
    }

    if (existing) {
      const { error: sup } = await supabase.from('drawings')
        .update({ status: 'Superseded' })
        .eq('project_id', projectId)
        .eq('drawing_no', existing.drawing_no)
        .neq('status', 'Superseded')
      if (sup) { setErr(sup.message); setBusy(false); return }
    }

    const { error } = await supabase.from('drawings').insert({
      org_id: prof?.org_id, project_id: projectId, folder_id: folderId,
      drawing_no: drawingNo.trim(), title: title || null, discipline,
      revision, status, remark: remark || null, file: fileUrl,
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
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{existing ? 'Upload New Revision' : 'Upload Drawing'}</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Drawing No *"><input className="input mono" value={drawingNo} onChange={e => setDrawingNo(e.target.value)} disabled={!!existing} placeholder="STR-001" /></L>
            <L label="Revision *"><input className="input mono" value={revision} onChange={e => setRevision(e.target.value)} placeholder="R0" /></L>
            <L label="Discipline">
              <select className="input" value={discipline} onChange={e => setDiscipline(e.target.value)}>
                {DISCIPLINES.map(d => <option key={d}>{d}</option>)}
              </select>
            </L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.filter(s => s !== 'Superseded').map(s => <option key={s}>{s}</option>)}
              </select>
            </L>
          </div>
          <L label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></L>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
          <L label={existing ? 'File (new revision)' : 'File *'}>
            <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
              {file ? file.name.slice(0, 30) : 'Choose file'}
            </button>
          </L>
          {existing && (
            <div className="text-[11px] text-amber-400 flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
              Uploading will mark the current revision ({existing.revision}) as Superseded.
            </div>
          )}
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Uploading…' : 'Save'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function nextRev(cur: string): string {
  const m = /^R(\d+)$/i.exec(cur.trim())
  if (m) return 'R' + (Number(m[1]) + 1)
  return cur + '+'
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}