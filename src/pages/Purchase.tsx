import ExportButtons from '../components/ExportButtons'
import { createPortal } from 'react-dom'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'

type PR = {
  id: string; date: string; pr_no: string | null; material: string; qty: number | null; unit: string | null
  vendor: string | null; needed_by: string | null; remark: string | null; quotation: string | null; status: string
}

const STATUS_STYLES: Record<string, string> = {
  Open: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Ordered: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  Received: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function Purchase() {
  const { activeProject } = useProject()
  const { can } = useAuth()
  const [rows, setRows] = useState<PR[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    if (!activeProject) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('purchase_requests')
      .select('*').eq('project_id', activeProject.id)
      .order('date', { ascending: false }).limit(300)
    setRows((data as PR[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  const openPRs = rows.filter(r => r.status === 'Open')
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Purchase Requests</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Material procurement and quotation tracking</p>
        </div>
        {can('purchase_requests', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New PR
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="card kpi-amber p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Open PRs</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-[#ffb87b]">{openPRs.length}</div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">pending</div>
          </div>
        </div>
        <div className="card kpi-red p-4 h-24 flex flex-col justify-between relative overflow-hidden">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Overdue PRs</span>
          <div>
            <div className="font-mono text-[28px] font-bold leading-none text-red-400">
              {openPRs.filter(r => r.needed_by && r.needed_by < today).length}
            </div>
            <div className="text-[10px] text-[#dcc1ae]/60 mt-1">past needed-by date</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">All Requests</span>
          <ExportButtons
            filename="purchase_requests"
            title="Purchase Requests"
            dateField="date"
            rows={rows}
            columns={[
              { header: 'Date', get: r => r.date },
              { header: 'PR No', get: r => r.pr_no || '—' },
              { header: 'Material', get: r => r.material },
              { header: 'Qty', get: r => (r.qty ?? '—') },
              { header: 'Unit', get: r => r.unit || '—' },
              { header: 'Vendor', get: r => r.vendor || '—' },
              { header: 'Needed By', get: r => r.needed_by || '—' },
              { header: 'Status', get: r => r.status },
              { header: 'Quotation', get: r => (r.quotation ? 'Attached' : '—') },
              { header: 'Remark', get: r => r.remark || '—' },
            ]}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date','PR No','Material','Qty','Unit','Vendor','Needed By','Status','Quotation','Remark'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.pr_no || '—'}</td>
                <td className="px-4 py-3 text-[#e2e2e8]">{r.material}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.qty != null ? Number(r.qty).toLocaleString('en-IN') : '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.unit || '—'}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.vendor || '—'}</td>
                <td className="px-4 py-3 font-mono">
                  {r.needed_by
                    ? <span className={r.needed_by < today && r.status === 'Open' ? 'text-red-400' : 'text-[#dcc1ae]'}>{r.needed_by}</span>
                    : <span className="text-[#dcc1ae]/40">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[r.status] || 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.quotation
                    ? <PrivateLink bucket="quotations" path={r.quotation} className="text-[#ffb87b] text-xs underline">View</PrivateLink>
                    : <span className="text-[#dcc1ae]/40">—</span>}
                </td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No purchase requests yet.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <PRForm projectId={activeProject.id} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function PRForm({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [prNo, setPrNo] = useState('')
  const [material, setMaterial] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const [vendor, setVendor] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [remark, setRemark] = useState('')
  const [status, setStatus] = useState('Open')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!material.trim()) { setErr('Enter material'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()

    let quotationUrl: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, 'quotations')
      const { path: stored, error: upErr } = await uploadPrivate('quotations', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      quotationUrl = stored ?? null
    }

    const { error } = await supabase.from('purchase_requests').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, pr_no: prNo || null,
      material: material.trim(), qty: qty ? Number(qty) : null,
      unit: unit || null, vendor: vendor || null,
      needed_by: neededBy || null, remark: remark || null,
      quotation: quotationUrl, status,
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
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">New Purchase Request</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="PR No."><input className="input" value={prNo} onChange={e => setPrNo(e.target.value)} placeholder="e.g. PR-001" /></L>
            <L label="Material" className="col-span-2">
              <input className="input" value={material} onChange={e => setMaterial(e.target.value)} />
            </L>
            <L label="Qty"><input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} /></L>
            <L label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Bags, Ltrs…" /></L>
            <L label="Vendor"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></L>
            <L label="Needed By"><input className="input" type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} /></L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option>Open</option><option>Ordered</option><option>Received</option><option>Cancelled</option>
              </select>
            </L>
            <L label="Quotation">
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 14) : 'Attach quotation'}
              </button>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save PR'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block mb-3 col-span-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}