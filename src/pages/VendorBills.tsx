import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'

type Vendor = { id: string; name: string; gstin?: string | null }
type WO = { id: string; wo_no: string | null; title: string | null; vendor: string | null }

type Bill = {
  id: string
  project_id: string | null
  vendor_id: string | null
  vendor: string | null
  bill_no: string | null
  bill_date: string | null
  amount: number | null
  gst_amount: number | null
  wo_id: string | null
  file: string | null
  stage: string
  remark: string | null
  created_at: string
}

type Movement = {
  id: string
  bill_id: string
  from_stage: string | null
  to_stage: string
  action_by: string | null
  note: string | null
  created_at: string
}

type Person = { id: string; full_name: string | null }

const STAGES = ['Submitted', 'Site Verified', 'Approved', 'Sent to Finance', 'Paid', 'On Hold', 'Rejected']

const STAGE_STYLES: Record<string, string> = {
  Submitted: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'Site Verified': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Approved: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Sent to Finance': 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
  Paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'On Hold': 'bg-white/5 text-[#dcc1ae] border-white/10',
  Rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function VendorBills() {
  const { activeProject } = useProject()
  const { can, isAdmin } = useAuth()
  const [tab, setTab] = useState<'all' | 'finance'>('all')
  const [rows, setRows] = useState<Bill[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [wos, setWos] = useState<WO[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [historyFor, setHistoryFor] = useState<Bill | null>(null)
  const [stageFilter, setStageFilter] = useState<string>('All')

  const canAdd = can('vendor_bills', 'add') || isAdmin
  const canAdvance = can('vendor_bills', 'edit') || isAdmin

  async function load() {
    setLoading(true)
    const q = supabase.from('vendor_bills').select('*').order('created_at', { ascending: false })
    const [{ data: b }, { data: v }, { data: w }, { data: p }] = await Promise.all([
      activeProject ? q.eq('project_id', activeProject.id) : q,
      supabase.from('m_vendors').select('id, name, gstin').order('name'),
      activeProject
        ? supabase.from('work_orders').select('id, wo_no, title, vendor').eq('project_id', activeProject.id).order('created_at', { ascending: false })
        : supabase.from('work_orders').select('id, wo_no, title, vendor').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
    ])
    setRows((b as Bill[]) ?? [])
    setVendors((v as Vendor[]) ?? [])
    setWos((w as WO[]) ?? [])
    setPeople((p as Person[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  async function advance(bill: Bill, toStage: string, note?: string) {
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id
    const { error } = await supabase.from('vendor_bills').update({ stage: toStage }).eq('id', bill.id)
    if (error) { alert(error.message); return }
    await supabase.from('bill_movements').insert({
      org_id: orgId, bill_id: bill.id, from_stage: bill.stage, to_stage: toStage, note: note || null,
    })
    load()
  }

  const filtered = rows.filter(r => {
    if (tab === 'finance') return r.stage === 'Sent to Finance'
    if (stageFilter === 'All') return true
    return r.stage === stageFilter
  })

  const nameOf = (id: string | null) => (id ? people.find(p => p.id === id)?.full_name : null) || '—'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Bills</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Track bills through the approval → finance workflow · {rows.length} total
            {activeProject ? '' : ' · (all projects — pick one from top bar to filter)'}
          </p>
        </div>
        {canAdd && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span> Upload Bill
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-white/10">
        <button className={`px-4 py-2.5 font-semibold text-sm border-b-2 -mb-px ${tab === 'all' ? 'border-[#ff8f00] text-[#ffb87b]' : 'border-transparent text-[#dcc1ae]'}`} onClick={() => setTab('all')}>
          All Bills ({rows.length})
        </button>
        <button className={`px-4 py-2.5 font-semibold text-sm border-b-2 -mb-px ${tab === 'finance' ? 'border-[#ff8f00] text-[#ffb87b]' : 'border-transparent text-[#dcc1ae]'}`} onClick={() => setTab('finance')}>
          Finance Queue ({rows.filter(r => r.stage === 'Sent to Finance').length})
        </button>
      </div>

      {tab === 'all' && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button className={`px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${stageFilter === 'All' ? 'bg-[#ff8f00]/20 text-[#ffb87b] border-[#ff8f00]/40' : 'bg-white/5 text-[#dcc1ae] border-white/10'}`} onClick={() => setStageFilter('All')}>All</button>
          {STAGES.map(s => (
            <button key={s} onClick={() => setStageFilter(s)}
              className={`px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-wider ${stageFilter === s ? STAGE_STYLES[s] : 'bg-white/5 text-[#dcc1ae]/70 border-white/10'}`}>
              {s} ({rows.filter(r => r.stage === s).length})
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Bill No', 'Date', 'Vendor', 'Amount', 'GST', 'WO', 'Stage', 'File', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {filtered.map(r => {
              const vName = r.vendor || vendors.find(v => v.id === r.vendor_id)?.name || '—'
              const wo = wos.find(w => w.id === r.wo_id)
              return (
                <Fragment key={r.id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#e2e2e8]">{r.bill_no || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{r.bill_date || '—'}</td>
                    <td className="px-4 py-3 text-[#e2e2e8]">{vName}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">₹{Number(r.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">₹{Number(r.gst_amount || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-[#dcc1ae] font-mono text-[12px]">{wo ? (wo.wo_no || wo.title?.slice(0, 20)) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STAGE_STYLES[r.stage] || ''}`}>{r.stage}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.file
                        ? <PrivateLink bucket="vendor-bills" path={r.file} className="text-[#ffb87b] hover:underline text-xs">Open</PrivateLink>
                        : <span className="text-[#dcc1ae]/40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {canAdvance && r.stage === 'Sent to Finance' && (
                        <button className="text-emerald-400 text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => advance(r, 'Paid', 'Payment released')}>Mark Paid</button>
                      )}
                      {canAdvance && (
                        <StageAdvancer bill={r} onAdvance={advance} />
                      )}
                      <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline ml-2" onClick={() => setHistoryFor(r)}>History</button>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No bills.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <BillForm vendors={vendors} wos={wos} projectId={activeProject?.id ?? null}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
      {historyFor && (
        <MovementHistory bill={historyFor} nameOf={nameOf} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

function StageAdvancer({ bill, onAdvance }: { bill: Bill; onAdvance: (b: Bill, to: string, note?: string) => void }) {
  const [open, setOpen] = useState(false)
  const next: Record<string, string[]> = {
    Submitted: ['Site Verified', 'On Hold', 'Rejected'],
    'Site Verified': ['Approved', 'On Hold', 'Rejected'],
    Approved: ['Sent to Finance', 'On Hold'],
    'Sent to Finance': ['Paid', 'On Hold'],
    Paid: [],
    'On Hold': ['Submitted', 'Rejected'],
    Rejected: [],
  }
  const options = next[bill.stage] ?? []
  if (!options.length) return null
  return (
    <span className="relative inline-block">
      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => setOpen(v => !v)}>Move →</button>
      {open && (
        <div className="absolute right-0 mt-1 bg-[#1B1F2A] border border-white/[0.1] rounded-lg shadow-lg z-20 min-w-[160px]">
          {options.map(o => (
            <button key={o} className="block w-full text-left px-3 py-2 text-xs text-[#e2e2e8] hover:bg-white/5"
              onClick={() => { setOpen(false); onAdvance(bill, o) }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

function BillForm({ vendors, wos, projectId, onClose, onSaved }: {
  vendors: Vendor[]; wos: WO[]; projectId: string | null
  onClose: () => void; onSaved: () => void
}) {
  const [vendorId, setVendorId] = useState('')
  const [vendorFree, setVendorFree] = useState('')
  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [gst, setGst] = useState('')
  const [woId, setWoId] = useState('')
  const [remark, setRemark] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!billNo.trim() || !amount) { setErr('Bill number and amount are required'); return }
    setBusy(true); setErr(null)

    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id

    let fileUrl: string | null = null
    if (file) {
      const path = makeObjectPath(orgId, file, projectId || 'shared')
      const { path: stored, error: upErr } = await uploadPrivate('vendor-bills', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      fileUrl = stored ?? null
    }
    const { data: inserted, error } = await supabase.from('vendor_bills').insert({
      org_id: orgId, project_id: projectId,
      vendor_id: vendorId || null, vendor: vendorFree || null,
      bill_no: billNo, bill_date: billDate,
      amount: Number(amount) || null,
      gst_amount: gst ? Number(gst) : null,
      wo_id: woId || null,
      file: fileUrl, stage: 'Submitted', remark: remark || null,
    }).select('id').single()
    if (error) { setErr(error.message); setBusy(false); return }
    await supabase.from('bill_movements').insert({
      org_id: orgId, bill_id: (inserted as any).id,
      from_stage: null, to_stage: 'Submitted', note: 'Bill submitted',
    })
    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Upload Vendor Bill</h3>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Vendor (master)">
              <select className="input" value={vendorId} onChange={e => { setVendorId(e.target.value); const v = vendors.find(x => x.id === e.target.value); if (v) setVendorFree(v.name) }}>
                <option value="">— pick —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </L>
            <L label="Vendor (free-text)"><input className="input" value={vendorFree} onChange={e => setVendorFree(e.target.value)} /></L>
            <L label="Bill No *"><input className="input mono" value={billNo} onChange={e => setBillNo(e.target.value)} /></L>
            <L label="Bill Date"><input className="input" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} /></L>
            <L label="Amount (₹) *"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></L>
            <L label="GST (₹)"><input className="input mono" inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} /></L>
            <L label="Linked WO">
              <select className="input" value={woId} onChange={e => setWoId(e.target.value)}>
                <option value="">— none —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_no || w.title?.slice(0, 40)}</option>)}
              </select>
            </L>
            <L label="Bill Scan">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 16) : 'Attach scan'}
              </button>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Uploading…' : 'Submit Bill'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function MovementHistory({ bill, nameOf, onClose }: { bill: Bill; nameOf: (id: string | null) => string; onClose: () => void }) {
  const [moves, setMoves] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('bill_movements').select('*').eq('bill_id', bill.id).order('created_at')
      .then(({ data }) => { setMoves((data as Movement[]) ?? []); setLoading(false) })
  }, [bill.id])

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Bill Movement</h3>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">{bill.bill_no || 'Bill'} · {bill.vendor}</p>
          </div>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          {loading ? <div className="text-[#dcc1ae]">Loading…</div> : (
            <ol className="space-y-3">
              {moves.map(m => (
                <li key={m.id} className="border-l-2 border-[#ff8f00]/40 pl-3">
                  <div className="text-[11px] text-[#dcc1ae]/60">{m.created_at.slice(0, 16).replace('T', ' ')} · {nameOf(m.action_by)}</div>
                  <div className="text-sm text-[#e2e2e8]">
                    <span className="text-[#dcc1ae]/70">{m.from_stage || 'Start'}</span>
                    <span className="mx-1 text-[#ffb87b]">→</span>
                    <span className="font-semibold">{m.to_stage}</span>
                  </div>
                  {m.note && <div className="text-[11px] text-[#dcc1ae]/70 italic">{m.note}</div>}
                </li>
              ))}
              {!moves.length && <div className="text-[#dcc1ae]/60 text-sm">No movements yet.</div>}
            </ol>
          )}
        </div>
      </div>
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