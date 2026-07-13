import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

type Row = {
  issue_id: string; line_id: string; slip_no: string
  issue_date: string; expected_return: string | null
  party_id: string; vendor_name: string; vendor_code: string | null; vendor_phone: string | null
  project_id: string; project_name: string | null; warehouse_name: string | null
  item_id: string; item_code: string | null; item_name: string
  category_name: string | null; unit: string | null
  condition_out: string
  qty_issued: number; qty_returned: number; qty_written_off: number; qty_pending: number
  rate: number; pending_value: number
  received_by: string | null; issued_by_name: string | null; remarks: string | null
  days_overdue: number | null; status: string
}
type Vendor = { id: string; name: string; vendor_code: string | null }
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null }
type Warehouse = { id: string; name: string; project_id: string | null; is_main: boolean }

const STATUS_STYLE: Record<string, string> = {
  'Returned': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Partially Returned': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Pending Return': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Overdue': 'bg-red-500/15 text-red-400 border-red-500/30',
}
const COND_STYLE: Record<string, string> = {
  'New': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Good': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Used': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Damaged': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Scrap': 'bg-red-500/15 text-red-400 border-red-500/25',
}

export default function VendorIssues() {
  const { can, isAdmin } = useAuth()
  const { activeProject } = useProject()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [returning, setReturning] = useState<Row | null>(null)
  const [fStatus, setFStatus] = useState('')
  const [fVendor, setFVendor] = useState('')
  const [qq, setQq] = useState('')

  async function load() {
    setLoading(true)
    // scan for overdue returns and expiring documents.
    // the DB deduplicates, so this is safe to call on every load.
    supabase.rpc('vendor_scan_alerts').then(() => {})
    const { data } = await supabase.from('vendor_pending_returns').select('*')
      .eq('project_id', activeProject?.id ?? '')
      .order('days_overdue', { ascending: false, nullsFirst: false })
    setRows((data as Row[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const vendors = useMemo(() =>
    [...new Map(rows.map(r => [r.party_id, r.vendor_name])).entries()], [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (fStatus && r.status !== fStatus) return false
    if (fVendor && r.party_id !== fVendor) return false
    const s = qq.trim().toLowerCase()
    if (s && !`${r.item_name} ${r.vendor_name} ${r.slip_no}`.toLowerCase().includes(s)) return false
    return true
  }), [rows, fStatus, fVendor, qq])

  const kpi = useMemo(() => ({
    issued: r3(rows.reduce((n, r) => n + Number(r.qty_issued || 0), 0)),
    returned: r3(rows.reduce((n, r) => n + Number(r.qty_returned || 0), 0)),
    pending: r3(rows.reduce((n, r) => n + Number(r.qty_pending || 0), 0)),
    pendingValue: rows.reduce((n, r) => n + Number(r.pending_value || 0), 0),
    overdue: rows.filter(r => r.status === 'Overdue').length,
    overdueValue: rows.filter(r => r.status === 'Overdue')
      .reduce((n, r) => n + Number(r.pending_value || 0), 0),
  }), [rows])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Issued Items</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Material lent to vendors — props, shuttering, tools, equipment. What is out, and what is overdue.
          </p>
        </div>
        {can('store', 'create') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>output</span> Issue to Vendor
          </button>
        )}
      </div>

      {kpi.overdue > 0 && (
        <div className="card p-4 mb-4 bg-red-500/10 border-red-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '20px' }}>error</span>
            <div>
              <div className="text-[13px] font-bold text-red-400">
                {kpi.overdue} item(s) are OVERDUE — {inr(kpi.overdueValue)} of company material
              </div>
              <div className="text-[12px] text-[#dcc1ae] mt-0.5">
                The expected return date has passed. Chase these vendors.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Total Issued" value={q(kpi.issued)} />
        <K label="Total Returned" value={q(kpi.returned)} tone="emerald" />
        <K label="Pending Return" value={q(kpi.pending)} sub={inr(kpi.pendingValue)}
          tone={kpi.pending > 0 ? 'amber' : undefined} />
        <K label="Overdue" value={String(kpi.overdue)} sub={inr(kpi.overdueValue)}
          tone={kpi.overdue > 0 ? 'red' : 'emerald'} />
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        {['', 'Pending Return', 'Partially Returned', 'Overdue', 'Returned'].map(st => (
          <button key={st || 'all'} onClick={() => setFStatus(st)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
              fStatus === st ? (st ? STATUS_STYLE[st] : 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30')
                : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {st || 'All'} ({st ? rows.filter(r => r.status === st).length : rows.length})
          </button>
        ))}
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px', maxWidth: 180 }}
          value={fVendor} onChange={e => setFVendor(e.target.value)}>
          <option value="">All vendors</option>
          {vendors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 180, padding: '6px 10px', fontSize: '13px' }}
          value={qq} onChange={e => setQq(e.target.value)} placeholder="Search item, vendor, slip…" />
        <div className="ml-auto">
          <ExportButtons filename="vendor-issued-items" title="Vendor Issued Items" rows={filtered}
            columns={[
              { header: 'Slip No.', get: (r: any) => r.slip_no },
              { header: 'Issue Date', get: (r: any) => r.issue_date },
              { header: 'Vendor Code', get: (r: any) => r.vendor_code || '—' },
              { header: 'Vendor', get: (r: any) => r.vendor_name },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Item Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Category', get: (r: any) => r.category_name || '—' },
              { header: 'Unit', get: (r: any) => r.unit || '—' },
              { header: 'Condition Out', get: (r: any) => r.condition_out },
              { header: 'Qty Issued', get: (r: any) => Number(r.qty_issued) },
              { header: 'Qty Returned', get: (r: any) => Number(r.qty_returned) },
              { header: 'Written Off', get: (r: any) => Number(r.qty_written_off) },
              { header: 'Qty Pending', get: (r: any) => Number(r.qty_pending) },
              { header: 'Pending Value', get: (r: any) => Number(r.pending_value) },
              { header: 'Expected Return', get: (r: any) => r.expected_return || '—' },
              { header: 'Days Overdue', get: (r: any) => r.days_overdue ?? '—' },
              { header: 'Issued By', get: (r: any) => r.issued_by_name || '—' },
              { header: 'Received By', get: (r: any) => r.received_by || '—' },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
          <PrintButton />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Slip / Item', 'Vendor', 'Issued', 'Returned', 'Pending', 'Expected Return', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(r => {
                const overdue = r.status === 'Overdue'
                return (
                  <tr key={r.line_id} className={`hover:bg-white/[0.02] ${overdue ? 'bg-red-500/[0.06]' : ''}`}>
                    <td className="px-4 py-2.5">
                      <div className="text-[#e2e2e8] font-semibold">{r.item_name}</div>
                      <div className="text-[10px] text-[#dcc1ae]/60 font-mono">
                        {r.slip_no}{r.item_code ? ` · ${r.item_code}` : ''}
                      </div>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${COND_STYLE[r.condition_out] ?? ''}`}>
                        {r.condition_out}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[#e2e2e8]">{r.vendor_name}</div>
                      <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.vendor_code}</div>
                      {r.vendor_phone && <div className="text-[10px] text-[#dcc1ae]/50">{r.vendor_phone}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                      {q(r.qty_issued)} <span className="text-[10px]">{r.unit}</span>
                      <div className="text-[10px] text-[#dcc1ae]/50">{r.issue_date}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">
                      {Number(r.qty_returned) ? q(r.qty_returned) : '—'}
                      {Number(r.qty_written_off) > 0 && (
                        <div className="text-[10px] text-red-400">−{q(r.qty_written_off)} lost</div>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${
                      Number(r.qty_pending) > 0 ? (overdue ? 'text-red-400' : 'text-amber-400') : 'text-[#dcc1ae]/40'}`}>
                      {Number(r.qty_pending) > 0 ? q(r.qty_pending) : '—'}
                      {Number(r.pending_value) > 0 && (
                        <div className="text-[10px] font-normal">{inr(r.pending_value)}</div>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                      {r.expected_return || '—'}
                      {overdue && <div className="text-[10px]">{r.days_overdue}d late</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {Number(r.qty_pending) > 0 && can('store', 'create') && (
                        <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                          onClick={() => setReturning(r)}>Return</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
                Nothing issued to vendors. Click "Issue to Vendor" to lend material.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <IssueForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {returning && <ReturnModal r={returning} onClose={() => setReturning(null)}
        onDone={() => { setReturning(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  RETURN
// =====================================================================
function ReturnModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(String(r.qty_pending))
  const [condition, setCondition] = useState('Good')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const damaged = ['Damaged', 'Scrap'].includes(condition)

  async function go() {
    const n = Number(qty)
    if (!n || n <= 0) { setErr('Enter the quantity returned.'); return }
    if (n > Number(r.qty_pending) + 0.001) {
      setErr(`Only ${q(r.qty_pending)} is still pending on this line.`); return
    }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('return_from_vendor', {
      p_line: r.line_id, p_qty: n, p_condition: condition,
      p_return_date: date, p_remarks: remarks || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Record a Return</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          <b className="text-[#e2e2e8]">{r.item_name}</b> from <b className="text-[#e2e2e8]">{r.vendor_name}</b>
          <br />Slip {r.slip_no} · issued {q(r.qty_issued)} {r.unit} · <b className="text-amber-400">{q(r.qty_pending)} still pending</b>
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Quantity Returned *">
              <input className="input mono text-right" inputMode="decimal" value={qty}
                onChange={e => setQty(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
            </F>
            <F label="Return Date">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
          </div>

          <F label="Condition on Return *">
            <select className="input" value={condition} onChange={e => setCondition(e.target.value)}>
              <option>New</option><option>Good</option><option>Used</option>
              <option>Damaged</option><option>Scrap</option>
            </select>
          </F>

          {damaged && (
            <div className="card p-3 bg-red-500/5 border-red-500/20 text-[12px] text-red-400">
              <b>{condition} material is NOT returned to stock.</b> It is written off instead —
              putting a broken item back into the store as usable would be wrong.
              The vendor's obligation is still cleared.
            </div>
          )}

          <F label="Remarks">
            <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder="Condition notes, who handed it over…" />
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Saving…' : damaged ? 'Write Off' : 'Return to Stock'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

// =====================================================================
//  ISSUE TO VENDOR
// =====================================================================
type Line = { item_id: string; qty: string; condition: string; rate: string; remarks: string }

function IssueForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [avail, setAvail] = useState<{ item_id: string; warehouse_id: string; free: number; avg_rate: number }[]>([])

  const [partyId, setPartyId] = useState('')
  const [whId, setWhId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedReturn, setExpectedReturn] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '', condition: 'Good', rate: '', remarks: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: i }, { data: u }, { data: w }, { data: a }] = await Promise.all([
        supabase.from('acc_parties').select('id, name, vendor_code')
          .in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name'),
        supabase.from('inv_items').select('id, item_code, name, unit_id').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
        supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true),
        supabase.from('inv_availability').select('item_id, warehouse_id, free, avg_rate'),
      ])
      setVendors((v as Vendor[]) ?? [])
      setItems((i as Item[]) ?? [])
      setUnits((u as any[]) ?? [])
      const whs = (w as Warehouse[]) ?? []
      setWarehouses(whs)
      setAvail((a as any[]) ?? [])
      const main = whs.find(x => x.is_main && x.project_id === activeProject?.id)
      if (main) setWhId(main.id)
    })()
  }, [])

  const wh = warehouses.filter(w => !w.project_id || w.project_id === activeProject?.id)
  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }
  const freeOf = (itemId: string) =>
    whId ? (avail.find(a => a.item_id === itemId && a.warehouse_id === whId)?.free ?? 0) : null
  const rateOf = (itemId: string) =>
    whId ? (avail.find(a => a.item_id === itemId && a.warehouse_id === whId)?.avg_rate ?? 0) : 0

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', condition: 'Good', rate: '', remarks: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  // you cannot lend what you do not have
  const shortages = useMemo(() => lines
    .filter(l => l.item_id && Number(l.qty) > 0)
    .map(l => {
      const free = freeOf(l.item_id) ?? 0
      return { name: items.find(i => i.id === l.item_id)?.name ?? '', want: Number(l.qty), free }
    })
    .filter(x => x.want > x.free), [lines, whId, avail, items])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!partyId) { setErr('Select the vendor.'); return }
    if (!whId) { setErr('Select the store the material is issued from.'); return }
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item.'); return }
    if (shortages.length) { setErr('Not enough free stock — see the warning.'); return }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', uid!).maybeSingle()

    let filePath: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, 'vendor-issues')
      const { path: stored, error: upErr } = await uploadPrivate('vendor-docs', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      filePath = stored ?? null
    }

    const { data: slip, error: sErr } = await supabase.rpc('next_issue_slip_no')
    if (sErr) { setErr(sErr.message); setBusy(false); return }

    const { data: iss, error: iErr } = await supabase.from('vendor_issues').insert({
      org_id: prof?.org_id,
      project_id: activeProject?.id,
      party_id: partyId,
      slip_no: slip,
      issue_date: issueDate,
      expected_return: expectedReturn || null,
      warehouse_id: whId,
      issued_by: uid,
      received_by: receivedBy || null,
      remarks: remarks || null,
      file: filePath,
    }).select('id').single()
    if (iErr) { setErr(iErr.message); setBusy(false); return }

    const issueId = (iss as any).id

    const { error: lErr } = await supabase.from('vendor_issue_lines').insert(
      valid.map((l, i) => ({
        org_id: prof?.org_id, issue_id: issueId, item_id: l.item_id,
        qty_issued: Number(l.qty),
        condition_out: l.condition,
        rate: Number(l.rate) || rateOf(l.item_id),
        remarks: l.remarks || null,
        line_no: i + 1,
      }))
    )
    if (lErr) { setErr(lErr.message); setBusy(false); return }

    // this posts the stock movement — and enforces negative-stock
    const { error: pErr } = await supabase.rpc('issue_to_vendor', { p_issue: issueId })
    setBusy(false)
    if (pErr) { setErr(pErr.message); return }

    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Issue Material to Vendor</h3>
            <p className="text-[11px] text-[#dcc1ae]/60">This is a loan — the material must come back.</p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <F label="Vendor *">
              <select className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
                <option value="">— Select vendor —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}{v.vendor_code ? ` (${v.vendor_code})` : ''}</option>
                ))}
              </select>
            </F>
          </div>
          <F label="Vendor Code">
            <input className="input mono" readOnly style={{ opacity: 0.7 }}
              value={vendors.find(v => v.id === partyId)?.vendor_code ?? ''} placeholder="auto" />
          </F>

          <F label="Issue From (store) *">
            <select className="input" value={whId} onChange={e => setWhId(e.target.value)}>
              <option value="">— Select —</option>
              {wh.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (main)' : ''}</option>)}
            </select>
          </F>
          <F label="Issue Date">
            <input type="date" className="input" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </F>
          <F label="Expected Return *">
            <input type="date" className="input" value={expectedReturn}
              onChange={e => setExpectedReturn(e.target.value)} />
          </F>

          <div className="sm:col-span-2">
            <F label="Received By (vendor's representative)">
              <input className="input" value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
                placeholder="Name of the person collecting it" />
            </F>
          </div>
          <F label="Signed Slip / Photo">
            <input type="file" className="input" accept=".pdf,image/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </F>
        </div>

        {shortages.length > 0 && (
          <div className="mx-5 mb-3 card p-3 bg-red-500/5 border-red-500/20">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
              <div className="text-[12px]">
                <b className="text-red-400">Not enough free stock:</b>
                {shortages.map((s, i) => (
                  <div key={i} className="text-[#dcc1ae]">
                    {s.name} — free <b className="text-[#e2e2e8]">{q(s.free)}</b>, issuing <b className="text-red-400">{q(s.want)}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pb-2">
          <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Free', 'Qty', 'Unit', 'Condition', 'Rate', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => {
                  const free = l.item_id ? freeOf(l.item_id) : null
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 190 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.item_id}
                          onChange={e => {
                            const id = e.target.value
                            setLine(i, { item_id: id, rate: String(rateOf(id) || '') })
                          }}>
                          <option value="">— Select item —</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-right whitespace-nowrap">
                        {free !== null
                          ? <span className={free <= 0 ? 'text-red-400' : 'text-[#dcc1ae]'}>{q(free)}</span>
                          : <span className="text-[#dcc1ae]/30">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 80 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae]">{unitOf(l.item_id) || '—'}</td>
                      <td className="px-3 py-2">
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }}
                          value={l.condition} onChange={e => setLine(i, { condition: e.target.value })}>
                          <option>New</option><option>Good</option><option>Used</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 80 }}
                          inputMode="decimal" value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
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
        </div>

        <div className="px-5 pb-3">
          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy || shortages.length > 0}>
            {busy ? 'Issuing…' : 'Issue to Vendor'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          The stock leaves the store immediately. The vendor owes it back by the expected return date.
        </p>
      </form>
    </div>
  ), document.body)
}

function K({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'emerald' | 'amber' | 'red'
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/50 mt-0.5">{sub}</div>}
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}