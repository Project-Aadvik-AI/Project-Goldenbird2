import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'

const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Batch = {
  batch_id: string; batch_no: string; lot_no: string | null
  item_id: string; item_code: string | null; item_name: string
  is_expiry_controlled: boolean; unit: string | null
  warehouse_id: string; warehouse_name: string
  project_id: string | null; project_name: string | null
  mfg_date: string | null; expiry_date: string | null; received_date: string
  balance_qty: number; balance_value: number; avg_rate: number
  stock_age_days: number; days_to_expiry: number | null
}
type Alert = Batch & { expiry_bucket: string; severity: number }

const BUCKET_STYLE: Record<string, string> = {
  'Expired': 'bg-red-500/15 text-red-400 border-red-500/30',
  'Expires Today': 'bg-red-500/10 text-red-400 border-red-500/25',
  'Within 7 days': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Within 15 days': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Within 30 days': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Within 60 days': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Within 90 days': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'OK': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

type Tab = 'expiry' | 'batches'

export default function BatchExpiry() {
  const { isAdmin, can } = useAuth()
  const [tab, setTab] = useState<Tab>('expiry')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [fBucket, setFBucket] = useState('')
  const [fWh, setFWh] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const [q_, setQ_] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: a }, { data: b }, { data: w }] = await Promise.all([
        supabase.from('inv_expiry_alerts').select('*').order('severity').order('expiry_date'),
        supabase.from('inv_batch_balance').select('*').order('received_date', { ascending: false }),
        supabase.from('inv_warehouses').select('id, name').eq('active', true).order('name'),
      ])
      setAlerts((a as Alert[]) ?? [])
      setBatches((b as Batch[]) ?? [])
      setWarehouses((w as any[]) ?? [])
      setLoading(false)
    })()
  }, [])

  // only the buckets that need attention
  const attention = useMemo(() => alerts.filter(a => a.expiry_bucket !== 'OK'), [alerts])

  const summary = useMemo(() => {
    const g = (bucket: string) => attention.filter(a => a.expiry_bucket === bucket)
    const val = (rows: Alert[]) => r2(rows.reduce((n, r) => n + Number(r.balance_value || 0), 0))
    const expired = alerts.filter(a => (a.days_to_expiry ?? 1) < 0)
    const in30 = alerts.filter(a => (a.days_to_expiry ?? 999) >= 0 && (a.days_to_expiry ?? 999) <= 30)
    const in90 = alerts.filter(a => (a.days_to_expiry ?? 999) > 30 && (a.days_to_expiry ?? 999) <= 90)
    return {
      expired: expired.length, expiredValue: val(expired),
      in30: in30.length, in30Value: val(in30),
      in90: in90.length,
      totalBatches: batches.length,
    }
  }, [alerts, attention, batches])

  const shownAlerts = useMemo(() => attention.filter(a => {
    if (fBucket && a.expiry_bucket !== fBucket) return false
    if (fWh && a.warehouse_id !== fWh) return false
    const s = q_.trim().toLowerCase()
    if (s && !`${a.item_name} ${a.batch_no}`.toLowerCase().includes(s)) return false
    return true
  }), [attention, fBucket, fWh, q_])

  const shownBatches = useMemo(() => batches.filter(b => {
    if (fWh && b.warehouse_id !== fWh) return false
    const s = q_.trim().toLowerCase()
    if (s && !`${b.item_name} ${b.batch_no}`.toLowerCase().includes(s)) return false
    return true
  }), [batches, fWh, q_])

  if (!isAdmin && !can('store', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">You don't have permission to view batches.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Batches &amp; Expiry</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Every batch, its age, and what is about to expire. Expiry-controlled items are always issued FEFO.
        </p>
      </div>

      {/* the alarm that matters */}
      {summary.expired > 0 && (
        <div className="card p-4 mb-4 bg-red-500/10 border-red-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-red-400" style={{ fontSize: '20px' }}>error</span>
            <div>
              <div className="text-[13px] font-bold text-red-400">
                {summary.expired} batch(es) have EXPIRED — {inr(summary.expiredValue)} of stock
              </div>
              <div className="text-[12px] text-[#dcc1ae] mt-1">
                Expired material should be written off with a Stock Adjustment (reason: expired), not issued.
              </div>
            </div>
          </div>
        </div>
      )}
      {summary.in30 > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{summary.in30} batch(es) expire within 30 days</b>
            <span className="text-[#dcc1ae]"> — {inr(summary.in30Value)}. Use them first (FEFO).</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Expired" value={String(summary.expired)} tone={summary.expired ? 'red' : 'emerald'} />
        <K label="Expiring ≤30 days" value={String(summary.in30)} tone={summary.in30 ? 'amber' : 'emerald'} />
        <K label="Expiring ≤90 days" value={String(summary.in90)} />
        <K label="Total Batches" value={String(summary.totalBatches)} />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap items-center">
        {([['expiry', `Expiry Alerts (${attention.length})`], ['batches', `Batch Register (${batches.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <input className="input" style={{ maxWidth: 200, padding: '6px 10px', fontSize: '13px' }}
            value={q_} onChange={e => setQ_(e.target.value)} placeholder="Search item or batch…" />
          <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fWh} onChange={e => setFWh(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {tab === 'expiry' && (
            <select className="input" style={{ padding: '6px 10px', fontSize: '13px' }} value={fBucket} onChange={e => setFBucket(e.target.value)}>
              <option value="">All buckets</option>
              {['Expired', 'Expires Today', 'Within 7 days', 'Within 15 days', 'Within 30 days', 'Within 60 days', 'Within 90 days'].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : tab === 'expiry' ? (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Expiry Alerts</span>
            <ExportButtons filename="expiry-report" title="Expiry Report" rows={shownAlerts}
              columns={[
                { header: 'Status', get: (r: any) => r.expiry_bucket },
                { header: 'Item Code', get: (r: any) => r.item_code || '—' },
                { header: 'Item', get: (r: any) => r.item_name },
                { header: 'Batch', get: (r: any) => r.batch_no },
                { header: 'Warehouse', get: (r: any) => r.warehouse_name },
                { header: 'Site', get: (r: any) => r.project_name || '—' },
                { header: 'Mfg Date', get: (r: any) => r.mfg_date || '—' },
                { header: 'Expiry Date', get: (r: any) => r.expiry_date || '—' },
                { header: 'Days to Expiry', get: (r: any) => r.days_to_expiry ?? '—' },
                { header: 'Balance Qty', get: (r: any) => Number(r.balance_qty) },
                { header: 'Unit', get: (r: any) => r.unit || '—' },
                { header: 'Value', get: (r: any) => Number(r.balance_value) },
              ]} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Status', 'Item', 'Batch', 'Warehouse / Site', 'Expiry Date', 'Days Left', 'Balance', 'Value'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {shownAlerts.map(a => {
                const expired = (a.days_to_expiry ?? 1) < 0
                const soon = (a.days_to_expiry ?? 999) <= 30
                return (
                  <tr key={a.batch_id + a.warehouse_id}
                    className={`hover:bg-white/[0.02] ${expired ? 'bg-red-500/[0.08]' : soon ? 'bg-amber-500/[0.05]' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${BUCKET_STYLE[a.expiry_bucket] || ''}`}>
                        {a.expiry_bucket}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{a.item_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{a.batch_no}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">
                      {a.warehouse_name}
                      {a.project_name && <div className="text-[10px] text-[#dcc1ae]/50">{a.project_name}</div>}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-[12px] ${expired ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                      {a.expiry_date}
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-bold text-right ${expired ? 'text-red-400' : soon ? 'text-amber-400' : 'text-[#dcc1ae]'}`}>
                      {a.days_to_expiry != null
                        ? (a.days_to_expiry < 0 ? `${Math.abs(a.days_to_expiry)}d ago` : `${a.days_to_expiry}d`)
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">
                      {q(a.balance_qty)} {a.unit}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(a.balance_value)}</td>
                  </tr>
                )
              })}
              {!shownAlerts.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
                ✓ Nothing expiring within 90 days.
              </td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Batch Register</span>
            <ExportButtons filename="batch-register" title="Batch Register" rows={shownBatches}
              columns={[
                { header: 'Item Code', get: (r: any) => r.item_code || '—' },
                { header: 'Item', get: (r: any) => r.item_name },
                { header: 'Batch No.', get: (r: any) => r.batch_no },
                { header: 'Lot No.', get: (r: any) => r.lot_no || '—' },
                { header: 'Warehouse', get: (r: any) => r.warehouse_name },
                { header: 'Site', get: (r: any) => r.project_name || '—' },
                { header: 'Received', get: (r: any) => r.received_date },
                { header: 'Stock Age (days)', get: (r: any) => r.stock_age_days },
                { header: 'Mfg Date', get: (r: any) => r.mfg_date || '—' },
                { header: 'Expiry Date', get: (r: any) => r.expiry_date || '—' },
                { header: 'Balance Qty', get: (r: any) => Number(r.balance_qty) },
                { header: 'Rate', get: (r: any) => Number(r.avg_rate) },
                { header: 'Value', get: (r: any) => Number(r.balance_value) },
              ]} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Item', 'Batch', 'Warehouse', 'Received', 'Age', 'Expiry', 'Balance', 'Rate', 'Value'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {shownBatches.map(b => (
                <tr key={b.batch_id + b.warehouse_id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">
                    {b.item_name}
                    {b.is_expiry_controlled && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">expiry</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">
                    {b.batch_no}
                    {b.lot_no && <div className="text-[10px] text-[#dcc1ae]/50">Lot {b.lot_no}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae] text-[12px]">{b.warehouse_name}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{b.received_date}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{b.stock_age_days}d</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{b.expiry_date || '—'}</td>
                  <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{q(b.balance_qty)} {b.unit}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr(b.avg_rate)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(b.balance_value)}</td>
                </tr>
              ))}
              {!shownBatches.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No batches yet. Enter a batch number on a Goods Receipt line to start tracking.
              </td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'amber' | 'emerald' }) {
  const c = tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[20px] font-bold ${c}`}>{value}</div>
    </div>
  )
}