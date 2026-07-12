import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

type Summary = {
  total_items: number; total_value: number; free_value: number
  reserved_value: number; in_transit_value: number
  zero_count: number; critical_count: number; reorder_count: number
  low_count: number; overstock_count: number
  dead_count: number; dead_value: number; slow_count: number; slow_value: number
  fast_count: number
  expired_value: number; near_expiry_value: number
  expired_count: number; near_expiry_count: number
}
type Health = {
  item_id: string; item_code: string | null; item_name: string
  category_name: string | null; unit: string | null
  warehouse_id: string; warehouse_name: string
  project_id: string | null; project_name: string | null
  on_hand: number; reserved: number; in_transit: number; free: number
  avg_rate: number; value: number
  alert_level: string; movement_class: string
  daily_burn: number; days_of_cover: number | null
  last_issue: string | null
  expired_qty: number; near_expiry_qty: number
}
type WhValue = {
  warehouse_id: string; warehouse_name: string; project_name: string | null
  item_count: number; total_value: number; free_value: number
  reserved_value: number; critical_items: number; dead_value: number
}
type Forecast = {
  project_name: string | null; item_code: string | null; item_name: string; unit: string | null
  required_qty: number; free_qty: number; in_transit_qty: number; on_order_qty: number
  shortage_qty: number; shortage_value: number
  daily_burn: number; days_to_stockout: number | null
  order_by_date: string | null; status: string
}

const ALERT_STYLE: Record<string, string> = {
  'ZERO': 'bg-red-500/15 text-red-400 border-red-500/30',
  'CRITICAL': 'bg-red-500/10 text-red-400 border-red-500/20',
  'REORDER': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'LOW': 'bg-amber-500/[0.06] text-amber-400/80 border-amber-500/15',
  'OVERSTOCK': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'OK': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}
const MOVE_STYLE: Record<string, string> = {
  'Dead': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Slow Moving': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Fast Moving': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Never Issued': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
  'No Stock': 'bg-white/5 text-[#dcc1ae]/40 border-white/10',
  'Active': 'bg-white/5 text-[#dcc1ae] border-white/10',
}

type Tab = 'health' | 'forecast' | 'sites'

export default function StockDashboard() {
  const { isAdmin, can } = useAuth()
  const { activeProject } = useProject()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('health')
  const [sum, setSum] = useState<Summary | null>(null)
  const [health, setHealth] = useState<Health[]>([])
  const [byWh, setByWh] = useState<WhValue[]>([])
  const [forecast, setForecast] = useState<Forecast[]>([])
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState<string>('')   // filter by alert or movement class

  useEffect(() => {
    (async () => {
      setLoading(true)
      // fire the alert scans (deduplicated server-side)
      supabase.rpc('inv_scan_stock_alerts').then(() => {})
      supabase.rpc('inv_scan_expiry_alerts').then(() => {})

      const [{ data: s }, { data: h }, { data: w }, { data: f }] = await Promise.all([
        supabase.from('inv_dashboard_summary').select('*').maybeSingle(),
        supabase.from('inv_stock_health').select('*').order('value', { ascending: false }),
        supabase.from('inv_value_by_warehouse').select('*').order('total_value', { ascending: false }),
        supabase.from('inv_demand_forecast').select('*').order('shortage_value', { ascending: false }),
      ])
      setSum((s as Summary) ?? null)
      setHealth((h as Health[]) ?? [])
      setByWh((w as WhValue[]) ?? [])
      setForecast((f as Forecast[]) ?? [])
      setLoading(false)
    })()
  }, [activeProject?.id])

  const shown = useMemo(() => {
    if (!drill) return health
    if (['ZERO', 'CRITICAL', 'REORDER', 'LOW', 'OVERSTOCK'].includes(drill)) {
      return health.filter(h => h.alert_level === drill)
    }
    return health.filter(h => h.movement_class === drill)
  }, [health, drill])

  const urgent = useMemo(() => forecast.filter(f => f.status === 'URGENT'), [forecast])
  const shortages = useMemo(() => forecast.filter(f => f.status !== 'Covered'), [forecast])

  if (!isAdmin && !can('store', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">You don't have permission to view this.</div>
  }
  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Stock Health</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          What you hold, what is spoken for, what is moving — and what you are about to run out of.
        </p>
      </div>

      {/* alarms first */}
      {(sum?.zero_count ?? 0) + (sum?.critical_count ?? 0) > 0 && (
        <div className="card p-3 mb-3 bg-red-500/10 border-red-500/25 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
          <div className="text-[13px]">
            <b className="text-red-400">
              {sum?.zero_count} out of stock · {sum?.critical_count} critical
            </b>
            <span className="text-[#dcc1ae]"> — these will stop work. Raise purchase orders now.</span>
          </div>
        </div>
      )}
      {urgent.length > 0 && (
        <div className="card p-3 mb-3 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{urgent.length} item(s) run out within 7 days</b>
            <span className="text-[#dcc1ae]"> — {urgent.slice(0, 3).map(u => u.item_name).join(', ')}</span>
          </div>
        </div>
      )}
      {(sum?.expired_value ?? 0) > 0 && (
        <div className="card p-3 mb-3 bg-red-500/5 border-red-500/15 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>event_busy</span>
          <div className="text-[13px]">
            <b className="text-red-400">{inr2(sum!.expired_value)} of stock has EXPIRED</b>
            <span className="text-[#dcc1ae]"> — write it off with a Stock Adjustment.</span>
          </div>
        </div>
      )}

      {/* the four numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Big label="Total Inventory Value" value={inr(sum?.total_value ?? 0)} sub={`${sum?.total_items ?? 0} items`} />
        <Big label="Free" value={inr(sum?.free_value ?? 0)} sub="available to issue" tone="emerald" />
        <Big label="Reserved" value={inr(sum?.reserved_value ?? 0)} sub="spoken for" tone="blue" />
        <Big label="In Transit" value={inr(sum?.in_transit_value ?? 0)} sub="on the road" tone="amber" />
      </div>

      {/* clickable drill-downs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
        <D label="Zero" v={sum?.zero_count ?? 0} tone="red" active={drill === 'ZERO'} onClick={() => setDrill(drill === 'ZERO' ? '' : 'ZERO')} />
        <D label="Critical" v={sum?.critical_count ?? 0} tone="red" active={drill === 'CRITICAL'} onClick={() => setDrill(drill === 'CRITICAL' ? '' : 'CRITICAL')} />
        <D label="Reorder" v={sum?.reorder_count ?? 0} tone="amber" active={drill === 'REORDER'} onClick={() => setDrill(drill === 'REORDER' ? '' : 'REORDER')} />
        <D label="Low" v={sum?.low_count ?? 0} tone="amber" active={drill === 'LOW'} onClick={() => setDrill(drill === 'LOW' ? '' : 'LOW')} />
        <D label="Overstock" v={sum?.overstock_count ?? 0} tone="blue" active={drill === 'OVERSTOCK'} onClick={() => setDrill(drill === 'OVERSTOCK' ? '' : 'OVERSTOCK')} />
        <D label="Dead" v={sum?.dead_count ?? 0} tone="red" active={drill === 'Dead'} onClick={() => setDrill(drill === 'Dead' ? '' : 'Dead')} />
        <D label="Slow" v={sum?.slow_count ?? 0} tone="amber" active={drill === 'Slow Moving'} onClick={() => setDrill(drill === 'Slow Moving' ? '' : 'Slow Moving')} />
        <D label="Fast" v={sum?.fast_count ?? 0} tone="emerald" active={drill === 'Fast Moving'} onClick={() => setDrill(drill === 'Fast Moving' ? '' : 'Fast Moving')} />
      </div>

      {(sum?.dead_value ?? 0) > 0 && (
        <p className="text-[12px] text-[#dcc1ae]/70 mb-4">
          <b className="text-red-400">{inr2(sum!.dead_value)}</b> is locked up in dead stock (no issue in 180 days)
          {(sum?.slow_value ?? 0) > 0 && <> · <b className="text-amber-400">{inr2(sum!.slow_value)}</b> slow moving</>}
        </p>
      )}

      <div className="flex gap-1 mb-4 flex-wrap items-center">
        {([['health', 'Stock Health'], ['forecast', `Demand Forecast (${shortages.length})`], ['sites', 'By Site & Warehouse']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        {drill && (
          <button className="btn btn-ghost ml-2" style={{ padding: '5px 10px', fontSize: '12px' }}
            onClick={() => setDrill('')}>
            Showing: {drill} — clear
          </button>
        )}
      </div>

      {tab === 'health' && <HealthTable rows={shown} />}
      {tab === 'forecast' && <ForecastTable rows={forecast} />}
      {tab === 'sites' && <SitesTable rows={byWh} />}
    </div>
  )
}

// ---------------- Stock Health ----------------
function HealthTable({ rows }: { rows: Health[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Stock Health — {rows.length} row(s)</span>
        <ExportButtons filename="stock-health" title="Stock Health" rows={rows}
          columns={[
            { header: 'Code', get: (r: any) => r.item_code || '—' },
            { header: 'Item', get: (r: any) => r.item_name },
            { header: 'Category', get: (r: any) => r.category_name || '—' },
            { header: 'Warehouse', get: (r: any) => r.warehouse_name },
            { header: 'Site', get: (r: any) => r.project_name || '—' },
            { header: 'On Hand', get: (r: any) => Number(r.on_hand) },
            { header: 'Reserved', get: (r: any) => Number(r.reserved) },
            { header: 'In Transit', get: (r: any) => Number(r.in_transit) },
            { header: 'Free', get: (r: any) => Number(r.free) },
            { header: 'Avg Rate', get: (r: any) => Number(r.avg_rate) },
            { header: 'Value', get: (r: any) => Number(r.value) },
            { header: 'Alert', get: (r: any) => r.alert_level },
            { header: 'Movement', get: (r: any) => r.movement_class },
            { header: 'Daily Burn', get: (r: any) => Number(r.daily_burn) },
            { header: 'Days of Cover', get: (r: any) => r.days_of_cover ?? '—' },
            { header: 'Last Issue', get: (r: any) => r.last_issue || 'Never' },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Item', 'Warehouse', 'On Hand', 'Reserved', 'In Transit', 'Free', 'Value', 'Cover', 'Alert', 'Movement'].map(h => (
            <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const bad = ['ZERO', 'CRITICAL'].includes(r.alert_level)
            return (
              <tr key={r.item_id + r.warehouse_id} className={`hover:bg-white/[0.02] ${bad ? 'bg-red-500/[0.05]' : ''}`}>
                <td className="px-3 py-2.5">
                  <div className="text-[#e2e2e8] font-semibold">{r.item_name}</div>
                  <div className="text-[10px] text-[#dcc1ae]/50">{r.item_code}</div>
                </td>
                <td className="px-3 py-2.5 text-[12px] text-[#dcc1ae]">
                  {r.warehouse_name}
                  {r.project_name && <div className="text-[10px] text-[#dcc1ae]/50">{r.project_name}</div>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{q(r.on_hand)}</td>
                <td className="px-3 py-2.5 font-mono text-blue-400 text-right">{Number(r.reserved) ? q(r.reserved) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-amber-400 text-right">{Number(r.in_transit) ? q(r.in_transit) : '—'}</td>
                <td className={`px-3 py-2.5 font-mono font-bold text-right ${bad ? 'text-red-400' : 'text-[#e2e2e8]'}`}>
                  {q(r.free)} <span className="text-[10px] font-normal text-[#dcc1ae]/50">{r.unit}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr2(r.value)}</td>
                <td className="px-3 py-2.5 font-mono text-right whitespace-nowrap">
                  {r.days_of_cover != null
                    ? <span className={r.days_of_cover < 7 ? 'text-red-400 font-bold' : r.days_of_cover < 15 ? 'text-amber-400' : 'text-[#dcc1ae]'}>
                        {r.days_of_cover}d
                      </span>
                    : <span className="text-[#dcc1ae]/30">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${ALERT_STYLE[r.alert_level] || ''}`}>
                    {r.alert_level}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${MOVE_STYLE[r.movement_class] || ''}`}>
                    {r.movement_class}
                  </span>
                </td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No stock matches.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Demand Forecast ----------------
function ForecastTable({ rows }: { rows: Forecast[] }) {
  const short = rows.filter(r => r.status !== 'Covered')
  const totalShort = short.reduce((n, r) => n + Number(r.shortage_value || 0), 0)

  return (
    <div>
      <div className="card p-4 mb-4 bg-white/[0.02]">
        <div className="text-[12px] text-[#dcc1ae]">
          <b className="text-[#e2e2e8]">How this is calculated —</b> no guesswork, no AI:
          <div className="mt-1.5 font-mono text-[11px] text-[#dcc1ae]/70 leading-relaxed">
            required = (BOQ qty − executed) × material norm × (1 + wastage%)<br />
            shortage = required − free stock − in transit − on order<br />
            days to stockout = free ÷ daily burn (issues over the last 90 days)<br />
            order by = stockout date − 7 day lead time
          </div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">
            Material Requirement Forecast
            {totalShort > 0 && <span className="text-red-400 ml-2">· {inr2(totalShort)} to procure</span>}
          </span>
          <ExportButtons filename="demand-forecast" title="Demand Forecast" rows={rows}
            columns={[
              { header: 'Site', get: (r: any) => r.project_name || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Unit', get: (r: any) => r.unit || '—' },
              { header: 'Still Required', get: (r: any) => Number(r.required_qty) },
              { header: 'Free Stock', get: (r: any) => Number(r.free_qty) },
              { header: 'In Transit', get: (r: any) => Number(r.in_transit_qty) },
              { header: 'On Order', get: (r: any) => Number(r.on_order_qty) },
              { header: 'Shortage', get: (r: any) => Number(r.shortage_qty) },
              { header: 'Shortage Value', get: (r: any) => Number(r.shortage_value) },
              { header: 'Daily Burn', get: (r: any) => Number(r.daily_burn) },
              { header: 'Days to Stockout', get: (r: any) => r.days_to_stockout ?? '—' },
              { header: 'Order By', get: (r: any) => r.order_by_date || '—' },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Site', 'Still Required', 'Free', 'In Transit', 'On Order', 'Shortage', 'Burn', 'Stockout', 'Order By', 'Status'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => {
              const urgent = r.status === 'URGENT'
              const covered = r.status === 'Covered'
              return (
                <tr key={i} className={`hover:bg-white/[0.02] ${urgent ? 'bg-red-500/[0.06]' : ''}`}>
                  <td className="px-3 py-2.5 text-[#e2e2e8] font-semibold">{r.item_name}</td>
                  <td className="px-3 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                    {q(r.required_qty)} <span className="text-[10px] text-[#dcc1ae]/50">{r.unit}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-emerald-400 text-right">{q(r.free_qty)}</td>
                  <td className="px-3 py-2.5 font-mono text-amber-400 text-right">{Number(r.in_transit_qty) ? q(r.in_transit_qty) : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-blue-400 text-right">{Number(r.on_order_qty) ? q(r.on_order_qty) : '—'}</td>
                  <td className={`px-3 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(r.shortage_qty) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {Number(r.shortage_qty) > 0 ? q(r.shortage_qty) : '—'}
                    {Number(r.shortage_value) > 0 && (
                      <div className="text-[10px] font-normal">{inr2(r.shortage_value)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae] text-right">
                    {Number(r.daily_burn) ? `${q(r.daily_burn)}/d` : '—'}
                  </td>
                  <td className={`px-3 py-2.5 font-mono font-bold text-right ${urgent ? 'text-red-400' : 'text-[#dcc1ae]'}`}>
                    {r.days_to_stockout != null ? `${r.days_to_stockout}d` : '—'}
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-[11px] whitespace-nowrap ${urgent ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {r.order_by_date || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                      urgent ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : covered ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={11} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              No forecast yet. It needs: material norms (Consumption &amp; Wastage) + a BOQ with executed quantities.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- By Site / Warehouse ----------------
function SitesTable({ rows }: { rows: WhValue[] }) {
  const total = rows.reduce((n, r) => n + Number(r.total_value || 0), 0)
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Inventory Value by Warehouse</span>
        <ExportButtons filename="warehouse-inventory" title="Warehouse-wise Inventory" rows={rows}
          columns={[
            { header: 'Warehouse', get: (r: any) => r.warehouse_name },
            { header: 'Site', get: (r: any) => r.project_name || '—' },
            { header: 'Items', get: (r: any) => Number(r.item_count) },
            { header: 'Total Value', get: (r: any) => Number(r.total_value) },
            { header: 'Free Value', get: (r: any) => Number(r.free_value) },
            { header: 'Reserved Value', get: (r: any) => Number(r.reserved_value) },
            { header: 'Critical Items', get: (r: any) => Number(r.critical_items) },
            { header: 'Dead Stock Value', get: (r: any) => Number(r.dead_value) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Warehouse', 'Site', 'Items', 'Total Value', 'Free', 'Reserved', 'Critical', 'Dead Stock', 'Share'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const pct = total ? Math.round(Number(r.total_value) / total * 100) : 0
            return (
              <tr key={r.warehouse_id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.warehouse_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{r.project_name || 'Company-wide'}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.item_count}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr2(r.total_value)}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{inr2(r.free_value)}</td>
                <td className="px-4 py-2.5 font-mono text-blue-400 text-right whitespace-nowrap">{Number(r.reserved_value) ? inr2(r.reserved_value) : '—'}</td>
                <td className={`px-4 py-2.5 font-mono text-right font-bold ${Number(r.critical_items) ? 'text-red-400' : 'text-[#dcc1ae]/40'}`}>
                  {Number(r.critical_items) || '—'}
                </td>
                <td className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${Number(r.dead_value) ? 'text-red-400' : 'text-[#dcc1ae]/40'}`}>
                  {Number(r.dead_value) ? inr2(r.dead_value) : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ minWidth: 90 }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-[#ff8f00]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-[#dcc1ae]">{pct}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No warehouses with stock.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-[#282a2e]">
            <tr>
              <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={3}>Total</td>
              <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr2(total)}</td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------- shared ----------------
function Big({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'emerald' | 'blue' | 'amber'
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'blue' ? 'text-blue-400'
    : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-4">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[22px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/50 mt-0.5">{sub}</div>}
    </div>
  )
}
function D({ label, v, tone, active, onClick }: {
  label: string; v: number; tone: 'red' | 'amber' | 'blue' | 'emerald'; active: boolean; onClick: () => void
}) {
  const c = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'blue' ? 'text-blue-400' : 'text-emerald-400'
  return (
    <button onClick={onClick}
      className={`card p-2.5 text-left transition-colors ${active ? 'border-[#ff8f00]/40 bg-[#ff8f00]/[0.06]' : 'hover:bg-white/[0.04]'} ${!v ? 'opacity-40' : ''}`}>
      <div className="text-[9px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-[17px] font-bold ${v ? c : 'text-[#dcc1ae]/40'}`}>{v}</div>
    </button>
  )
}