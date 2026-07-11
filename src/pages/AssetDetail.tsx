import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import { type Asset, inr } from './Assets'

export type AssetDoc = {
  id: string; asset_id: string; doc_type: string; title: string | null
  file: string | null; issue_date: string | null; expiry_date: string | null; remarks: string | null
}

export const DOC_TYPES = ['Insurance', 'RC Book', 'PUC Certificate', 'Fitness Certificate', 'Permit',
  'Warranty', 'Invoice / Bill', 'Service Record', 'User Manual', 'Image', 'Other']

// days until expiry; negative = expired
export function daysToExpiry(d: string | null): number | null {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(d); exp.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - today.getTime()) / 86400000)
}
export function expiryState(d: string | null): { label: string; cls: string } {
  const n = daysToExpiry(d)
  if (n === null) return { label: 'No expiry', cls: 'bg-white/5 text-[#dcc1ae]/60 border-white/10' }
  if (n < 0) return { label: `Expired ${Math.abs(n)}d ago`, cls: 'bg-red-500/10 text-red-400 border-red-500/20' }
  if (n <= 30) return { label: `Expires in ${n}d`, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  return { label: `Valid · ${n}d left`, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
}

type Assignment = {
  id: string; employee_id: string | null; project_id: string | null
  from_date: string; to_date: string | null; note: string | null; created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  'Available': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Assigned': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Under Maintenance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Scrap': 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects } = useProject()
  const { can, isAdmin } = useAuth()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([])
  const [history, setHistory] = useState<Assignment[]>([])
  const [docs, setDocs] = useState<AssetDoc[]>([])
  const [showDoc, setShowDoc] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const [{ data: a }, { data: e }, { data: h }, { data: d }] = await Promise.all([
        supabase.from('assets').select('*').eq('id', id).maybeSingle(),
        supabase.from('employees').select('id, full_name'),
        supabase.from('asset_assignments').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
        supabase.from('asset_documents').select('*').eq('asset_id', id).order('expiry_date', { ascending: true, nullsFirst: false }),
      ])
      if (!alive) return
      setAsset((a as Asset) ?? null)
      setEmps((e as any[]) ?? [])
      setHistory((h as Assignment[]) ?? [])
      setDocs((d as AssetDoc[]) ?? [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [id])

  async function reloadDocs() {
    if (!id) return
    const { data } = await supabase.from('asset_documents').select('*').eq('asset_id', id).order('expiry_date', { ascending: true, nullsFirst: false })
    setDocs((data as AssetDoc[]) ?? [])
  }
  async function deleteDoc(docId: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('asset_documents').delete().eq('id', docId)
    reloadDocs()
  }

  const nameOfEmp = (eid: string | null) => (eid ? emps.find(e => e.id === eid)?.full_name : null) || '—'
  const nameOfProj = (pid: string | null) => (pid ? projects.find(p => p.id === pid)?.name : null) || '—'

  const ageYears = useMemo(() => {
    if (!asset?.purchase_date) return null
    const d = new Date(asset.purchase_date)
    const yrs = (Date.now() - d.getTime()) / (365.25 * 86400000)
    return Math.round(yrs * 10) / 10
  }, [asset])

  if (loading) return <div className="p-8 text-[#dcc1ae] text-sm">Loading…</div>
  if (!asset) return (
    <div className="p-8 text-center">
      <p className="text-[#dcc1ae]">Asset not found.</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/assets')}>Back to Assets</button>
    </div>
  )

  return (
    <div>
      <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[13px] mb-4 flex items-center gap-1" onClick={() => navigate('/assets')}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> All Assets
      </button>

      {/* Header */}
      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-[#ff8f00]/10 border border-[#ff8f00]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '28px' }}>
              {asset.category === 'Vehicle' ? 'local_shipping' : asset.category === 'IT / Laptop' ? 'laptop_mac' : 'construction'}
            </span>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{asset.name}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLE[asset.status] || ''}`}>{asset.status}</span>
              {asset.archived && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae]/60 border-white/10">Archived</span>}
            </div>
            <div className="text-[13px] text-[#dcc1ae] mt-0.5">
              <span className="font-mono">{asset.asset_code || '—'}</span> · {asset.category || 'Uncategorised'}
              {asset.company_branch ? ` · ${asset.company_branch}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Purchase Cost</div>
            <div className="font-mono text-[22px] font-bold text-[#e2e2e8]">{asset.purchase_cost ? inr(asset.purchase_cost) : '—'}</div>
            {ageYears != null && <div className="text-[11px] text-[#dcc1ae]/60">{ageYears} yrs old</div>}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[#e2e2e8] mb-3">Asset Information</h3>
          <Row label="Asset ID" value={asset.asset_code || '—'} mono />
          <Row label="Category" value={asset.category || '—'} />
          <Row label="Company / Branch" value={asset.company_branch || '—'} />
          <Row label="Vendor / Supplier" value={asset.vendor || '—'} />
          <Row label="Purchase Date" value={asset.purchase_date || '—'} mono />
          <Row label="Purchase Cost" value={asset.purchase_cost ? inr(asset.purchase_cost) : '—'} mono />
          <Row label="Location" value={asset.location || '—'} />
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[#e2e2e8] mb-3">Current Assignment</h3>
          <Row label="Assigned Employee" value={nameOfEmp(asset.assigned_employee_id)} />
          <Row label="Project / Site" value={nameOfProj(asset.project_id)} />
          <Row label="Status" value={asset.status} />
          {asset.remarks && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">Remarks</div>
              <div className="text-[13px] text-[#dcc1ae]">{asset.remarks}</div>
            </div>
          )}
        </div>
      </div>

      {/* Assignment history */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Assignment History</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{history.length} record(s)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Employee', 'Project / Site', 'From', 'To', 'Note'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {history.map(h => (
              <tr key={h.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8]">{nameOfEmp(h.employee_id)}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{nameOfProj(h.project_id)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{h.from_date}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{h.to_date || <span className="text-emerald-400">Current</span>}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{h.note || '—'}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No assignment history yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Expiry alerts */}
      {(() => {
        const expired = docs.filter(d => { const n = daysToExpiry(d.expiry_date); return n !== null && n < 0 })
        const soon = docs.filter(d => { const n = daysToExpiry(d.expiry_date); return n !== null && n >= 0 && n <= 30 })
        if (!expired.length && !soon.length) return null
        return (
          <div className="mb-5 space-y-2">
            {expired.length > 0 && (
              <div className="card p-3 bg-red-500/5 border-red-500/15 flex items-start gap-2">
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
                <div className="text-[13px]">
                  <b className="text-red-400">{expired.length} document(s) EXPIRED:</b>{' '}
                  <span className="text-[#dcc1ae]">{expired.map(d => `${d.doc_type} (${d.expiry_date})`).join(', ')}</span>
                </div>
              </div>
            )}
            {soon.length > 0 && (
              <div className="card p-3 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
                <div className="text-[13px]">
                  <b className="text-amber-400">{soon.length} expiring within 30 days:</b>{' '}
                  <span className="text-[#dcc1ae]">{soon.map(d => `${d.doc_type} (${daysToExpiry(d.expiry_date)}d)`).join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Documents */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Documents</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#dcc1ae]/60">{docs.length} file(s)</span>
            {can('machines', 'create') && (
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowDoc(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>upload_file</span> Upload
              </button>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Type', 'Title', 'Issue Date', 'Expiry Date', 'Status', 'File', ''].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {docs.map(d => {
              const st = expiryState(d.expiry_date)
              return (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-medium">{d.doc_type}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{d.title || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{d.issue_date || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{d.expiry_date || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.file ? <PrivateLink bucket="asset-docs" path={d.file} className="btn btn-ghost">View</PrivateLink> : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isAdmin && <button className="text-red-400 hover:text-red-300" onClick={() => deleteDoc(d.id)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>}
                  </td>
                </tr>
              )
            })}
            {!docs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No documents yet. Upload RC, insurance, PUC, fitness, permit, warranty and more — expiry is tracked automatically.</td></tr>}
          </tbody>
        </table>
      </div>

      {showDoc && asset && <DocForm assetId={asset.id} onClose={() => setShowDoc(false)} onSaved={() => { setShowDoc(false); reloadDocs() }} />}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#dcc1ae]/70">{label}</span>
      <span className={`text-[13px] text-[#e2e2e8] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}


// ---------------- Upload document ----------------
function DocForm({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [docType, setDocType] = useState('Insurance')
  const [title, setTitle] = useState('')
  const [issue, setIssue] = useState('')
  const [expiry, setExpiry] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    let path: string | null = null
    if (file) {
      const p = makeObjectPath(prof?.org_id, file, 'assets')
      const { path: stored, error: upErr } = await uploadPrivate('asset-docs', p, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      path = stored ?? null
    }
    const { error } = await supabase.from('asset_documents').insert({
      org_id: prof?.org_id, asset_id: assetId, doc_type: docType,
      title: title || null, file: path, issue_date: issue || null,
      expiry_date: expiry || null, remarks: remarks || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Upload Document</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DL label="Document Type *">
            <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </DL>
          <DL label="Title / Number"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Policy no., cert no…" /></DL>
          <DL label="Issue Date"><input type="date" className="input" value={issue} onChange={e => setIssue(e.target.value)} /></DL>
          <DL label="Expiry Date"><input type="date" className="input" value={expiry} onChange={e => setExpiry(e.target.value)} /></DL>
          <div className="sm:col-span-2">
            <DL label="File (PDF or image)">
              <input type="file" accept="image/*,.pdf" className="input" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </DL>
          </div>
          <div className="sm:col-span-2">
            <DL label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></DL>
          </div>
        </div>
        <p className="px-5 text-[11px] text-[#dcc1ae]/50">Leave Expiry blank for documents that never expire (invoice, manual, images). Expiry is tracked automatically and alerts show 30 days before.</p>
        {err && <div className="px-5 pt-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2 mt-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Uploading…' : 'Save Document'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}