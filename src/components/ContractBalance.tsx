import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type Balance = {
  wo_id: string; wo_no: string | null; title: string | null; status: string
  project_name: string | null; vendor_name: string | null; vendor_code: string | null
  start_date: string | null; end_date: string | null
  retention_pct: number; tds_pct: number; payment_terms: string | null
  contract_value: number
  bills_submitted: number; bills_approved: number; payments_released: number
  pending_approval: number; pending_payment: number
  retention_held: number; tds_deducted: number
  remaining_value: number; used_pct: number
  bill_count: number; rejected_count: number
  fully_billed: boolean; can_bill: boolean
}

/**
 * The running-billing dashboard for one work order.
 * Every figure comes from the DATABASE view — nothing is computed here,
 * so the numbers cannot be tampered with from the browser.
 */
export function ContractBalance({ woId, compact }: { woId: string; compact?: boolean }) {
  const [b, setB] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('wo_running_balance').select('*').eq('wo_id', woId).maybeSingle()
      setB(data as Balance)
      setLoading(false)
    })()
  }, [woId])

  if (loading) return <div className="card p-4 text-[13px] text-[#dcc1ae]">Loading…</div>
  if (!b) return null

  const used = Math.min(100, Math.max(0, Number(b.used_pct)))

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">
            Contract Running Balance
          </div>
          {b.wo_no && (
            <div className="text-[13px] text-[#e2e2e8] mt-0.5">
              <span className="font-mono">{b.wo_no}</span>
              {b.vendor_name && <span className="text-[#dcc1ae]"> · {b.vendor_name}</span>}
            </div>
          )}
        </div>
        {!b.can_bill && (
          <span className="px-2.5 py-1 rounded text-[11px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/25">
            {b.fully_billed ? 'Fully billed' : `${b.status} — no further billing`}
          </span>
        )}
      </div>

      {/* progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-[12px] mb-1.5">
          <span className="text-[#dcc1ae]">Contract used</span>
          <span className={`font-mono font-bold ${used >= 100 ? 'text-red-400' : used >= 80 ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>
            {used.toFixed(0)}%
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Number(b.payments_released) / Math.max(1, Number(b.contract_value)) * 100)}%` }}
            title={`Paid ${inr(b.payments_released)}`} />
          <div className="h-full bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, Number(b.pending_payment) / Math.max(1, Number(b.contract_value)) * 100)}%` }}
            title={`Approved, awaiting payment ${inr(b.pending_payment)}`} />
          <div className="h-full bg-amber-500 transition-all"
            style={{ width: `${Math.min(100, Number(b.pending_approval) / Math.max(1, Number(b.contract_value)) * 100)}%` }}
            title={`Awaiting approval ${inr(b.pending_approval)}`} />
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
          <Legend colour="bg-emerald-500" label={`Paid ${inr(b.payments_released)}`} />
          <Legend colour="bg-blue-500" label={`Awaiting payment ${inr(b.pending_payment)}`} />
          <Legend colour="bg-amber-500" label={`Awaiting approval ${inr(b.pending_approval)}`} />
          <Legend colour="bg-white/10" label={`Remaining ${inr(b.remaining_value)}`} />
        </div>
      </div>

      {/* the cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Contract Value" v={inr2(b.contract_value)} big />
        <Card label="Bills Submitted" v={inr2(b.bills_submitted)} />
        <Card label="Bills Approved" v={inr2(b.bills_approved)} tone="blue" />
        <Card label="Payments Released" v={inr2(b.payments_released)} tone="emerald" />
        <Card label="Pending Approval" v={inr2(b.pending_approval)}
          tone={Number(b.pending_approval) > 0 ? 'amber' : undefined} />
        <Card label="Pending Payment" v={inr2(b.pending_payment)}
          tone={Number(b.pending_payment) > 0 ? 'amber' : undefined} />
        <Card label="Remaining Contract" v={inr2(b.remaining_value)}
          tone={Number(b.remaining_value) <= 0 ? 'red' : 'emerald'} big />
        <Card label="Bills" v={String(b.bill_count)}
          sub={b.rejected_count > 0 ? `${b.rejected_count} rejected` : undefined} />
      </div>

      {/* deductions, if any */}
      {(Number(b.retention_held) > 0 || Number(b.tds_deducted) > 0) && !compact && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-3">
          {Number(b.retention_held) > 0 && (
            <Card label={`Retention Held (${b.retention_pct}%)`} v={inr2(b.retention_held)} />
          )}
          {Number(b.tds_deducted) > 0 && (
            <Card label={`TDS Deducted (${b.tds_pct}%)`} v={inr2(b.tds_deducted)} />
          )}
        </div>
      )}

      {!compact && b.payment_terms && (
        <p className="text-[11px] text-[#dcc1ae]/60 mt-3">
          <b>Payment terms:</b> {b.payment_terms}
        </p>
      )}
    </div>
  )
}

/** The same numbers, summed across every work order for one vendor. */
export function VendorContractSummary({ partyId }: { partyId: string }) {
  const [s, setS] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('vendor_contract_summary')
        .select('*').eq('party_id', partyId).maybeSingle()
      setS(data)
    })()
  }, [partyId])

  if (!s) return null
  const used = Math.min(100, Number(s.used_pct ?? 0))

  return (
    <div className="card p-5">
      <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">
        Contracts — {s.work_orders} work order(s)
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-[12px] mb-1.5">
          <span className="text-[#dcc1ae]">Contract used</span>
          <span className={`font-mono font-bold ${used >= 100 ? 'text-red-400' : used >= 80 ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>
            {used.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[#ff8f00] transition-all" style={{ width: `${used}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Total Contract Value" v={inr2(s.total_contract_value)} big />
        <Card label="Bills Submitted" v={inr2(s.total_submitted)} />
        <Card label="Bills Approved" v={inr2(s.total_approved)} tone="blue" />
        <Card label="Payments Received" v={inr2(s.total_paid)} tone="emerald" />
        <Card label="Pending Approval" v={inr2(s.total_pending_approval)}
          tone={Number(s.total_pending_approval) > 0 ? 'amber' : undefined} />
        <Card label="Pending Payment" v={inr2(s.total_pending_payment)}
          tone={Number(s.total_pending_payment) > 0 ? 'amber' : undefined} />
        <Card label="Remaining Value" v={inr2(s.total_remaining)} tone="emerald" big />
        <Card label="Retention Held" v={inr2(s.total_retention)} />
      </div>
    </div>
  )
}

function Card({ label, v, sub, tone, big }: {
  label: string; v: string; sub?: string
  tone?: 'emerald' | 'amber' | 'blue' | 'red'; big?: boolean
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'blue' ? 'text-blue-400' : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className={`rounded-lg border p-3 ${big ? 'border-[#ff8f00]/20 bg-[#ff8f00]/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-bold mt-0.5 ${big ? 'text-[16px]' : 'text-[14px]'} ${c}`}>{v}</div>
      {sub && <div className="text-[10px] text-[#dcc1ae]/50 mt-0.5">{sub}</div>}
    </div>
  )
}
function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[#dcc1ae]/70">
      <span className={`h-2 w-2 rounded-sm ${colour}`} />{label}
    </span>
  )
}