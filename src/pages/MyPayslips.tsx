import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { generatePayslipPdf } from '../lib/payslipPdf'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Slip = {
  id: string; payslip_no: string; pay_month: string; month_label: string
  employee_name: string; emp_code: string | null
  designation: string | null; department: string | null
  project_name: string | null; uan_no: string | null; pan_no: string | null
  days_in_month: number
  days_present: number; days_half: number; days_leave: number
  days_holiday: number; days_weekoff: number; days_absent: number
  paid_days: number; lop_days: number
  basic: number; hra: number; conveyance: number; medical: number
  special: number; other_allow: number
  gross_salary: number; earned_gross: number; lop_amount: number
  overtime_hours: number; overtime_amt: number; bonus: number; incentive: number
  total_earnings: number
  pf_employee: number; esi_employee: number; pt_amount: number; tds_amount: number
  loan_deduct: number; advance_deduct: number; other_deduct: number
  total_deductions: number
  pf_employer: number; esi_employer: number
  net_salary: number
  pay_mode: string; bank_name: string | null; bank_account: string | null
  status: string; paid_date: string | null
}

export default function MyPayslips() {
  const [slips, setSlips] = useState<Slip[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Slip | null>(null)

  useEffect(() => {
    (async () => {
      // RLS restricts this to the caller's own payslips
      const { data } = await supabase.from('my_payslips').select('*')
        .order('pay_month', { ascending: false })
      setSlips((data as Slip[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const ytd = useMemo(() => {
    const year = new Date().getFullYear()
    const mine = slips.filter(s => new Date(s.pay_month).getFullYear() === year)
    return {
      months: mine.length,
      earnings: mine.reduce((n, s) => n + Number(s.total_earnings || 0), 0),
      deductions: mine.reduce((n, s) => n + Number(s.total_deductions || 0), 0),
      net: mine.reduce((n, s) => n + Number(s.net_salary || 0), 0),
    }
  }, [slips])

  if (loading) return <div className="p-8 text-center text-[#dcc1ae] text-sm">Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">My Payslips</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Your salary statements. Only you and HR can see these.
        </p>
      </div>

      {!slips.length ? (
        <div className="card p-10 text-center">
          <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '40px' }}>receipt_long</span>
          <p className="text-[15px] text-[#e2e2e8] font-semibold mt-2">No payslips yet</p>
          <p className="text-[13px] text-[#dcc1ae] mt-1 max-w-md mx-auto">
            Payslips appear here once HR has approved the month's payroll. If you believe one is
            missing, speak to HR — it may be that your login is not yet linked to your employee record.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <K label={`Payslips (${new Date().getFullYear()})`} value={String(ytd.months)} />
            <K label="Total Earnings YTD" value={inr(ytd.earnings)} />
            <K label="Total Deductions YTD" value={inr(ytd.deductions)} tone="amber" />
            <K label="Net Received YTD" value={inr(ytd.net)} tone="emerald" big />
          </div>

          <div className="space-y-3">
            {slips.map(s => (
              <div key={s.id} className="card p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-[#e2e2e8]">{s.month_label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        s.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#dcc1ae]/60 font-mono mt-0.5">
                      {s.payslip_no} · {s.paid_days} of {s.days_in_month} days paid
                      {Number(s.lop_days) > 0 && ` · ${s.lop_days}d LOP`}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Net</div>
                      <div className="font-mono text-[18px] font-bold text-[#ffb87b]">
                        {inr2(s.net_salary)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => setOpen(s)}>View</button>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={() => generatePayslipPdf(s as any)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span>
                        PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {open && <SlipDetail s={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function SlipDetail({ s, onClose }: { s: Slip; onClose: () => void }) {
  const earnings: [string, number][] = ([
    ['Basic', s.basic], ['HRA', s.hra], ['Conveyance', s.conveyance],
    ['Medical', s.medical], ['Special Allowance', s.special], ['Other Allowance', s.other_allow],
  ] as [string, number][]).filter(([, v]) => Number(v) > 0)

  const deductions: [string, number][] = ([
    ['Provident Fund', s.pf_employee], ['ESI', s.esi_employee],
    ['Professional Tax', s.pt_amount], ['Income Tax (TDS)', s.tds_amount],
    ['Loan Repayment', s.loan_deduct], ['Advance Recovery', s.advance_deduct],
    ['Other', s.other_deduct],
  ] as [string, number][]).filter(([, v]) => Number(v) > 0)

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">
              Payslip — {s.month_label}
            </h3>
            <p className="text-[12px] text-[#dcc1ae] font-mono">{s.payslip_no}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => generatePayslipPdf(s as any)}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span> PDF
            </button>
            <PrintButton title={`Payslip — ${s.month_label}`} />
            <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 mb-4">
            <div className="text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
              Attendance — {s.days_in_month} days
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
              <D label="Present" v={s.days_present} tone="emerald" />
              <D label="Half" v={s.days_half} />
              <D label="Holiday" v={s.days_holiday} tone="emerald" />
              <D label="Week Off" v={s.days_weekoff} tone="emerald" />
              <D label="Leave" v={s.days_leave} tone="red" />
              <D label="Absent" v={s.days_absent} tone="red" />
              <D label="PAID" v={s.paid_days} tone="amber" bold />
            </div>
            {Number(s.lop_days) > 0 && (
              <p className="text-[11px] text-red-400 mt-2">
                {s.lop_days} day(s) loss of pay. Leave and absence are not paid.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Sec>Earnings</Sec>
              {earnings.map(([k, v]) => <Row key={k} k={k} v={inr2(v)} />)}
              <div className="flex justify-between py-1.5 border-t border-white/[0.08] mt-1">
                <span className="text-[12px] text-[#dcc1ae]">Gross (full month)</span>
                <span className="font-mono text-[13px] text-[#dcc1ae]">{inr2(s.gross_salary)}</span>
              </div>
              <Row k={`Earned (${s.paid_days}/${s.days_in_month}d)`} v={inr2(s.earned_gross)} strong />
              {Number(s.lop_amount) > 0 && <Row k={`Loss of pay`} v={'−' + inr2(s.lop_amount)} red />}
              {Number(s.overtime_amt) > 0 && (
                <Row k={`Overtime (${s.overtime_hours}h)`} v={'+' + inr2(s.overtime_amt)} green />
              )}
              <div className="flex justify-between py-2 mt-1 border-t border-white/[0.08]">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total</span>
                <span className="font-mono text-[15px] font-bold text-emerald-400">{inr2(s.total_earnings)}</span>
              </div>
            </div>

            <div>
              <Sec>Deductions</Sec>
              {deductions.length
                ? deductions.map(([k, v]) => <Row key={k} k={k} v={inr2(v)} />)
                : <p className="text-[12px] text-[#dcc1ae]/50 py-2">No deductions.</p>}
              <div className="flex justify-between py-2 mt-1 border-t border-white/[0.08]">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total</span>
                <span className="font-mono text-[15px] font-bold text-amber-400">{inr2(s.total_deductions)}</span>
              </div>

              {(Number(s.pf_employer) > 0 || Number(s.esi_employer) > 0) && (
                <div className="mt-3 pt-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-[#dcc1ae]/50 uppercase tracking-wider mb-1">
                    Paid by the company on your behalf
                  </p>
                  {Number(s.pf_employer) > 0 && <Row k="Employer PF" v={inr2(s.pf_employer)} muted />}
                  {Number(s.esi_employer) > 0 && <Row k="Employer ESI" v={inr2(s.esi_employer)} muted />}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-[#ff8f00]/[0.08] border border-[#ff8f00]/25 p-4 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[#dcc1ae] uppercase tracking-wider">Net Salary</span>
            <span className="font-mono text-[26px] font-bold text-[#ffb87b]">{inr2(s.net_salary)}</span>
          </div>

          {s.bank_name && (
            <p className="text-[11px] text-[#dcc1ae]/60 mt-3">
              Paid by <b>{s.pay_mode}</b> — {s.bank_name} ···{(s.bank_account ?? '').slice(-4)}
              {s.paid_date && ` on ${s.paid_date}`}
            </p>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

function D({ label, v, tone, bold }: { label: string; v: number; tone?: string; bold?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400'
    : tone === 'amber' ? 'text-[#ffb87b]' : 'text-[#e2e2e8]'
  return (
    <div>
      <div className="text-[9px] text-[#dcc1ae]/50 uppercase">{label}</div>
      <div className={`font-mono ${bold ? 'text-[15px] font-bold' : 'text-[13px]'} ${Number(v) ? c : 'text-[#dcc1ae]/25'}`}>
        {v}
      </div>
    </div>
  )
}
function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2 pb-1 border-b border-white/[0.06]">{children}</div>
}
function Row({ k, v, strong, red, green, muted }: {
  k: string; v: string; strong?: boolean; red?: boolean; green?: boolean; muted?: boolean
}) {
  const c = red ? 'text-red-400' : green ? 'text-emerald-400'
    : muted ? 'text-[#dcc1ae]/60' : 'text-[#e2e2e8]'
  return (
    <div className="flex justify-between py-1">
      <span className={`text-[12px] ${muted ? 'text-[#dcc1ae]/60' : 'text-[#dcc1ae]'}`}>{k}</span>
      <span className={`font-mono text-[13px] ${strong ? 'font-bold' : ''} ${c}`}>{v}</span>
    </div>
  )
}
function K({ label, value, tone, big }: {
  label: string; value: string; tone?: 'emerald' | 'amber'; big?: boolean
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className={`card p-3 ${big ? 'border-[#ff8f00]/25 bg-[#ff8f00]/[0.04]' : ''}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[21px]' : 'text-[18px]'} font-bold ${big ? 'text-[#ffb87b]' : c}`}>
        {value}
      </div>
    </div>
  )
}