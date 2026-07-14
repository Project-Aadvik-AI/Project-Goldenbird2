import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type PoStatus = {
  po_id: string; po_no: string; po_date: string; status: string
  vendor_name: string | null; project_name: string | null; warehouse_name: string | null
  sub_total: number; tax_amount: number; total_amount: number
  ordered_qty: number; received_qty: number; pending_qty: number
  pct_received: number; line_count: number
}
type Pending = {
  po_no: string; po_date: string; delivery_date: string | null; days_overdue: number | null
  vendor_name: string | null; item_name: string; unit: string | null
  ordered_qty: number; received_qty: number; pending_qty: number
  rate: number; pending_value: number
}
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null; standard_rate: number }
type Warehouse = { id: string; name: string; project_id: string | null; is_main: boolean }
type Vendor = { id: string; name: string }
type Tax = { id: string; name: string; total_rate: number }

const STATUS_STYLE: Record<string, string> = {
  'Draft': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Approved': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Partial': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Received': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Closed': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
  'Cancelled': 'bg-red-500/10 text-red-400 border-red-500/20',
}

type Tab = 'orders' | 'pending'

export default function PurchaseOrders() {
  const { can, isAdmin } = useAuth()
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('orders')
  const [rows, setRows] = useState<PoStatus[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fStatus, setFStatus] = useState('')

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    const [{ data: p }, { data: pd }, { data: w }] = await Promise.all([
      supabase.from('inv_po_status').select('*').order('po_date', { ascending: false }),
      supabase.from('inv_pending_deliveries').select('*').order('days_overdue', { ascending: false, nullsFirst: false }),
      supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true),
    ])

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((p as PoStatus[]) ?? [])
    setPending((pd as Pending[]) ?? [])
    setWarehouses((w as Warehouse[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const filtered = useMemo(() =>
    rows.filter(r => !fStatus || r.status === fStatus), [rows, fStatus])

  const kpis = useMemo(() => ({
    open: rows.filter(r => ['Approved', 'Partial'].includes(r.status)).length,
    value: r2(rows.filter(r => r.status !== 'Cancelled').reduce((n, r) => n + Number(r.total_amount || 0), 0)),
    pendingValue: r2(pending.reduce((n, p) => n + Number(p.pending_value || 0), 0)),
    overdue: pending.filter(p => (p.days_overdue ?? 0) > 0).length,
  }), [rows, pending])

  async function approve(po: PoStatus) {
    if (!confirm(`Approve ${po.po_no}?\n\nOnce approved the lines are locked and goods can be received against it.`)) return
    const { error } = await supabase.rpc('inv_approve_po', { p_po: po.po_id })
    if (error) { alert('Could not approve:\n\n' + error.message); return }
    load()
  }

  async function receive(po: PoStatus) {
    const wh = warehouses.filter(w => !w.project_id || w.project_id === activeProject?.id)
    if (!wh.length) { alert('No warehouse available on this project.'); return }
    const main = wh.find(w => w.is_main) ?? wh[0]

    if (!confirm(
      `Create a Goods Receipt against ${po.po_no}?\n\n` +
      `It will be pre-filled with the pending quantities and received into "${main.name}".\n` +
      `Review it in Stock Movements, then Post it.`
    )) return

    const { data, error } = await supabase.rpc('inv_grn_from_po', { p_po: po.po_id, p_warehouse: main.id })
    if (error) { alert('Could not create GRN:\n\n' + error.message); return }
    alert('Draft GRN created. Review the quantities in Stock Movements, then Post it.')
    navigate('/stock-movements')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Purchase Orders</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Order → receive → bill. Goods can only be received against an approved PO, and never more than ordered.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Open Orders" value={String(kpis.open)} />
        <K label="Total PO Value" value={inr(kpis.value)} />
        <K label="Pending Delivery" value={inr(kpis.pendingValue)} tone={kpis.pendingValue ? 'amber' : undefined} />
        <K label="Overdue Lines" value={String(kpis.overdue)} tone={kpis.overdue ? 'red' : undefined} />
      </div>

      <div className="flex gap-1 mb-4">
        {([['orders', 'Purchase Orders'], ['pending', `Pending Deliveries (${pending.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {tab === 'orders' && (
            <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">All status</option>
              {['Draft', 'Approved', 'Partial', 'Received', 'Closed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          {can('purchase_requests', 'create') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New PO
            </button>
          )}
        </div>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : tab === 'orders' ? (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Purchase Orders</span>
            <ExportButtons filename="purchase-orders" title="Purchase Orders" rows={filtered}
              columns={[
                { header: 'PO No.', get: (r: any) => r.po_no },
                { header: 'Date', get: (r: any) => r.po_date },
                { header: 'Vendor', get: (r: any) => r.vendor_name || '—' },
                { header: 'Project', get: (r: any) => r.project_name || '—' },
                { header: 'Ordered Qty', get: (r: any) => Number(r.ordered_qty) },
                { header: 'Received Qty', get: (r: any) => Number(r.received_qty) },
                { header: 'Pending Qty', get: (r: any) => Number(r.pending_qty) },
                { header: '% Received', get: (r: any) => Number(r.pct_received) },
                { header: 'Sub Total', get: (r: any) => Number(r.sub_total) },
                { header: 'Tax', get: (r: any) => Number(r.tax_amount) },
                { header: 'Total', get: (r: any) => Number(r.total_amount) },
                { header: 'Status', get: (r: any) => r.status },
              ]} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['PO No.', 'Date', 'Vendor', 'Items', 'Ordered', 'Received', 'Progress', 'Total', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(r => (
                <tr key={r.po_id} className={`hover:bg-white/[0.02] ${r.status === 'Cancelled' ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8] font-semibold">{r.po_no}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.po_date}</td>
                  <td className="px-4 py-2.5 text-[#e2e2e8]">{r.vendor_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.line_count}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{q(r.ordered_qty)}</td>
                  <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">{q(r.received_qty)}</td>
                  <td className="px-4 py-2.5" style={{ minWidth: 90 }}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, r.pct_received)}%` }} />
                      </div>
                      <span className="font-mono text-[11px] text-[#dcc1ae]">{r.pct_received}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.total_amount)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {r.status === 'Draft' && can('purchase_requests', 'approve') && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => approve(r)}>Approve</button>
                    )}
                    {['Approved', 'Partial'].includes(r.status) && can('store', 'create') && (
                      <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline" onClick={() => receive(r)}>Receive</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No purchase orders yet. Click "New PO" to raise one.
              </td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Pending Deliveries — what vendors still owe you</span>
            <ExportButtons filename="pending-deliveries" title="Pending Deliveries" rows={pending}
              columns={[
                { header: 'PO No.', get: (r: any) => r.po_no },
                { header: 'Vendor', get: (r: any) => r.vendor_name || '—' },
                { header: 'Item', get: (r: any) => r.item_name },
                { header: 'Ordered', get: (r: any) => Number(r.ordered_qty) },
                { header: 'Received', get: (r: any) => Number(r.received_qty) },
                { header: 'Pending', get: (r: any) => Number(r.pending_qty) },
                { header: 'Due Date', get: (r: any) => r.delivery_date || '—' },
                { header: 'Days Overdue', get: (r: any) => r.days_overdue ?? 0 },
                { header: 'Pending Value', get: (r: any) => Number(r.pending_value) },
              ]} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['PO No.', 'Vendor', 'Item', 'Ordered', 'Received', 'Pending', 'Due Date', 'Value'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {pending.map((p, i) => {
                const overdue = (p.days_overdue ?? 0) > 0
                return (
                  <tr key={i} className={`hover:bg-white/[0.02] ${overdue ? 'bg-red-500/[0.05]' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{p.po_no}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{p.vendor_name || '—'}</td>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{p.item_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{q(p.ordered_qty)}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">{q(p.received_qty)}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-amber-400 text-right">{q(p.pending_qty)} {p.unit}</td>
                    <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                      {p.delivery_date || '—'}{overdue ? ` · ${p.days_overdue}d late` : ''}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(p.pending_value)}</td>
                  </tr>
                )
              })}
              {!pending.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
                ✓ Nothing pending — every approved PO has been fully received.
              </td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <PoForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

// =====================================================================
//  NEW PO
// =====================================================================
type Line = { item_id: string; qty: string; rate: string; remarks: string }

function PoForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [vendorId, setVendorId] = useState('')
  const [whId, setWhId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [taxId, setTaxId] = useState('')
  const [terms, setTerms] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '', rate: '', remarks: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: u }, { data: v }, { data: w }, { data: t }] = await Promise.all([
        supabase.from('inv_items').select('id, item_code, name, unit_id, standard_rate').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
        supabase.from('acc_parties').select('id, name').in('party_type', ['Vendor', 'Both']).eq('active', true).order('name'),
        supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true),
        supabase.from('acc_tax_rates').select('id, name, total_rate').eq('active', true).order('total_rate', { ascending: false }),
      ])
      setItems((i as Item[]) ?? [])
      setUnits((u as any[]) ?? [])
      setVendors((v as Vendor[]) ?? [])
      const whs = (w as Warehouse[]) ?? []
      setWarehouses(whs)
      setTaxes((t as Tax[]) ?? [])
      const main = whs.find(x => x.is_main && x.project_id === activeProject?.id)
      if (main) setWhId(main.id)
    })()
  }, [])

  const wh = warehouses.filter(w => !w.project_id || w.project_id === activeProject?.id)
  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', rate: '', remarks: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  const subTotal = r2(lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0))
  const tax = taxes.find(t => t.id === taxId)
  const taxAmt = tax ? r2(subTotal * Number(tax.total_rate) / 100) : 0
  const total = r2(subTotal + taxAmt)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!vendorId) { setErr('Select a vendor.'); return }
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item with a quantity.'); return }

    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { data: u } = await supabase.auth.getUser()
    const { data: no, error: noErr } = await supabase.rpc('inv_next_po_no')
    if (noErr) { setErr(noErr.message); setBusy(false); return }

    const { data: po, error: pErr } = await supabase.from('inv_purchase_orders').insert({
      org_id: prof?.org_id, project_id: activeProject?.id ?? null,
      po_no: no, po_date: date, vendor_id: vendorId,
      warehouse_id: whId || null, delivery_date: deliveryDate || null,
      tax_rate_id: taxId || null, payment_terms: terms || null,
      remarks: remarks || null, status: 'Draft', created_by: u?.user?.id ?? null,
    }).select('id').single()
    if (pErr) { setErr(pErr.message); setBusy(false); return }

    const { error: lErr } = await supabase.from('inv_po_lines').insert(
      valid.map((l, i) => ({
        org_id: prof?.org_id, po_id: (po as any).id, item_id: l.item_id,
        qty: Number(l.qty), rate: Number(l.rate) || 0,
        amount: r2((Number(l.qty) || 0) * (Number(l.rate) || 0)),
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
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-4xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New Purchase Order</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <F label="PO Date *"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          <F label="Vendor *">
            <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
              <option value="">— Select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </F>
          <F label="Deliver To">
            <select className="input" value={whId} onChange={e => setWhId(e.target.value)}>
              <option value="">— Select warehouse —</option>
              {wh.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (main)' : ''}</option>)}
            </select>
          </F>
          <F label="Delivery Date"><input type="date" className="input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></F>
          <F label="GST Rate">
            <select className="input" value={taxId} onChange={e => setTaxId(e.target.value)}>
              <option value="">— No GST —</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </F>
          <div className="sm:col-span-3">
            <F label="Payment Terms"><input className="input" value={terms} onChange={e => setTerms(e.target.value)} placeholder="30 days from delivery" /></F>
          </div>
        </div>

        {!vendors.length && (
          <div className="mx-5 mb-3 card p-3 bg-amber-500/5 border-amber-500/15 text-[12px] text-amber-400">
            No vendors found. Add them in <b>Head Office → Accounting → Parties</b> (type: Vendor).
          </div>
        )}

        {/* lines */}
        <div className="px-5 pb-2">
          <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Qty', 'Unit', 'Rate', 'Amount', 'Remarks', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => {
                  const amt = r2((Number(l.qty) || 0) * (Number(l.rate) || 0))
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.item_id}
                          onChange={e => {
                            const id = e.target.value
                            const it = items.find(x => x.id === id)
                            setLine(i, { item_id: id, rate: it?.standard_rate ? String(it.standard_rate) : l.rate })
                          }}>
                          <option value="">— Select item —</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.item_code ? ` (${it.item_code})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae]">{unitOf(l.item_id) || '—'}</td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{amt ? inr(amt) : '—'}</td>
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
        </div>

        {/* totals */}
        <div className="px-5 pb-3">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4 max-w-xs ml-auto">
            <Row label="Sub Total" value={inr(subTotal)} />
            {tax && <Row label={`GST (${tax.total_rate}%)`} value={'+ ' + inr(taxAmt)} />}
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/[0.08]">
              <span className="text-[12px] font-bold text-[#e2e2e8] uppercase tracking-wide">Total</span>
              <span className="font-mono text-[16px] font-bold text-[#ffb87b]">{inr(total)}</span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-3">
          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save as Draft'}</button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          Saved as Draft. Approve it to lock the lines and allow goods to be received against it.
        </p>
      </form>
    </div>
  ), document.body)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[12px] text-[#dcc1ae]">{label}</span>
      <span className="font-mono text-[13px] text-[#e2e2e8]">{value}</span>
    </div>
  )
}
function K({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}