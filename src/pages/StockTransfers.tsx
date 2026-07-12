import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Transfer = {
  transfer_id: string; transfer_no: string; status: string
  request_date: string; required_date: string | null
  dispatch_date: string | null; receipt_date: string | null
  from_warehouse_name: string; to_warehouse_name: string
  from_project_name: string | null; to_project_name: string | null
  from_warehouse: string; to_warehouse: string
  vehicle_no: string | null; driver_name: string | null; transporter: string | null
  transfer_cost: number; mr_no: string | null
  requested_by_name: string | null; approved_by_name: string | null
  line_count: number; requested_qty: number; dispatched_qty: number
  received_qty: number; transit_loss: number; total_value: number
  days_in_transit: number | null
}
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null }
type Warehouse = { id: string; name: string; project_id: string | null; is_main: boolean }
type TLine = {
  id: string; item_id: string; qty: number; dispatched_qty: number; received_qty: number
  rate: number; value: number
}

const STATUS_STYLE: Record<string, string> = {
  'Requested': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Approved': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Dispatched': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Received': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Completed': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Cancelled': 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function StockTransfers() {
  const { can, isAdmin } = useAuth()
  const [rows, setRows] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [dispatchFor, setDispatchFor] = useState<Transfer | null>(null)
  const [receiveFor, setReceiveFor] = useState<Transfer | null>(null)
  const [fStatus, setFStatus] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inv_transfer_status').select('*')
      .order('request_date', { ascending: false })
    setRows((data as Transfer[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() =>
    rows.filter(r => !fStatus || r.status === fStatus), [rows, fStatus])

  const kpi = useMemo(() => ({
    pending: rows.filter(r => r.status === 'Requested').length,
    approved: rows.filter(r => r.status === 'Approved').length,
    inTransit: rows.filter(r => r.status === 'Dispatched').length,
    inTransitValue: r2(rows.filter(r => r.status === 'Dispatched')
      .reduce((n, r) => n + Number(r.total_value || 0), 0)),
    loss: r2(rows.reduce((n, r) => n + Number(r.transit_loss || 0), 0)),
  }), [rows])

  async function approve(t: Transfer) {
    if (!confirm(
      `Approve ${t.transfer_no}?\n\n` +
      `The stock will be RESERVED at ${t.from_warehouse_name} — nobody else can take it.`
    )) return
    const { error } = await supabase.rpc('inv_approve_transfer', { p_transfer: t.transfer_id, p_note: null })
    if (error) { alert('Could not approve:\n\n' + error.message); return }
    load()
  }

  async function cancel(t: Transfer) {
    const reason = prompt(`Cancel ${t.transfer_no}?\n\nAny reserved stock is released. Reason:`)
    if (!reason) return
    const { error } = await supabase.rpc('inv_cancel_transfer', { p_transfer: t.transfer_id, p_reason: reason })
    if (error) { alert('Could not cancel:\n\n' + error.message); return }
    load()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Stock Transfers</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Requested → Approved → <b>Dispatched (in transit)</b> → Received.
          Goods on the road belong to neither store — and both keepers can see them.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Awaiting Approval" value={String(kpi.pending)} tone={kpi.pending ? 'amber' : undefined} />
        <K label="Ready to Dispatch" value={String(kpi.approved)} tone={kpi.approved ? 'blue' : undefined} />
        <K label="In Transit" value={String(kpi.inTransit)} tone={kpi.inTransit ? 'amber' : undefined} />
        <K label="Value on the Road" value={inr(kpi.inTransitValue)} />
      </div>

      {kpi.loss > 0 && (
        <div className="card p-3 mb-4 bg-red-500/5 border-red-500/15 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
          <div className="text-[13px]">
            <b className="text-red-400">Transit loss: {q(kpi.loss)} units</b>
            <span className="text-[#dcc1ae]"> — material dispatched but never received. Raise a Stock Adjustment at the source.</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All status</option>
          {['Requested', 'Approved', 'Dispatched', 'Received', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <ExportButtons filename="transfer-register" title="Transfer Register" rows={filtered}
            columns={[
              { header: 'Transfer No.', get: (r: any) => r.transfer_no },
              { header: 'Date', get: (r: any) => r.request_date },
              { header: 'From', get: (r: any) => `${r.from_warehouse_name}${r.from_project_name ? ' · ' + r.from_project_name : ''}` },
              { header: 'To', get: (r: any) => `${r.to_warehouse_name}${r.to_project_name ? ' · ' + r.to_project_name : ''}` },
              { header: 'Items', get: (r: any) => Number(r.line_count) },
              { header: 'Requested Qty', get: (r: any) => Number(r.requested_qty) },
              { header: 'Dispatched Qty', get: (r: any) => Number(r.dispatched_qty) },
              { header: 'Received Qty', get: (r: any) => Number(r.received_qty) },
              { header: 'Transit Loss', get: (r: any) => Number(r.transit_loss) },
              { header: 'Value', get: (r: any) => Number(r.total_value) },
              { header: 'Vehicle', get: (r: any) => r.vehicle_no || '—' },
              { header: 'Dispatch Date', get: (r: any) => r.dispatch_date || '—' },
              { header: 'Receipt Date', get: (r: any) => r.receipt_date || '—' },
              { header: 'Status', get: (r: any) => r.status },
              { header: 'Against MR', get: (r: any) => r.mr_no || '—' },
            ]} />
          {can('store', 'create') && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Transfer
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Transfer No.', 'From → To', 'Items', 'Qty', 'Vehicle', 'Status', 'Timeline', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(t => (
                <tr key={t.transfer_id} className={`hover:bg-white/[0.02] ${t.status === 'Cancelled' ? 'opacity-40' : ''} ${t.status === 'Dispatched' ? 'bg-amber-500/[0.04]' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{t.transfer_no}</div>
                    {t.mr_no && <div className="text-[10px] text-[#dcc1ae]/50">for {t.mr_no}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">
                    <div className="text-[#e2e2e8]">{t.from_warehouse_name}</div>
                    <div className="text-[#dcc1ae]/50 flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>arrow_downward</span>
                      {t.to_warehouse_name}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{t.line_count}</td>
                  <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap">
                    <div className="text-[#e2e2e8]">{q(t.requested_qty)}</div>
                    {Number(t.transit_loss) > 0 && (
                      <div className="text-[10px] text-red-400">−{q(t.transit_loss)} lost</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                    {t.vehicle_no || '—'}
                    {t.driver_name && <div className="text-[10px] text-[#dcc1ae]/50">{t.driver_name}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[t.status] || ''}`}>
                      {t.status}
                    </span>
                    {t.days_in_transit != null && (
                      <div className="text-[10px] text-amber-400 mt-0.5">{t.days_in_transit}d on road</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae]/70 whitespace-nowrap">
                    <div>Req {t.request_date}</div>
                    {t.dispatch_date && <div>Disp {t.dispatch_date}</div>}
                    {t.receipt_date && <div className="text-emerald-400">Recd {t.receipt_date}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {t.status === 'Requested' && isAdmin && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => approve(t)}>Approve</button>
                    )}
                    {t.status === 'Approved' && can('store', 'create') && (
                      <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => setDispatchFor(t)}>Dispatch</button>
                    )}
                    {t.status === 'Dispatched' && can('store', 'create') && (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2" onClick={() => setReceiveFor(t)}>Receive</button>
                    )}
                    {['Requested', 'Approved'].includes(t.status) && (
                      <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline" onClick={() => cancel(t)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No transfers. Raise one to move stock between sites.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <TransferForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {dispatchFor && <DispatchModal t={dispatchFor} onClose={() => setDispatchFor(null)} onDone={() => { setDispatchFor(null); load() }} />}
      {receiveFor && <ReceiveModal t={receiveFor} onClose={() => setReceiveFor(null)} onDone={() => { setReceiveFor(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  NEW TRANSFER
// =====================================================================
type Line = { item_id: string; qty: string; rate: string }

function TransferForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [avail, setAvail] = useState<{ item_id: string; warehouse_id: string; free: number; avg_rate: number }[]>([])

  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [requiredDate, setRequiredDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '', rate: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: u }, { data: w }, { data: a }] = await Promise.all([
        supabase.from('inv_items').select('id, item_code, name, unit_id').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
        supabase.from('inv_warehouses').select('id, name, project_id, is_main').eq('active', true).order('name'),
        supabase.from('inv_availability').select('item_id, warehouse_id, free, avg_rate'),
      ])
      setItems((i as Item[]) ?? [])
      setUnits((u as any[]) ?? [])
      setWarehouses((w as Warehouse[]) ?? [])
      setAvail((a as any[]) ?? [])
      const main = ((w as Warehouse[]) ?? []).find(x => x.is_main && x.project_id === activeProject?.id)
      if (main) setToWh(main.id)
    })()
  }, [])

  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }
  const freeAt = (itemId: string, whId: string) =>
    avail.find(a => a.item_id === itemId && a.warehouse_id === whId)?.free ?? 0
  const rateAt = (itemId: string, whId: string) =>
    avail.find(a => a.item_id === itemId && a.warehouse_id === whId)?.avg_rate ?? 0

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', rate: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  const shortages = useMemo(() => {
    if (!fromWh) return []
    return lines
      .filter(l => l.item_id && Number(l.qty) > 0)
      .map(l => {
        const free = freeAt(l.item_id, fromWh)
        return { name: items.find(i => i.id === l.item_id)?.name ?? '', want: Number(l.qty), free }
      })
      .filter(x => x.want > x.free)
  }, [lines, fromWh, avail, items])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!fromWh || !toWh) { setErr('Select both the source and destination store.'); return }
    if (fromWh === toWh) { setErr('Source and destination cannot be the same.'); return }
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item.'); return }
    if (shortages.length) { setErr('Not enough free stock at the source — see the warning.'); return }

    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { data: u } = await supabase.auth.getUser()
    const { data: no, error: noErr } = await supabase.rpc('inv_next_transfer_no')
    if (noErr) { setErr(noErr.message); setBusy(false); return }

    const fromProj = warehouses.find(w => w.id === fromWh)?.project_id ?? null
    const toProj = warehouses.find(w => w.id === toWh)?.project_id ?? null

    const { data: tr, error: tErr } = await supabase.from('inv_transfers').insert({
      org_id: prof?.org_id, transfer_no: no,
      from_warehouse: fromWh, to_warehouse: toWh,
      from_project: fromProj, to_project: toProj,
      required_date: requiredDate || null, remarks: remarks || null,
      status: 'Requested', requested_by: u?.user?.id ?? null,
    }).select('id').single()
    if (tErr) { setErr(tErr.message); setBusy(false); return }

    const { error: lErr } = await supabase.from('inv_transfer_lines').insert(
      valid.map((l, i) => {
        const rate = Number(l.rate) || rateAt(l.item_id, fromWh)
        return {
          org_id: prof?.org_id, transfer_id: (tr as any).id, item_id: l.item_id,
          qty: Number(l.qty), rate, value: r2(Number(l.qty) * rate), line_no: i + 1,
        }
      })
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
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">New Stock Transfer</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <F label="From Store *">
            <select className="input" value={fromWh} onChange={e => setFromWh(e.target.value)}>
              <option value="">— Select —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </F>
          <F label="To Store *">
            <select className="input" value={toWh} onChange={e => setToWh(e.target.value)}>
              <option value="">— Select —</option>
              {warehouses.filter(w => w.id !== fromWh).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </F>
          <F label="Required By"><input type="date" className="input" value={requiredDate} onChange={e => setRequiredDate(e.target.value)} /></F>
        </div>

        {shortages.length > 0 && (
          <div className="mx-5 mb-3 card p-3 bg-red-500/5 border-red-500/15">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
              <div className="text-[12px]">
                <b className="text-red-400">Not enough free stock at the source:</b>
                {shortages.map((s, i) => (
                  <div key={i} className="text-[#dcc1ae]">
                    {s.name} — free <b className="text-[#e2e2e8]">{q(s.free)}</b>, transferring <b className="text-red-400">{q(s.want)}</b>
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
                {['Item', 'Free at Source', 'Qty', 'Unit', 'Rate', 'Value', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {lines.map((l, i) => {
                  const free = fromWh && l.item_id ? freeAt(l.item_id, fromWh) : null
                  const rate = Number(l.rate) || (fromWh && l.item_id ? rateAt(l.item_id, fromWh) : 0)
                  const val = r2((Number(l.qty) || 0) * rate)
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 190 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }} value={l.item_id}
                          onChange={e => {
                            const id = e.target.value
                            setLine(i, { item_id: id, rate: fromWh ? String(rateAt(id, fromWh)) : '' })
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
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae]">{unitOf(l.item_id) || '—'}</td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 80 }}
                          inputMode="decimal" value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{val ? inr(val) : '—'}</td>
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
            {busy ? 'Saving…' : 'Raise Transfer Request'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          Approval will reserve the stock at the source, so nobody takes it before the truck leaves.
        </p>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  DISPATCH
// =====================================================================
function DispatchModal({ t, onClose, onDone }: { t: Transfer; onClose: () => void; onDone: () => void }) {
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [transporter, setTransporter] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('inv_dispatch_transfer', {
      p_transfer: t.transfer_id,
      p_vehicle: vehicle || null, p_driver: driver || null,
      p_transporter: transporter || null, p_cost: Number(cost) || 0,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Dispatch {t.transfer_no}</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          {t.from_warehouse_name} → {t.to_warehouse_name} · {q(t.requested_qty)} units
        </p>

        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/15 text-[12px] text-amber-400">
          The stock leaves <b>{t.from_warehouse_name}</b> now and becomes <b>in transit</b> —
          visible at {t.to_warehouse_name} as incoming, but not yet available there.
        </div>

        <div className="space-y-3">
          <F label="Vehicle Number"><input className="input mono" value={vehicle} onChange={e => setVehicle(e.target.value.toUpperCase())} placeholder="MH12AB1234" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Driver"><input className="input" value={driver} onChange={e => setDriver(e.target.value)} /></F>
            <F label="Transporter"><input className="input" value={transporter} onChange={e => setTransporter(e.target.value)} /></F>
          </div>
          <F label="Transfer Cost (₹)"><input className="input mono" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d.]/g, ''))} /></F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Dispatching…' : 'Dispatch — stock leaves now'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

// =====================================================================
//  RECEIVE  (short receipt allowed — that is the transit loss)
// =====================================================================
function ReceiveModal({ t, onClose, onDone }: { t: Transfer; onClose: () => void; onDone: () => void }) {
  const [lines, setLines] = useState<(TLine & { item_name: string; unit: string })[]>([])
  const [recd, setRecd] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('inv_transfer_lines')
        .select('*, inv_items(name, inv_units(code))')
        .eq('transfer_id', t.transfer_id).order('line_no')
      const mapped = ((data as any[]) ?? []).map(x => ({
        ...x,
        item_name: x.inv_items?.name ?? '—',
        unit: x.inv_items?.inv_units?.code ?? '',
      }))
      setLines(mapped)
      const init: Record<string, string> = {}
      for (const l of mapped) init[l.id] = String(l.dispatched_qty)
      setRecd(init)
    })()
  }, [t.transfer_id])

  const shortages = lines
    .map(l => ({ name: l.item_name, disp: Number(l.dispatched_qty), got: Number(recd[l.id] ?? 0) }))
    .filter(x => x.got < x.disp - 0.0001)

  async function go() {
    setBusy(true); setErr(null)
    const payload = lines.map(l => ({ line_id: l.id, received_qty: Number(recd[l.id] ?? 0) }))
    const { error } = await supabase.rpc('inv_receive_transfer', {
      p_transfer: t.transfer_id, p_lines: payload, p_note: note || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-xl p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Receive {t.transfer_no}</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Arriving at {t.to_warehouse_name}
          {t.vehicle_no && ` · vehicle ${t.vehicle_no}`}
          {t.days_in_transit != null && ` · ${t.days_in_transit} days on the road`}
        </p>

        <div className="rounded-lg border border-white/[0.08] overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Item', 'Dispatched', 'Received', 'Short'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {lines.map(l => {
                const got = Number(recd[l.id] ?? 0)
                const short = Number(l.dispatched_qty) - got
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-[#e2e2e8]">{l.item_name}</td>
                    <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{q(l.dispatched_qty)} {l.unit}</td>
                    <td className="px-3 py-2">
                      <input className="input mono text-right" style={{ padding: '4px 8px', fontSize: '12px', width: 90 }}
                        inputMode="decimal" value={recd[l.id] ?? ''}
                        onChange={e => setRecd({ ...recd, [l.id]: e.target.value.replace(/[^\d.]/g, '') })} />
                    </td>
                    <td className={`px-3 py-2 font-mono text-right font-bold ${short > 0.0001 ? 'text-red-400' : 'text-[#dcc1ae]/40'}`}>
                      {short > 0.0001 ? q(short) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {shortages.length > 0 && (
          <div className="card p-3 mb-3 bg-red-500/5 border-red-500/15 text-[12px]">
            <b className="text-red-400">Short receipt — material lost in transit:</b>
            {shortages.map((s, i) => (
              <div key={i} className="text-[#dcc1ae]">{s.name}: {q(s.disp - s.got)} did not arrive</div>
            ))}
            <div className="text-[11px] text-red-400/80 mt-1">
              This is recorded. Raise a Stock Adjustment at the source to write it off.
            </div>
          </div>
        )}

        <F label="Note"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Damaged bags, spillage…" /></F>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Receiving…' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'blue' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'blue' ? 'text-blue-400' : 'text-[#e2e2e8]'
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