import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Requirement Planning — pools material demand (approved Material Requests +
// BOQ→BOM demand), nets it against free stock and pending purchase orders, and
// releases ONE consolidated vendor PO. The PO is created by the database
// function inv_po_from_requirements, which refuses to cover unapproved MRs.

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Item = { id: string; item_code: string | null; name: string; standard_rate: number | null }
type MRHead = { mr_id: string; request_no: string; status: string }
type MRLine = { mr_id: string; item_id: string; approved_qty: number }
type Vendor = { id: string; name: string }
type BoqHead = { id: string; name: string | null; title: string | null }
type BoqItem = Record<string, any>
type BomLine = { id: string; boq_item_id: string; item_id: string; coefficient: number }

export default function RequirementPlanning() {
  const { profile, isAdmin, can } = useAuth()
  const [tab, setTab] = useState<'plan' | 'bom'>('plan')

  const [items, setItems] = useState<Item[]>([])
  const [mrs, setMrs] = useState<MRHead[]>([])
  const [mrLines, setMrLines] = useState<MRLine[]>([])
  const [onHand, setOnHand] = useState<Map<string, number>>(new Map())
  const [pendingPo, setPendingPo] = useState<Map<string, number>>(new Map())
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [bomDemand, setBomDemand] = useState<Map<string, number>>(new Map())  // item_id -> qty (from BOM tab)
  const [loading, setLoading] = useState(true)

  const [sel, setSel] = useState<Set<string>>(new Set())      // item_ids ticked for the PO
  const [vendorId, setVendorId] = useState('')
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: it }, { data: mh }, { data: vend }, { data: led }, { data: pol }, { data: pos }] = await Promise.all([
      supabase.from('inv_items').select('id, item_code, name, standard_rate').eq('active', true).order('name'),
      supabase.from('inv_mr_status').select('mr_id, request_no, status').in('status', ['Approved', 'Partially Fulfilled']),
      supabase.from('acc_parties').select('id, name').in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name'),
      supabase.from('inv_stock_ledger').select('item_id, signed_qty'),
      supabase.from('inv_po_lines').select('po_id, item_id, qty'),
      supabase.from('inv_purchase_orders').select('id, status'),
    ])
    setItems((it as Item[]) ?? [])
    const heads = (mh as MRHead[]) ?? []
    setMrs(heads)
    setVendors((vend as Vendor[]) ?? [])

    // approved MR demand lines
    if (heads.length) {
      const { data: ml } = await supabase.from('inv_mr_lines')
        .select('mr_id, item_id, approved_qty').in('mr_id', heads.map(h => h.mr_id))
      setMrLines((ml as MRLine[]) ?? [])
    } else setMrLines([])

    // on-hand per item, derived from the ledger (source of truth)
    const oh = new Map<string, number>()
    for (const r of (led as { item_id: string; signed_qty: number }[]) ?? [])
      oh.set(r.item_id, (oh.get(r.item_id) ?? 0) + Number(r.signed_qty || 0))
    setOnHand(oh)

    // pending PO qty per item = lines of POs still open (Draft/Approved/Partial)
    const open = new Set(((pos as { id: string; status: string }[]) ?? [])
      .filter(p => ['Draft', 'Approved', 'Partial'].includes(p.status)).map(p => p.id))
    const pp = new Map<string, number>()
    for (const l of (pol as { po_id: string; item_id: string; qty: number }[]) ?? [])
      if (open.has(l.po_id)) pp.set(l.item_id, (pp.get(l.item_id) ?? 0) + Number(l.qty || 0))
    setPendingPo(pp)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const itemMap = useMemo(() => { const m = new Map<string, Item>(); for (const i of items) m.set(i.id, i); return m }, [items])

  // ── the pool ──
  const pool = useMemo(() => {
    const mrByItem = new Map<string, { qty: number; mrIds: Set<string> }>()
    for (const l of mrLines) {
      const e = mrByItem.get(l.item_id) ?? { qty: 0, mrIds: new Set<string>() }
      e.qty += Number(l.approved_qty || 0); e.mrIds.add(l.mr_id)
      mrByItem.set(l.item_id, e)
    }
    const ids = new Set<string>([...mrByItem.keys(), ...bomDemand.keys()])
    const rows = [...ids].map(id => {
      const mr = mrByItem.get(id)
      const gross = (mr?.qty ?? 0) + (bomDemand.get(id) ?? 0)
      const stock = onHand.get(id) ?? 0
      const po = pendingPo.get(id) ?? 0
      const net = Math.max(0, Math.round((gross - stock - po) * 1000) / 1000)
      return { item_id: id, item: itemMap.get(id), mrQty: mr?.qty ?? 0, mrIds: mr?.mrIds ?? new Set<string>(), bomQty: bomDemand.get(id) ?? 0, gross, stock, po, net }
    }).filter(r => r.gross > 0).sort((a, b) => b.net - a.net)
    return rows
  }, [mrLines, bomDemand, onHand, pendingPo, itemMap])

  const coveredMrIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of pool) if (sel.has(r.item_id)) for (const id of r.mrIds) s.add(id)
    return [...s]
  }, [pool, sel])

  async function createPO() {
    const lines = pool.filter(r => sel.has(r.item_id) && r.net > 0)
      .map(r => ({ item_id: r.item_id, qty: r.net, rate: Number(r.item?.standard_rate || 0) }))
    if (!vendorId) { setMsg('Select a vendor.'); return }
    if (!lines.length) { setMsg('Tick at least one item with a net requirement.'); return }
    setCreating(true); setMsg(null)
    const { data, error } = await supabase.rpc('inv_po_from_requirements', {
      p_vendor: vendorId, p_lines: lines, p_mr_ids: coveredMrIds,
      p_remarks: `Consolidated PO covering ${coveredMrIds.length} request(s)`,
    })
    setCreating(false)
    if (error) { setMsg('Could not create PO: ' + error.message); return }
    setMsg(`Draft PO created (${lines.length} item(s), covering ${coveredMrIds.length} request(s)). Approve it on the Purchase Orders page.`)
    setSel(new Set()); load()
  }

  const canOrder = isAdmin || can('purchase_requests', 'create')

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>Requirement Planning</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
          Pool demand from approved requests and BOQ material breakdowns, net off stock &amp; open orders, release one consolidated PO.
        </p>
      </div>

      <div className="flex gap-1.5 mb-5 no-print">
        {([['plan', 'Pooled Requirements'], ['bom', 'BOQ → BOM']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border"
            style={tab === k ? { background: 'var(--accent)', color: '#0B0B0C', borderColor: 'var(--accent)' } : { color: 'var(--text-2)', borderColor: 'var(--line)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' && (
        <>
          {canOrder && (
            <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
              <select className="input" style={{ minWidth: 220 }} value={vendorId} onChange={e => setVendorId(e.target.value)}>
                <option value="">— Vendor for the consolidated PO —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button className="btn btn-primary" disabled={creating} onClick={createPO}>
                {creating ? 'Creating…' : `Create consolidated PO (${[...sel].length} item(s))`}
              </button>
              <span className="text-[11px]" style={{ color: 'var(--faint)' }}>Rates prefill from the item master — edit them on the PO before approval.</span>
            </div>
          )}
          {msg && <div className="mb-4 text-sm" style={{ color: msg.startsWith('Could not') ? '#f87171' : '#34d399' }}>{msg}</div>}

          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#282a2e]"><tr>
                {['', 'Item', 'From Requests', 'From BOM', 'Gross Demand', 'On Hand', 'On Order (PO)', 'Net To Procure'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--faint)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {pool.map(r => (
                  <tr key={r.item_id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <input type="checkbox" className="accent-[#ffb87b] w-4 h-4" disabled={r.net <= 0}
                        checked={sel.has(r.item_id)}
                        onChange={e => setSel(prev => { const n = new Set(prev); e.target.checked ? n.add(r.item_id) : n.delete(r.item_id); return n })} />
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text)' }}>
                      {r.item?.name ?? r.item_id}
                      {r.mrIds.size > 0 && <span className="ml-2 text-[10px]" style={{ color: 'var(--faint)' }}>{r.mrIds.size} request(s)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-2)' }}>{q(r.mrQty)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-2)' }}>{q(r.bomQty)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--text)' }}>{q(r.gross)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: '#34d399' }}>{q(r.stock)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: '#38bdf8' }}>{q(r.po)}</td>
                    <td className="px-3 py-2 font-mono font-bold" style={{ color: r.net > 0 ? '#ffb87b' : 'var(--faint)' }}>{q(r.net)}</td>
                  </tr>
                ))}
                {!pool.length && !loading && (
                  <tr><td colSpan={8} className="px-3 py-10 text-center" style={{ color: 'var(--faint)' }}>
                    No open demand. Approve Material Requests, or add BOM demand from the BOQ → BOM tab.
                  </td></tr>
                )}
              </tbody>
            </table>
            {loading && <div className="p-4 text-sm" style={{ color: 'var(--text-2)' }}>Loading…</div>}
          </div>
          <p className="text-[11px] mt-3" style={{ color: 'var(--faint)' }}>
            Net = gross demand − on-hand stock − quantity already on open POs. On-order counts full PO line quantities (partial receipts count once received).
          </p>
        </>
      )}

      {tab === 'bom' && <BomTab items={items} orgId={profile?.org_id ?? null}
        onPlan={(demand) => { setBomDemand(demand); setTab('plan') }} planned={bomDemand} />}
    </div>
  )
}

/* ── BOQ → BOM tab: define material breakdowns and push demand into the pool ── */
function BomTab({ items, orgId, onPlan, planned }: {
  items: Item[]; orgId: string | null
  onPlan: (demand: Map<string, number>) => void
  planned: Map<string, number>
}) {
  const [boqs, setBoqs] = useState<BoqHead[]>([])
  const [boqId, setBoqId] = useState('')
  const [boqItems, setBoqItems] = useState<BoqItem[]>([])
  const [boqItemId, setBoqItemId] = useState('')
  const [bom, setBom] = useState<BomLine[]>([])
  const [newItem, setNewItem] = useState('')
  const [newCoef, setNewCoef] = useState('')
  const [planQty, setPlanQty] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { (async () => {
    const { data } = await supabase.from('boqs').select('id, name, title')
    setBoqs((data as BoqHead[]) ?? [])
  })() }, [])

  useEffect(() => { (async () => {
    setBoqItems([]); setBoqItemId('')
    if (!boqId) return
    const { data } = await supabase.from('boq_items').select('*').eq('boq_id', boqId)
    setBoqItems((data as BoqItem[]) ?? [])
  })() }, [boqId])

  useEffect(() => { (async () => {
    setBom([])
    if (!boqItemId) return
    const { data } = await supabase.from('bom_lines').select('id, boq_item_id, item_id, coefficient').eq('boq_item_id', boqItemId)
    setBom((data as BomLine[]) ?? [])
  })() }, [boqItemId])

  const labelOf = (r: BoqItem) =>
    [r.item_no ?? r.code ?? '', r.description ?? r.name ?? r.item ?? ''].filter(Boolean).join(' — ') || r.id

  async function addLine() {
    if (!boqItemId || !newItem || !Number(newCoef)) { setErr('Pick a material and a coefficient.'); return }
    setErr(null)
    const { error } = await supabase.from('bom_lines').insert({
      org_id: orgId, boq_item_id: boqItemId, item_id: newItem, coefficient: Number(newCoef),
    })
    if (error) { setErr(error.message); return }
    setNewItem(''); setNewCoef('')
    const { data } = await supabase.from('bom_lines').select('id, boq_item_id, item_id, coefficient').eq('boq_item_id', boqItemId)
    setBom((data as BomLine[]) ?? [])
  }
  async function removeLine(id: string) {
    await supabase.from('bom_lines').delete().eq('id', id)
    setBom(prev => prev.filter(b => b.id !== id))
  }

  function pushToPlan() {
    const qty = Number(planQty)
    if (!qty || !bom.length) { setErr('Enter the BOQ quantity to plan (and define at least one BOM line).'); return }
    setErr(null)
    const demand = new Map(planned)
    for (const b of bom) {
      const add = Math.round(qty * Number(b.coefficient) * 1000) / 1000
      demand.set(b.item_id, (demand.get(b.item_id) ?? 0) + add)
    }
    onPlan(demand)
  }

  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? id

  return (
    <div className="space-y-4">
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--faint)' }}>BOQ</span>
          <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)}>
            <option value="">— Select —</option>
            {boqs.map(b => <option key={b.id} value={b.id}>{b.name || b.title || b.id}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--faint)' }}>BOQ Item (scope of work)</span>
          <select className="input" value={boqItemId} onChange={e => setBoqItemId(e.target.value)} disabled={!boqId}>
            <option value="">— Select —</option>
            {boqItems.map(r => <option key={r.id} value={r.id}>{labelOf(r)}</option>)}
          </select>
        </label>
      </div>

      {boqItemId && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Material breakdown (per 1 unit of this BOQ item)</h3>
          <div className="divide-y divide-white/[0.05] mb-3">
            {bom.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 text-[13px]">
                <span style={{ color: 'var(--text)' }}>{itemName(b.item_id)}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono" style={{ color: 'var(--text-2)' }}>× {q(Number(b.coefficient))}</span>
                  <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline" onClick={() => removeLine(b.id)}>Remove</button>
                </span>
              </div>
            ))}
            {!bom.length && <p className="text-[13px] py-2" style={{ color: 'var(--faint)' }}>No materials linked yet.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input" style={{ minWidth: 220 }} value={newItem} onChange={e => setNewItem(e.target.value)}>
              <option value="">— Material —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input className="input mono" style={{ maxWidth: 140 }} placeholder="coefficient" inputMode="decimal"
              value={newCoef} onChange={e => setNewCoef(e.target.value.replace(/[^\d.]/g, ''))} />
            <button className="btn btn-ghost" onClick={addLine}>+ Add material</button>
          </div>

          <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--line)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Plan procurement for</span>
            <input className="input mono" style={{ maxWidth: 140 }} placeholder="BOQ qty" inputMode="decimal"
              value={planQty} onChange={e => setPlanQty(e.target.value.replace(/[^\d.]/g, ''))} />
            <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>units of this item</span>
            <button className="btn btn-primary" onClick={pushToPlan}>Add demand to the pool →</button>
          </div>
        </div>
      )}
      {err && <div className="text-sm text-red-400">{err}</div>}
      <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
        Demand added here appears in the Pooled Requirements tab as "From BOM", netted against stock and open POs.
      </p>
    </div>
  )
}