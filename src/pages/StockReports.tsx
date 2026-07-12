import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Val = {
  item_id: string; item_code: string | null; item_name: string; category_name: string | null
  unit: string | null; warehouse_id: string; warehouse_name: string
  in_qty: number; out_qty: number; balance_qty: number
  avg_rate: number; closing_value: number
  reorder_level: number; below_reorder: boolean; is_negative: boolean
}
type LedgerRow = {
  item_name: string; item_code: string | null; unit: string | null
  warehouse_name: string; movement_no: string; movement_type: string
  entry_date: string; reference_no: string | null; issued_to: string | null
  vendor_name: string | null; in_qty: number; out_qty: number
  rate: number; value: number; running_balance: number
}
type Cons = {
  entry_date: string; movement_no: string; issued_to: string | null
  warehouse_name: string; item_name: string; item_code: string | null
  category_name: string | null; unit: string | null
  qty_consumed: number; rate: number; value_consumed: number
}
type Age = {
  item_code: string | null; item_name: string; unit: string | null; warehouse_name: string
  balance_qty: number; avg_rate: number; closing_value: number
  last_movement: string | null; last_issue: string | null
  days_since_issue: number | null; movement_status: string
}
type Abc = {
  item_code: string | null; item_name: string; category_name: string | null; unit: string | null
  total_qty: number; total_value: number; pct_of_total: number
  cumulative_pct: number; abc_class: string
}
type Integrity = { item_name: string; warehouse_name: string; balance_qty: number; issue: string }

type Rep = 'summary' | 'ledger' | 'consumption' | 'reorder' | 'dead' | 'abc'

const REPORTS: [Rep, string, string][] = [
  ['summary', 'Stock Summary', 'Closing quantity and value, per item and warehouse'],
  ['ledger', 'Stock Ledger', 'Every movement of an item, with a running balance'],
  ['consumption', 'Consumption', 'What was issued, to whom, and at what value'],
  ['reorder', 'Reorder Report', 'Items at or below their reorder level'],
  ['dead', 'Dead & Slow Moving', 'Stock that has not been issued for a long time'],
  ['abc', 'ABC Analysis', 'Items ranked by consumption value (Pareto)'],
]

export default function StockReports() {
  const { isAdmin, can } = useAuth()
  const { activeProject } = useProject()
  const [rep, setRep] = useState<Rep>('summary')
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [whFilter, setWhFilter] = useState('')
  const [itemFilter, setItemFilter] = useState('')

  const [val, setVal] = useState<Val[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [cons, setCons] = useState<Cons[]>([])
  const [age, setAge] = useState<Age[]>([])
  const [abc, setAbc] = useState<Abc[]>([])
  const [bad, setBad] = useState<Integrity[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [items, setItems] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: v }, { data: c }, { data: a }, { data: ab }, { data: ig }, { data: w }, { data: i }] = await Promise.all([
        supabase.from('inv_valuation').select('*').order('item_name'),
        supabase.from('inv_consumption').select('*').gte('entry_date', from).lte('entry_date', to).order('entry_date', { ascending: false }),
        supabase.from('inv_stock_ageing').select('*').order('days_since_issue', { ascending: false }),
        supabase.from('inv_abc_analysis').select('*').order('total_value', { ascending: false }),
        supabase.from('inv_integrity_check').select('*'),
        supabase.from('inv_warehouses').select('id, name').eq('active', true).order('name'),
        supabase.from('inv_items').select('id, name').eq('active', true).order('name'),
      ])
      setVal((v as Val[]) ?? [])
      setCons((c as Cons[]) ?? [])
      setAge((a as Age[]) ?? [])
      setAbc((ab as Abc[]) ?? [])
      setBad((ig as Integrity[]) ?? [])
      setWarehouses((w as any[]) ?? [])
      setItems((i as any[]) ?? [])
      setLoading(false)
    })()
  }, [from, to, activeProject?.id])

  // stock ledger loads only when needed (it can be large)
  useEffect(() => {
    if (rep !== 'ledger' || !itemFilter) { setLedger([]); return }
    (async () => {
      let qy = supabase.from('inv_stock_ledger').select('*')
        .eq('item_id', itemFilter)
        .gte('entry_date', from).lte('entry_date', to)
        .order('entry_date').order('movement_no')
      if (whFilter) qy = qy.eq('warehouse_id', whFilter)
      const { data } = await qy
      setLedger((data as LedgerRow[]) ?? [])
    })()
  }, [rep, itemFilter, whFilter, from, to])

  const scoped = useMemo(() =>
    val.filter(v => !whFilter || v.warehouse_id === whFilter), [val, whFilter])

  const totals = useMemo(() => ({
    items: new Set(scoped.map(v => v.item_id)).size,
    qty: r2(scoped.reduce((n, v) => n + Number(v.balance_qty || 0), 0)),
    value: r2(scoped.reduce((n, v) => n + Number(v.closing_value || 0), 0)),
    lowStock: scoped.filter(v => v.below_reorder).length,
  }), [scoped])

  if (!isAdmin && !can('store', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">You don't have permission to view stock reports.</div>
  }

  const meta = REPORTS.find(r => r[0] === rep)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Stock Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Valued at weighted average cost. Built from posted movements only.</p>
      </div>

      {/* integrity alarm — should never fire if Phase 2 is working */}
      {bad.length > 0 && (
        <div className="card p-4 mb-5 bg-red-500/10 border-red-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '20px' }}>error</span>
            <div>
              <div className="text-[13px] font-bold text-red-400">
                DATA INTEGRITY WARNING — {bad.length} item(s) have NEGATIVE stock
              </div>
              <div className="text-[12px] text-[#dcc1ae] mt-1">
                {bad.slice(0, 4).map(b => `${b.item_name} @ ${b.warehouse_name}: ${q(b.balance_qty)}`).join(' · ')}
              </div>
              <div className="text-[11px] text-red-400/80 mt-1">
                Stock should never go below zero. Valuation figures cannot be trusted until this is fixed.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Items in Stock" value={String(totals.items)} />
        <K label="Total Quantity" value={q(totals.qty)} />
        <K label="Stock Value" value={inr(totals.value)} tone="emerald" />
        <K label="Below Reorder" value={String(totals.lowStock)} tone={totals.lowStock ? 'amber' : undefined} />
      </div>

      {/* controls */}
      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="Report">
          <select className="input" value={rep} onChange={e => setRep(e.target.value as Rep)} style={{ minWidth: 190 }}>
            {REPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </L>
        <L label="Warehouse">
          <select className="input" value={whFilter} onChange={e => setWhFilter(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </L>
        {rep === 'ledger' && (
          <L label="Item *">
            <select className="input" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">— Select an item —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </L>
        )}
        {(rep === 'ledger' || rep === 'consumption') && (
          <>
            <L label="From"><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></L>
            <L label="To"><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></L>
          </>
        )}
      </div>

      <p className="text-[12px] text-[#dcc1ae]/60 mb-4">{meta[2]}</p>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {rep === 'summary' && <Summary rows={scoped} />}
          {rep === 'ledger' && <Ledger rows={ledger} hasItem={!!itemFilter} />}
          {rep === 'consumption' && <Consumption rows={cons} />}
          {rep === 'reorder' && <Reorder rows={scoped.filter(v => v.below_reorder)} />}
          {rep === 'dead' && <DeadStock rows={age} />}
          {rep === 'abc' && <AbcAnalysis rows={abc} />}
        </>
      )}
    </div>
  )
}

// ---------------- Stock Summary ----------------
function Summary({ rows }: { rows: Val[] }) {
  const totQty = r2(rows.reduce((n, r) => n + Number(r.balance_qty || 0), 0))
  const totVal = r2(rows.reduce((n, r) => n + Number(r.closing_value || 0), 0))
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Stock Summary</span>
        <ExportButtons filename="stock-summary" title="Stock Summary" rows={rows}
          columns={[
            { header: 'Code', get: (r: any) => r.item_code || '—' },
            { header: 'Item', get: (r: any) => r.item_name },
            { header: 'Category', get: (r: any) => r.category_name || '—' },
            { header: 'Warehouse', get: (r: any) => r.warehouse_name },
            { header: 'Unit', get: (r: any) => r.unit || '—' },
            { header: 'Received', get: (r: any) => Number(r.in_qty) },
            { header: 'Issued', get: (r: any) => Number(r.out_qty) },
            { header: 'Closing Qty', get: (r: any) => Number(r.balance_qty) },
            { header: 'Avg Rate', get: (r: any) => Number(r.avg_rate) },
            { header: 'Closing Value', get: (r: any) => Number(r.closing_value) },
            { header: 'Reorder Level', get: (r: any) => Number(r.reorder_level) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Code', 'Item', 'Warehouse', 'Unit', 'Received', 'Issued', 'Closing Qty', 'Avg Rate', 'Value'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.item_id + r.warehouse_id}
              className={`hover:bg-white/[0.02] ${r.is_negative ? 'bg-red-500/10' : r.below_reorder ? 'bg-amber-500/[0.05]' : ''}`}>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.item_code || '—'}</td>
              <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">
                {r.item_name}
                {r.below_reorder && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">reorder</span>}
              </td>
              <td className="px-4 py-2.5 text-[#dcc1ae]">{r.warehouse_name}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{r.unit || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">{q(r.in_qty)}</td>
              <td className="px-4 py-2.5 font-mono text-red-400 text-right">{q(r.out_qty)}</td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right ${r.is_negative ? 'text-red-400' : r.below_reorder ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>
                {q(r.balance_qty)}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(r.avg_rate)}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.closing_value)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No stock yet. Record a Goods Receipt in Stock Movements.
          </td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-[#282a2e]">
            <tr>
              <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={6}>Total</td>
              <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8] text-right">{q(totQty)}</td>
              <td />
              <td className="px-4 py-3 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">{inr(totVal)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------- Stock Ledger ----------------
function Ledger({ rows, hasItem }: { rows: LedgerRow[]; hasItem: boolean }) {
  if (!hasItem) return <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">Select an item above to see its ledger.</div>
  const totIn = r2(rows.reduce((n, r) => n + Number(r.in_qty || 0), 0))
  const totOut = r2(rows.reduce((n, r) => n + Number(r.out_qty || 0), 0))
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : 0

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          {rows[0]?.item_name ?? 'Stock Ledger'}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-[#dcc1ae]/60">Closing: <b className="text-[#e2e2e8] font-mono">{q(closing)}</b></span>
          <ExportButtons filename="stock-ledger" title="Stock Ledger" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.entry_date },
              { header: 'Movement No.', get: (r: any) => r.movement_no },
              { header: 'Type', get: (r: any) => r.movement_type },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name },
              { header: 'Vendor / Issued To', get: (r: any) => r.vendor_name || r.issued_to || '—' },
              { header: 'Reference', get: (r: any) => r.reference_no || '—' },
              { header: 'In', get: (r: any) => Number(r.in_qty) },
              { header: 'Out', get: (r: any) => Number(r.out_qty) },
              { header: 'Rate', get: (r: any) => Number(r.rate) },
              { header: 'Balance', get: (r: any) => Number(r.running_balance) },
            ]} />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Date', 'Movement', 'Type', 'Warehouse', 'Vendor / Issued To', 'In', 'Out', 'Rate', 'Balance'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.entry_date}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.movement_no}</td>
              <td className="px-4 py-2.5 text-[#dcc1ae]">{r.movement_type}</td>
              <td className="px-4 py-2.5 text-[#dcc1ae]">{r.warehouse_name}</td>
              <td className="px-4 py-2.5 text-[#dcc1ae]">{r.vendor_name || r.issued_to || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">{r.in_qty ? q(r.in_qty) : '—'}</td>
              <td className="px-4 py-2.5 font-mono text-red-400 text-right">{r.out_qty ? q(r.out_qty) : '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{r.rate ? inr(r.rate) : '—'}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right">{q(r.running_balance)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No movements for this item in the period.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-[#282a2e]">
            <tr>
              <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={5}>Total</td>
              <td className="px-4 py-3 font-mono font-bold text-emerald-400 text-right">{q(totIn)}</td>
              <td className="px-4 py-3 font-mono font-bold text-red-400 text-right">{q(totOut)}</td>
              <td />
              <td className="px-4 py-3 font-mono font-bold text-[#ffb87b] text-right">{q(closing)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------- Consumption ----------------
function Consumption({ rows }: { rows: Cons[] }) {
  const totQty = r2(rows.reduce((n, r) => n + Number(r.qty_consumed || 0), 0))
  const totVal = r2(rows.reduce((n, r) => n + Number(r.value_consumed || 0), 0))

  // grouped by item
  const byItem = useMemo(() => {
    const m = new Map<string, { name: string; unit: string | null; qty: number; value: number }>()
    for (const r of rows) {
      const cur = m.get(r.item_name) ?? { name: r.item_name, unit: r.unit, qty: 0, value: 0 }
      cur.qty = r2(cur.qty + Number(r.qty_consumed || 0))
      cur.value = r2(cur.value + Number(r.value_consumed || 0))
      m.set(r.item_name, cur)
    }
    return [...m.values()].sort((a, b) => b.value - a.value)
  }, [rows])

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Consumption by Item</span>
          <span className="text-[11px] text-[#dcc1ae]/60">Total {inr(totVal)}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Unit', 'Qty Consumed', 'Value'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {byItem.map(r => (
              <tr key={r.name} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.name}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae]">{r.unit || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{q(r.qty)}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.value)}</td>
              </tr>
            ))}
            {!byItem.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">Nothing consumed in this period.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Issue Detail</span>
          <ExportButtons filename="consumption" title="Consumption Report" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.entry_date },
              { header: 'Movement No.', get: (r: any) => r.movement_no },
              { header: 'Item Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Category', get: (r: any) => r.category_name || '—' },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name },
              { header: 'Issued To', get: (r: any) => r.issued_to || '—' },
              { header: 'Unit', get: (r: any) => r.unit || '—' },
              { header: 'Qty', get: (r: any) => Number(r.qty_consumed) },
              { header: 'Rate', get: (r: any) => Number(r.rate) },
              { header: 'Value', get: (r: any) => Number(r.value_consumed) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Movement', 'Item', 'Issued To', 'Qty', 'Rate', 'Value'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.entry_date}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.movement_no}</td>
                <td className="px-4 py-2.5 text-[#e2e2e8]">{r.item_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{r.issued_to || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{q(r.qty_consumed)} {r.unit}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(r.rate)}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.value_consumed)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No issues in this period.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-[#282a2e]">
              <tr>
                <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={4}>Total</td>
                <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8] text-right">{q(totQty)}</td>
                <td />
                <td className="px-4 py-3 font-mono font-bold text-red-400 text-right whitespace-nowrap">{inr(totVal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ---------------- Reorder ----------------
function Reorder({ rows }: { rows: Val[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Items to Reorder</span>
        <ExportButtons filename="reorder" title="Reorder Report" rows={rows}
          columns={[
            { header: 'Code', get: (r: any) => r.item_code || '—' },
            { header: 'Item', get: (r: any) => r.item_name },
            { header: 'Warehouse', get: (r: any) => r.warehouse_name },
            { header: 'Unit', get: (r: any) => r.unit || '—' },
            { header: 'Current Stock', get: (r: any) => Number(r.balance_qty) },
            { header: 'Reorder Level', get: (r: any) => Number(r.reorder_level) },
            { header: 'Shortfall', get: (r: any) => r2(Number(r.reorder_level) - Number(r.balance_qty)) },
            { header: 'Avg Rate', get: (r: any) => Number(r.avg_rate) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Code', 'Item', 'Warehouse', 'Current Stock', 'Reorder Level', 'Shortfall', 'Est. Cost'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const short = r2(Number(r.reorder_level) - Number(r.balance_qty))
            return (
              <tr key={r.item_id + r.warehouse_id} className="hover:bg-white/[0.02] bg-amber-500/[0.05]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.item_code || '—'}</td>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.item_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{r.warehouse_name}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-amber-400 text-right">{q(r.balance_qty)} {r.unit}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{q(r.reorder_level)}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-red-400 text-right">{q(short)}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(short * Number(r.avg_rate || 0))}</td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
            ✓ Nothing to reorder — all items are above their reorder level.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Dead / Slow moving ----------------
function DeadStock({ rows }: { rows: Age[] }) {
  const dead = rows.filter(r => r.movement_status === 'Dead Stock')
  const slow = rows.filter(r => r.movement_status === 'Slow Moving')
  const never = rows.filter(r => r.movement_status === 'Never Issued')
  const deadValue = r2([...dead, ...never].reduce((n, r) => n + Number(r.closing_value || 0), 0))

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <K label="Dead Stock (>180d)" value={String(dead.length)} tone={dead.length ? 'red' : undefined} />
        <K label="Slow Moving (>90d)" value={String(slow.length)} tone={slow.length ? 'amber' : undefined} />
        <K label="Locked-up Value" value={inr(deadValue)} tone={deadValue ? 'red' : undefined} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Stock Ageing</span>
          <ExportButtons filename="dead-stock" title="Dead & Slow Moving Stock" rows={rows}
            columns={[
              { header: 'Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name },
              { header: 'Balance', get: (r: any) => Number(r.balance_qty) },
              { header: 'Value', get: (r: any) => Number(r.closing_value) },
              { header: 'Last Issue', get: (r: any) => r.last_issue || 'Never' },
              { header: 'Days Idle', get: (r: any) => r.days_since_issue ?? '—' },
              { header: 'Status', get: (r: any) => r.movement_status },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Warehouse', 'Balance', 'Value', 'Last Issue', 'Days Idle', 'Status'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => {
              const isDead = r.movement_status === 'Dead Stock' || r.movement_status === 'Never Issued'
              return (
                <tr key={i} className={`hover:bg-white/[0.02] ${isDead ? 'bg-red-500/[0.05]' : r.movement_status === 'Slow Moving' ? 'bg-amber-500/[0.04]' : ''}`}>
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.item_name}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{r.warehouse_name}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{q(r.balance_qty)} {r.unit}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.closing_value)}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.last_issue || 'Never'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.days_since_issue ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                      isDead ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : r.movement_status === 'Slow Moving' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>{r.movement_status}</span>
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No stock on hand.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- ABC Analysis ----------------
function AbcAnalysis({ rows }: { rows: Abc[] }) {
  const cls = (c: string) => rows.filter(r => r.abc_class === c)
  const val = (c: string) => r2(cls(c).reduce((n, r) => n + Number(r.total_value || 0), 0))

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">Class A — high value</div>
          <div className="font-mono text-[20px] font-bold text-emerald-400">{cls('A').length} items</div>
          <div className="text-[11px] text-[#dcc1ae] mt-0.5">{inr(val('A'))} · tight control needed</div>
        </div>
        <div className="card p-4 border-amber-500/20 bg-amber-500/5">
          <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">Class B — medium</div>
          <div className="font-mono text-[20px] font-bold text-amber-400">{cls('B').length} items</div>
          <div className="text-[11px] text-[#dcc1ae] mt-0.5">{inr(val('B'))} · routine control</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">Class C — low value</div>
          <div className="font-mono text-[20px] font-bold text-[#dcc1ae]">{cls('C').length} items</div>
          <div className="text-[11px] text-[#dcc1ae] mt-0.5">{inr(val('C'))} · simple control</div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">ABC Analysis — by consumption value</span>
          <ExportButtons filename="abc-analysis" title="ABC Analysis" rows={rows}
            columns={[
              { header: 'Class', get: (r: any) => r.abc_class },
              { header: 'Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Category', get: (r: any) => r.category_name || '—' },
              { header: 'Qty Consumed', get: (r: any) => Number(r.total_qty) },
              { header: 'Value', get: (r: any) => Number(r.total_value) },
              { header: '% of Total', get: (r: any) => Number(r.pct_of_total) },
              { header: 'Cumulative %', get: (r: any) => Number(r.cumulative_pct) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Class', 'Item', 'Category', 'Qty Consumed', 'Value', '% of Total', 'Cumulative %'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                    r.abc_class === 'A' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : r.abc_class === 'B' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{r.abc_class}</span>
                </td>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.item_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{r.category_name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{q(r.total_qty)} {r.unit}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.total_value)}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.pct_of_total}%</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.cumulative_pct}%</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              Nothing consumed yet. ABC analysis ranks items by how much value you actually use.
            </td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
        A = top 70% of consumption value · B = next 20% · C = last 10%. Focus your control on Class A.
      </p>
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}