import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type WH = {
  warehouse_id: string; name: string; code: string | null; location: string | null
  is_main: boolean; active: boolean
  parent_id: string | null; parent_name: string | null
  project_id: string | null; project_name: string | null
  is_central: boolean; keeper_name: string | null
  item_count: number; total_qty: number; stock_value: number; reserved_qty: number
  child_count: number; can_use: boolean
}
type Stock = {
  warehouse_id: string; item_id: string
  item_code: string | null; item_name: string
  category_name: string | null; unit: string | null
  on_hand: number; reserved: number; free: number
  avg_rate: number; stock_value: number; below_min: boolean
}

export default function Warehouses() {
  const { isAdmin, can } = useAuth()
  const [whs, setWhs] = useState<WH[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [transferFrom, setTransferFrom] = useState<WH | null>(null)
  const [receiveInto, setReceiveInto] = useState<WH | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: w }, { data: s }] = await Promise.all([
      supabase.from('warehouse_overview').select('*').order('is_central', { ascending: false }).order('name'),
      supabase.from('warehouse_stock').select('*').order('item_name'),
    ])
    const list = (w as WH[]) ?? []
    setWhs(list)
    setStock((s as Stock[]) ?? [])
    if (!selected && list.length) setSelected(list[0].warehouse_id)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const central = whs.filter(w => w.is_central)
  const projectStores = whs.filter(w => !w.is_central)

  const sel = whs.find(w => w.warehouse_id === selected) ?? null
  const selStock = useMemo(() =>
    stock.filter(s => s.warehouse_id === selected), [stock, selected])

  const kpi = useMemo(() => ({
    centralValue: central.reduce((n, w) => n + Number(w.stock_value || 0), 0),
    siteValue: projectStores.reduce((n, w) => n + Number(w.stock_value || 0), 0),
    stores: projectStores.length,
    lowStock: stock.filter(s => s.below_min).length,
  }), [central, projectStores, stock])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Warehouses</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            {isAdmin
              ? 'The central store holds everything. Each project has its own store, stocked by transfer.'
              : 'The stores on your projects. Material arrives here by transfer from the central warehouse.'}
          </p>
        </div>
        {(isAdmin || can('warehouses', 'create')) && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_home_work</span>
            New Store
          </button>
        )}
      </div>

      {(isAdmin || can('warehouses', 'create')) && !central.length && (
        <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '20px' }}>warehouse</span>
            <div className="text-[13px]">
              <b className="text-amber-400">You have no central warehouse.</b>
              <p className="text-[#dcc1ae] mt-1">
                Create one first — a company-wide store with <b>no project</b>. Everything is received
                there, then transferred out to the sites.
              </p>
            </div>
          </div>
        </div>
      )}

      {kpi.lowStock > 0 && (
        <div className="card p-3 mb-4 bg-red-500/5 border-red-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>warning</span>
          <div className="text-[13px]">
            <b className="text-red-400">{kpi.lowStock} item(s) below the minimum level</b>
            <span className="text-[#dcc1ae]"> — across all stores.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {isAdmin && <K label="Central Warehouse" value={inr(kpi.centralValue)} />}
        <K label={isAdmin ? 'At the Sites' : 'Stock in Your Stores'} value={inr(kpi.siteValue)} tone="blue" />
        <K label={isAdmin ? 'Project Stores' : 'Your Stores'} value={String(kpi.stores)} />
        <K label="Items Below Minimum" value={String(kpi.lowStock)}
          tone={kpi.lowStock ? undefined : 'blue'} />
        {(isAdmin || can('warehouses', 'create')) && (
          <K label="Total Stock Value" value={inr(kpi.centralValue + kpi.siteValue)} big />
        )}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ---- the tree ---- */}
          <div className="lg:col-span-1">
            <div className="card p-4">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">
                {isAdmin ? 'Central Warehouse' : 'Your Stores'}
              </div>

              {central.map(c => (
                <div key={c.warehouse_id} className="mb-2">
                  <StoreRow w={c} selected={selected === c.warehouse_id}
                    onSelect={() => setSelected(c.warehouse_id)}
                    onTransfer={(isAdmin || can('store', 'create')) ? () => setTransferFrom(c) : undefined} />
                </div>
              ))}

              {projectStores.length > 0 && (
                <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mt-4 mb-2">Project Warehouses</div>
              )}
              <div className="space-y-1">
                {projectStores.map(p => (
                  <StoreRow key={p.warehouse_id} w={p}
                    selected={selected === p.warehouse_id}
                    onSelect={() => setSelected(p.warehouse_id)}
                    onTransfer={(isAdmin || can('store', 'create')) ? () => setTransferFrom(p) : undefined} />
                ))}
              </div>

              {!whs.length && (
                <div className="py-6 text-center">
                  <span className="material-symbols-outlined text-[#dcc1ae]/30" style={{ fontSize: '30px' }}>
                    store
                  </span>
                  <p className="text-[12px] text-[#dcc1ae]/70 mt-1">
                    {isAdmin
                      ? 'No warehouses yet.'
                      : 'You are not assigned to a store.'}
                  </p>
                  {!isAdmin && (
                    <p className="text-[11px] text-[#dcc1ae]/50 mt-1 max-w-[200px] mx-auto">
                      Ask Head Office to assign you to a project, or to create a store for it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---- what is in the selected store ---- */}
          <div className="lg:col-span-2">
            {sel ? (
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#e2e2e8]">{sel.name}</span>
                      {sel.is_central && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/25">
                          Central
                        </span>
                      )}
                      {!sel.can_use && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae]/50 border-white/10">
                          view only
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
                      {sel.project_name ?? 'Company-wide'}
                      {sel.keeper_name && ` · keeper: ${sel.keeper_name}`}
                      {sel.location && ` · ${sel.location}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {sel.can_use && (
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => setReceiveInto(sel)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add_box</span>
                        Receive Stock
                      </button>
                    )}
                    {isAdmin && Number(sel.item_count) > 0 && (
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => setTransferFrom(sel)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>local_shipping</span>
                        Send Stock
                      </button>
                    )}
                    <ExportButtons filename={`stock-${sel.name}`} title={`Stock — ${sel.name}`} rows={selStock}
                      columns={[
                        { header: 'Item Code', get: (r: any) => r.item_code || '—' },
                        { header: 'Item', get: (r: any) => r.item_name },
                        { header: 'Category', get: (r: any) => r.category_name || '—' },
                        { header: 'Unit', get: (r: any) => r.unit || '—' },
                        { header: 'On Hand', get: (r: any) => Number(r.on_hand) },
                        { header: 'Reserved', get: (r: any) => Number(r.reserved) },
                        { header: 'Free', get: (r: any) => Number(r.free) },
                        { header: 'Rate', get: (r: any) => Number(r.avg_rate) },
                        { header: 'Value', get: (r: any) => Number(r.stock_value) },
                      ]} />
                    <PrintButton />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 p-4 border-b border-white/5">
                  <Mini label="Items" v={String(sel.item_count)} />
                  <Mini label="Stock Value" v={inr(sel.stock_value)} />
                  <Mini label="Reserved" v={q(sel.reserved_qty)}
                    tone={Number(sel.reserved_qty) > 0 ? 'amber' : undefined} />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#282a2e]"><tr>
                      {['Item', 'On Hand', 'Reserved', 'Free', 'Value'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {selStock.map(s => (
                        <tr key={s.item_id} className={`hover:bg-white/[0.02] ${s.below_min ? 'bg-red-500/[0.05]' : ''}`}>
                          <td className="px-4 py-2.5">
                            <div className="text-[#e2e2e8]">{s.item_name}</div>
                            <div className="text-[10px] text-[#dcc1ae]/50">
                              {s.item_code}{s.category_name ? ` · ${s.category_name}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                            {q(s.on_hand)} <span className="text-[10px] text-[#dcc1ae]/60">{s.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-amber-400 text-right">
                            {Number(s.reserved) ? q(s.reserved) : '—'}
                          </td>
                          <td className={`px-4 py-2.5 font-mono font-bold text-right ${s.below_min ? 'text-red-400' : 'text-[#e2e2e8]'}`}>
                            {q(s.free)}
                            {s.below_min && <div className="text-[9px]">BELOW MIN</div>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                            {inr(s.stock_value)}
                          </td>
                        </tr>
                      ))}
                      {!selStock.length && (
                        <tr><td colSpan={5} className="px-4 py-12 text-center">
                          <span className="material-symbols-outlined text-[#dcc1ae]/30" style={{ fontSize: '32px' }}>
                            inventory_2
                          </span>
                          <p className="text-[14px] text-[#e2e2e8] font-semibold mt-2">This store is empty</p>
                          <p className="text-[12px] text-[#dcc1ae] mt-1 max-w-sm mx-auto">
                            {sel.is_central
                              ? 'Click "Receive Stock" to bring material in — a delivery, or the opening stock you already had.'
                              : isAdmin
                                ? 'Receive material here directly, or transfer it from the central warehouse.'
                                : 'Ask Head Office to transfer material from the central warehouse.'}
                          </p>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="card p-10 text-center text-[#dcc1ae]/60 text-sm">
                Select a warehouse.
              </div>
            )}
          </div>
        </div>
      )}

      {showNew && <NewStore onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); load() }} />}
      {receiveInto && <ReceiveStock wh={receiveInto}
        onClose={() => setReceiveInto(null)}
        onDone={() => { setReceiveInto(null); load() }} />}
      {transferFrom && <QuickTransfer from={transferFrom} warehouses={whs}
        stock={stock.filter(s => s.warehouse_id === transferFrom.warehouse_id)}
        onClose={() => setTransferFrom(null)}
        onDone={() => { setTransferFrom(null); load() }} />}
    </div>
  )
}

// ---------------- a store in the tree ----------------
function StoreRow({ w, child, selected, onSelect, onTransfer }: {
  w: WH; child?: boolean; selected: boolean
  onSelect: () => void; onTransfer?: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`rounded-lg px-3 py-2 cursor-pointer border transition-colors ${
        selected ? 'bg-[#ff8f00]/10 border-[#ff8f00]/30'
          : 'border-transparent hover:bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined ${
            w.is_central ? 'text-[#ffb87b]' : 'text-[#dcc1ae]/60'}`}
            style={{ fontSize: child ? '16px' : '18px' }}>
            {w.is_central ? 'warehouse' : 'store'}
          </span>
          <div className="min-w-0">
            <div className={`truncate ${child ? 'text-[12px]' : 'text-[13px] font-semibold'} text-[#e2e2e8]`}>
              {w.name}
            </div>
            <div className="text-[10px] text-[#dcc1ae]/50 truncate">
              {w.item_count} item(s) · {inr(w.stock_value)}
            </div>
          </div>
        </div>
        {onTransfer && Number(w.item_count) > 0 && (
          <button onClick={e => { e.stopPropagation(); onTransfer() }}
            className="text-[#ffb87b] hover:text-white shrink-0" title="Send stock">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>local_shipping</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------- RECEIVE STOCK ----------------
type Item = { id: string; item_code: string | null; name: string; unit: string | null }
type RLine = { item_id: string; qty: string; rate: string }

function ReceiveStock({ wh, onClose, onDone }: {
  wh: WH; onClose: () => void; onDone: () => void
}) {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [lines, setLines] = useState<RLine[]>([{ item_id: '', qty: '', rate: '' }])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [isOpening, setIsOpening] = useState(false)
  const [vendorId, setVendorId] = useState('')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showNewItem, setShowNewItem] = useState(false)

  async function loadItems() {
    const { data } = await supabase.from('inv_items')
      .select('id, item_code, name, inv_units(code)')
      .eq('active', true).order('name')
    setItems(((data as any[]) ?? []).map(i => ({
      id: i.id, item_code: i.item_code, name: i.name,
      unit: i.inv_units?.code ?? null,
    })))
  }

  useEffect(() => {
    loadItems()
    supabase.from('acc_parties').select('id, name')
      .in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name')
      .then(({ data }) => setVendors((data as any[]) ?? []))
  }, [])

  const setLine = (i: number, patch: Partial<RLine>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '', rate: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  const unitOf = (id: string) => items.find(i => i.id === id)?.unit ?? ''
  const total = lines
    .filter(l => l.item_id && Number(l.qty) > 0)
    .reduce((n, l) => n + Number(l.qty) * (Number(l.rate) || 0), 0)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item with a quantity.'); return }

    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('receive_stock', {
      p_warehouse: wh.warehouse_id,
      p_items: valid.map(l => ({
        item_id: l.item_id,
        qty: Number(l.qty),
        rate: Number(l.rate) || 0,
      })),
      p_date: date,
      p_vendor: vendorId || null,
      p_reference: reference || null,
      p_remarks: remarks || null,
      p_is_opening: isOpening,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Receive Stock</h3>
            <p className="text-[12px] text-[#dcc1ae]">
              Into <b className="text-[#e2e2e8]">{wh.name}</b>
            </p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* what kind of receipt is this? */}
          <div className="grid grid-cols-2 gap-2">
            {([[false, 'A Delivery (GRN)', 'Material that has just arrived'],
               [true, 'Opening Stock', 'What you already had before using the system']] as const).map(([k, label, hint]) => (
              <button key={String(k)} type="button" onClick={() => setIsOpening(k)}
                className={`px-3 py-2.5 rounded-lg border text-left ${
                  isOpening === k ? 'bg-[#ff8f00]/10 border-[#ff8f00]/30'
                    : 'border-white/[0.08] hover:bg-white/[0.03]'}`}>
                <div className={`text-[12px] font-semibold ${isOpening === k ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>
                  {label}
                </div>
                <div className="text-[10px] text-[#dcc1ae]/60 mt-0.5">{hint}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <F label="Date">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
            {!isOpening && (
              <>
                <F label="Vendor">
                  <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)}>
                    <option value="">— None —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </F>
                <F label="Invoice / Challan No.">
                  <input className="input" value={reference} onChange={e => setReference(e.target.value)} />
                </F>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Items</span>
              {isAdmin && (
                <button type="button" className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline"
                  onClick={() => setShowNewItem(true)}>
                  + New Item
                </button>
              )}
            </div>

            <div className="rounded-lg border border-white/[0.08] overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e]"><tr>
                  {['Item', 'Quantity', 'Unit', 'Rate', 'Value', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }}
                          value={l.item_id} onChange={e => setLine(i, { item_id: e.target.value })}>
                          <option value="">— Select item —</option>
                          {items.map(it => (
                            <option key={it.id} value={it.id}>{it.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#dcc1ae]">
                        {unitOf(l.item_id) || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.rate}
                          onChange={e => setLine(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[#e2e2e8] text-right whitespace-nowrap">
                        {Number(l.qty) && Number(l.rate)
                          ? inr(Number(l.qty) * Number(l.rate))
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 && (
                          <button type="button" className="text-red-400 hover:text-red-300"
                            onClick={() => delLine(i)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn btn-ghost mt-2"
              style={{ padding: '4px 12px', fontSize: '12px' }} onClick={addLine}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Add Item
            </button>
          </div>

          {total > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 flex justify-between">
              <span className="text-[12px] text-[#dcc1ae]">Total value</span>
              <span className="font-mono text-[15px] font-bold text-[#ffb87b]">{inr(total)}</span>
            </div>
          )}

          <F label="Remarks">
            <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </F>

          <p className="text-[11px] text-[#dcc1ae]/50">
            The rate sets the value of this stock. It feeds the weighted-average
            valuation, so put in what you actually paid.
          </p>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Receiving…' : 'Receive Stock'}
          </button>
        </div>

        {showNewItem && <NewItem onClose={() => setShowNewItem(false)}
          onCreated={async (id) => {
            setShowNewItem(false)
            await loadItems()
            // drop it into the first empty line
            setLines(p => {
              const idx = p.findIndex(l => !l.item_id)
              if (idx === -1) return [...p, { item_id: id, qty: '', rate: '' }]
              return p.map((l, i) => i === idx ? { ...l, item_id: id } : l)
            })
          }} />}
      </form>
    </div>
  ), document.body)
}

function NewItem({ onClose, onCreated }: {
  onClose: () => void; onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [minStock, setMinStock] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!name.trim()) { setErr('Give it a name.'); return }
    if (!unit.trim()) { setErr('What unit is it measured in?'); return }

    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('quick_create_item', {
      p_name: name.trim(),
      p_unit_code: unit.trim(),
      p_category: category.trim() || null,
      p_min_stock: Number(minStock) || 0,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onCreated(data as string)
  }

  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { e.stopPropagation(); onClose() }}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-sm p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">New Item</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          This defines <b>what</b> the item is. The quantity comes next.
        </p>

        <div className="space-y-3">
          <F label="Item Name *">
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Cement OPC 43" autoFocus />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Unit *">
              <input className="input" value={unit} onChange={e => setUnit(e.target.value.toUpperCase())}
                placeholder="BAG, KG, CUM…" />
            </F>
            <F label="Minimum Stock">
              <input className="input mono text-right" inputMode="decimal" value={minStock}
                onChange={e => setMinStock(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
          </div>
          <F label="Category">
            <input className="input" value={category} onChange={e => setCategory(e.target.value)}
              placeholder="Cement, Steel, Aggregate…" />
          </F>
          <p className="text-[11px] text-[#dcc1ae]/50">
            The unit and category are created automatically if they do not exist.
          </p>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary flex-[2]" disabled={busy}
            onClick={go as any}>
            {busy ? 'Creating…' : 'Create Item'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}
// ---------------- ONE-STEP TRANSFER ----------------
type Line = { item_id: string; qty: string }

function QuickTransfer({ from, warehouses, stock, onClose, onDone }: {
  from: WH; warehouses: WH[]; stock: Stock[]
  onClose: () => void; onDone: () => void
}) {
  const [toWh, setToWh] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '' }])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [receivedBy, setReceivedBy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const targets = warehouses.filter(w => w.warehouse_id !== from.warehouse_id && w.active)

  const freeOf = (itemId: string) =>
    stock.find(s => s.item_id === itemId)?.free ?? 0
  const unitOf = (itemId: string) =>
    stock.find(s => s.item_id === itemId)?.unit ?? ''

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const addLine = () => setLines(p => [...p, { item_id: '', qty: '' }])
  const delLine = (i: number) => setLines(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p)

  // you cannot send what you do not have
  const shortages = useMemo(() => lines
    .filter(l => l.item_id && Number(l.qty) > 0)
    .map(l => ({
      name: stock.find(s => s.item_id === l.item_id)?.item_name ?? '',
      want: Number(l.qty),
      free: freeOf(l.item_id),
    }))
    .filter(x => x.want > x.free), [lines, stock])

  const totalValue = useMemo(() => lines
    .filter(l => l.item_id && Number(l.qty) > 0)
    .reduce((n, l) => {
      const s = stock.find(x => x.item_id === l.item_id)
      return n + Number(l.qty) * Number(s?.avg_rate ?? 0)
    }, 0), [lines, stock])

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!toWh) { setErr('Where is it going?'); return }
    const valid = lines.filter(l => l.item_id && Number(l.qty) > 0)
    if (!valid.length) { setErr('Add at least one item.'); return }
    if (shortages.length) { setErr('Not enough stock — see the warning.'); return }

    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('quick_transfer', {
      p_from_wh: from.warehouse_id,
      p_to_wh: toWh,
      p_items: valid.map(l => ({ item_id: l.item_id, qty: Number(l.qty) })),
      p_date: date,
      p_received_by: receivedBy || null,
      p_remarks: remarks || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Send Stock</h3>
            <p className="text-[12px] text-[#dcc1ae]">
              From <b className="text-[#e2e2e8]">{from.name}</b>
            </p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <F label="Send To *">
              <select className="input" value={toWh} onChange={e => setToWh(e.target.value)}>
                <option value="">— Select a store —</option>
                {targets.map(w => (
                  <option key={w.warehouse_id} value={w.warehouse_id}>
                    {w.name}{w.project_name ? ` (${w.project_name})` : ' (central)'}
                  </option>
                ))}
              </select>
            </F>
            <F label="Date">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
          </div>

          {shortages.length > 0 && (
            <div className="card p-3 bg-red-500/5 border-red-500/20">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
                <div className="text-[12px]">
                  <b className="text-red-400">Not enough stock at {from.name}:</b>
                  {shortages.map((s, i) => (
                    <div key={i} className="text-[#dcc1ae]">
                      {s.name} — free <b className="text-[#e2e2e8]">{q(s.free)}</b>,
                      sending <b className="text-red-400">{q(s.want)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">Items</div>
            <div className="rounded-lg border border-white/[0.08] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e]"><tr>
                  {['Item', 'Available', 'Send', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2" style={{ minWidth: 200 }}>
                        <select className="input" style={{ padding: '5px 8px', fontSize: '12px' }}
                          value={l.item_id} onChange={e => setLine(i, { item_id: e.target.value })}>
                          <option value="">— Select item —</option>
                          {stock.map(s => (
                            <option key={s.item_id} value={s.item_id}>{s.item_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-right whitespace-nowrap">
                        {l.item_id ? (
                          <span className={freeOf(l.item_id) <= 0 ? 'text-red-400' : 'text-[#dcc1ae]'}>
                            {q(freeOf(l.item_id))} <span className="text-[10px]">{unitOf(l.item_id)}</span>
                          </span>
                        ) : <span className="text-[#dcc1ae]/30">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '5px 8px', fontSize: '12px', width: 90 }}
                          inputMode="decimal" value={l.qty}
                          onChange={e => setLine(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {lines.length > 1 && (
                          <button type="button" className="text-red-400 hover:text-red-300"
                            onClick={() => delLine(i)}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-ghost mt-2"
              style={{ padding: '4px 12px', fontSize: '12px' }} onClick={addLine}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span> Add Item
            </button>
          </div>

          {totalValue > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 flex justify-between">
              <span className="text-[12px] text-[#dcc1ae]">Value being moved</span>
              <span className="font-mono text-[15px] font-bold text-[#ffb87b]">{inr(totalValue)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <F label="Received By">
              <input className="input" value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
                placeholder="Store keeper at the site" />
            </F>
            <F label="Remarks">
              <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} />
            </F>
          </div>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy || shortages.length > 0}>
            {busy ? 'Sending…' : 'Send Stock'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          The stock leaves immediately and arrives at the destination. One step — no approval chain.
        </p>
      </form>
    </div>
  ), document.body)
}

// ---------------- new store ----------------
function NewStore({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [kind, setKind] = useState<'central' | 'project'>('central')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('projects').select('id, name').eq('status', 'Active').order('name')
      .then(({ data }) => setProjects((data as any[]) ?? []))
  }, [])

  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)

    if (kind === 'central') {
      if (!name.trim()) { setErr('Give it a name.'); setBusy(false); return }
      const { data: u } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('profiles')
        .select('org_id').eq('id', u?.user?.id ?? '').maybeSingle()

      const { error } = await supabase.from('inv_warehouses').insert({
        org_id: prof?.org_id,
        project_id: null,           // company-wide = central
        name: name.trim(),
        is_main: true,
        location: location || null,
        active: true,
      })
      setBusy(false)
      if (error) { setErr(error.message); return }
      onCreated()
      return
    }

    if (!projectId) { setErr('Which project?'); setBusy(false); return }
    const { error } = await supabase.rpc('create_project_store', {
      p_project: projectId,
      p_name: name.trim() || null,
      p_parent: null,               // defaults to the central warehouse
      p_keeper: null,
      p_location: location || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onCreated()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">New Store</h3>

        <div className="space-y-3">
          <F label="Type">
            <div className="grid grid-cols-2 gap-2">
              {([['central', 'Central Warehouse', 'warehouse']] as const).map(([k, label, icon]) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`px-3 py-2.5 rounded-lg border text-[12px] font-semibold flex items-center gap-2 justify-center ${
                    kind === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                      : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </F>

          {kind === 'central' ? (
            <>
              <div className="card p-2.5 bg-white/[0.03] text-[11px] text-[#dcc1ae]">
                A central warehouse belongs to <b>no project</b>. Everything is received there first,
                then transferred out to the sites. <b className="text-[#e2e2e8]">Only Head Office can
                take stock from it.</b>
              </div>
              <F label="Name *">
                <input className="input" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Central Warehouse" autoFocus />
              </F>
            </>
          ) : (
            <>
              <F label="Project *">
                <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">— Select a project —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </F>
              <F label="Store Name">
                <input className="input" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Leave blank to use the project name" />
              </F>
              <div className="card p-2.5 bg-white/[0.03] text-[11px] text-[#dcc1ae]">
                It hangs off the central warehouse automatically. Only people assigned to this
                project can issue from it.
              </div>
            </>
          )}

          <F label="Location">
            <input className="input" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Gate 2, behind the batching plant…" />
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Creating…' : 'Create Store'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Mini({ label, v, tone }: { label: string; v: string; tone?: 'amber' }) {
  return (
    <div>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-[15px] font-bold mt-0.5 ${tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>
        {v}
      </div>
    </div>
  )
}
function K({ label, value, tone, big }: {
  label: string; value: string; tone?: 'blue'; big?: boolean
}) {
  const c = tone === 'blue' ? 'text-blue-400' : 'text-[#e2e2e8]'
  return (
    <div className={`card p-3 ${big ? 'border-[#ff8f00]/25 bg-[#ff8f00]/[0.04]' : ''}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[21px]' : 'text-[18px]'} font-bold ${big ? 'text-[#ffb87b]' : c}`}>
        {value}
      </div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}