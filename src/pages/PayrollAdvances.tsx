import { useEffect, useMemo, useState, useRef } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Emp = { id: string; emp_code: string | null; full_name: string; department: string | null }
type Ledger = { id: string; name: string }
type OT = {
  ot_id: string; employee_id: string; emp_code: string | null; employee_name: string
  department: string | null; project_name: string | null
  ot_date: string; hours: number; rate_multiplier: number
  reason: string | null; status: string; reject_reason: string | null
  hourly_rate: number; ot_amount: number
  approved_by_name: string | null; created_by_name: string | null
}
type Loan = {
  loan_id: string; employee_id: string; emp_code: string | null; employee_name: string
  department: string | null; loan_no: string; loan_date: string
  principal: number; emi_amount: number; start_month: string
  status: string; reason: string | null
  repaid: number; outstanding: number
  emis_left: number; emis_paid: number; repaid_pct: number
}
type Adv = {
  advance_id: string; employee_id: string; emp_code: string | null; employee_name: string
  department: string | null; advance_no: string; advance_date: string
  amount: number; recover_from: string; pay_mode: string
  reason: string | null; status: string
  recovered: number; outstanding: number
}

type Tab = 'overtime' | 'loans' | 'advances'

export default function PayrollAdvances() {
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const { isAdmin, can } = useAuth()
  const [tab, setTab] = useState<Tab>('overtime')
  const [ots, setOts] = useState<OT[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [advs, setAdvs] = useState<Adv[]>([])
  const [loading, setLoading] = useState(true)
  const [showOT, setShowOT] = useState(false)
  const [showLoan, setShowLoan] = useState(false)
  const [showAdv, setShowAdv] = useState(false)

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    const [o, l, a] = await Promise.all([
      supabase.from('overtime_register').select('*').order('ot_date', { ascending: false }),
      supabase.from('employee_loan_balance').select('*').order('outstanding', { ascending: false }),
      supabase.from('employee_advance_balance').select('*').order('outstanding', { ascending: false }),
    ])

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setOts((o.data as OT[]) ?? [])
    setLoans((l.data as Loan[]) ?? [])
    setAdvs((a.data as Adv[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  async function approveOT(o: OT, approve: boolean) {
    let reason: string | null = null
    if (!approve) {
      reason = await appPrompt(`Reject ${o.hours}h overtime for ${o.employee_name}?\n\nReason:`)
      if (!reason) return
    } else {
      if (!await appConfirm(
        `Approve ${o.hours}h overtime for ${o.employee_name}?\n\n` +
        `${inr2(o.ot_amount)} will be added to their next payslip.`
      )) return
    }
    const { error } = await supabase.rpc('approve_overtime', {
      p_ot: o.ot_id, p_approve: approve, p_reason: reason,
    })
    if (error) { appAlert(error.message); return }
    load()
  }

  const kpi = useMemo(() => ({
    otPending: ots.filter(o => o.status === 'Pending').length,
    otPendingValue: ots.filter(o => o.status === 'Pending')
      .reduce((n, o) => n + Number(o.ot_amount || 0), 0),
    otApproved: ots.filter(o => o.status === 'Approved')
      .reduce((n, o) => n + Number(o.ot_amount || 0), 0),
    loansOut: loans.filter(l => l.status === 'Active')
      .reduce((n, l) => n + Number(l.outstanding || 0), 0),
    advOut: advs.reduce((n, a) => n + Number(a.outstanding || 0), 0),
  }), [ots, loans, advs])

  if (!isAdmin && !can('payroll', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">
      Loans and advances are restricted to HR and Head Office.
    </div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">
          Overtime, Loans &amp; Advances
        </h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Everything that adds to or subtracts from a payslip, other than the base salary.
        </p>
      </div>

      {kpi.otPending > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{kpi.otPending} overtime claim(s) awaiting approval</b>
            <span className="text-[#dcc1ae]"> — {inr(kpi.otPendingValue)}. Unapproved overtime is not paid.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="OT Awaiting Approval" value={String(kpi.otPending)}
          sub={inr(kpi.otPendingValue)} tone={kpi.otPending ? 'amber' : undefined} />
        <K label="OT Approved (unpaid)" value={inr(kpi.otApproved)} tone="emerald" />
        <K label="Loans Outstanding" value={inr(kpi.loansOut)} tone={kpi.loansOut ? 'blue' : undefined} />
        <K label="Advances Outstanding" value={inr(kpi.advOut)} tone={kpi.advOut ? 'blue' : undefined} />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap items-center">
        {([['overtime', `Overtime (${ots.length})`],
           ['loans', `Loans (${loans.filter(l => l.status === 'Active').length})`],
           ['advances', `Salary Advances (${advs.filter(a => Number(a.outstanding) > 0).length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto">
          {tab === 'overtime' && (
            <button className="btn btn-primary" onClick={() => setShowOT(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>more_time</span> Record Overtime
            </button>
          )}
          {tab === 'loans' && (
            <button className="btn btn-primary" onClick={() => setShowLoan(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>request_quote</span> Issue Loan
            </button>
          )}
          {tab === 'advances' && (
            <button className="btn btn-primary" onClick={() => setShowAdv(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span> Give Advance
            </button>
          )}
        </div>
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {tab === 'overtime' && <Overtime rows={ots} onApprove={approveOT} />}
          {tab === 'loans' && <Loans rows={loans} />}
          {tab === 'advances' && <Advances rows={advs} />}
        </>
      )}

      {showOT && <OTForm onClose={() => setShowOT(false)} onSaved={() => { setShowOT(false); load() }} />}
      {showLoan && <LoanForm onClose={() => setShowLoan(false)} onSaved={() => { setShowLoan(false); load() }} />}
      {showAdv && <AdvForm onClose={() => setShowAdv(false)} onSaved={() => { setShowAdv(false); load() }} />}
    </div>
  )
}

// ---------------- Overtime ----------------
function Overtime({ rows, onApprove }: { rows: OT[]; onApprove: (o: OT, ok: boolean) => void }) {
  const ST: Record<string, string> = {
    'Pending': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'Approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'Rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
    'Paid': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">Overtime Register</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            An hour is worth gross ÷ 208 (26 days × 8 hours). Only <b>approved</b> overtime is paid.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButtons filename="overtime-register" title="Overtime Register" rows={rows}
            columns={[
              { header: 'Date', get: (r: any) => r.ot_date },
              { header: 'Employee', get: (r: any) => r.employee_name },
              { header: 'Code', get: (r: any) => r.emp_code || '—' },
              { header: 'Department', get: (r: any) => r.department || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Hours', get: (r: any) => Number(r.hours) },
              { header: 'Multiplier', get: (r: any) => Number(r.rate_multiplier) },
              { header: 'Hourly Rate', get: (r: any) => Number(r.hourly_rate) },
              { header: 'OT Amount', get: (r: any) => Number(r.ot_amount) },
              { header: 'Reason', get: (r: any) => r.reason || '—' },
              { header: 'Status', get: (r: any) => r.status },
              { header: 'Approved By', get: (r: any) => r.approved_by_name || '—' },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Date', 'Employee', 'Hours', 'Rate', 'Amount', 'Status', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(o => (
            <tr key={o.ot_id} className={`hover:bg-white/[0.02] ${o.status === 'Pending' ? 'bg-amber-500/[0.04]' : ''} ${o.status === 'Rejected' ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{o.ot_date}</td>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{o.employee_name}</div>
                <div className="text-[10px] text-[#dcc1ae]/50">
                  {o.emp_code}{o.department ? ` · ${o.department}` : ''}
                </div>
                {o.reason && <div className="text-[10px] text-[#dcc1ae]/60 italic">{o.reason}</div>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                {o.hours}h
                <div className="text-[10px] text-[#dcc1ae]/50">× {o.rate_multiplier}</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae] text-right whitespace-nowrap">
                {inr2(o.hourly_rate)}/h
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-emerald-400 text-right whitespace-nowrap">
                {inr2(o.ot_amount)}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${ST[o.status]}`}>
                  {o.status}
                </span>
                {o.reject_reason && (
                  <div className="text-[10px] text-red-400 mt-0.5">{o.reject_reason}</div>
                )}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {o.status === 'Pending' && (
                  <>
                    <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline mr-2"
                      onClick={() => onApprove(o, true)}>Approve</button>
                    <button className="text-red-400 text-[11px] font-semibold uppercase hover:underline"
                      onClick={() => onApprove(o, false)}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No overtime recorded.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Loans ----------------
function Loans({ rows }: { rows: Loan[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">Employee Loans</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            Recovered from salary automatically. The final month deducts only what is left, not a full EMI.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButtons filename="employee-loans" title="Employee Loans" rows={rows}
            columns={[
              { header: 'Loan No.', get: (r: any) => r.loan_no },
              { header: 'Employee', get: (r: any) => r.employee_name },
              { header: 'Code', get: (r: any) => r.emp_code || '—' },
              { header: 'Department', get: (r: any) => r.department || '—' },
              { header: 'Date', get: (r: any) => r.loan_date },
              { header: 'Principal', get: (r: any) => Number(r.principal) },
              { header: 'EMI', get: (r: any) => Number(r.emi_amount) },
              { header: 'Repaid', get: (r: any) => Number(r.repaid) },
              { header: 'Outstanding', get: (r: any) => Number(r.outstanding) },
              { header: 'EMIs Paid', get: (r: any) => Number(r.emis_paid) },
              { header: 'EMIs Left', get: (r: any) => Number(r.emis_left) },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Loan No.', 'Employee', 'Principal', 'EMI', 'Repaid', 'Outstanding', 'Progress'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(l => (
            <tr key={l.loan_id} className={`hover:bg-white/[0.02] ${l.status === 'Closed' ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5">
                <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{l.loan_no}</div>
                <div className="text-[10px] text-[#dcc1ae]/60">{l.loan_date}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="text-[#e2e2e8]">{l.employee_name}</div>
                <div className="text-[10px] text-[#dcc1ae]/50">{l.emp_code}{l.department ? ` · ${l.department}` : ''}</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(l.principal)}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                {inr(l.emi_amount)}
                <div className="text-[10px] text-[#dcc1ae]/50">{l.emis_left} left</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">{inr(l.repaid)}</td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(l.outstanding) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {Number(l.outstanding) > 0 ? inr(l.outstanding) : 'CLEARED'}
              </td>
              <td className="px-4 py-2.5" style={{ minWidth: 100 }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${l.repaid_pct}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-[#dcc1ae]">{l.repaid_pct}%</span>
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No loans issued.
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
        <div>
          <span className="text-sm font-semibold text-[#e2e2e8]">Salary Advances</span>
          <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
            Money against future salary — recovered from the next payslip. Not the same as Staff Imprest,
            which is for site expenses.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButtons filename="salary-advances" title="Salary Advances" rows={rows}
            columns={[
              { header: 'Advance No.', get: (r: any) => r.advance_no },
              { header: 'Employee', get: (r: any) => r.employee_name },
              { header: 'Date', get: (r: any) => r.advance_date },
              { header: 'Amount', get: (r: any) => Number(r.amount) },
              { header: 'Recovered', get: (r: any) => Number(r.recovered) },
              { header: 'Outstanding', get: (r: any) => Number(r.outstanding) },
              { header: 'Recover From', get: (r: any) => r.recover_from },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Advance No.', 'Employee', 'Amount', 'Recovered', 'Outstanding', 'Recover From', 'Status'].map(h => (
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
                <div className="text-[#e2e2e8]">{a.employee_name}</div>
                <div className="text-[10px] text-[#dcc1ae]/50">{a.emp_code}</div>
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">{inr(a.amount)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(a.recovered) ? inr(a.recovered) : '—'}
              </td>
              <td className={`px-4 py-2.5 font-mono font-bold text-right whitespace-nowrap ${Number(a.outstanding) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {Number(a.outstanding) > 0 ? inr(a.outstanding) : 'CLEARED'}
              </td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{a.recover_from}</td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                  a.status === 'Recovered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : a.status === 'Partly Recovered' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                  {a.status}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No salary advances.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// =====================================================================
//  FORMS
// =====================================================================
function useEmployees() {
  const [emps, setEmps] = useState<Emp[]>([])
  // employees are company-wide, not per project — load once
  useEffect(() => {
    supabase.from('employees').select('id, emp_code, full_name, department')
      .eq('status', 'Active').order('full_name')
      .then(({ data }) => setEmps((data as Emp[]) ?? []))
  }, [])
  return emps
}
function usePayLedgers() {
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  useEffect(() => {
    supabase.from('acc_ledgers')
      .select('id, name, acc_groups!inner(name)')
      .in('acc_groups.name', ['Bank Accounts', 'Cash in Hand']).order('name')
      .then(({ data }) => setLedgers(((data as any[]) ?? []).map(l => ({ id: l.id, name: l.name }))))
  }, [])
  return ledgers
}

function OTForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const emps = useEmployees()
  const [empId, setEmpId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [mult, setMult] = useState('2')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!empId) { setErr('Select the employee.'); return }
    if (!Number(hours)) { setErr('Enter the hours worked.'); return }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles')
      .select('org_id').eq('id', u?.user?.id ?? '').maybeSingle()

    const { error } = await supabase.from('overtime').insert({
      org_id: prof?.org_id,
      project_id: activeProject?.id ?? null,
      employee_id: empId,
      ot_date: date,
      hours: Number(hours),
      rate_multiplier: Number(mult) || 2,
      reason: reason || null,
      status: 'Pending',
      created_by: u?.user?.id,
    })
    setBusy(false)
    if (error) {
      setErr(error.message.includes('duplicate')
        ? 'Overtime is already recorded for this employee on this date.'
        : error.message)
      return
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Record Overtime</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          It must be <b>approved</b> before it reaches a payslip.
        </p>

        <div className="space-y-3">
          <F label="Employee *">
            <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">— Select —</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>
                  {e.full_name}{e.emp_code ? ` (${e.emp_code})` : ''}
                </option>
              ))}
            </select>
          </F>
          <div className="grid grid-cols-3 gap-3">
            <F label="Date *">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
            <F label="Hours *">
              <input className="input mono text-right" inputMode="decimal" value={hours}
                onChange={e => setHours(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="Multiplier">
              <select className="input" value={mult} onChange={e => setMult(e.target.value)}>
                <option value="1">1× (normal)</option>
                <option value="1.5">1.5×</option>
                <option value="2">2× (standard)</option>
                <option value="3">3× (holiday)</option>
              </select>
            </F>
          </div>
          <F label="Reason">
            <input className="input" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Concrete pour ran late…" />
          </F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Submit for Approval'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function LoanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const emps = useEmployees()
  const ledgers = usePayLedgers()
  const [empId, setEmpId] = useState('')
  const [principal, setPrincipal] = useState('')
  const [emi, setEmi] = useState('')
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [ledgerId, setLedgerId] = useState('')
  const [mode, setMode] = useState('Bank')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const p = Number(principal) || 0
  const e = Number(emi) || 0
  const months = e > 0 ? Math.ceil(p / e) : 0

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (!empId) { setErr('Select the employee.'); return }
    if (p <= 0) { setErr('Enter the loan amount.'); return }
    if (e <= 0) { setErr('Enter the monthly EMI.'); return }
    if (e > p) { setErr('The EMI cannot exceed the loan amount.'); return }
    if (!ledgerId) { setErr('Select the bank or cash account.'); return }

    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('issue_employee_loan', {
      p_emp: empId, p_principal: p, p_emi: e, p_start: start,
      p_pay_ledger: ledgerId, p_date: date, p_mode: mode,
      p_reason: reason || null, p_project: activeProject?.id ?? null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={ev => ev.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Issue a Loan</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Recovered automatically from salary, month by month.
        </p>

        <div className="space-y-3">
          <F label="Employee *">
            <select className="input" value={empId} onChange={ev => setEmpId(ev.target.value)}>
              <option value="">— Select —</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}{e.emp_code ? ` (${e.emp_code})` : ''}</option>
              ))}
            </select>
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Loan Amount *">
              <input className="input mono text-right" inputMode="decimal" value={principal}
                onChange={ev => setPrincipal(ev.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="Monthly EMI *">
              <input className="input mono text-right" inputMode="decimal" value={emi}
                onChange={ev => setEmi(ev.target.value.replace(/[^\d.]/g, ''))} />
            </F>
          </div>

          {months > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-[12px] text-[#dcc1ae]">
              Recovered over <b className="text-[#e2e2e8]">{months} month(s)</b>.
              The final month deducts only what is left ({inr(p - e * (months - 1))}), not a full EMI.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Recover From *">
              <input type="date" className="input" value={start} onChange={ev => setStart(ev.target.value)} />
            </F>
            <F label="Loan Date">
              <input type="date" className="input" value={date} onChange={ev => setDate(ev.target.value)} />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Mode">
              <select className="input" value={mode} onChange={ev => setMode(ev.target.value)}>
                {['Bank', 'Cash', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="Paid From *">
              <select className="input" value={ledgerId} onChange={ev => setLedgerId(ev.target.value)}>
                <option value="">— Select —</option>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
          </div>

          <F label="Reason"><input className="input" value={reason} onChange={ev => setReason(ev.target.value)} /></F>
        </div>

        <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
          Creates a Payment voucher: Dr Staff Loans (they owe us), Cr the account above.
        </p>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Issuing…' : 'Issue Loan'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function AdvForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const emps = useEmployees()
  const ledgers = usePayLedgers()
  const [empId, setEmpId] = useState('')
  const [amount, setAmount] = useState('')
  const [recoverFrom, setRecoverFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [ledgerId, setLedgerId] = useState('')
  const [mode, setMode] = useState('Cash')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!empId) { setErr('Select the employee.'); return }
    if (!Number(amount)) { setErr('Enter the amount.'); return }
    if (!ledgerId) { setErr('Select the bank or cash account.'); return }

    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('issue_salary_advance', {
      p_emp: empId, p_amount: Number(amount), p_pay_ledger: ledgerId,
      p_recover_from: recoverFrom, p_date: date, p_mode: mode,
      p_reason: reason || null, p_project: activeProject?.id ?? null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">Give a Salary Advance</h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          Money against future salary — recovered from their next payslip.
          <b className="text-[#e2e2e8]"> This is not Staff Imprest</b> (which is for site expenses).
        </p>

        <div className="space-y-3">
          <F label="Employee *">
            <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">— Select —</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}{e.emp_code ? ` (${e.emp_code})` : ''}</option>
              ))}
            </select>
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Amount *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="Date">
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </F>
          </div>

          <F label="Recover From (month) *">
            <input type="date" className="input" value={recoverFrom}
              onChange={e => setRecoverFrom(e.target.value)} />
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Mode">
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                {['Cash', 'Bank', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="Paid From *">
              <select className="input" value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
                <option value="">— Select —</option>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </F>
          </div>

          <F label="Reason"><input className="input" value={reason} onChange={e => setReason(e.target.value)} /></F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Give Advance'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function K({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'amber' | 'emerald' | 'blue'
}) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'emerald' ? 'text-emerald-400'
    : tone === 'blue' ? 'text-blue-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[19px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/50 mt-0.5">{sub}</div>}
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}