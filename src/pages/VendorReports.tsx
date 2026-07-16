import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr0 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Out = {
  party_id: string; vendor_code: string | null; vendor_name: string
  category: string | null; status: string; phone: string | null
  total_billed: number; total_paid: number
  outstanding: number; advance_paid: number
  oldest_unpaid_bill: string | null; unpaid_bill_count: number
}
type Led = {
  voucher_no: string; voucher_type: string; voucher_date: string
  narration: string | null; contra_ledgers: string | null
  project_name: string | null
  billed: number; paid: number; running_balance: number
}
type Age = {
  vendor_code: string | null; vendor_name: string; bill_no: string | null
  bill_date: string; stage: string; amount: number
  project_name: string | null; age_days: number; age_bucket: string
}
type Perf = {
  party_id: string; vendor_name: string
  total_projects: number; total_pos: number; total_wos: number
  total_bills: number; total_bill_value: number
  total_deliveries: number; on_time_deliveries: number; late_deliveries: number
  avg_delay_days: number; on_time_pct: number | null; fulfilment_pct: number | null
  material_supplied_value: number; quality_rating: number | null; overall_rating: number
}
type Delay = {
  vendor_name: string; vendor_code: string | null; category: string | null
  po_no: string | null; grn_no: string; item_name: string
  qty_delivered: number; unit: string | null; value: number
  promised_date: string | null; delivery_date: string
  days_late: number | null; delay_bucket: string; project_name: string | null
}
type Cost = {
  vendor_code: string | null; vendor_name: string; category: string | null
  project_name: string | null
  po_value: number; wo_value: number; material_value: number
  billed_value: number; committed_value: number
}

type Rep = 'outstanding' | 'ledger' | 'ageing' | 'performance' | 'delays' | 'cost' | 'documents'
const REPORTS: [Rep, string, string][] = [
  ['outstanding', 'Outstanding', 'Who we owe, and how much'],
  ['ledger', 'Vendor Ledger', 'Every entry for one vendor, with a running balance'],
  ['ageing', 'Ageing', 'Unpaid bills bucketed by age'],
  ['performance', 'Performance', 'On-time delivery, fulfilment and rating'],
  ['delays', 'Delay Analysis', 'Every late delivery, and by how many days'],
  ['cost', 'Project Cost', 'What each vendor cost each project'],
  ['documents', 'Expiring Documents', 'GST certificates, licences and agreements about to lapse'],
]

const BUCKET_STYLE: Record<string, string> = {
  '0-30': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  '31-60': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  '61-90': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  '90+': 'bg-red-500/10 text-red-400 border-red-500/25',
  'On time': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'No promise date': 'bg-white/5 text-[#dcc1ae]/50 border-white/10',
  'Late (1-7 days)': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Late (8-15 days)': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Late (16-30 days)': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Very late (30+ days)': 'bg-red-500/15 text-red-400 border-red-500/30',
}

export default function VendorReports() {
  const { isAdmin, can } = useAuth()
  const [rep, setRep] = useState<Rep>('outstanding')
  const [loading, setLoading] = useState(true)

  const [out, setOut] = useState<Out[]>([])
  const [ageing, setAgeing] = useState<Age[]>([])
  const [perf, setPerf] = useState<Perf[]>([])
  const [delays, setDelays] = useState<Delay[]>([])
  const [cost, setCost] = useState<Cost[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [ledger, setLedger] = useState<Led[]>([])
  const [vendorId, setVendorId] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [o, a, p, d, c, dc] = await Promise.all([
        supabase.from('vendor_outstanding').select('*').order('outstanding', { ascending: false }),
        supabase.from('vendor_ageing').select('*').order('age_days', { ascending: false }),
        supabase.from('vendor_performance').select('*').order('overall_rating', { ascending: false }),
        supabase.from('vendor_delay_analysis').select('*').order('days_late', { ascending: false, nullsFirst: false }),
        supabase.from('vendor_project_cost').select('*').order('committed_value', { ascending: false }),
        supabase.from('vendor_expiring_documents').select('*').order('days_left'),
      ])
      setOut((o.data as Out[]) ?? [])
      setAgeing((a.data as Age[]) ?? [])
      setPerf((p.data as Perf[]) ?? [])
      setDelays((d.data as Delay[]) ?? [])
      setCost((c.data as Cost[]) ?? [])
      setDocs((dc.data as any[]) ?? [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (rep !== 'ledger' || !vendorId) { setLedger([]); return }
    (async () => {
      const { data } = await supabase.from('vendor_ledger').select('*')
        .eq('party_id', vendorId)
        .order('voucher_date')
      setLedger((data as Led[]) ?? [])
    })()
  }, [rep, vendorId])

  const totals = useMemo(() => ({
    payable: r2(out.reduce((n, o) => n + Number(o.outstanding || 0), 0)),
    advances: r2(out.reduce((n, o) => n + Number(o.advance_paid || 0), 0)),
    over90: r2(ageing.filter(a => a.age_bucket === '90+').reduce((n, a) => n + Number(a.amount || 0), 0)),
    lateDeliveries: delays.filter(d => (d.days_late ?? 0) > 0).length,
  }), [out, ageing, delays])

  if (!isAdmin && !can('vendor_reports', 'view')) return <div className="p-8 text-center text-[#dcc1ae]">Vendor reports are restricted to administrators.</div>
  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>

  const meta = REPORTS.find(r => r[0] === rep)!

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Built from purchase orders, work orders, bills, goods receipts and the accounting ledger.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Total Payable" value={inr0(totals.payable)} tone={totals.payable ? 'amber' : undefined} />
        <K label="Overdue 90+ days" value={inr0(totals.over90)} tone={totals.over90 ? 'red' : undefined} />
        <K label="Advances Paid" value={inr0(totals.advances)} />
        <K label="Late Deliveries" value={String(totals.lateDeliveries)} tone={totals.lateDeliveries ? 'red' : 'emerald'} />
      </div>

      <div className="card p-4 mb-5 flex flex-wrap gap-3 items-end">
        <L label="Report">
          <select className="input" value={rep} onChange={e => setRep(e.target.value as Rep)} style={{ minWidth: 190 }}>
            {REPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </L>
        {rep === 'ledger' && (
          <L label="Vendor *">
            <select className="input" value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">— Select a vendor —</option>
              {out.map(o => (
                <option key={o.party_id} value={o.party_id}>
                  {o.vendor_name}{o.vendor_code ? ` (${o.vendor_code})` : ''}
                </option>
              ))}
            </select>
          </L>
        )}
      </div>

      <p className="text-[12px] text-[#dcc1ae]/60 mb-4">{meta[2]}</p>

      {rep === 'outstanding' && <Outstanding rows={out} />}
      {rep === 'ledger' && <Ledger rows={ledger} hasVendor={!!vendorId}
        name={out.find(o => o.party_id === vendorId)?.vendor_name ?? ''} />}
      {rep === 'ageing' && <Ageing rows={ageing} />}
      {rep === 'performance' && <Performance rows={perf} />}
      {rep === 'delays' && <Delays rows={delays} />}
      {rep === 'cost' && <ProjectCost rows={cost} />}
      {rep === 'documents' && <ExpiringDocs rows={docs} />}
    </div>
  )
}

// ---------------- Outstanding ----------------
function Outstanding({ rows }: { rows: Out[] }) {
  const owed = rows.filter(r => Number(r.outstanding) > 0)
  const total = r2(owed.reduce((n, r) => n + Number(r.outstanding), 0))
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Vendor Outstanding — {inr0(total)}</span>
        <ExportButtons filename="vendor-outstanding" title="Vendor Outstanding" rows={rows}
          columns={[
            { header: 'Code', get: (r: any) => r.vendor_code || '—' },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Category', get: (r: any) => r.category || '—' },
            { header: 'Phone', get: (r: any) => r.phone || '—' },
            { header: 'Total Billed', get: (r: any) => Number(r.total_billed) },
            { header: 'Total Paid', get: (r: any) => Number(r.total_paid) },
            { header: 'Outstanding', get: (r: any) => Number(r.outstanding) },
            { header: 'Advance Paid', get: (r: any) => Number(r.advance_paid) },
            { header: 'Unpaid Bills', get: (r: any) => Number(r.unpaid_bill_count) },
            { header: 'Oldest Unpaid', get: (r: any) => r.oldest_unpaid_bill || '—' },
          ]} />
          <PrintButton />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Category', 'Billed', 'Paid', 'Outstanding', 'Unpaid Bills', 'Oldest'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.party_id} className={`hover:bg-white/[0.02] ${Number(r.outstanding) > 0 ? '' : 'opacity-50'}`}>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                {r.vendor_code && <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.vendor_code}</div>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.category || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr0(r.total_billed)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{inr0(r.total_paid)}</td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(r.outstanding) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                {Number(r.outstanding) > 0 ? inr(r.outstanding) : '—'}
                {Number(r.advance_paid) > 0 && (
                  <div className="text-[10px] text-blue-400 font-normal">advance {inr0(r.advance_paid)}</div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.unpaid_bill_count || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.oldest_unpaid_bill || '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No vendors.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-[#282a2e]"><tr>
            <td className="px-4 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={4}>Total Payable</td>
            <td className="px-4 py-3 font-mono font-bold text-amber-400 text-right whitespace-nowrap">{inr(total)}</td>
            <td colSpan={2} />
          </tr></tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------- Ledger ----------------
function Ledger({ rows, hasVendor, name }: { rows: Led[]; hasVendor: boolean; name: string }) {
  if (!hasVendor) return <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">Select a vendor above.</div>
  const closing = rows.length ? Number(rows[rows.length - 1].running_balance) : 0
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">{name}</span>
          <span className="text-[12px] text-[#dcc1ae] ml-3">
            Closing: <b className={closing > 0 ? 'text-amber-400' : 'text-[#e2e2e8]'}>
              {inr(Math.abs(closing))} {closing > 0 ? 'payable' : closing < 0 ? 'advance' : ''}
            </b>
          </span>
        </div>
        <ExportButtons filename="vendor-ledger" title={`Vendor Ledger — ${name}`} rows={rows}
          columns={[
            { header: 'Date', get: (r: any) => r.voucher_date },
            { header: 'Voucher', get: (r: any) => r.voucher_no },
            { header: 'Type', get: (r: any) => r.voucher_type },
            { header: 'Particulars', get: (r: any) => r.contra_ledgers || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Billed', get: (r: any) => Number(r.billed) },
            { header: 'Paid', get: (r: any) => Number(r.paid) },
            { header: 'Balance', get: (r: any) => Number(r.running_balance) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Date', 'Voucher', 'Particulars', 'Project', 'Billed', 'Paid', 'Balance'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.voucher_no}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae] max-w-[200px]">
                <div className="truncate">{r.contra_ledgers || '—'}</div>
                {r.narration && <div className="text-[10px] text-[#dcc1ae]/50 italic truncate">{r.narration}</div>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {Number(r.billed) ? inr(r.billed) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(r.paid) ? inr(r.paid) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right whitespace-nowrap">
                {inr(Math.abs(Number(r.running_balance)))}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No accounting entries for this vendor yet.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Ageing ----------------
function Ageing({ rows }: { rows: Age[] }) {
  const bucket = (b: string) => rows.filter(r => r.age_bucket === b)
  const val = (b: string) => r2(bucket(b).reduce((n, r) => n + Number(r.amount || 0), 0))
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {['0-30', '31-60', '61-90', '90+'].map(b => (
          <div key={b} className={`card p-3 ${b === '90+' && val(b) > 0 ? 'border-red-500/20 bg-red-500/[0.04]' : ''}`}>
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{b} days</div>
            <div className={`font-mono text-[17px] font-bold ${b === '90+' ? 'text-red-400' : b === '61-90' ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>
              {inr0(val(b))}
            </div>
            <div className="text-[11px] text-[#dcc1ae]/50">{bucket(b).length} bill(s)</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Unpaid Bills by Age</span>
          <ExportButtons filename="vendor-ageing" title="Vendor Ageing" rows={rows}
            columns={[
              { header: 'Vendor', get: (r: any) => r.vendor_name },
              { header: 'Bill No.', get: (r: any) => r.bill_no || '—' },
              { header: 'Bill Date', get: (r: any) => r.bill_date },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Stage', get: (r: any) => r.stage },
              { header: 'Amount', get: (r: any) => Number(r.amount) },
              { header: 'Age (days)', get: (r: any) => r.age_days },
              { header: 'Bucket', get: (r: any) => r.age_bucket },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Vendor', 'Bill No.', 'Date', 'Project', 'Stage', 'Amount', 'Age'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => (
              <tr key={i} className={`hover:bg-white/[0.02] ${r.age_bucket === '90+' ? 'bg-red-500/[0.05]' : ''}`}>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.vendor_name}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.bill_no || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.bill_date}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.stage}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.amount)}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${BUCKET_STYLE[r.age_bucket]}`}>
                    {r.age_days}d
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
              ✓ No unpaid bills.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Performance ----------------
function Performance({ rows }: { rows: Perf[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Vendor Performance</span>
        <ExportButtons filename="vendor-performance" title="Vendor Performance" rows={rows}
          columns={[
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Projects', get: (r: any) => Number(r.total_projects) },
            { header: 'Purchase Orders', get: (r: any) => Number(r.total_pos) },
            { header: 'Work Orders', get: (r: any) => Number(r.total_wos) },
            { header: 'Bills', get: (r: any) => Number(r.total_bills) },
            { header: 'Bill Value', get: (r: any) => Number(r.total_bill_value) },
            { header: 'Deliveries', get: (r: any) => Number(r.total_deliveries) },
            { header: 'On Time', get: (r: any) => Number(r.on_time_deliveries) },
            { header: 'Late', get: (r: any) => Number(r.late_deliveries) },
            { header: 'On-Time %', get: (r: any) => r.on_time_pct ?? '—' },
            { header: 'Avg Delay (days)', get: (r: any) => Number(r.avg_delay_days) },
            { header: 'Fulfilment %', get: (r: any) => r.fulfilment_pct ?? '—' },
            { header: 'Quality Rating', get: (r: any) => r.quality_rating ?? '—' },
            { header: 'Overall Rating', get: (r: any) => Number(r.overall_rating) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Projects', 'Orders', 'Deliveries', 'On Time', 'Late', 'Avg Delay', 'Overall'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => {
            const poor = r.on_time_pct != null && r.on_time_pct < 60
            return (
              <tr key={r.party_id} className={`hover:bg-white/[0.02] ${poor ? 'bg-red-500/[0.04]' : ''}`}>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.vendor_name}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.total_projects}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.total_pos + r.total_wos}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.total_deliveries}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.on_time_pct != null ? (
                    <span className={`font-mono font-bold ${r.on_time_pct >= 80 ? 'text-emerald-400' : r.on_time_pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {r.on_time_pct}%
                    </span>
                  ) : <span className="text-[#dcc1ae]/30">—</span>}
                </td>
                <td className={`px-4 py-2.5 font-mono text-right ${r.late_deliveries > 0 ? 'text-red-400' : 'text-[#dcc1ae]/40'}`}>
                  {r.late_deliveries || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">
                  {Number(r.avg_delay_days) ? `${r.avg_delay_days}d` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="font-mono text-[15px] font-bold text-[#ffb87b]">
                    {Number(r.overall_rating).toFixed(1)}
                  </span>
                  <span className="text-[11px] text-[#dcc1ae]/40"> / 5</span>
                </td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No vendors.</td></tr>}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[11px] text-[#dcc1ae]/50 border-t border-white/5">
        On-time % counts only deliveries where the purchase order carried a promised date.
      </p>
    </div>
  )
}

// ---------------- Delays ----------------
function Delays({ rows }: { rows: Delay[] }) {
  const late = rows.filter(r => (r.days_late ?? 0) > 0)
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          Delay Analysis — {late.length} late of {rows.length} deliveries
        </span>
        <ExportButtons filename="vendor-delays" title="Vendor Delay Analysis" rows={rows}
          columns={[
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'PO No.', get: (r: any) => r.po_no || '—' },
            { header: 'GRN No.', get: (r: any) => r.grn_no },
            { header: 'Item', get: (r: any) => r.item_name },
            { header: 'Qty', get: (r: any) => Number(r.qty_delivered) },
            { header: 'Value', get: (r: any) => Number(r.value) },
            { header: 'Promised', get: (r: any) => r.promised_date || '—' },
            { header: 'Delivered', get: (r: any) => r.delivery_date },
            { header: 'Days Late', get: (r: any) => r.days_late ?? '—' },
            { header: 'Bucket', get: (r: any) => r.delay_bucket },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Item', 'PO / GRN', 'Promised', 'Delivered', 'Delay', 'Value'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => {
            const isLate = (r.days_late ?? 0) > 0
            return (
              <tr key={i} className={`hover:bg-white/[0.02] ${isLate ? 'bg-red-500/[0.04]' : ''}`}>
                <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.vendor_name}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">
                  {r.item_name}
                  <div className="text-[10px] text-[#dcc1ae]/50">{q(r.qty_delivered)} {r.unit}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[#dcc1ae]">
                  {r.po_no || '—'}
                  <div className="text-[10px] text-[#dcc1ae]/50">{r.grn_no}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.promised_date || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.delivery_date}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${BUCKET_STYLE[r.delay_bucket] ?? ''}`}>
                    {r.delay_bucket}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr0(r.value)}</td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No deliveries yet.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Project Cost ----------------
function ProjectCost({ rows }: { rows: Cost[] }) {
  const total = r2(rows.reduce((n, r) => n + Number(r.committed_value || 0), 0))
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Vendor Cost by Project — {inr0(total)} committed</span>
        <ExportButtons filename="vendor-project-cost" title="Vendor Cost by Project" rows={rows}
          columns={[
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Category', get: (r: any) => r.category || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'PO Value', get: (r: any) => Number(r.po_value) },
            { header: 'WO Value', get: (r: any) => Number(r.wo_value) },
            { header: 'Committed', get: (r: any) => Number(r.committed_value) },
            { header: 'Material Delivered', get: (r: any) => Number(r.material_value) },
            { header: 'Billed', get: (r: any) => Number(r.billed_value) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Project', 'PO Value', 'WO Value', 'Committed', 'Delivered', 'Billed'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                {r.category && <div className="text-[10px] text-[#dcc1ae]/50">{r.category}</div>}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {Number(r.po_value) ? inr0(r.po_value) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {Number(r.wo_value) ? inr0(r.wo_value) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr0(r.committed_value)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(r.material_value) ? inr0(r.material_value) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {Number(r.billed_value) ? inr0(r.billed_value) : '—'}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No vendor activity.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function ExpiringDocs({ rows }: { rows: any[] }) {
  const expired = rows.filter(r => r.status === 'Expired')
  const soon = rows.filter(r => r.status === 'Expiring Soon')
  return (
    <div>
      {(expired.length > 0 || soon.length > 0) && (
        <div className={`card p-3 mb-4 ${expired.length ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <div className="text-[13px]">
            {expired.length > 0 && (
              <div className="text-red-400 font-bold">
                {expired.length} document(s) have EXPIRED — chase these vendors for renewed copies.
              </div>
            )}
            {soon.length > 0 && (
              <div className="text-amber-400">{soon.length} expiring within 30 days.</div>
            )}
          </div>
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Vendor Documents by Expiry</span>
          <div className="flex gap-2">
            <ExportButtons filename="expiring-documents" title="Expiring Vendor Documents" rows={rows}
              columns={[
                { header: 'Vendor', get: (r: any) => r.vendor_name },
                { header: 'Code', get: (r: any) => r.vendor_code || '—' },
                { header: 'Phone', get: (r: any) => r.phone || '—' },
                { header: 'Document', get: (r: any) => r.doc_type },
                { header: 'Number', get: (r: any) => r.doc_number || '—' },
                { header: 'Issued', get: (r: any) => r.issue_date || '—' },
                { header: 'Expires', get: (r: any) => r.expiry_date },
                { header: 'Days Left', get: (r: any) => r.days_left },
                { header: 'Status', get: (r: any) => r.status },
              ]} />
            <PrintButton />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Vendor', 'Document', 'Number', 'Expires', 'Status'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => {
              const isExpired = r.status === 'Expired'
              return (
                <tr key={r.doc_id} className={`hover:bg-white/[0.02] ${isExpired ? 'bg-red-500/[0.06]' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                    {r.phone && <div className="text-[11px] text-[#dcc1ae]/60">{r.phone}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">
                    {r.doc_type}
                    {r.version > 1 && <span className="text-[10px] text-[#dcc1ae]/50 ml-1">v{r.version}</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.doc_number || '—'}</td>
                  <td className={`px-4 py-2.5 font-mono text-[12px] ${isExpired ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {r.expiry_date}
                    <div className="text-[10px]">
                      {r.days_left < 0 ? `${Math.abs(r.days_left)}d ago` : `${r.days_left}d left`}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                      isExpired ? 'bg-red-500/10 text-red-400 border-red-500/25'
                        : r.status === 'Expiring Soon' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
              ✓ No documents with an expiry date.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' | 'emerald' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400'
    : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}