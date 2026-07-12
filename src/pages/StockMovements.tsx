import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

type MType = 'Opening' | 'GRN' | 'Issue' | 'Return' | 'Transfer' | 'Adjustment'

const TYPES: { key: MType; label: string; desc: string; icon: string; dir: 'in' | 'out' | 'both' }[] = [
  { key: 'GRN', label: 'Goods Receipt', desc: 'Material received from a vendor', icon: 'local_shipping', dir: 'in' },
  { key: 'Issue', label: 'Material Issue', desc: 'Material issued to site / machine / subcontractor', icon: 'output', dir: 'out' },
  { key: 'Return', label: 'Material Return', desc: 'Unused material returned to store', icon: 'undo', dir: 'in' },
  { key: 'Transfer', label: 'Stock Transfer', desc: 'Move stock between warehouses', icon: 'swap_horiz', dir: 'both' },
  { key: 'Adjustment', label: 'Stock Adjustment', desc: 'Physical verification, damage, loss', icon: 'tune', dir: 'both' },
  { key: 'Opening', label: 'Opening Stock', desc: 'Stock on hand when you start', icon: 'flag', dir: 'in' },
]

const TYPE_STYLE: Record<string, string> = {
  'GRN': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Issue': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Return': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Transfer': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Adjustment': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Opening': 'bg-white/5 text-[#dcc1ae] border-white/10',
}

type Movement = {
  id: string; movement_no: string; movement_type: string; movement_date: string
  from_warehouse: string | null; to_warehouse: string | null
  vendor_id: string | null; issued_to: string | null; reference_no: string | null
  reason: string | null; remarks: string | null; status: string
  total_qty: number; total_value: number
}
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null; allow_negative: boolean }
type Warehouse = { id: string; name: string; project_id: string | null; is_main: boolean }
type Unit = { id: string; code: string }
type Balance = { item_id: string; warehouse_id: string; balance_qty: number; avg_rate: number }

export default function StockMovements() {
  const { can, isAdmin } = useAuth()
  const { activeProject } = useProject()
  const [rows, setRows] = useState<Movement[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<MType | null>(null)
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [ready, setReady] = useState(true)

  async function load() {
    setLoading(true)
    const { count } = await supabase.from('inv_items').select('id', { count: 'exact', head: true })
    if ((count ?? 0) === 0) { setReady(false); setLoading(false); return }

    const [{ data: m }, { data: w }] = await Promise.all([
      supabase.from('inv_movements').select('*')
        .order('movement_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true).order('name'),
    ])
    setRows((m as Movement[]) ?? [])
    setWarehouses((w as Warehouse[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const whOf = (id: string | null) => (id ? warehouses.find(w => w.id === id)?.name : null) || '—'

  const filtered = useMemo(() => rows.filter(r =>
    (!fType || r.movement_type === fType) && (!fStatus || r.status === fStatus)
  ), [rows, fType, fStatus])

  async function post(m: Movement) {
    if (!confirm(`Post ${m.movement_no}?\n\nOnce posted the stock moves and the entry becomes locked.`)) return
    const { error } = await supabase.rpc('inv_post_movement', { p_movement: m.id })
    if (error) { alert('Could not post:\n\n' + error.message); return }
    load()
  }
  async function cancel(m: Movement) {
    const reason = prompt(`Cancel ${m.movement_no}?\n\nThis reverses the stock. Reason:`)
    if (reason === null) return
    const { error } = await supabase.rpc('inv_cancel_movement', { p_movement: m.id, p_reason: reason })
    if (error) { alert('Could not cancel:\n\n' + error.message); return }
    load()
  }

  if (!ready) return (
    <div className="max-w-lg mx-auto mt-10 card p-8 text-center">
      <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '40px' }}>inventory_2</span>
      <h1 className="font-headline text-xl font-semibold text-[#e2e2e8] mt-3">Item Master not set up</h1>
      <p className="text-[13px] text-[#dcc1ae] mt-2">
        Go to <b>Head Office → Inventory Masters</b> and create the Item Master first.
        Stock movements need real items and warehouses.
      </p>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Stock Movements</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Receipt, issue, return, transfer and adjustment. Stock cannot go negative — the database enforces it.
        </p>
      </div>

      {/* new movement buttons */}
      {can('store', 'create') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setShowForm(t.key)}
              className="card p-3 text-left hover:bg-white/[0.04] transition-colors">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>{t.icon}</span>
              <div className="text-[13px] font-semibold text-[#e2e2e8] mt-1">{t.label}</div>
              <div className="text-[10px] text-[#dcc1ae]/60 leading-tight mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All status</option>
          <option>Draft</option><option>Posted</option><option>Cancelled</option>
        </select>
        <div className="ml-auto">
          <ExportButtons filename="stock-movements" title="Stock Movements" rows={filtered}
            columns={[
              { header: 'Date', get: (r: any) => r.movement_date },
              { header: 'Movement No.', get: (r: any) => r.movement_no },
              { header: 'Type', get: (r: any) => r.movement_type },
              { header: 'From', get: (r: any) => whOf(r.from_warehouse) },
              { header: 'To', get: (r: any) => whOf(r.to_warehouse) },
              { header: 'Reference', get: (r: any) => r.reference_no || '—' },
              { header: 'Issued To', get: (r: any) => r.issued_to || '—' },
              { header: 'Total Qty', get: (r: any) => Number(r.total_qty) },
              { header: 'Total Value', get: (r: any) => Number(r.total_value) },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Date', 'Movement No.', 'Type', 'From → To', 'Reference', 'Qty', 'Value', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(m => (
                <tr key={m.id} className={`hover:bg-white/[0.02] ${m.status === 'Cancelled' ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{m.movement_date}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8] font-semibold">{m.movement_no}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${TYPE_STYLE[m.movement_type] || ''}`}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px] whitespace-nowrap">
                    {m.from_warehouse && whOf(m.from_warehouse)}
                    {m.from_warehouse && m.to_warehouse && ' → '}
                    {m.to_warehouse && whOf(m.to_warehouse)}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{m.reference_no || m.issued_to || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{q(m.total_qty)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{m.total_value ? inr(m.total_value) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                      m.status === 'Posted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : m.status === 'Cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{m.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {m.status === 'Draft' && can('store', 'create') && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline" onClick={() => post(m)}>Post</button>
                    )}
                    {m.status === 'Posted' && isAdmin && (
                      <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline" onClick={() => cancel(m)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No movements yet. Use the buttons above to record a receipt, issue, transfer or adjustment.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <MovementForm type={showForm} warehouses={warehouses}
        onClose={() => setShowForm(null)} onSaved={() => { setShowForm(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  MOVEMENT FORM
// =====================================================================
type Line = { item_id: string; qty: string; rate: string; batch_no: string; remarks: string }

function MovementForm({ type, warehouses, onClose, onSaved }: {
  type: MType; warehouses: Warehouse[]; onClose: () => void; onSaved: () => void
}) {
  const { activeProject } = useProject()
  const meta = TYPES.find(t => t.key === type)!

  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [bal, setBal] = useState<Balance[]>([])
  const [boqItems, setBoqItems] = useState<{ id: string; description: string; unit: string | null; completed_qty: number }[]>([])
  const [boqItemId, setBoqItemId] = useState('')

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [issuedTo, setIssuedTo] = useState('')
  const [refNo, setRefNo] = useState('')
  const [reason, setReason] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '', rate: '', batch_no: '', remarks: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // warehouses on this project (plus company-wide)
  const wh = useMemo(() => warehouses.filter(w =>
    !w.project_id || w.project_id === activeProject?.id), [warehouses, activeProject])

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: u }, { data: v }, { data: b }] = await Promise.all([
        supabase.from('inv_items').select('id, item_code, name, unit_id, allow_negative').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
        supabase.from('acc_parties').select('id, name').in('party_type', ['Vendor', 'Both']).order('name'),
        supabase.from('inv_balance').select('item_id, warehouse_id, balance_qty, avg_rate'),
      ])
      setItems((i as Item[]) ?? [])
      setUnits((u as Unit[]) ?? [])
      setVendors((v as any[]) ?? [])
      setBal((b as Balance[]) ?? [])

      // BOQ items on this project — an Issue can be tagged to one,
      // which is what makes wastage analysis possible.
      if (activeProject) {
        const { data: bq } = await supabase.from('boqs').select('id').eq('project_id', activeProject.id)
        const ids = ((bq as any[]) ?? []).map(x => x.id)
        if (ids.length) {
          const { data: bi } = await supabase.from('boq_items')
            .select('id, description, unit, completed_qty').in('boq_id', ids).order('sort_order')
          setBoqItems((bi as any[]) ?? [])
        }
      }
      // sensible default warehouse
      const main = wh.find(w => w.is_main)
      if (main) {
        if (meta.dir === 'in') setToWh(main.id)
        if (meta.dir === 'out') setFromWh(main.id)
        if (type === 'Transfer') setFromWh(main.id)
      }
    })()
  }, [])

  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }
  const stockOf = (itemId: string, whId: string) =>
    bal.find(b => b.item_id === itemId && b.warehouse_id === whId)?.balance_qty ?? 0
  const avgRateOf = (itemId: string, whId: string) =>
    bal.find(b => b.item_id === itemId && b.warehouse_id === whId)?.avg_rate ?? 0

  function setLine(i: number, patch: Partial<Line>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', rate: '', batch_no: '', remarks: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  const totalQty = r3(lines.reduce((n, l) => n + (Number(l.qty) || 0), 0))
  const totalVal = r2(lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0))

  // live warning: is any line taking out more than is available?
  const shortages = useMemo(() => {
    if (!(type === 'Issue' || type === 'Transfer' || (type === 'Adjustment' && fromWh))) return []
    if (!fromWh) return []
    return lines
      .filter(l => l.item_id && Number(l.qty) > 0)
      .map(l => {
        const it = items.find(i => i.id === l.item_id)
        const have = stockOf(l.item_id, fromWh)
        return { name: it?.name ?? '', want: Number(l.qty), have, allow: it?.allow_negative ?? false }
      })
      .filter(x => !x.allow && x.want > x.have)
  }, [lines, fromWh, bal, items, type])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item with a quantity.'); return }
    if (shortages.length) { setErr('Not enough stock — see the warning above.'); return }
    if (type === 'Adjustment' && !reason.trim()) { setErr('An adjustment needs a reason.'); return }

    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { data: u } = await supabase.auth.getUser()
    const { data: no, error: noErr } = await supabase.rpc('inv_next_movement_no', { p_type: type })
    if (noErr) { setErr(noErr.message); setBusy(false); return }

    const { data: mv, error: mErr } = await supabase.from('inv_movements').insert({
      org_id: prof?.org_id, project_id: activeProject?.id ?? null,
      movement_no: no, movement_type: type, movement_date: date,
      from_warehouse: fromWh || null, to_warehouse: toWh || null,
      vendor_id: vendorId || null, issued_to: issuedTo || null,
      boq_item_id: boqItemId || null,
      reference_no: refNo || null, reason: reason || null, remarks: remarks || null,
      status: 'Draft', created_by: u?.user?.id ?? null,
    }).select('id').single()
    if (mErr) { setErr(mErr.message); setBusy(false); return }

    const mid = (mv as any).id
    const { error: lErr } = await supabase.from('inv_movement_lines').insert(
      valid.map((l, i) => ({
        org_id: prof?.org_id, movement_id: mid, item_id: l.item_id,
        qty: Number(l.qty), rate: Number(l.rate) || 0,
        value: r2((Number(l.qty) || 0) * (Number(l.rate) || 0)),
        batch_no: l.batch_no || null, remarks: l.remarks || null, line_no: i + 1,
      }))
    )
    setBusy(false)
    if (lErr) { setErr(lErr.message); return }
    onSaved()
  }

  const needFrom = type === 'Issue' || type === 'Transfer' || type === 'Adjustment'
  const needTo = type === 'Opening' || type === 'GRN' || type === 'Return' || type === 'Transfer' || type === 'Adjustment'

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-4xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>{meta.icon}</span>
            <div>
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{meta.label}</h3>
              <p className="text-[11px] text-[#dcc1ae]/60">{meta.desc}</p>
            </div>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <F label="Date *"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>

          {needFrom && (
            <F label={type === 'Transfer' ? 'From Warehouse *' : 'Warehouse *'}>
              <select className="input" value={fromWh} onChange={e => setFromWh(e.target.value)}>
                <option value="">— Select —</option>
                {wh.map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (main)' : ''}</option>)}
              </select>
            </F>
          )}
          {needTo && type !== 'Adjustment' && (
            <F label={type === 'Transfer' ? 'To Warehouse *' : 'Warehouse *'}>
              <select className="input" value={toWh} onChange={e => setToWh(e.target.value)}>
                <option value="">— Select —</option>
                {wh.filter(w => w.id !== fromWh).map(w => <option key={w.id} value={w.id}>{w.name}{w.is_main ? ' (main)' : ''}</option>)}
              </select>
            </F>
          )}

          {type === 'GRN' && (
            <>
              <F label="Vendor">
                <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                  <option value="">— None —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </F>
              <F label="Challan / Invoice No."><input className="input" value={refNo} onChange={e => setRefNo(e.target.value)} /></F>
            </>
          )}
          {type === 'Issue' && (
            <>
              <F label="Issued To *"><input className="input" value={issuedTo} onChange={e => setIssuedTo(e.target.value)} placeholder="Person / machine / subcontractor" /></F>
              <F label="Indent No."><input className="input" value={refNo} onChange={e => setRefNo(e.target.value)} /></F>
              <div className="sm:col-span-2">
                <F label="Against BOQ Item (enables wastage analysis)">
                  <select className="input" value={boqItemId} onChange={e => setBoqItemId(e.target.value)}>
                    <option value="">— Not linked to a BOQ item —</option>
                    {boqItems.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.description.slice(0, 80)}{b.description.length > 80 ? '…' : ''} ({b.unit})
                      </option>
                    ))}
                  </select>
                  {boqItemId && (
                    <p className="text-[11px] text-[#dcc1ae]/60 mt-1">
                      Tagging the issue lets the system compare what you used against the material norm.
                    </p>
                  )}
                </F>
              </div>
            </>
          )}
          {type === 'Adjustment' && (
            <>
              <F label="Adjust Direction">
                <select className="input" value={toWh ? 'in' : 'out'}
                  onChange={e => {
                    if (e.target.value === 'in') { setToWh(fromWh); setFromWh('') }
                    else { setFromWh(toWh); setToWh('') }
                  }}>
                  <option value="out">Decrease stock (loss / damage)</option>
                  <option value="in">Increase stock (found / correction)</option>
                </select>
              </F>
              <div className="sm:col-span-2">
                <F label="Reason *"><input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Physical verification, damage, theft…" /></F>
              </div>
            </>
          )}
        </div>

        {/* shortage warning */}
        {shortages.length > 0 && (
          <div className="mx-5 mb-3 card p-3 bg-red-500/5 border-red-500/15">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
              <div className="text-[12px]">
                <b className="text-red-400">Not enough stock:</b>
                {shortages.map((s, i) => (
                  <div key={i} className="text-[#dcc1ae]">
                    {s.name} — available <b className="text-[#e2e2e8]">{q(s.have)}</b>, trying to take <b className="text-red-400">{q(s.want)}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* lines */}
        <div className="px-5 pb-2">
          <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Available', 'Qty', 'Rate', 'Value', 'Batch', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => {
                  const avail = fromWh && l.item_id ? stockOf(l.item_id, fromWh) : null
                  const val = r2((Number(l.qty) || 0) * (Number(l.rate) || 0))
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.item_id}
                          onChange={e => {
                            const id = e.target.value
                            // auto-fill rate from weighted average when issuing
                            const r = fromWh && id ? avgRateOf(id, fromWh) : 0
                            setLine(i, { item_id: id, rate: r ? String(r) : l.rate })
                          }}>
                          <option value="">— Select item —</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.item_code ? ` (${it.item_code})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-right whitespace-nowrap">
                        {avail !== null
                          ? <span className={avail <= 0 ? 'text-red-400' : 'text-[#dcc1ae]'}>{q(avail)} {unitOf(l.item_id)}</span>
                          : <span className="text-[#dcc1ae]/30">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{val ? inr(val) : '—'}</td>
                      <td className="px-3 py-2">
                        <input className="input" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          value={l.batch_no} onChange={e => setLine(i, { batch_no: e.target.value })} />
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
              <tfoot className="bg-[#282a2e]">
                <tr>
                  <td className="px-3 py-2 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={2}>Total</td>
                  <td className="px-3 py-2 font-mono font-bold text-[#e2e2e8] text-right">{q(totalQty)}</td>
                  <td />
                  <td className="px-3 py-2 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(totalVal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
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
            {busy ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          Saved as Draft. Post it from the list — the database checks stock availability again before moving anything.
        </p>
      </form>
    </div>
  ), document.body)
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}