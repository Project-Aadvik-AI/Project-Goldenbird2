import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Avail = {
  item_id: string; item_code: string | null; item_name: string
  category_name: string | null; unit: string | null
  warehouse_id: string; warehouse_name: string; is_main: boolean
  project_id: string | null; project_name: string | null
  on_hand: number; reserved: number; in_transit: number; free: number
  avg_rate: number; stock_value: number
  reorder_level: number; critical_stock: number; max_stock: number | null
  is_expiry_controlled: boolean
}
type Resv = {
  reservation_id: string; created_at: string; status: string
  source_type: string; is_in_transit: boolean; qty: number
  expires_at: string | null; item_name: string; unit: string | null
  warehouse_name: string; project_name: string | null
  batch_no: string | null; reserved_by_name: string | null; notes: string | null
}
type FindRow = {
  warehouse_id: string; warehouse_name: string
  project_id: string | null; project_name: string
  on_hand: number; reserved: number; in_transit: number; free: number
  avg_rate: number; can_fulfil: boolean; is_partial: boolean
}

type Tab = 'availability' | 'reservations' | 'find'

export default function StockAvailability() {
  const { isAdmin, can } = useAuth()
  const [tab, setTab] = useState<Tab>('availability')
  const [rows, setRows] = useState<Avail[]>([])
  const [resv, setResv] = useState<Resv[]>([])
  const [loading, setLoading] = useState(true)
  const [q_, setQ_] = useState('')
  const [fWh, setFWh] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])

  async function load() {
    setLoading(true)
    const [{ data: a }, { data: r }, { data: w }] = await Promise.all([
      supabase.from('inv_availability').select('*').order('item_name'),
      supabase.from('inv_reservation_register').select('*').order('created_at', { ascending: false }),
      supabase.from('inv_warehouses').select('id, name').eq('active', true).order('name'),
    ])
    setRows((a as Avail[]) ?? [])
    setResv((r as Resv[]) ?? [])
    setWarehouses((w as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter(r => {
    if (fWh && r.warehouse_id !== fWh) return false
    const s = q_.trim().toLowerCase()
    if (s && !`${r.item_name} ${r.item_code ?? ''}`.toLowerCase().includes(s)) return false
    return true
  }), [rows, q_, fWh])

  const totals = useMemo(() => ({
    onHand: r2(shown.reduce((n, r) => n + Number(r.on_hand || 0), 0)),
    reserved: r2(shown.reduce((n, r) => n + Number(r.reserved || 0), 0)),
    inTransit: r2(shown.reduce((n, r) => n + Number(r.in_transit || 0), 0)),
    free: r2(shown.reduce((n, r) => n + Number(r.free || 0), 0)),
    value: r2(shown.reduce((n, r) => n + Number(r.stock_value || 0), 0)),
    activeResv: resv.filter(r => r.status === 'Active').length,
  }), [shown, resv])

  async function releaseExpired() {
    const { data, error } = await supabase.rpc('inv_release_expired_reservations')
    if (error) { alert('Failed: ' + error.message); return }
    alert(`Released ${data ?? 0} expired reservation(s).`)
    load()
  }
  async function release(id: string) {
    if (!confirm('Release this reservation? The stock becomes free again.')) return
    await supabase.from('inv_reservations')
      .update({ status: 'Released', released_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  if (!isAdmin && !can('store', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">You don't have permission to view stock.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Stock Availability</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          On hand is not the same as available. <b>Free = On Hand − Reserved</b> — and free is what you can actually issue.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <K label="On Hand" value={q(totals.onHand)} />
        <K label="Reserved" value={q(totals.reserved)} tone={totals.reserved ? 'amber' : undefined} />
        <K label="In Transit" value={q(totals.inTransit)} tone={totals.inTransit ? 'blue' : undefined} />
        <K label="Free" value={q(totals.free)} tone="emerald" />
        <K label="Stock Value" value={inr(totals.value)} />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap items-center">
        {([
          ['availability', 'Availability'],
          ['reservations', `Reservations (${totals.activeResv})`],
          ['find', 'Find Stock Across Sites'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        {tab !== 'find' && (
          <div className="ml-auto flex gap-2">
            <input className="input" style={{ maxWidth: 200, padding: '6px 10px', fontSize: '13px' }}
              value={q_} onChange={e => setQ_(e.target.value)} placeholder="Search item…" />
            <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fWh} onChange={e => setFWh(e.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> :
        tab === 'availability' ? (
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e2e2e8]">Available Stock</span>
              <ExportButtons filename="stock-availability" title="Stock Availability" rows={shown}
                columns={[
                  { header: 'Code', get: (r: any) => r.item_code || '—' },
                  { header: 'Item', get: (r: any) => r.item_name },
                  { header: 'Warehouse', get: (r: any) => r.warehouse_name },
                  { header: 'Site', get: (r: any) => r.project_name || 'Company-wide' },
                  { header: 'Unit', get: (r: any) => r.unit || '—' },
                  { header: 'On Hand', get: (r: any) => Number(r.on_hand) },
                  { header: 'Reserved', get: (r: any) => Number(r.reserved) },
                  { header: 'In Transit', get: (r: any) => Number(r.in_transit) },
                  { header: 'Free', get: (r: any) => Number(r.free) },
                  { header: 'Avg Rate', get: (r: any) => Number(r.avg_rate) },
                  { header: 'Stock Value', get: (r: any) => Number(r.stock_value) },
                ]} />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Item', 'Warehouse / Site', 'On Hand', 'Reserved', 'In Transit', 'Free', 'Rate', 'Value'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {shown.map(r => (
                  <tr key={r.item_id + r.warehouse_id} className={`hover:bg-white/[0.02] ${r.free <= 0 ? 'bg-red-500/[0.05]' : ''}`}>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">
                      {r.item_name}
                      {r.is_expiry_controlled && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">expiry</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">
                      {r.warehouse_name}
                      {r.project_name && <div className="text-[10px] text-[#dcc1ae]/50">{r.project_name}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{q(r.on_hand)}</td>
                    <td className={`px-4 py-2.5 font-mono text-right ${Number(r.reserved) > 0 ? 'text-amber-400 font-bold' : 'text-[#dcc1ae]/40'}`}>
                      {Number(r.reserved) > 0 ? q(r.reserved) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-right ${Number(r.in_transit) > 0 ? 'text-blue-400' : 'text-[#dcc1ae]/40'}`}>
                      {Number(r.in_transit) > 0 ? q(r.in_transit) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-bold text-right ${
                      r.free <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {q(r.free)} {r.unit}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(r.avg_rate)}</td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.stock_value)}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No stock.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : tab === 'reservations' ? (
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e2e2e8]">Reservation Register</span>
              <div className="flex gap-2 items-center">
                <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={releaseExpired}>
                  Release expired
                </button>
                <ExportButtons filename="reservations" title="Reservation Register" rows={resv}
                  columns={[
                    { header: 'Created', get: (r: any) => String(r.created_at).slice(0, 10) },
                    { header: 'Item', get: (r: any) => r.item_name },
                    { header: 'Warehouse', get: (r: any) => r.warehouse_name },
                    { header: 'Site', get: (r: any) => r.project_name || '—' },
                    { header: 'Qty', get: (r: any) => Number(r.qty) },
                    { header: 'Source', get: (r: any) => r.source_type },
                    { header: 'In Transit', get: (r: any) => (r.is_in_transit ? 'Yes' : 'No') },
                    { header: 'Status', get: (r: any) => r.status },
                    { header: 'Reserved By', get: (r: any) => r.reserved_by_name || '—' },
                    { header: 'Expires', get: (r: any) => r.expires_at || '—' },
                  ]} />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Created', 'Item', 'Warehouse', 'Qty', 'Source', 'Type', 'Status', 'Reserved By', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {resv.map(r => (
                  <tr key={r.reservation_id} className={`hover:bg-white/[0.02] ${r.status !== 'Active' ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{String(r.created_at).slice(0, 10)}</td>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.item_name}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{r.warehouse_name}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-amber-400 text-right">{q(r.qty)} {r.unit}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{r.source_type}</td>
                    <td className="px-4 py-2.5">
                      {r.is_in_transit
                        ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-blue-500/10 text-blue-400 border-blue-500/20">In Transit</span>
                        : <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">Reserved</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                        r.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : r.status === 'Consumed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-white/5 text-[#dcc1ae]/60 border-white/10'}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{r.reserved_by_name || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.status === 'Active' && isAdmin && (
                        <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline"
                          onClick={() => release(r.reservation_id)}>Release</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!resv.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                  No reservations. Stock gets reserved when a Material Request is approved.
                </td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <FindStock />
        )}
    </div>
  )
}

// =====================================================================
//  FIND STOCK ACROSS SITES  (Feature 1)
// =====================================================================
function FindStock() {
  const [items, setItems] = useState<{ id: string; name: string; unit_id: string | null }[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [itemId, setItemId] = useState('')
  const [needQty, setNeedQty] = useState('')
  const [results, setResults] = useState<FindRow[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      const [{ data: i }, { data: u }] = await Promise.all([
        supabase.from('inv_items').select('id, name, unit_id').eq('active', true).order('name'),
        supabase.from('inv_units').select('id, code'),
      ])
      setItems((i as any[]) ?? [])
      setUnits((u as any[]) ?? [])
    })()
  }, [])

  const unit = useMemo(() => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }, [itemId, items, units])

  async function search() {
    if (!itemId) return
    setBusy(true)
    const { data, error } = await supabase.rpc('inv_find_stock', {
      p_item: itemId, p_qty: Number(needQty) || 0, p_exclude_warehouse: null,
    })
    setBusy(false)
    if (error) { alert('Search failed: ' + error.message); return }
    setResults((data as FindRow[]) ?? [])
    setSearched(true)
  }

  const need = Number(needQty) || 0
  const totalFree = r2(results.reduce((n, r) => n + Number(r.free || 0), 0))

  // the fulfilment plan — greedy, biggest free stock first
  const plan = useMemo(() => {
    if (!need) return []
    let left = need
    const out: { row: FindRow; take: number }[] = []
    for (const r of [...results].sort((a, b) => Number(b.free) - Number(a.free))) {
      if (left <= 0) break
      const take = Math.min(Number(r.free), left)
      if (take > 0) { out.push({ row: r, take: r2(take) }); left = r2(left - take) }
    }
    return out
  }, [results, need])

  const shortfall = r2(Math.max(0, need - totalFree))

  return (
    <div>
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <label className="block flex-1 min-w-[240px]">
          <span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">Item</span>
          <select className="input w-full" value={itemId} onChange={e => { setItemId(e.target.value); setSearched(false) }}>
            <option value="">— Select item —</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        <label className="block" style={{ width: 160 }}>
          <span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">Quantity Needed</span>
          <div className="flex items-center gap-2">
            <input className="input mono text-right w-full" inputMode="decimal" value={needQty}
              onChange={e => setNeedQty(e.target.value.replace(/[^\d.]/g, ''))} placeholder="500" />
            <span className="text-[12px] text-[#dcc1ae]">{unit}</span>
          </div>
        </label>
        <button className="btn btn-primary" disabled={!itemId || busy} onClick={search}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>travel_explore</span>
          {busy ? 'Searching…' : 'Search All Sites'}
        </button>
      </div>

      {searched && (
        <>
          {/* the recommendation */}
          {need > 0 && (
            <div className={`card p-4 mb-5 ${shortfall > 0
              ? 'bg-amber-500/5 border-amber-500/15'
              : 'bg-emerald-500/5 border-emerald-500/15'}`}>
              <div className="flex items-start gap-2">
                <span className={`material-symbols-outlined ${shortfall > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
                  style={{ fontSize: '20px' }}>
                  {shortfall > 0 ? 'shopping_cart' : 'swap_horiz'}
                </span>
                <div className="flex-1">
                  {plan.length > 0 && (
                    <>
                      <div className="text-[13px] font-bold text-[#e2e2e8] mb-1">
                        {shortfall > 0 ? 'Partial internal fulfilment possible' : 'No purchase needed — transfer instead'}
                      </div>
                      <div className="text-[13px] text-[#dcc1ae] space-y-0.5">
                        {plan.map((p, i) => (
                          <div key={i}>
                            Transfer <b className="text-emerald-400">{q(p.take)} {unit}</b> from{' '}
                            <b className="text-[#e2e2e8]">{p.row.warehouse_name}</b>
                            {p.row.project_name !== 'Company-wide' && <span className="text-[#dcc1ae]/60"> ({p.row.project_name})</span>}
                            <span className="text-[#dcc1ae]/50"> — {q(p.row.free)} free there</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {shortfall > 0 && (
                    <div className="text-[13px] mt-2 pt-2 border-t border-white/[0.06]">
                      <span className="text-amber-400 font-bold">Shortfall {q(shortfall)} {unit}</span>
                      <span className="text-[#dcc1ae]"> — raise a Purchase Order for the balance.</span>
                    </div>
                  )}
                  {!plan.length && (
                    <div className="text-[13px]">
                      <span className="text-amber-400 font-bold">No free stock anywhere.</span>
                      <span className="text-[#dcc1ae]"> Raise a Purchase Order for the full {q(need)} {unit}.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e2e2e8]">Stock across all sites</span>
              <span className="text-[11px] text-[#dcc1ae]/60">
                Total free: <b className="text-emerald-400 font-mono">{q(totalFree)} {unit}</b>
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Site', 'Warehouse', 'On Hand', 'Reserved', 'In Transit', 'Free', 'Rate', 'Can Fulfil'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {results.map(r => (
                  <tr key={r.warehouse_id} className={`hover:bg-white/[0.02] ${r.can_fulfil ? 'bg-emerald-500/[0.05]' : ''}`}>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.project_name}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{r.warehouse_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{q(r.on_hand)}</td>
                    <td className="px-4 py-2.5 font-mono text-amber-400 text-right">{Number(r.reserved) ? q(r.reserved) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-blue-400 text-right">{Number(r.in_transit) ? q(r.in_transit) : '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 text-right">{q(r.free)} {unit}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(r.avg_rate)}</td>
                    <td className="px-4 py-2.5">
                      {r.can_fulfil
                        ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Full</span>
                        : r.is_partial
                          ? <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">Partial</span>
                          : <span className="text-[#dcc1ae]/40 text-[11px]">—</span>}
                    </td>
                  </tr>
                ))}
                {!results.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                  No free stock of this item at any site.
                </td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'blue' | 'emerald' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'blue' ? 'text-blue-400'
          : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}