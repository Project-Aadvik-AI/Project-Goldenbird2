import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import { VendorContractSummary } from '../components/ContractBalance'
import type { Vendor } from './Vendors'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const inr0 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Proj = {
  project_id: string; project_name: string; project_code: string | null
  project_status: string; first_engaged: string; last_activity: string
  po_count: number; wo_count: number; bill_count: number
  contract_value: number; billed_value: number
}
type WO = {
  wo_id: string; wo_no: string | null; title: string | null; wo_date: string
  start_date: string | null; end_date: string | null
  amount: number; status: string; project_name: string | null
  billed_amount: number; unbilled_amount: number
}
type Bill = {
  bill_id: string; bill_no: string | null; bill_date: string; amount: number
  total_amount: number; status: string; payment_status: string
  project_name: string | null; wo_no: string | null; age_days: number
  uploaded_by_name: string | null; uploaded_at: string | null
  paid_amount: number; paid_date: string | null
}
type Pay = {
  voucher_no: string; voucher_type: string; voucher_date: string
  narration: string | null; contra_ledgers: string | null
  paid: number; billed: number; project_name: string | null
}
type Mat = {
  grn_no: string; delivery_date: string; challan_no: string | null
  project_name: string | null; warehouse_name: string | null
  item_name: string; unit: string | null; qty_delivered: number
  rate: number; value: number; po_no: string | null
  promised_date: string | null; days_late: number | null; received_by: string | null
}
type Perf = {
  total_pos: number; total_po_value: number; total_wos: number
  total_projects: number; total_bills: number; total_bill_value: number
  total_deliveries: number; on_time_deliveries: number; late_deliveries: number
  avg_delay_days: number; on_time_pct: number | null; fulfilment_pct: number | null
  material_supplied_value: number; quality_rating: number | null; overall_rating: number
}
type Event = {
  at: string; event: string; title: string; detail: string | null
}
type Issued = {
  line_id: string; slip_no: string; issue_date: string; expected_return: string | null
  project_name: string | null; item_code: string | null; item_name: string; unit: string | null
  condition_out: string
  qty_issued: number; qty_returned: number; qty_written_off: number; qty_pending: number
  pending_value: number; days_overdue: number | null; status: string
}

const TAB = ['overview', 'projects', 'orders', 'bills', 'payments', 'materials', 'issued', 'timeline'] as const
type Tab = typeof TAB[number]

const STATUS_STYLE: Record<string, string> = {
  // vendor status
  'Active': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Inactive': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
  'Blacklisted': 'bg-red-500/10 text-red-400 border-red-500/25',
  // bill stages (the real pipeline in vendor_bills.stage)
  'Submitted': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Site Verified': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Approved': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Sent to Finance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Paid': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'On Hold': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
  // work order status
  'Draft': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Issued': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Completed': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Cancelled': 'bg-red-500/10 text-red-400 border-red-500/20',
}
const EVENT_ICON: Record<string, string> = {
  created: 'person_add', work_order: 'assignment', purchase_order: 'shopping_cart',
  delivery: 'local_shipping', bill: 'receipt_long',
  blacklisted: 'block', active: 'check_circle', inactive: 'pause_circle',
}

export default function VendorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [v, setV] = useState<Vendor | null>(null)
  const [perf, setPerf] = useState<Perf | null>(null)
  const [projects, setProjects] = useState<Proj[]>([])
  const [wos, setWos] = useState<WO[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [pays, setPays] = useState<Pay[]>([])
  const [mats, setMats] = useState<Mat[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [issued, setIssued] = useState<Issued[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    (async () => {
      setLoading(true)
      const [vm, pf, pj, w, b, p, m, t, ii] = await Promise.all([
        supabase.from('vendor_master').select('*').eq('party_id', id).maybeSingle(),
        supabase.from('vendor_performance').select('*').eq('party_id', id).maybeSingle(),
        supabase.from('vendor_projects').select('*').eq('party_id', id).order('last_activity', { ascending: false }),
        supabase.from('vendor_work_orders').select('*').eq('party_id', id).order('wo_date', { ascending: false }),
        supabase.from('vendor_bill_list').select('*').eq('party_id', id).order('bill_date', { ascending: false }),
        supabase.from('vendor_payments').select('*').eq('party_id', id).order('voucher_date', { ascending: false }),
        supabase.from('vendor_materials').select('*').eq('party_id', id).order('delivery_date', { ascending: false }),
        supabase.from('vendor_timeline').select('*').eq('party_id', id).order('at', { ascending: false }).limit(100),
        supabase.from('vendor_pending_returns').select('*').eq('party_id', id)
          .order('days_overdue', { ascending: false, nullsFirst: false }),
      ])
      setV(vm.data as Vendor)
      setPerf(pf.data as Perf)
      setProjects((pj.data as Proj[]) ?? [])
      setWos((w.data as WO[]) ?? [])
      setBills((b.data as Bill[]) ?? [])
      setPays((p.data as Pay[]) ?? [])
      setMats((m.data as Mat[]) ?? [])
      setEvents((t.data as Event[]) ?? [])
      setIssued((ii.data as Issued[]) ?? [])
      setLoading(false)
    })()
  }, [id])

  const money = useMemo(() => {
    const totalPaid = pays.reduce((n, p) => n + Number(p.paid || 0), 0)
    const totalBilled = pays.reduce((n, p) => n + Number(p.billed || 0), 0)
    return {
      workValue: Number(perf?.total_po_value ?? 0) + wos.reduce((n, w) => n + Number(w.amount || 0), 0),
      billed: totalBilled,
      paid: totalPaid,
      outstanding: totalBilled - totalPaid,
    }
  }, [pays, wos, perf])

  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>
  if (!v) return (
    <div className="p-8 text-center">
      <p className="text-[#dcc1ae]">Vendor not found.</p>
      <button className="btn btn-ghost mt-3" onClick={() => navigate('/vendors')}>Back to Vendors</button>
    </div>
  )

  return (
    <div>
      {/* header */}
      <button className="text-[12px] text-[#dcc1ae] hover:text-[#e2e2e8] mb-3 flex items-center gap-1"
        onClick={() => navigate('/vendors')}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> All Vendors
      </button>

      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{v.name}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLE[v.status]}`}>
                {v.status}
              </span>
              {v.category && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae] border-white/10">
                  {v.category}
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#dcc1ae] mt-1">
              <span className="font-mono">{v.vendor_code}</span>
              {v.company_name && v.company_name !== v.name && ` · ${v.company_name}`}
              {v.city && ` · ${v.city}`}{v.state && `, ${v.state}`}
            </p>
            {v.blacklist_reason && (
              <p className="text-[12px] text-red-400 mt-1">
                <b>Blacklisted:</b> {v.blacklist_reason}
              </p>
            )}
          </div>

          {perf && (
            <div className="text-right">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Overall Rating</div>
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <span className="font-mono text-[26px] font-bold text-[#ffb87b]">
                  {Number(perf.overall_rating).toFixed(1)}
                </span>
                <span className="text-[13px] text-[#dcc1ae]/50">/ 5</span>
              </div>
              {perf.on_time_pct != null && (
                <div className="text-[11px] text-[#dcc1ae]/60">{perf.on_time_pct}% on time</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* the money, at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Total Work Value" value={inr0(money.workValue)} />
        <K label="Total Billed" value={inr0(money.billed)} />
        <K label="Total Paid" value={inr0(money.paid)} tone="emerald" />
        <K label="Outstanding" value={inr0(money.outstanding)}
          tone={money.outstanding > 0 ? 'amber' : undefined} />
      </div>

      {/* tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {TAB.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border capitalize ${
              tab === t ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {t === 'orders' ? `Work Orders (${wos.length})`
              : t === 'projects' ? `Projects (${projects.length})`
              : t === 'bills' ? `Bills (${bills.length})`
              : t === 'materials' ? `Materials (${mats.length})`
              : t === 'payments' ? `Payments (${pays.length})`
              : t === 'issued' ? `Issued Items (${issued.filter(i => Number(i.qty_pending) > 0).length})`
              : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview v={v} perf={perf} />}
      {tab === 'projects' && <Projects rows={projects} />}
      {tab === 'orders' && <WorkOrdersTab rows={wos} />}
      {tab === 'bills' && <BillsTab rows={bills} />}
      {tab === 'payments' && <PaymentsTab rows={pays} />}
      {tab === 'materials' && <MaterialsTab rows={mats} />}
      {tab === 'issued' && <IssuedItems rows={issued} />}
      {tab === 'timeline' && <Timeline rows={events} />}
    </div>
  )
}

// ---------------- Overview ----------------
function Overview({ v, perf }: { v: Vendor; perf: Perf | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* the running contract position across every work order */}
      <div className="lg:col-span-2">
        <VendorContractSummary partyId={v.party_id} />
      </div>

      <div className="card p-5">
        <Sec>Company &amp; Contact</Sec>
        <Row k="Vendor Code" val={v.vendor_code} mono />
        <Row k="Company" val={v.company_name} />
        <Row k="Category" val={v.category} />
        <Row k="Contact Person" val={v.contact_name} />
        <Row k="Phone" val={[v.phone, v.phone_alt].filter(Boolean).join(' · ')} />
        <Row k="Email" val={v.email} />
        <Row k="Address" val={[v.address, v.city, v.state, v.pincode].filter(Boolean).join(', ')} />
      </div>

      <div className="card p-5">
        <Sec>Tax &amp; Bank</Sec>
        <Row k="GSTIN" val={v.gstin} mono />
        <Row k="PAN" val={v.pan} mono />
        <Row k="Bank" val={v.bank_name} />
        <Row k="Account No." val={v.bank_account} mono />
        <Row k="IFSC" val={v.bank_ifsc} mono />
        <Row k="UPI" val={v.upi_id} mono />
      </div>

      {perf && (
        <div className="card p-5 lg:col-span-2">
          <Sec>Performance — calculated from actual activity, not typed in</Sec>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <P label="Projects" v={String(perf.total_projects)} />
            <P label="Purchase Orders" v={String(perf.total_pos)} />
            <P label="Work Orders" v={String(perf.total_wos)} />
            <P label="Bills" v={String(perf.total_bills)} />
            <P label="Deliveries" v={String(perf.total_deliveries)} />
            <P label="On Time" v={perf.on_time_pct != null ? `${perf.on_time_pct}%` : '—'}
              tone={perf.on_time_pct != null && perf.on_time_pct >= 80 ? 'emerald'
                : perf.on_time_pct != null && perf.on_time_pct < 60 ? 'red' : undefined} />
            <P label="Late Deliveries" v={String(perf.late_deliveries)}
              tone={perf.late_deliveries > 0 ? 'red' : undefined} />
            <P label="Avg Delay" v={perf.avg_delay_days ? `${perf.avg_delay_days}d` : '—'} />
            <P label="Fulfilment" v={perf.fulfilment_pct != null ? `${perf.fulfilment_pct}%` : '—'} />
            <P label="Material Supplied" v={inr0(perf.material_supplied_value)} />
            <P label="Quality Rating" v={perf.quality_rating != null ? `${perf.quality_rating} / 5` : 'not rated'} />
            <P label="Overall" v={`${Number(perf.overall_rating).toFixed(1)} / 5`} tone="amber" />
          </div>
          <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
            On-time % counts only deliveries where the purchase order carried a promised date.
            Overall rating = half on-time performance, half quality rating.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------- Projects ----------------
function Projects({ rows }: { rows: Proj[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Projects Worked On</span>
        <ExportButtons filename="vendor-projects" title="Vendor Projects" rows={rows}
          columns={[
            { header: 'Project', get: (r: any) => r.project_name },
            { header: 'Code', get: (r: any) => r.project_code || '—' },
            { header: 'Status', get: (r: any) => r.project_status },
            { header: 'First Engaged', get: (r: any) => r.first_engaged },
            { header: 'Last Activity', get: (r: any) => r.last_activity },
            { header: 'Contract Value', get: (r: any) => Number(r.contract_value) },
            { header: 'Billed', get: (r: any) => Number(r.billed_value) },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Project', 'Status', 'First Engaged', 'Last Activity', 'Orders', 'Contract Value', 'Billed'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.project_id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.project_name}</div>
                {r.project_code && <div className="text-[10px] font-mono text-[#dcc1ae]/60">{r.project_code}</div>}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLE[r.project_status] ?? 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  {r.project_status}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.first_engaged}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.last_activity}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                {r.po_count > 0 && <span>{r.po_count} PO</span>}
                {r.wo_count > 0 && <span>{r.po_count > 0 ? ' · ' : ''}{r.wo_count} WO</span>}
                {r.po_count === 0 && r.wo_count === 0 && '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr0(r.contract_value)}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">{inr0(r.billed_value)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No projects yet — this vendor has no purchase orders, work orders or bills.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Work Orders ----------------
function WorkOrdersTab({ rows }: { rows: WO[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Work Orders</span>
        <ExportButtons filename="vendor-work-orders" title="Vendor Work Orders" rows={rows}
          columns={[
            { header: 'WO No.', get: (r: any) => r.wo_no || '—' },
            { header: 'Date', get: (r: any) => r.wo_date },
            { header: 'Title', get: (r: any) => r.title || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Amount', get: (r: any) => Number(r.amount) },
            { header: 'Billed', get: (r: any) => Number(r.billed_amount) },
            { header: 'Unbilled', get: (r: any) => Number(r.unbilled_amount) },
            { header: 'Status', get: (r: any) => r.status },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['WO No.', 'Date', 'Scope', 'Project', 'Amount', 'Billed', 'Pending', 'Status'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.wo_id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8] font-semibold">{r.wo_no || '—'}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.wo_date}</td>
              <td className="px-4 py-2.5 text-[#dcc1ae] max-w-[200px] truncate" title={r.title ?? ''}>{r.title || '—'}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr0(r.amount)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{inr0(r.billed_amount)}</td>
              <td className={`px-4 py-2.5 font-mono text-right whitespace-nowrap ${Number(r.unbilled_amount) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                {Number(r.unbilled_amount) > 0 ? inr0(r.unbilled_amount) : '—'}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[r.status] ?? 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No work orders.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Bills ----------------
function BillsTab({ rows }: { rows: Bill[] }) {
  const byStatus = (s: string) => rows.filter(r => r.status === s).length
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <K label="Total Bills" value={String(rows.length)} />
        <K label="Awaiting Verification" value={String(byStatus('Submitted'))}
          tone={byStatus('Submitted') ? 'amber' : undefined} />
        <K label="Approved" value={String(byStatus('Approved') + byStatus('Sent to Finance'))} tone="emerald" />
        <K label="Paid" value={String(byStatus('Paid'))} tone="emerald" />
        <K label="Rejected / On Hold" value={String(byStatus('Rejected') + byStatus('On Hold'))}
          tone={byStatus('Rejected') + byStatus('On Hold') ? 'red' : undefined} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Bills</span>
          <ExportButtons filename="vendor-bills" title="Vendor Bills" rows={rows}
            columns={[
              { header: 'Bill No.', get: (r: any) => r.bill_no || '—' },
              { header: 'Date', get: (r: any) => r.bill_date },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
              { header: 'Uploaded By', get: (r: any) => r.uploaded_by_name || '—' },
              { header: 'Uploaded At', get: (r: any) => r.uploaded_at || '—' },
              { header: 'Bill Amount', get: (r: any) => Number(r.amount) },
              { header: 'Total (incl GST)', get: (r: any) => Number(r.total_amount ?? r.amount) },
              { header: 'Paid', get: (r: any) => Number(r.paid_amount || 0) },
              { header: 'Approval Status', get: (r: any) => r.status },
              { header: 'Payment Status', get: (r: any) => r.payment_status },
              { header: 'Age (days)', get: (r: any) => r.age_days },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Bill No.', 'Project', 'Work Order', 'Uploaded By', 'Amount', 'Age', 'Status'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.bill_id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{r.bill_no || '—'}</div>
                  <div className="text-[10px] text-[#dcc1ae]/60">{r.bill_date}</div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.wo_no || '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                  {r.uploaded_by_name || '—'}
                  {r.uploaded_at && (
                    <div className="text-[10px] text-[#dcc1ae]/50">
                      {new Date(r.uploaded_at).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">
                  {inr(r.total_amount ?? r.amount)}
                  {Number(r.paid_amount) > 0 && (
                    <div className="text-[10px] text-emerald-400 font-normal">paid {inr0(r.paid_amount)}</div>
                  )}
                </td>
                <td className={`px-4 py-2.5 font-mono text-right ${r.age_days > 60 ? 'text-red-400' : r.age_days > 30 ? 'text-amber-400' : 'text-[#dcc1ae]'}`}>
                  {r.age_days}d
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[r.status] ?? 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                    {r.status}
                  </span>
                  <div className="text-[10px] text-[#dcc1ae]/60 mt-0.5">{r.payment_status}</div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No bills.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Payments ----------------
function PaymentsTab({ rows }: { rows: Pay[] }) {
  const paid = rows.reduce((n, r) => n + Number(r.paid || 0), 0)
  const billed = rows.reduce((n, r) => n + Number(r.billed || 0), 0)
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <K label="Total Billed to Us" value={inr0(billed)} />
        <K label="Total Paid" value={inr0(paid)} tone="emerald" />
        <K label="Outstanding" value={inr0(billed - paid)} tone={billed - paid > 0 ? 'amber' : undefined} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Payment Timeline — from the accounting ledger</span>
          <ExportButtons filename="vendor-payments" title="Vendor Payments" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.voucher_date },
              { header: 'Voucher', get: (r: any) => r.voucher_no },
              { header: 'Type', get: (r: any) => r.voucher_type },
              { header: 'Particulars', get: (r: any) => r.contra_ledgers || '—' },
              { header: 'Narration', get: (r: any) => r.narration || '—' },
              { header: 'Billed', get: (r: any) => Number(r.billed) },
              { header: 'Paid', get: (r: any) => Number(r.paid) },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Voucher', 'Type', 'Particulars', 'Billed', 'Paid'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.voucher_date}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#e2e2e8]">{r.voucher_no}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.voucher_type}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae] max-w-[200px] truncate">
                  {r.contra_ledgers || '—'}
                  {r.narration && <div className="text-[10px] text-[#dcc1ae]/50 italic truncate">{r.narration}</div>}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                  {Number(r.billed) ? inr(r.billed) : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">
                  {Number(r.paid) ? inr(r.paid) : '—'}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              No accounting entries. Post a vendor bill or payment to see it here.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Materials ----------------
function MaterialsTab({ rows }: { rows: Mat[] }) {
  const late = rows.filter(r => (r.days_late ?? 0) > 0).length
  const totalValue = rows.reduce((n, r) => n + Number(r.value || 0), 0)
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <K label="Deliveries" value={String(rows.length)} />
        <K label="Late Deliveries" value={String(late)} tone={late ? 'red' : 'emerald'} />
        <K label="Total Value" value={inr0(totalValue)} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Material Supplied</span>
          <ExportButtons filename="vendor-materials" title="Vendor Material Supply" rows={rows}
            columns={[
              { header: 'GRN No.', get: (r: any) => r.grn_no },
              { header: 'Delivery Date', get: (r: any) => r.delivery_date },
              { header: 'Challan', get: (r: any) => r.challan_no || '—' },
              { header: 'PO No.', get: (r: any) => r.po_no || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Qty', get: (r: any) => Number(r.qty_delivered) },
              { header: 'Unit', get: (r: any) => r.unit || '—' },
              { header: 'Rate', get: (r: any) => Number(r.rate) },
              { header: 'Value', get: (r: any) => Number(r.value) },
              { header: 'Site', get: (r: any) => r.project_name || '—' },
              { header: 'Warehouse', get: (r: any) => r.warehouse_name || '—' },
              { header: 'Promised', get: (r: any) => r.promised_date || '—' },
              { header: 'Days Late', get: (r: any) => r.days_late ?? '—' },
              { header: 'Received By', get: (r: any) => r.received_by || '—' },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['GRN', 'Date', 'Item', 'Qty', 'Value', 'Site', 'On Time?'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => {
              const isLate = (r.days_late ?? 0) > 0
              return (
                <tr key={i} className={`hover:bg-white/[0.02] ${isLate ? 'bg-red-500/[0.04]' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[12px] text-[#e2e2e8]">{r.grn_no}</div>
                    {r.challan_no && <div className="text-[10px] text-[#dcc1ae]/50">challan {r.challan_no}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.delivery_date}</td>
                  <td className="px-4 py-2.5 text-[#e2e2e8]">{r.item_name}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                    {q(r.qty_delivered)} <span className="text-[10px] text-[#dcc1ae]/60">{r.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr0(r.value)}</td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                    {r.project_name || '—'}
                    {r.warehouse_name && <div className="text-[10px] text-[#dcc1ae]/50">{r.warehouse_name}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.days_late == null ? (
                      <span className="text-[11px] text-[#dcc1ae]/40">no promise date</span>
                    ) : isLate ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/20">
                        {r.days_late}d late
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        on time
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              No material received from this vendor yet. Post a Goods Receipt naming them.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Issued Items (returnable material) ----------------
function IssuedItems({ rows }: { rows: Issued[] }) {
  const pending = rows.filter(r => Number(r.qty_pending) > 0)
  const overdue = rows.filter(r => r.status === 'Overdue')
  const pendingValue = rows.reduce((n, r) => n + Number(r.pending_value || 0), 0)
  const overdueValue = overdue.reduce((n, r) => n + Number(r.pending_value || 0), 0)

  const ST: Record<string, string> = {
    'Returned': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Partially Returned': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'Pending Return': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'Overdue': 'bg-red-500/15 text-red-400 border-red-500/30',
  }

  return (
    <div>
      {overdue.length > 0 && (
        <div className="card p-4 mb-4 bg-red-500/10 border-red-500/25 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '20px' }}>error</span>
          <div>
            <div className="text-[13px] font-bold text-red-400">
              {overdue.length} item(s) OVERDUE — {inr0(overdueValue)} of company material
            </div>
            <div className="text-[12px] text-[#dcc1ae] mt-0.5">
              The expected return date has passed. Chase this vendor.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <K label="Items Issued" value={String(rows.length)} />
        <K label="Fully Returned" value={String(rows.filter(r => r.status === 'Returned').length)} tone="emerald" />
        <K label="Still Pending" value={String(pending.length)}
          tone={pending.length ? 'amber' : undefined} />
        <K label="Pending Value" value={inr0(pendingValue)}
          tone={pendingValue ? 'amber' : undefined} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Returnable Material</span>
          <ExportButtons filename="vendor-issued-items" title="Vendor Issued Items" rows={rows}
            columns={[
              { header: 'Slip No.', get: (r: any) => r.slip_no },
              { header: 'Issue Date', get: (r: any) => r.issue_date },
              { header: 'Item Code', get: (r: any) => r.item_code || '—' },
              { header: 'Item', get: (r: any) => r.item_name },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Condition Out', get: (r: any) => r.condition_out },
              { header: 'Qty Issued', get: (r: any) => Number(r.qty_issued) },
              { header: 'Qty Returned', get: (r: any) => Number(r.qty_returned) },
              { header: 'Qty Pending', get: (r: any) => Number(r.qty_pending) },
              { header: 'Pending Value', get: (r: any) => Number(r.pending_value) },
              { header: 'Expected Return', get: (r: any) => r.expected_return || '—' },
              { header: 'Days Overdue', get: (r: any) => r.days_overdue ?? '—' },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Item', 'Project', 'Issued', 'Returned', 'Pending', 'Expected Return', 'Status'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => {
              const isOverdue = r.status === 'Overdue'
              return (
                <tr key={r.line_id} className={`hover:bg-white/[0.02] ${isOverdue ? 'bg-red-500/[0.06]' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="text-[#e2e2e8] font-semibold">{r.item_name}</div>
                    <div className="text-[10px] font-mono text-[#dcc1ae]/50">
                      {r.slip_no} · {r.issue_date}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.project_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                    {q(r.qty_issued)} <span className="text-[10px]">{r.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">
                    {Number(r.qty_returned) ? q(r.qty_returned) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${
                    Number(r.qty_pending) > 0 ? (isOverdue ? 'text-red-400' : 'text-amber-400') : 'text-[#dcc1ae]/40'}`}>
                    {Number(r.qty_pending) > 0 ? q(r.qty_pending) : '—'}
                    {Number(r.pending_value) > 0 && (
                      <div className="text-[10px] font-normal">{inr0(r.pending_value)}</div>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 font-mono text-[12px] whitespace-nowrap ${isOverdue ? 'text-red-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {r.expected_return || '—'}
                    {isOverdue && <div className="text-[10px]">{r.days_overdue}d late</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${ST[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
              Nothing issued to this vendor.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Timeline ----------------
function Timeline({ rows }: { rows: Event[] }) {
  return (
    <div className="card p-5">
      <Sec>Complete History</Sec>
      <div className="relative pl-6">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/[0.08]" />
        {rows.map((e, i) => (
          <div key={i} className="relative pb-5 last:pb-0">
            <div className="absolute -left-6 top-0.5 h-4 w-4 rounded-full bg-[#1B1F2A] border-2 border-[#ff8f00]/40 flex items-center justify-center">
              <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '10px' }}>
                {EVENT_ICON[e.event] ?? 'circle'}
              </span>
            </div>
            <div className="text-[13px] text-[#e2e2e8] font-semibold">{e.title}</div>
            {e.detail && <div className="text-[12px] text-[#dcc1ae]">{e.detail}</div>}
            <div className="text-[11px] text-[#dcc1ae]/50 mt-0.5">
              {new Date(e.at).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
        ))}
        {!rows.length && <div className="text-[13px] text-[#dcc1ae]/60">No activity yet.</div>}
      </div>
    </div>
  )
}

// ---------------- shared ----------------
function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3 pb-1.5 border-b border-white/[0.06]">{children}</div>
}
function Row({ k, val, mono }: { k: string; val?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-white/[0.03] last:border-0">
      <span className="text-[12px] text-[#dcc1ae]/70 shrink-0">{k}</span>
      <span className={`text-[13px] text-[#e2e2e8] text-right ${mono ? 'font-mono' : ''}`}>
        {val || <span className="text-[#dcc1ae]/30">—</span>}
      </span>
    </div>
  )
}
function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function P({ label, v, tone }: { label: string; v: string; tone?: 'emerald' | 'amber' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-[#ffb87b]'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-[17px] font-bold ${c} mt-0.5`}>{v}</div>
    </div>
  )
}