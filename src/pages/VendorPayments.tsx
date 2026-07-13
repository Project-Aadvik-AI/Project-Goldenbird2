import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr0 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Vendor = { id: string; name: string; vendor_code: string | null }
type Ledger = { id: string; name: string }
type Due = {
  bill_id: string; party_id: string; vendor_name: string; vendor_code: string | null
  bill_no: string | null; bill_date: string; stage: string
  project_name: string | null; wo_no: string | null
  gross: number; retention: number; tds: number; net_payable: number
  paid: number; advance_adjusted: number; amount_due: number; age_days: number
}
type Adv = {
  advance_id: string; party_id: string; vendor_name: string; vendor_code: string | null
  advance_no: string; advance_date: string; amount: number
  adjusted_amount: number; remaining: number
  pay_mode: string; reference_no: string | null
  project_name: string | null; wo_no: string | null
  voucher_no: string | null; status: string; created_by_name: string | null
}
type Pay = {
  payment_id: string; vendor_name: string; vendor_code: string | null
  payment_no: string; payment_date: string; amount: number
  pay_mode: string; reference_no: string | null
  bill_no: string | null; project_name: string | null
  voucher_no: string | null; paid_from: string | null; created_by_name: string | null
}
type Ret = {
  party_id: string; vendor_name: string; vendor_code: string | null
  wo_id: string | null; wo_no: string | null; wo_status: string | null
  project_name: string | null
  retention_held: number; retention_released: number
  retention_balance: number; final_released: boolean
}

type Tab = 'due' | 'advances' | 'payments' | 'retention'

const MODES = ['Bank', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash']

export default function VendorPayments() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('due')
  const [due, setDue] = useState<Due[]>([])
  const [advs, setAdvs] = useState<Adv[]>([])
  const [pays, setPays] = useState<Pay[]>([])
  const [rets, setRets] = useState<Ret[]>([])
  const [loading, setLoading] = useState(true)

  const [payFor, setPayFor] = useState<Due | null>(null)
  const [adjustFor, setAdjustFor] = useState<Due | null>(null)
  const [showAdvance, setShowAdvance] = useState(false)
  const [releaseFor, setReleaseFor] = useState<Ret | null>(null)

  async function load() {
    setLoading(true)
    const [d, a, p, r] = await Promise.all([
      supabase.from('vendor_bill_due').select('*').order('age_days', { ascending: false }),
      supabase.from('vendor_advance_list').select('*').order('advance_date', { ascending: false }),
      supabase.from('vendor_payment_list').select('*').order('payment_date', { ascending: false }),
      supabase.from('vendor_retention_summary').select('*').order('retention_balance', { ascending: false }),
    ])
    setDue((d.data as Due[]) ?? [])
    setAdvs((a.data as Adv[]) ?? [])
    setPays((p.data as Pay[]) ?? [])
    setRets((r.data as Ret[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const kpi = useMemo(() => ({
    payable: r2(due.reduce((n, d) => n + Number(d.amount_due || 0), 0)),
    overdue: r2(due.filter(d => d.age_days > 45).reduce((n, d) => n + Number(d.amount_due || 0), 0)),
    advanceOut: r2(advs.reduce((n, a) => n + Number(a.remaining || 0), 0)),
    retentionHeld: r2(rets.reduce((n, r) => n + Number(r.retention_balance || 0), 0)),
    paidTotal: r2(pays.reduce((n, p) => n + Number(p.amount || 0), 0)),
  }), [due, advs, pays, rets])

  if (!isAdmin) {
    return <div className="p-8 text-center text-[#dcc1ae]">
      Vendor payments are restricted to Head Office and Accounts.
    </div>
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Payments</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Advances, payments and retention — all posted to the double-entry ledger automatically.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdvance(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span> Pay Advance
        </button>
      </div>

      {kpi.retentionHeld > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>savings</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{inr0(kpi.retentionHeld)} of retention is held</b>
            <span className="text-[#dcc1ae]"> — this is the vendors' money. Release it at contract close.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Payable Now" value={inr0(kpi.payable)} tone={kpi.payable ? 'amber' : undefined} />
        <K label="Overdue 45+ days" value={inr0(kpi.overdue)} tone={kpi.overdue ? 'red' : undefined} />
        <K label="Advance Outstanding" value={inr0(kpi.advanceOut)} tone="blue" />
        <K label="Retention Held" value={inr0(kpi.retentionHeld)} />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {([['due', `Bills Due (${due.filter(d => Number(d.amount_due) > 0.01).length})`],
           ['advances', `Advances (${advs.length})`],
           ['payments', `Payments (${pays.length})`],
           ['retention', `Retention (${rets.filter(r => Number(r.retention_balance) > 0).length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {tab === 'due' && <BillsDue rows={due} onPay={setPayFor} onAdjust={setAdjustFor} />}
          {tab === 'advances' && <Advances rows={advs} />}
          {tab === 'payments' && <Payments rows={pays} />}
          {tab === 'retention' && <Retention rows={rets} onRelease={setReleaseFor} />}
        </>
      )}

      {payFor && <PayModal d={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load() }} />}
      {adjustFor && <AdjustModal d={adjustFor} advances={advs.filter(a => a.party_id === adjustFor.party_id && Number(a.remaining) > 0)}
        onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); load() }} />}
      {showAdvance && <AdvanceModal onClose={() => setShowAdvance(false)} onDone={() => { setShowAdvance(false); load() }} />}
      {releaseFor && <ReleaseModal r={releaseFor} onClose={() => setReleaseFor(null)} onDone={() => { setReleaseFor(null); load() }} />}
    </div>
  )
}

// ---------------- Bills due ----------------
function BillsDue({ rows, onPay, onAdjust }: {
  rows: Due[]; onPay: (d: Due) => void; onAdjust: (d: Due) => void
}) {
  const open = rows.filter(r => Number(r.amount_due) > 0.01)
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Approved Bills — what we owe</span>
        <ExportButtons filename="bills-due" title="Vendor Bills Due" rows={rows}
          columns={[
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Bill No.', get: (r: any) => r.bill_no || '—' },
            { header: 'Bill Date', get: (r: any) => r.bill_date },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Gross', get: (r: any) => Number(r.gross) },
            { header: 'Retention', get: (r: any) => Number(r.retention) },
            { header: 'TDS', get: (r: any) => Number(r.tds) },
            { header: 'Net Payable', get: (r: any) => Number(r.net_payable) },
            { header: 'Paid', get: (r: any) => Number(r.paid) },
            { header: 'Advance Adjusted', get: (r: any) => Number(r.advance_adjusted) },
            { header: 'Amount Due', get: (r: any) => Number(r.amount_due) },
            { header: 'Age (days)', get: (r: any) => r.age_days },
          ]} />
          <PrintButton />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor / Bill', 'Net Payable', 'Paid', 'Advance', 'Still Due', 'Age', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {open.map(r => (
            <tr key={r.bill_id} className={`hover:bg-white/[0.02] ${r.age_days > 45 ? 'bg-red-500/[0.04]' : ''}`}>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                <div className="text-[10px] font-mono text-[#dcc1ae]/60">
                  {r.bill_no} · {r.bill_date}{r.wo_no ? ` · ${r.wo_no}` : ''}
                </div>
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                {inr(r.net_payable)}
                {(Number(r.retention) > 0 || Number(r.tds) > 0) && (
                  <div className="text-[10px] text-[#dcc1ae]/50">
                    after ret {inr0(r.retention)} · TDS {inr0(r.tds)}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(r.paid) ? inr(r.paid) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-blue-400 text-right whitespace-nowrap">
                {Number(r.advance_adjusted) ? inr(r.advance_adjusted) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-amber-400 text-right whitespace-nowrap">
                {inr(r.amount_due)}
              </td>
              <td className={`px-4 py-2.5 font-mono text-right ${r.age_days > 60 ? 'text-red-400 font-bold' : r.age_days > 45 ? 'text-amber-400' : 'text-[#dcc1ae]'}`}>
                {r.age_days}d
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                <button className="text-blue-400 text-[11px] font-semibold uppercase hover:underline mr-2"
                  onClick={() => onAdjust(r)}>Adjust Advance</button>
                <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                  onClick={() => onPay(r)}>Pay</button>
              </td>
            </tr>
          ))}
          {!open.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-emerald-400/70 text-sm">
            ✓ Nothing outstanding. Every approved bill is settled.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Advances ----------------
function Advances({ rows }: { rows: Adv[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Advances Paid</span>
        <ExportButtons filename="vendor-advances" title="Vendor Advances" rows={rows}
          columns={[
            { header: 'Advance No.', get: (r: any) => r.advance_no },
            { header: 'Date', get: (r: any) => r.advance_date },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Amount', get: (r: any) => Number(r.amount) },
            { header: 'Adjusted', get: (r: any) => Number(r.adjusted_amount) },
            { header: 'Remaining', get: (r: any) => Number(r.remaining) },
            { header: 'Mode', get: (r: any) => r.pay_mode },
            { header: 'Reference', get: (r: any) => r.reference_no || '—' },
            { header: 'Voucher', get: (r: any) => r.voucher_no || '—' },
            { header: 'Status', get: (r: any) => r.status },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Advance No.', 'Vendor', 'Amount', 'Adjusted', 'Remaining', 'Mode', 'Status'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(a => (
            <tr key={a.advance_id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5">
                <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{a.advance_no}</div>
                <div className="text-[10px] text-[#dcc1ae]/60">{a.advance_date}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8]">{a.vendor_name}</div>
                {a.wo_no && <div className="text-[10px] text-[#dcc1ae]/50">{a.wo_no}</div>}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">{inr(a.amount)}</td>
              <td className="px-4 py-2.5 font-mono text-blue-400 text-right whitespace-nowrap">
                {Number(a.adjusted_amount) ? inr(a.adjusted_amount) : '—'}
              </td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(a.remaining) > 0 ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                {Number(a.remaining) > 0 ? inr(a.remaining) : '—'}
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                {a.pay_mode}
                {a.reference_no && <div className="text-[10px] font-mono text-[#dcc1ae]/50">{a.reference_no}</div>}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                  a.status === 'Fully Adjusted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : a.status === 'Partly Adjusted' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                  {a.status}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No advances paid. Click "Pay Advance" to record one.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Payments ----------------
function Payments({ rows }: { rows: Pay[] }) {
  const total = r2(rows.reduce((n, p) => n + Number(p.amount || 0), 0))
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Payments Made — {inr0(total)}</span>
        <ExportButtons filename="vendor-payments" title="Vendor Payments" rows={rows}
          columns={[
            { header: 'Payment No.', get: (r: any) => r.payment_no },
            { header: 'Date', get: (r: any) => r.payment_date },
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Against Bill', get: (r: any) => r.bill_no || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'Amount', get: (r: any) => Number(r.amount) },
            { header: 'Mode', get: (r: any) => r.pay_mode },
            { header: 'Reference', get: (r: any) => r.reference_no || '—' },
            { header: 'Paid From', get: (r: any) => r.paid_from || '—' },
            { header: 'Voucher', get: (r: any) => r.voucher_no || '—' },
            { header: 'Recorded By', get: (r: any) => r.created_by_name || '—' },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Payment No.', 'Vendor', 'Against Bill', 'Amount', 'Mode / Reference', 'Voucher'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(p => (
            <tr key={p.payment_id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5">
                <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{p.payment_no}</div>
                <div className="text-[10px] text-[#dcc1ae]/60">{p.payment_date}</div>
              </td>
              <td className="px-4 py-2.5 text-[#e2e2e8]">{p.vendor_name}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{p.bill_no || '—'}</td>
              <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">{inr(p.amount)}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                {p.pay_mode}
                {p.reference_no && <div className="text-[10px] font-mono text-[#dcc1ae]/50">{p.reference_no}</div>}
                {p.paid_from && <div className="text-[10px] text-[#dcc1ae]/50">from {p.paid_from}</div>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-[#dcc1ae]/70">{p.voucher_no || '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No payments recorded yet.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Retention ----------------
function Retention({ rows, onRelease }: { rows: Ret[]; onRelease: (r: Ret) => void }) {
  const held = rows.filter(r => Number(r.retention_balance) > 0.01)
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">Retention</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            Money deducted from bills and held. It is the vendor's — release it when the work is signed off.
          </p>
        </div>
        <ExportButtons filename="vendor-retention" title="Vendor Retention" rows={rows}
          columns={[
            { header: 'Vendor', get: (r: any) => r.vendor_name },
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Project', get: (r: any) => r.project_name || '—' },
            { header: 'WO Status', get: (r: any) => r.wo_status || '—' },
            { header: 'Retention Held', get: (r: any) => Number(r.retention_held) },
            { header: 'Released', get: (r: any) => Number(r.retention_released) },
            { header: 'Balance', get: (r: any) => Number(r.retention_balance) },
            { header: 'Final Released', get: (r: any) => (r.final_released ? 'Yes' : 'No') },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Vendor', 'Work Order', 'Held', 'Released', 'Balance', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => {
            const canRelease = Number(r.retention_balance) > 0.01
            const woDone = r.wo_status === 'Completed'
            return (
              <tr key={i} className={`hover:bg-white/[0.02] ${woDone && canRelease ? 'bg-amber-500/[0.05]' : ''}`}>
                <td className="px-4 py-2.5">
                  <div className="text-[#e2e2e8] font-semibold">{r.vendor_name}</div>
                  <div className="text-[10px] font-mono text-[#dcc1ae]/50">{r.vendor_code}</div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                  {r.wo_no || '—'}
                  {r.wo_status && (
                    <div className={`text-[10px] ${woDone ? 'text-emerald-400' : 'text-[#dcc1ae]/50'}`}>
                      {r.wo_status}{woDone && canRelease ? ' — ready to release' : ''}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(r.retention_held)}</td>
                <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                  {Number(r.retention_released) ? inr(r.retention_released) : '—'}
                </td>
                <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${canRelease ? 'text-amber-400' : 'text-[#dcc1ae]/40'}`}>
                  {canRelease ? inr(r.retention_balance) : '—'}
                  {r.final_released && <div className="text-[10px] text-emerald-400 font-normal">final released</div>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canRelease && (
                    <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline"
                      onClick={() => onRelease(r)}>Release</button>
                  )}
                </td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No retention held.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================
//  MODALS
// =====================================================================
function usePayLedgers() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('acc_ledgers')
        .select('id, name, acc_groups!inner(name)')
        .in('acc_groups.name', ['Bank Accounts', 'Cash in Hand'])
        .order('name')
      setLedgers(((data as any[]) ?? []).map(l => ({ id: l.id, name: l.name })))
    })()
  }, [])
  return ledgers
}

function PayModal({ d, onClose, onDone }: { d: Due; onClose: () => void; onDone: () => void }) {
  const ledgers = usePayLedgers()
  const [amount, setAmount] = useState(String(d.amount_due))
  const [ledgerId, setLedgerId] = useState('')
  const [mode, setMode] = useState('Bank')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const n = Number(amount) || 0
  const isPartial = n > 0 && n < Number(d.amount_due) - 0.01

  async function go() {
    if (n <= 0) { setErr('Enter the amount.'); return }
    if (!ledgerId) { setErr('Select the bank or cash account.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('record_vendor_payment', {
      p_party: d.party_id, p_amount: n, p_pay_ledger: ledgerId,
      p_bill: d.bill_id, p_project: null, p_date: date,
      p_mode: mode, p_reference: reference || null,
      p_remarks: remarks || null, p_file: null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Pay {d.vendor_name}</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Bill {d.bill_no} · net payable <b className="text-[#e2e2e8]">{inr(d.net_payable)}</b>
          {Number(d.paid) > 0 && <> · already paid {inr(d.paid)}</>}
          {Number(d.advance_adjusted) > 0 && <> · advance {inr(d.advance_adjusted)}</>}
          <br /><b className="text-amber-400">{inr(d.amount_due)} still due</b>
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Amount *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
            </F>
            <F label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          </div>

          {isPartial && (
            <div className="text-[12px] text-blue-400">
              Partial payment — {inr(Number(d.amount_due) - n)} will remain due.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Mode">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="Paid From *">
              <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
                <option value="">— Select —</option>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
          </div>

          <F label="Reference (UTR / cheque no. / UPI ref)">
            <input className="input mono" value={reference} onChange={e => setReference(e.target.value)} />
          </F>
          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
          A Payment voucher is created automatically — Dr {d.vendor_name}, Cr the account above.
        </p>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Recording…' : `Pay ${inr(n)}`}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function AdjustModal({ d, advances, onClose, onDone }: {
  d: Due; advances: Adv[]; onClose: () => void; onDone: () => void
}) {
  const [advId, setAdvId] = useState(advances[0]?.advance_id ?? '')
  const adv = advances.find(a => a.advance_id === advId)
  const max = Math.min(Number(adv?.remaining ?? 0), Number(d.amount_due))
  const [amount, setAmount] = useState(String(max || ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { setAmount(String(Math.min(Number(adv?.remaining ?? 0), Number(d.amount_due)) || '')) }, [advId])

  async function go() {
    const n = Number(amount) || 0
    if (n <= 0) { setErr('Enter the amount to adjust.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('adjust_advance_against_bill', {
      p_advance: advId, p_bill: d.bill_id, p_amount: n,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Adjust an Advance</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Bill {d.bill_no} · <b className="text-amber-400">{inr(d.amount_due)} due</b>
        </p>

        {!advances.length ? (
          <div className="card p-4 text-center text-[13px] text-[#dcc1ae]/70">
            {d.vendor_name} has no unadjusted advance.
          </div>
        ) : (
          <div className="space-y-3">
            <F label="Advance *">
              <select className="input" value={advId} onChange={e => setAdvId(e.target.value)}>
                {advances.map(a => (
                  <option key={a.advance_id} value={a.advance_id}>
                    {a.advance_no} — {inr(a.remaining)} unadjusted
                  </option>
                ))}
              </select>
            </F>
            <F label="Amount to Adjust *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              <p className="text-[11px] text-[#dcc1ae]/60 mt-1">
                Maximum {inr(max)} — the lesser of the advance remaining and the bill due.
              </p>
            </F>
            <div className="card p-3 bg-white/[0.03] text-[12px] text-[#dcc1ae]">
              No new voucher is created. The advance is already a debit on the vendor's ledger —
              this simply records that it covered this bill, so we pay out less cash.
            </div>
          </div>
        )}

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          {advances.length > 0 && (
            <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
              {busy ? 'Adjusting…' : 'Adjust'}
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

function AdvanceModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const ledgers = usePayLedgers()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [wos, setWos] = useState<{ id: string; wo_no: string | null; project_id: string | null }[]>([])
  const [partyId, setPartyId] = useState('')
  const [woId, setWoId] = useState('')
  const [amount, setAmount] = useState('')
  const [ledgerId, setLedgerId] = useState('')
  const [mode, setMode] = useState('Bank')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: v } = await supabase.from('acc_parties')
        .select('id, name, vendor_code')
        .in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name')
      setVendors((v as Vendor[]) ?? [])
    })()
  }, [])

  useEffect(() => {
    if (!partyId) { setWos([]); return }
    (async () => {
      const { data } = await supabase.from('work_orders')
        .select('id, wo_no, project_id').eq('party_id', partyId)
        .not('status', 'in', '("Cancelled","Completed")')
      setWos((data as any[]) ?? [])
    })()
  }, [partyId])

  async function go() {
    const n = Number(amount) || 0
    if (!partyId) { setErr('Select the vendor.'); return }
    if (n <= 0) { setErr('Enter the amount.'); return }
    if (!ledgerId) { setErr('Select the bank or cash account.'); return }
    setBusy(true); setErr(null)
    const proj = wos.find(w => w.id === woId)?.project_id ?? null
    const { error } = await supabase.rpc('record_vendor_advance', {
      p_party: partyId, p_amount: n, p_pay_ledger: ledgerId,
      p_project: proj, p_wo: woId || null, p_date: date,
      p_mode: mode, p_reference: reference || null,
      p_remarks: remarks || null, p_file: null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Pay an Advance</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Money paid up front, adjusted against their later bills.
        </p>

        <div className="space-y-3">
          <F label="Vendor *">
            <select className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
              <option value="">— Select vendor —</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.vendor_code ? ` (${v.vendor_code})` : ''}</option>
              ))}
            </select>
          </F>

          {wos.length > 0 && (
            <F label="Against Work Order">
              <select className="input" value={woId} onChange={e => setWoId(e.target.value)}>
                <option value="">— Not linked —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_no}</option>)}
              </select>
            </F>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Amount *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Mode">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="Paid From *">
              <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
                <option value="">— Select —</option>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
          </div>

          <F label="Reference"><input className="input mono" value={reference} onChange={e => setReference(e.target.value)} /></F>
          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
          Creates a Payment voucher: Dr the vendor (they owe us work), Cr the account above.
        </p>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Recording…' : 'Pay Advance'}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function ReleaseModal({ r, onClose, onDone }: { r: Ret; onClose: () => void; onDone: () => void }) {
  const ledgers = usePayLedgers()
  const [amount, setAmount] = useState(String(r.retention_balance))
  const [ledgerId, setLedgerId] = useState('')
  const [mode, setMode] = useState('Bank')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [isFinal, setIsFinal] = useState(false)
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const n = Number(amount) || 0
  const isPartial = n > 0 && n < Number(r.retention_balance) - 0.01

  async function go() {
    if (n <= 0) { setErr('Enter the amount.'); return }
    if (!ledgerId) { setErr('Select the bank or cash account.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('release_retention', {
      p_party: r.party_id, p_amount: n, p_pay_ledger: ledgerId,
      p_wo: r.wo_id, p_project: null, p_is_final: isFinal,
      p_date: date, p_mode: mode,
      p_reference: reference || null, p_remarks: remarks || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Release Retention</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          {r.vendor_name}{r.wo_no ? ` · ${r.wo_no}` : ''}
          <br />Held <b className="text-[#e2e2e8]">{inr(r.retention_held)}</b>
          {Number(r.retention_released) > 0 && <> · released {inr(r.retention_released)}</>}
          <br /><b className="text-amber-400">{inr(r.retention_balance)} available to release</b>
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Amount *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
            </F>
            <F label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
          </div>

          {isPartial && (
            <div className="text-[12px] text-blue-400">
              Partial release — {inr(Number(r.retention_balance) - n)} stays held.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Mode">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="Paid From *">
              <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
                <option value="">— Select —</option>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
          </div>

          <F label="Reference"><input className="input mono" value={reference} onChange={e => setReference(e.target.value)} /></F>

          <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
            <input type="checkbox" className="accent-[#ff8f00]" checked={isFinal}
              onChange={e => setIsFinal(e.target.checked)} />
            This is the <b className="text-[#e2e2e8]">final</b> retention release for this contract
          </label>

          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={go}>
            {busy ? 'Releasing…' : `Release ${inr(n)}`}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' | 'blue' }) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400'
    : tone === 'blue' ? 'text-blue-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}