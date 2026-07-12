import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

type MR = {
  mr_id: string; request_no: string; request_date: string; required_date: string | null
  status: string; priority: string; purpose: string | null; fulfil_mode: string | null
  rejection_reason: string | null
  project_name: string | null; project_id: string | null; warehouse_name: string | null
  requested_by_name: string | null; approved_by_name: string | null
  line_count: number; requested_qty: number; approved_qty: number
  issued_qty: number; pending_qty: number; shortfall_qty: number
  pct_issued: number; is_overdue: boolean; days_overdue: number | null
}
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null }
type Warehouse = { id: string; name: string; project_id: string | null; is_main: boolean }
type MrLine = {
  id: string; item_id: string; qty: number; approved_qty: number
  reserved_qty: number; issued_qty: number; remarks: string | null
}

const STATUS_STYLE: Record<string, string> = {
  'Draft': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Submitted': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Approved': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Partially Fulfilled': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Fulfilled': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Cancelled': 'bg-white/5 text-[#dcc1ae]/50 border-white/10',
}
const PRIORITY_STYLE: Record<string, string> = {
  'Urgent': 'bg-red-500/10 text-red-400 border-red-500/20',
  'High': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Normal': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Low': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
}

export default function MaterialRequests() {
  const { can, isAdmin, user } = useAuth()
  const { activeProject } = useProject()
  const navigate = useNavigate()
  const [rows, setRows] = useState<MR[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState<MR | null>(null)
  const [fStatus, setFStatus] = useState('')
  const [fPriority, setFPriority] = useState('')

  async function load() {
    setLoading(true)
    // release any stale reservations first
    await supabase.rpc('inv_release_expired_reservations')
    const { data } = await supabase.from('inv_mr_status').select('*')
      .order('request_date', { ascending: false })
    setRows((data as MR[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const scoped = useMemo(() =>
    rows.filter(r => !activeProject || r.project_id === activeProject.id || !r.project_id),
    [rows, activeProject])

  const filtered = useMemo(() => scoped.filter(r =>
    (!fStatus || r.status === fStatus) && (!fPriority || r.priority === fPriority)
  ), [scoped, fStatus, fPriority])

  // ---- dashboard widgets (Feature 9) ----
  const kpi = useMemo(() => ({
    awaitingApproval: scoped.filter(r => r.status === 'Submitted').length,
    approved: scoped.filter(r => r.status === 'Approved').length,
    partial: scoped.filter(r => r.status === 'Partially Fulfilled').length,
    fulfilled: scoped.filter(r => r.status === 'Fulfilled').length,
    rejected: scoped.filter(r => r.status === 'Rejected').length,
    overdue: scoped.filter(r => r.is_overdue).length,
    awaitingStock: scoped.filter(r =>
      ['Approved', 'Partially Fulfilled'].includes(r.status) && Number(r.shortfall_qty) > 0).length,
    readyToIssue: scoped.filter(r =>
      ['Approved', 'Partially Fulfilled'].includes(r.status) && Number(r.pending_qty) > 0).length,
  }), [scoped])

  async function submit(mr: MR) {
    if (!confirm(`Submit ${mr.request_no} for approval?`)) return
    const { error } = await supabase.rpc('inv_submit_mr', { p_mr: mr.mr_id })
    if (error) { alert('Could not submit:\n\n' + error.message); return }
    load()
  }

  async function reject(mr: MR) {
    const reason = prompt(`Reject ${mr.request_no}?\n\nReason:`)
    if (!reason) return
    const { error } = await supabase.rpc('inv_reject_mr', { p_mr: mr.mr_id, p_reason: reason })
    if (error) { alert('Could not reject:\n\n' + error.message); return }
    load()
  }

  async function cancel(mr: MR) {
    const reason = prompt(`Cancel ${mr.request_no}?\n\nAny reserved stock will be released. Reason:`)
    if (reason === null) return
    const { error } = await supabase.rpc('inv_cancel_mr', { p_mr: mr.mr_id, p_reason: reason || 'cancelled' })
    if (error) { alert('Could not cancel:\n\n' + error.message); return }
    load()
  }

  async function issue(mr: MR) {
    if (!confirm(
      `Create a Material Issue against ${mr.request_no}?\n\n` +
      `It will be pre-filled with the approved quantities and sent to Stock Movements for posting.`
    )) return
    const { error } = await supabase.rpc('inv_mr_to_issue', { p_mr: mr.mr_id })
    if (error) { alert('Could not create the issue:\n\n' + error.message); return }
    alert('Draft Issue created. Review it in Stock Movements, then Post it.')
    navigate('/stock-movements')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Material Requests</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Site asks → approver reviews → <b>stock is reserved</b> → material is issued.
          Approving a request holds the stock, so it cannot be promised twice.
        </p>
      </div>

      {/* Dashboard widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <W label="Awaiting Approval" value={kpi.awaitingApproval} tone={kpi.awaitingApproval ? 'amber' : undefined}
          onClick={() => setFStatus('Submitted')} />
        <W label="Ready to Issue" value={kpi.readyToIssue} tone={kpi.readyToIssue ? 'blue' : undefined}
          onClick={() => setFStatus('Approved')} />
        <W label="Awaiting Stock" value={kpi.awaitingStock} tone={kpi.awaitingStock ? 'purple' : undefined} />
        <W label="Partly Fulfilled" value={kpi.partial} onClick={() => setFStatus('Partially Fulfilled')} />
        <W label="Fulfilled" value={kpi.fulfilled} tone="emerald" onClick={() => setFStatus('Fulfilled')} />
        <W label="Overdue" value={kpi.overdue} tone={kpi.overdue ? 'red' : undefined} />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All status</option>
          {['Draft', 'Submitted', 'Approved', 'Partially Fulfilled', 'Fulfilled', 'Rejected', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fPriority} onChange={e => setFPriority(e.target.value)}>
          <option value="">All priorities</option>
          {['Urgent', 'High', 'Normal', 'Low'].map(p => <option key={p}>{p}</option>)}
        </select>
        {(fStatus || fPriority) && (
          <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => { setFStatus(''); setFPriority('') }}>Clear</button>
        )}
        <div className="ml-auto flex gap-2">
          <ExportButtons filename="material-requests" title="Material Request Register" rows={filtered}
            columns={[
              { header: 'Request No.', get: (r: any) => r.request_no },
              { header: 'Date', get: (r: any) => r.request_date },
              { header: 'Required By', get: (r: any) => r.required_date || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Requested By', get: (r: any) => r.requested_by_name || '—' },
              { header: 'Priority', get: (r: any) => r.priority },
              { header: 'Items', get: (r: any) => Number(r.line_count) },
              { header: 'Requested Qty', get: (r: any) => Number(r.requested_qty) },
              { header: 'Approved Qty', get: (r: any) => Number(r.approved_qty) },
              { header: 'Issued Qty', get: (r: any) => Number(r.issued_qty) },
              { header: 'Shortfall', get: (r: any) => Number(r.shortfall_qty) },
              { header: 'Status', get: (r: any) => r.status },
              { header: 'Approved By', get: (r: any) => r.approved_by_name || '—' },
            ]} />
          {can('store', 'create') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Request
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Request No.', 'Date', 'Required', 'Priority', 'Requested By', 'Items', 'Progress', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(r => (
                <tr key={r.mr_id}
                  className={`hover:bg-white/[0.02] ${r.is_overdue ? 'bg-red-500/[0.05]' : ''} ${['Cancelled', 'Rejected'].includes(r.status) ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8] font-semibold cursor-pointer hover:text-[#ffb87b]"
                    onClick={() => setDetail(r)}>{r.request_no}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.request_date}</td>
                  <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${r.is_overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {r.required_date || '—'}
                    {r.is_overdue && <span className="block text-[10px]">{r.days_overdue}d late</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLE[r.priority] || ''}`}>{r.priority}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{r.requested_by_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.line_count}</td>
                  <td className="px-4 py-2.5" style={{ minWidth: 100 }}>
                    {['Approved', 'Partially Fulfilled', 'Fulfilled'].includes(r.status) ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, r.pct_issued)}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-[#dcc1ae]">{r.pct_issued}%</span>
                      </div>
                    ) : <span className="text-[#dcc1ae]/30 text-[11px]">—</span>}
                    {Number(r.shortfall_qty) > 0 && (
                      <div className="text-[10px] text-amber-400 mt-0.5">short {q(r.shortfall_qty)}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {r.status === 'Draft' && (
                      <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => submit(r)}>Submit</button>
                    )}
                    {r.status === 'Submitted' && isAdmin && (
                      <>
                        <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => setDetail(r)}>Review</button>
                        <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => reject(r)}>Reject</button>
                      </>
                    )}
                    {['Approved', 'Partially Fulfilled'].includes(r.status) && Number(r.pending_qty) > 0 && can('store', 'create') && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => issue(r)}>Issue</button>
                    )}
                    {!['Fulfilled', 'Cancelled', 'Rejected'].includes(r.status) && (
                      <button className="text-[#dcc1ae] text-[11px] font-semibold uppercase hover:underline" onClick={() => cancel(r)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No material requests. Click "New Request" to raise one.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <MrForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {detail && <MrDetail mr={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); load() }} />}
    </div>
  )
}

function W({ label, value, tone, onClick }: {
  label: string; value: number; tone?: 'amber' | 'blue' | 'purple' | 'emerald' | 'red'; onClick?: () => void
}) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'blue' ? 'text-blue-400'
    : tone === 'purple' ? 'text-purple-400' : tone === 'emerald' ? 'text-emerald-400'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <button className="card p-3 text-left hover:bg-white/[0.04] transition-colors" onClick={onClick}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[20px] font-bold ${c}`}>{value}</div>
    </button>
  )
}

// =====================================================================
//  NEW REQUEST
// =====================================================================
type Line = { item_id: string; qty: string; remarks: string }

function MrForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [avail, setAvail] = useState<{ item_id: string; warehouse_id: string; free: number }[]>([])
  const [boqItems, setBoqItems] = useState<{ id: string; description: string; unit: string | null }[]>([])

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [requiredDate, setRequiredDate] = useState('')
  const [whId, setWhId] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [purpose, setPurpose] = useState('')
  const [boqItemId, setBoqItemId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '', remarks: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: u }, { data: w }, { data: a }] = await Promise.all([
        supabase.from('inv_items').select('id, item_code, name, unit_id').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
        supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true),
        supabase.from('inv_availability').select('item_id, warehouse_id, free'),
      ])
      setItems((i as Item[]) ?? [])
      setUnits((u as any[]) ?? [])
      const whs = (w as Warehouse[]) ?? []
      setWarehouses(whs)
      setAvail((a as any[]) ?? [])
      const main = whs.find(x => x.is_main && x.project_id === activeProject?.id)
      if (main) setWhId(main.id)

      if (activeProject) {
        const { data: bq } = await supabase.from('boqs').select('id').eq('project_id', activeProject.id)
        const ids = ((bq as any[]) ?? []).map(x => x.id)
        if (ids.length) {
          const { data: bi } = await supabase.from('boq_items')
            .select('id, description, unit').in('boq_id', ids).order('sort_order')
          setBoqItems((bi as any[]) ?? [])
        }
      }
    })()
  }, [])

  const wh = warehouses.filter(w => !w.project_id || w.project_id === activeProject?.id)
  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }
  const freeOf = (itemId: string) =>
    whId ? (avail.find(a => a.item_id === itemId && a.warehouse_id === whId)?.free ?? 0) : null

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', remarks: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item with a quantity.'); return }

    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { data: u } = await supabase.auth.getUser()
    const { data: no, error: noErr } = await supabase.rpc('inv_next_mr_no')
    if (noErr) { setErr(noErr.message); setBusy(false); return }

    const { data: mr, error: mErr } = await supabase.from('inv_material_requests').insert({
      org_id: prof?.org_id, project_id: activeProject?.id ?? null,
      request_no: no, request_date: date, required_date: requiredDate || null,
      warehouse_id: whId || null, requested_by: u?.user?.id ?? null,
      priority, purpose: purpose || null, boq_item_id: boqItemId || null,
      remarks: remarks || null, status: 'Draft',
    }).select('id').single()
    if (mErr) { setErr(mErr.message); setBusy(false); return }

    const { error: lErr } = await supabase.from('inv_mr_lines').insert(
      valid.map((l, i) => ({
        org_id: prof?.org_id, mr_id: (mr as any).id, item_id: l.item_id,
        qty: Number(l.qty), boq_item_id: boqItemId || null,
        remarks: l.remarks || null, line_no: i + 1,
      }))
    )
    setBusy(false)
    if (lErr) { setErr(lErr.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New Material Request</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <F label="Request Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          <F label="Required By"><input type="date" className="input" value={requiredDate} onChange={e => setRequiredDate(e.target.value)} /></F>
          <F label="Priority">
            <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
              {['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}
            </select>
          </F>
          <F label="Issue From">
            <select className="input" value={whId} onChange={e => setWhId(e.target.value)}>
              <option value="">— Select warehouse —</option>
              {wh.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (main)' : ''}</option>)}
            </select>
          </F>
          <div className="sm:col-span-2">
            <F label="Purpose"><input className="input" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Foundation concreting, block A" /></F>
          </div>
          <div className="sm:col-span-2">
            <F label="Against BOQ Item">
              <select className="input" value={boqItemId} onChange={e => setBoqItemId(e.target.value)}>
                <option value="">— Not linked —</option>
                {boqItems.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.description.slice(0, 60)}{b.description.length > 60 ? '…' : ''} ({b.unit})
                  </option>
                ))}
              </select>
            </F>
          </div>
        </div>

        {/* lines */}
        <div className="px-5 pb-2">
          <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Free at Store', 'Qty Required', 'Unit', 'Remarks', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => {
                  const free = l.item_id ? freeOf(l.item_id) : null
                  const short = free !== null && Number(l.qty) > free
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.item_id}
                          onChange={e => setLine(i, { item_id: e.target.value })}>
                          <option value="">— Select item —</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.item_code ? ` (${it.item_code})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-right whitespace-nowrap">
                        {free !== null
                          ? <span className={free <= 0 ? 'text-red-400' : 'text-[#dcc1ae]'}>{q(free)}</span>
                          : <span className="text-[#dcc1ae]/30">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input className={`input mono text-right ${short ? 'border-amber-500/40' : ''}`}
                          style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                        {short && <div className="text-[10px] text-amber-400 mt-0.5">short by {q(Number(l.qty) - (free ?? 0))}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae]">{unitOf(l.item_id) || '—'}</td>
                      <td className="px-3 py-2">
                        <input className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.remarks}
                          onChange={e => setLine(i, { remarks: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 && (
                          <button type="button" className="text-red-400 hover:text-red-300" onClick={() => delLine(i)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-ghost mt-2" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={addLine}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Add Item
          </button>
          <p className="text-[11px] text-[#dcc1ae]/50 mt-2">
            "Free at Store" excludes stock already reserved for other requests. A shortfall is fine —
            the approver can cover it with a transfer from another site, or a purchase order.
          </p>
        </div>

        <div className="px-5 pb-3">
          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save as Draft'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  DETAIL / APPROVE
// =====================================================================
function MrDetail({ mr, onClose, onChanged }: { mr: MR; onClose: () => void; onChanged: () => void }) {
  const { isAdmin } = useAuth()
  const [lines, setLines] = useState<(MrLine & { item_name: string; unit: string })[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [avail, setAvail] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any[] | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: h }] = await Promise.all([
        supabase.from('inv_mr_lines').select('*, inv_items(name, inv_units(code))').eq('mr_id', mr.mr_id).order('line_no'),
        supabase.from('inv_mr_history').select('*, profiles(full_name)').eq('mr_id', mr.mr_id).order('created_at'),
      ])
      const mapped = ((l as any[]) ?? []).map(x => ({
        ...x,
        item_name: x.inv_items?.name ?? '—',
        unit: x.inv_items?.inv_units?.code ?? '',
      }))
      setLines(mapped)
      setHistory((h as any[]) ?? [])

      // free stock per item at the issuing warehouse
      const { data: a } = await supabase.from('inv_availability').select('item_id, free')
        .in('item_id', mapped.map(x => x.item_id))
      const m: Record<string, number> = {}
      for (const r of ((a as any[]) ?? [])) m[r.item_id] = Number(r.free || 0)
      setAvail(m)
    })()
  }, [mr.mr_id])

  async function approve() {
    if (!confirm(
      `Approve ${mr.request_no}?\n\n` +
      `Available stock will be RESERVED for this request — no one else can take it.\n` +
      `Anything short will be reported so it can go to a transfer or a purchase order.`
    )) return
    setBusy(true)
    const { data, error } = await supabase.rpc('inv_approve_mr', { p_mr: mr.mr_id, p_warehouse: null, p_note: null })
    setBusy(false)
    if (error) { alert('Could not approve:\n\n' + error.message); return }
    setResult((data as any[]) ?? [])
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{mr.request_no}</h3>
            <p className="text-[12px] text-[#dcc1ae]">
              {mr.project_name} · {mr.priority} priority
              {mr.required_date && ` · required by ${mr.required_date}`}
            </p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        {result ? (
          <div className="p-5">
            <div className="text-center py-4">
              <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '36px' }}>check_circle</span>
              <p className="text-[#e2e2e8] font-semibold mt-2">Approved — stock reserved</p>
            </div>
            <table className="w-full text-sm rounded-lg border border-white/[0.08] overflow-hidden">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Requested', 'Approved & Reserved', 'Shortfall'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {result.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[#e2e2e8]">{r.item_name}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{q(r.requested)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-emerald-400 text-right">{q(r.approved)}</td>
                    <td className={`px-3 py-2 font-mono font-bold text-right ${Number(r.shortfall) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                      {Number(r.shortfall) > 0 ? q(r.shortfall) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.some(r => Number(r.shortfall) > 0) && (
              <p className="text-[12px] text-amber-400 mt-3">
                Some items are short. Use <b>Stock Availability</b> to find them at another site,
                or raise a Purchase Order for the shortfall.
              </p>
            )}
            <button className="btn btn-primary w-full mt-4" onClick={onChanged}>Done</button>
          </div>
        ) : (
          <>
            <div className="p-5">
              <table className="w-full text-sm rounded-lg border border-white/[0.08] overflow-hidden">
                <thead className="bg-[#282a2e]"><tr>
                  {['Item', 'Requested', 'Free', 'Approved', 'Issued'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {lines.map(l => {
                    const free = avail[l.item_id] ?? 0
                    const short = Number(l.qty) > free
                    return (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-[#e2e2e8] font-semibold">{l.item_name}</td>
                        <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right">{q(l.qty)} {l.unit}</td>
                        <td className={`px-3 py-2 font-mono text-right ${short ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {q(free)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{Number(l.approved_qty) ? q(l.approved_qty) : '—'}</td>
                        <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{Number(l.issued_qty) ? q(l.issued_qty) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {mr.status === 'Submitted' && isAdmin && (
                <>
                  <p className="text-[12px] text-[#dcc1ae]/70 mt-3">
                    Approving reserves whatever is free. If an item is short, it is approved for what exists
                    and the shortfall is reported — you can then transfer it in or purchase it.
                  </p>
                  <button className="btn btn-primary w-full mt-3" disabled={busy} onClick={approve}>
                    {busy ? 'Approving…' : 'Approve & Reserve Stock'}
                  </button>
                </>
              )}

              {mr.rejection_reason && (
                <div className="card p-3 mt-3 bg-red-500/5 border-red-500/15 text-[12px] text-red-400">
                  <b>Rejected:</b> {mr.rejection_reason}
                </div>
              )}
            </div>

            {/* history */}
            <div className="px-5 pb-5">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">Approval History</div>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-start gap-2 text-[12px]">
                    <span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '14px', marginTop: 2 }}>
                      {h.action === 'approved' ? 'check' : h.action === 'rejected' ? 'close' : 'arrow_forward'}
                    </span>
                    <div>
                      <span className="text-[#e2e2e8] capitalize">{h.action.replace(/_/g, ' ')}</span>
                      {h.profiles?.full_name && <span className="text-[#dcc1ae]"> by {h.profiles.full_name}</span>}
                      <span className="text-[#dcc1ae]/50"> · {new Date(h.created_at).toLocaleString('en-IN')}</span>
                      {h.note && <div className="text-[#dcc1ae]/70 text-[11px]">{h.note}</div>}
                    </div>
                  </div>
                ))}
                {!history.length && <div className="text-[12px] text-[#dcc1ae]/50">No actions yet.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body)
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}