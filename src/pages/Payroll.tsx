import { useEffect, useMemo, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'
import { generatePayslipPdf } from '../lib/payslipPdf'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Run = {
  id: string; run_no: string; pay_month: string; month_label: string
  days_in_month: number; status: string; locked: boolean
  project_name: string | null
  employee_count: number
  total_gross: number; total_earned: number; total_deduct: number
  total_net: number; employer_cost: number
  approved_by_name: string | null; approved_at: string | null
  voucher_no: string | null; voucher_id: string | null
}
type Slip = {
  id: string; payslip_no: string; employee_id: string
  emp_code: string | null; employee_name: string
  designation: string | null; department: string | null
  project_name: string | null
  days_in_month: number; days_present: number; days_half: number
  days_leave: number; days_holiday: number; days_weekoff: number
  days_absent: number; paid_days: number; lop_days: number
  basic: number; hra: number; conveyance: number; medical: number
  special: number; other_allow: number; gross_salary: number
  earned_gross: number; lop_amount: number
  overtime_hours: number; overtime_amt: number
  bonus: number; incentive: number; total_earnings: number
  pf_employee: number; esi_employee: number; pt_amount: number; tds_amount: number
  loan_deduct: number; advance_deduct: number; other_deduct: number
  total_deductions: number
  pf_employer: number; esi_employer: number
  net_salary: number
  pay_mode: string; bank_name: string | null; bank_account: string | null
  status: string; run_locked: boolean
}

export default function Payroll() {
  const { isAdmin, can } = useAuth()
  const [runs, setRuns] = useState<Run[]>([])
  const [active, setActive] = useState<Run | null>(null)
  const [slips, setSlips] = useState<Slip[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [viewSlip, setViewSlip] = useState<Slip | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('payroll_run_list').select('*')
      .order('pay_month', { ascending: false })
    const list = (data as Run[]) ?? []
    setRuns(list)
    if (!active && list.length) setActive(list[0])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!active) { setSlips([]); return }
    supabase.from('payslip_full').select('*').eq('run_id', active.id)
      .order('employee_name')
      .then(({ data }) => setSlips((data as Slip[]) ?? []))
  }, [active?.id])

  async function reloadRun(id: string) {
    const { data } = await supabase.from('payroll_run_list').select('*').eq('id', id).maybeSingle()
    if (data) setActive(data as Run)
    load()
  }

  async function generate() {
    if (!active) return
    if (!await appConfirm(
      `Generate payslips for ${active.month_label}?\n\n` +
      `Every active employee will get a payslip based on their attendance.\n` +
      `Anyone with NO attendance will be skipped and named — payroll does not guess.`
    )) return

    setBusy(true)
    const { data, error } = await supabase.rpc('generate_payroll_run', { p_run: active.id })
    setBusy(false)
    if (error) { appAlert(error.message); return }

    const r = (data as any[])?.[0]
    let msg = `Generated ${r?.generated ?? 0} payslip(s).`
    if (r?.skipped > 0) {
      msg += `\n\n⚠️ ${r.skipped} could NOT be generated:\n\n${r.problems}`
    }
    appAlert(msg)
    reloadRun(active.id)
  }

  async function approve() {
    if (!active) return
    if (!await appConfirm(
      `Approve payroll for ${active.month_label}?\n\n` +
      `${active.employee_count} employees · ${inr(active.total_net)} net\n\n` +
      `⚠️ THIS LOCKS THE RUN. Payslips cannot be changed afterwards.\n` +
      `Loan and advance recoveries will be recorded, and approved overtime marked paid.`
    )) return

    setBusy(true)
    const { error } = await supabase.rpc('approve_payroll_run', { p_run: active.id })
    setBusy(false)
    if (error) { appAlert('Could not approve:\n\n' + error.message); return }
    reloadRun(active.id)
  }

  async function markPaid() {
    if (!active) return
    const ref = await appPrompt(
      `Mark ${active.month_label} payroll as PAID?\n\n` +
      `${active.employee_count} employees · ${inr(active.total_net)}\n\n` +
      `Payment reference (UTR / batch no.), optional:`
    )
    if (ref === null) return    // cancelled

    setBusy(true)
    const { data, error } = await supabase.rpc('mark_payroll_paid', {
      p_run: active.id,
      p_date: new Date().toISOString().slice(0, 10),
      p_ref: ref || null,
    })
    setBusy(false)
    if (error) { appAlert('Could not mark paid:\n\n' + error.message); return }
    appAlert(`${data ?? 0} payslip(s) marked Paid. Employees can now see them.`)
    reloadRun(active.id)
  }

  async function postToBooks() {
    if (!active) return
    if (!await appConfirm(
      `Post ${active.month_label} payroll to the accounts?\n\n` +
      `Dr Salaries & Wages  ${inr(active.total_earned)}\n` +
      `  Cr Salary Payable  ${inr(active.total_net)}\n` +
      `  Cr PF/ESI/TDS payable, loans recovered\n\n` +
      `A draft Journal voucher will be created.`
    )) return

    setBusy(true)
    const { error } = await supabase.rpc('post_payroll_to_accounts', { p_run: active.id })
    setBusy(false)
    if (error) { appAlert('Could not post:\n\n' + error.message); return }
    appAlert('Draft journal voucher created. Review it in Accounting → Vouchers, then Post.')
    reloadRun(active.id)
  }

  const kpi = useMemo(() => {
    if (!active) return null
    return {
      employees: active.employee_count,
      gross: Number(active.total_gross),
      earned: Number(active.total_earned),
      deduct: Number(active.total_deduct),
      net: Number(active.total_net),
      erCost: Number(active.employer_cost),
      totalCost: Number(active.total_earned) + Number(active.employer_cost),
    }
  }, [active])

  const byDept = useMemo(() => {
    const m: Record<string, { n: number; net: number }> = {}
    for (const s of slips) {
      const d = s.department || '—'
      if (!m[d]) m[d] = { n: 0, net: 0 }
      m[d].n++
      m[d].net += Number(s.net_salary || 0)
    }
    return Object.entries(m).sort((a, b) => b[1].net - a[1].net)
  }, [slips])

  if (!isAdmin && !can('payroll', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">
      Payroll is restricted to HR and Head Office.
    </div>
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Payroll</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Salary ÷ days in the month. Present, Half Day, Holiday and Week Off are paid;
            Absent and all Leave are not.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Payroll Run
        </button>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {/* month picker */}
          {runs.length > 0 && (
            <div className="flex gap-2 mb-5 flex-wrap items-center">
              <span className="text-[11px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider">Month</span>
              <select className="input" style={{ maxWidth: 240 }}
                value={active?.id ?? ''} onChange={e => setActive(runs.find(r => r.id === e.target.value) ?? null)}>
                {runs.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.month_label}{r.project_name ? ` · ${r.project_name}` : ''} — {r.status}
                  </option>
                ))}
              </select>
              {active && (
                <span className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase border ${
                  active.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : active.status === 'Paid' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  {active.locked && '🔒 '}{active.status}
                </span>
              )}
            </div>
          )}

          {!runs.length && (
            <div className="card p-10 text-center">
              <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '40px' }}>payments</span>
              <p className="text-[15px] text-[#e2e2e8] font-semibold mt-2">No payroll runs yet</p>
              <p className="text-[13px] text-[#dcc1ae] mt-1 max-w-md mx-auto">
                Create one for a month. Every active employee's payslip is computed from their
                attendance, approved overtime, and any loans or advances due.
              </p>
            </div>
          )}

          {active && kpi && (
            <>
              {active.locked && (
                <div className="card p-3 mb-4 bg-emerald-500/5 border-emerald-500/20 flex items-start gap-2">
                  <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '18px' }}>lock</span>
                  <div className="text-[13px]">
                    <b className="text-emerald-400">This run is approved and locked.</b>
                    <span className="text-[#dcc1ae]">
                      {' '}Payslips cannot be changed — a payslip is a statement of what you paid.
                      {active.approved_by_name && ` Approved by ${active.approved_by_name}.`}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <K label="Employees" value={String(kpi.employees)} />
                <K label="Earned Gross" value={inr(kpi.earned)} />
                <K label="Deductions" value={inr(kpi.deduct)} tone="amber" />
                <K label="Net Payable" value={inr(kpi.net)} tone="emerald" big />
                <K label="Total Cost to Company" value={inr(kpi.totalCost)}
                  sub={kpi.erCost > 0 ? `incl. ${inr(kpi.erCost)} employer PF/ESI` : undefined} />
              </div>

              {/* actions */}
              <div className="flex flex-wrap gap-2 mb-5">
                {!active.locked && (
                  <>
                    <button className="btn btn-primary" disabled={busy} onClick={generate}>
                      <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>bolt</span>
                      {busy ? 'Working…' : slips.length ? 'Regenerate Payslips' : 'Generate Payslips'}
                    </button>
                    {slips.length > 0 && (
                      <button className="btn btn-ghost" disabled={busy} onClick={approve}>
                        <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>lock</span>
                        Approve &amp; Lock
                      </button>
                    )}
                  </>
                )}
                {active.locked && !active.voucher_id && (
                  <button className="btn btn-ghost" disabled={busy} onClick={postToBooks}>
                    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>account_balance</span>
                    Post to Accounts
                  </button>
                )}
                {active.locked && active.status !== 'Paid' && (
                  <button className="btn btn-primary" disabled={busy} onClick={markPaid}>
                    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>check_circle</span>
                    Mark as Paid
                  </button>
                )}
                {active.voucher_no && (
                  <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 px-3">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                    In the books — {active.voucher_no}
                  </span>
                )}
              </div>

              {/* dept summary */}
              {byDept.length > 0 && (
                <div className="card p-4 mb-5">
                  <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">
                    Payroll by Department
                  </div>
                  <div className="space-y-2">
                    {byDept.map(([dept, d]) => (
                      <div key={dept} className="flex items-center gap-3">
                        <span className="text-[12px] text-[#dcc1ae] w-28 truncate">{dept}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-[#ff8f00]"
                            style={{ width: `${d.net / kpi.net * 100}%` }} />
                        </div>
                        <span className="text-[11px] text-[#dcc1ae]/60 w-8 text-right">{d.n}</span>
                        <span className="font-mono text-[12px] text-[#e2e2e8] w-24 text-right">{inr(d.net)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Payslips rows={slips} onOpen={setViewSlip} month={active.month_label} />
            </>
          )}
        </>
      )}

      {showNew && <NewRun onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); load() }} />}
      {viewSlip && <PayslipView s={viewSlip} onClose={() => setViewSlip(null)} />}
    </div>
  )
}

// ---------------- the payslip list ----------------
function Payslips({ rows, onOpen, month }: {
  rows: Slip[]; onOpen: (s: Slip) => void; month: string
}) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Payslips — {month}</span>
        <div className="flex gap-2">
          <ExportButtons filename={`payroll-register-${month}`} title={`Payroll Register — ${month}`} rows={rows}
            columns={[
              { header: 'Payslip No.', get: (r: any) => r.payslip_no },
              { header: 'Emp Code', get: (r: any) => r.emp_code || '—' },
              { header: 'Employee', get: (r: any) => r.employee_name },
              { header: 'Department', get: (r: any) => r.department || '—' },
              { header: 'Designation', get: (r: any) => r.designation || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Days in Month', get: (r: any) => Number(r.days_in_month) },
              { header: 'Present', get: (r: any) => Number(r.days_present) },
              { header: 'Half Day', get: (r: any) => Number(r.days_half) },
              { header: 'Leave', get: (r: any) => Number(r.days_leave) },
              { header: 'Holiday', get: (r: any) => Number(r.days_holiday) },
              { header: 'Week Off', get: (r: any) => Number(r.days_weekoff) },
              { header: 'Absent', get: (r: any) => Number(r.days_absent) },
              { header: 'Paid Days', get: (r: any) => Number(r.paid_days) },
              { header: 'LOP Days', get: (r: any) => Number(r.lop_days) },
              { header: 'Basic', get: (r: any) => Number(r.basic) },
              { header: 'HRA', get: (r: any) => Number(r.hra) },
              { header: 'Gross Salary', get: (r: any) => Number(r.gross_salary) },
              { header: 'Earned Gross', get: (r: any) => Number(r.earned_gross) },
              { header: 'Loss of Pay', get: (r: any) => Number(r.lop_amount) },
              { header: 'Overtime', get: (r: any) => Number(r.overtime_amt) },
              { header: 'Total Earnings', get: (r: any) => Number(r.total_earnings) },
              { header: 'PF', get: (r: any) => Number(r.pf_employee) },
              { header: 'ESI', get: (r: any) => Number(r.esi_employee) },
              { header: 'PT', get: (r: any) => Number(r.pt_amount) },
              { header: 'TDS', get: (r: any) => Number(r.tds_amount) },
              { header: 'Loan', get: (r: any) => Number(r.loan_deduct) },
              { header: 'Advance', get: (r: any) => Number(r.advance_deduct) },
              { header: 'Total Deductions', get: (r: any) => Number(r.total_deductions) },
              { header: 'NET SALARY', get: (r: any) => Number(r.net_salary) },
              { header: 'Bank', get: (r: any) => r.bank_name || '—' },
              { header: 'Account', get: (r: any) => r.bank_account || '—' },
              { header: 'Pay Mode', get: (r: any) => r.pay_mode },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Employee', 'Days', 'Gross', 'Earned', 'Overtime', 'Deductions', 'NET', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(s => (
            <tr key={s.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => onOpen(s)}>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{s.employee_name}</div>
                <div className="text-[10px] text-[#dcc1ae]/50">
                  {s.emp_code}{s.department ? ` · ${s.department}` : ''}
                </div>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                <span className="font-mono text-[13px] text-[#e2e2e8]">
                  {s.paid_days} / {s.days_in_month}
                </span>
                {Number(s.lop_days) > 0 && (
                  <div className="text-[10px] text-red-400">{s.lop_days}d LOP</div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {inr(s.gross_salary)}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                {inr(s.earned_gross)}
                {Number(s.lop_amount) > 0 && (
                  <div className="text-[10px] text-red-400">−{inr(s.lop_amount)}</div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(s.overtime_amt) ? inr(s.overtime_amt) : '—'}
                {Number(s.overtime_hours) > 0 && (
                  <div className="text-[10px] text-[#dcc1ae]/50">{s.overtime_hours}h</div>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-amber-400 text-right whitespace-nowrap">
                {Number(s.total_deductions) ? inr(s.total_deductions) : '—'}
              </td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${
                Number(s.net_salary) < 0 ? 'text-red-400' : 'text-[#ffb87b]'}`}>
                {inr2(s.net_salary)}
                {Number(s.net_salary) < 0 && (
                  <div className="text-[9px] text-red-400">NEGATIVE</div>
                )}
              </td>
              <td className="px-4 py-2.5 text-right">
                <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '18px' }}>chevron_right</span>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
            No payslips yet. Click "Generate Payslips".
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- the payslip itself ----------------
function PayslipView({ s, onClose }: { s: Slip; onClose: () => void }) {
  const earnings: [string, number][] = [
    ['Basic', s.basic], ['HRA', s.hra], ['Conveyance', s.conveyance],
    ['Medical', s.medical], ['Special Allowance', s.special], ['Other Allowance', s.other_allow],
  ].filter(([, v]) => Number(v) > 0) as [string, number][]

  const deductions: [string, number][] = [
    ['Provident Fund', s.pf_employee], ['ESI', s.esi_employee],
    ['Professional Tax', s.pt_amount], ['Income Tax (TDS)', s.tds_amount],
    ['Loan Repayment', s.loan_deduct], ['Advance Recovery', s.advance_deduct],
    ['Other', s.other_deduct],
  ].filter(([, v]) => Number(v) > 0) as [string, number][]

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between no-print">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{s.employee_name}</h3>
            <p className="text-[12px] text-[#dcc1ae]">
              {s.payslip_no} · {s.emp_code}
              {s.designation ? ` · ${s.designation}` : ''}
              {s.department ? ` · ${s.department}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => generatePayslipPdf(s as any)}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span> PDF
            </button>
            <PrintButton title={`Payslip — ${s.employee_name}`} />
            <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* attendance */}
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 mb-4">
            <div className="text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">
              Attendance — {s.days_in_month} days in the month
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
              <D label="Present" v={s.days_present} tone="emerald" />
              <D label="Half Day" v={s.days_half} />
              <D label="Holiday" v={s.days_holiday} tone="emerald" />
              <D label="Week Off" v={s.days_weekoff} tone="emerald" />
              <D label="Leave" v={s.days_leave} tone="red" />
              <D label="Absent" v={s.days_absent} tone="red" />
              <D label="PAID" v={s.paid_days} tone="amber" bold />
            </div>
            {Number(s.lop_days) > 0 && (
              <p className="text-[11px] text-red-400 mt-2">
                {s.lop_days} day(s) loss of pay — leave and absence are not paid.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* earnings */}
            <div>
              <Sec>Earnings</Sec>
              {earnings.map(([k, v]) => <Row key={k} k={k} v={inr2(v)} />)}
              <div className="flex justify-between py-1.5 border-t border-white/[0.08] mt-1">
                <span className="text-[12px] text-[#dcc1ae]">Full monthly gross</span>
                <span className="font-mono text-[13px] text-[#dcc1ae]">{inr2(s.gross_salary)}</span>
              </div>
              <Row k={`Earned (${s.paid_days}/${s.days_in_month} days)`} v={inr2(s.earned_gross)} strong />
              {Number(s.lop_amount) > 0 && (
                <Row k={`Loss of pay (${s.lop_days}d)`} v={'−' + inr2(s.lop_amount)} red />
              )}
              {Number(s.overtime_amt) > 0 && (
                <Row k={`Overtime (${s.overtime_hours}h)`} v={'+' + inr2(s.overtime_amt)} green />
              )}
              {Number(s.bonus) > 0 && <Row k="Bonus" v={'+' + inr2(s.bonus)} green />}
              {Number(s.incentive) > 0 && <Row k="Incentive" v={'+' + inr2(s.incentive)} green />}

              <div className="flex justify-between py-2 mt-1 border-t border-white/[0.08]">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total Earnings</span>
                <span className="font-mono text-[15px] font-bold text-emerald-400">{inr2(s.total_earnings)}</span>
              </div>
            </div>

            {/* deductions */}
            <div>
              <Sec>Deductions</Sec>
              {deductions.length
                ? deductions.map(([k, v]) => <Row key={k} k={k} v={inr2(v)} />)
                : <p className="text-[12px] text-[#dcc1ae]/50 py-2">No deductions.</p>}

              <div className="flex justify-between py-2 mt-1 border-t border-white/[0.08]">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total Deductions</span>
                <span className="font-mono text-[15px] font-bold text-amber-400">{inr2(s.total_deductions)}</span>
              </div>

              {(Number(s.pf_employer) > 0 || Number(s.esi_employer) > 0) && (
                <div className="mt-3 pt-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-[#dcc1ae]/50 uppercase tracking-wider mb-1">
                    Employer contribution (not deducted from you)
                  </p>
                  {Number(s.pf_employer) > 0 && <Row k="Employer PF" v={inr2(s.pf_employer)} muted />}
                  {Number(s.esi_employer) > 0 && <Row k="Employer ESI" v={inr2(s.esi_employer)} muted />}
                </div>
              )}
            </div>
          </div>

          {/* net */}
          <div className="mt-5 rounded-lg bg-[#ff8f00]/[0.08] border border-[#ff8f00]/25 p-4 flex items-center justify-between">
            <span className="text-[13px] font-bold text-[#dcc1ae] uppercase tracking-wider">Net Salary</span>
            <span className={`font-mono text-[26px] font-bold ${Number(s.net_salary) < 0 ? 'text-red-400' : 'text-[#ffb87b]'}`}>
              {inr2(s.net_salary)}
            </span>
          </div>

          {s.bank_name && (
            <p className="text-[11px] text-[#dcc1ae]/60 mt-3">
              To be paid by <b>{s.pay_mode}</b> — {s.bank_name} ···{(s.bank_account ?? '').slice(-4)}
            </p>
          )}
        </div>
      </div>
    </div>
  ), document.body)
}

// ---------------- new run ----------------
function NewRun({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().slice(0, 7)
  })
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects((data as any[]) ?? []))
  }, [])

  async function go(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('create_payroll_run', {
      p_month: month + '-01',
      p_project: projectId || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onCreated()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={go}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">New Payroll Run</h3>

        <div className="space-y-3">
          <F label="Month *">
            <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} />
          </F>
          <F label="Project">
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">All employees (every project)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
              Leave blank to run payroll for the whole company.
            </p>
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Creating…' : 'Create Run'}
          </button>
        </div>
      </form>
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
function K({ label, value, sub, tone, big }: {
  label: string; value: string; sub?: string; tone?: 'emerald' | 'amber'; big?: boolean
}) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className={`card p-3 ${big ? 'border-[#ff8f00]/25 bg-[#ff8f00]/[0.04]' : ''}`}>
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[21px]' : 'text-[18px]'} font-bold ${big ? 'text-[#ffb87b]' : c}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#dcc1ae]/50 mt-0.5">{sub}</div>}
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}