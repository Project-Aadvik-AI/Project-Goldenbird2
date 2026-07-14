import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Run = { id: string; month_label: string; pay_month: string; status: string }
type Rep = 'register' | 'salary' | 'history' | 'department' | 'project' | 'bank' | 'statutory' | 'audit'

const REPORTS: [Rep, string, string][] = [
  ['register',  'Payroll Register',  'One month, every employee — the report an auditor asks for'],
  ['salary',    'Salary Register',   'The current salary structure of everyone'],
  ['history',   'Salary History',    'One person, every month'],
  ['department','Department-wise',   'What each department costs'],
  ['project',   'Project-wise',      'What each project costs in salary'],
  ['bank',      'Bank Advice',       'What you hand the bank — with a readiness check'],
  ['statutory', 'Statutory Due',     'PF, ESI, PT and TDS you must remit'],
  ['audit',     'Audit Log',         'Who did what, and when'],
]

export default function PayrollReports() {
  const { isAdmin } = useAuth()
  const [rep, setRep] = useState<Rep>('register')
  const [runs, setRuns] = useState<Run[]>([])
  const [runId, setRunId] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [emps, setEmps] = useState<{ id: string; full_name: string; emp_code: string | null }[]>([])
  const [empId, setEmpId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: e }] = await Promise.all([
        supabase.from('payroll_run_list').select('id, month_label, pay_month, status')
          .order('pay_month', { ascending: false }),
        supabase.from('employees').select('id, full_name, emp_code')
          .eq('status', 'Active').order('full_name'),
      ])
      const list = (r as Run[]) ?? []
      setRuns(list)
      if (list.length) setRunId(list[0].id)
      setEmps((e as any[]) ?? [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    (async () => {
      setLoading(true)
      let q: any = null

      if (rep === 'register')        q = supabase.from('payroll_register').select('*').eq('run_id', runId).order('employee_name')
      else if (rep === 'salary')     q = supabase.from('salary_register').select('*').order('full_name')
      else if (rep === 'history')    q = empId
                                        ? supabase.from('employee_salary_history').select('*').eq('employee_id', empId).order('pay_month', { ascending: false })
                                        : null
      else if (rep === 'department') q = supabase.from('payroll_by_department').select('*').eq('run_id', runId).order('total_cost', { ascending: false })
      else if (rep === 'project')    q = supabase.from('payroll_by_project').select('*').eq('run_id', runId).order('total_cost', { ascending: false })
      else if (rep === 'bank')       q = supabase.from('payroll_bank_advice').select('*').eq('run_id', runId).order('employee_name')
      else if (rep === 'statutory')  q = supabase.from('payroll_statutory_due').select('*').eq('run_id', runId)
      else if (rep === 'audit')      q = supabase.from('payroll_audit_log').select('*').order('created_at', { ascending: false }).limit(300)

      if (!q) { setRows([]); setLoading(false); return }
      const { data } = await q
      setRows((data as any[]) ?? [])
      setLoading(false)
    })()
  }, [rep, runId, empId])

  const needsRun = ['register', 'department', 'project', 'bank', 'statutory'].includes(rep)
  const meta = REPORTS.find(r => r[0] === rep)!

  if (!isAdmin) {
    return <div className="p-8 text-center text-[#dcc1ae]">
      Payroll reports are restricted to HR and Head Office.
    </div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Payroll Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Built from approved payroll runs. Everything exports to Excel, PDF and print.
        </p>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <L label="Report">
          <select className="input" style={{ minWidth: 200 }} value={rep}
            onChange={e => setRep(e.target.value as Rep)}>
            {REPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </L>
        {needsRun && (
          <L label="Month">
            <select className="input" style={{ minWidth: 170 }} value={runId}
              onChange={e => setRunId(e.target.value)}>
              {runs.map(r => (
                <option key={r.id} value={r.id}>{r.month_label} — {r.status}</option>
              ))}
            </select>
          </L>
        )}
        {rep === 'history' && (
          <L label="Employee *">
            <select className="input" style={{ minWidth: 200 }} value={empId}
              onChange={e => setEmpId(e.target.value)}>
              <option value="">— Select an employee —</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>
                  {e.full_name}{e.emp_code ? ` (${e.emp_code})` : ''}
                </option>
              ))}
            </select>
          </L>
        )}
      </div>

      <p className="text-[12px] text-[#dcc1ae]/60 mb-4">{meta[2]}</p>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {rep === 'register'   && <Register rows={rows} />}
          {rep === 'salary'     && <SalaryReg rows={rows} />}
          {rep === 'history'    && <History rows={rows} hasEmp={!!empId} />}
          {rep === 'department' && <Grouped rows={rows} keyField="department" label="Department" />}
          {rep === 'project'    && <Grouped rows={rows} keyField="project_name" label="Project" />}
          {rep === 'bank'       && <BankAdvice rows={rows} />}
          {rep === 'statutory'  && <Statutory rows={rows} />}
          {rep === 'audit'      && <Audit rows={rows} />}
        </>
      )}
    </div>
  )
}

// ---------------- Payroll Register ----------------
function Register({ rows }: { rows: any[] }) {
  const t = useMemo(() => ({
    earn: rows.reduce((n, r) => n + Number(r.total_earnings || 0), 0),
    ded: rows.reduce((n, r) => n + Number(r.total_deductions || 0), 0),
    net: rows.reduce((n, r) => n + Number(r.net_salary || 0), 0),
  }), [rows])

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          Payroll Register — {rows.length} employee(s), {inr(t.net)} net
        </span>
        <div className="flex gap-2">
          <ExportButtons filename="payroll-register" title="Payroll Register" rows={rows}
            columns={[
              { header: 'Payslip No.', get: (r: any) => r.payslip_no },
              { header: 'Emp Code', get: (r: any) => r.emp_code || '—' },
              { header: 'Employee', get: (r: any) => r.employee_name },
              { header: 'Designation', get: (r: any) => r.designation || '—' },
              { header: 'Department', get: (r: any) => r.department || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'UAN', get: (r: any) => r.uan_no || '—' },
              { header: 'PF No.', get: (r: any) => r.pf_no || '—' },
              { header: 'ESI No.', get: (r: any) => r.esi_no || '—' },
              { header: 'PAN', get: (r: any) => r.pan_no || '—' },
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
              { header: 'Conveyance', get: (r: any) => Number(r.conveyance) },
              { header: 'Medical', get: (r: any) => Number(r.medical) },
              { header: 'Special', get: (r: any) => Number(r.special) },
              { header: 'Other', get: (r: any) => Number(r.other_allow) },
              { header: 'Gross Salary', get: (r: any) => Number(r.gross_salary) },
              { header: 'Earned Gross', get: (r: any) => Number(r.earned_gross) },
              { header: 'Loss of Pay', get: (r: any) => Number(r.lop_amount) },
              { header: 'OT Hours', get: (r: any) => Number(r.overtime_hours) },
              { header: 'Overtime', get: (r: any) => Number(r.overtime_amt) },
              { header: 'Total Earnings', get: (r: any) => Number(r.total_earnings) },
              { header: 'PF (Employee)', get: (r: any) => Number(r.pf_employee) },
              { header: 'ESI (Employee)', get: (r: any) => Number(r.esi_employee) },
              { header: 'Professional Tax', get: (r: any) => Number(r.pt_amount) },
              { header: 'TDS', get: (r: any) => Number(r.tds_amount) },
              { header: 'Loan', get: (r: any) => Number(r.loan_deduct) },
              { header: 'Advance', get: (r: any) => Number(r.advance_deduct) },
              { header: 'Total Deductions', get: (r: any) => Number(r.total_deductions) },
              { header: 'PF (Employer)', get: (r: any) => Number(r.pf_employer) },
              { header: 'ESI (Employer)', get: (r: any) => Number(r.esi_employer) },
              { header: 'NET SALARY', get: (r: any) => Number(r.net_salary) },
              { header: 'Pay Mode', get: (r: any) => r.pay_mode },
              { header: 'Bank', get: (r: any) => r.bank_name || '—' },
              { header: 'Account', get: (r: any) => r.bank_account || '—' },
              { header: 'IFSC', get: (r: any) => r.bank_ifsc || '—' },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Employee', 'Days', 'Earned', 'OT', 'PF/ESI', 'Loan/Adv', 'Deductions', 'NET'].map(h => (
            <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.payslip_no} className="hover:bg-white/[0.02]">
              <td className="px-3 py-2.5">
                <div className="text-[#e2e2e8] font-semibold">{r.employee_name}</div>
                <div className="text-[10px] text-[#dcc1ae]/50">
                  {r.emp_code}{r.department ? ` · ${r.department}` : ''}
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                <span className="text-[#e2e2e8]">{r.paid_days}/{r.days_in_month}</span>
                {Number(r.lop_days) > 0 && (
                  <div className="text-[10px] text-red-400">{r.lop_days}d LOP</div>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                {inr(r.earned_gross)}
              </td>
              <td className="px-3 py-2.5 font-mono text-emerald-400 text-right whitespace-nowrap">
                {Number(r.overtime_amt) ? inr(r.overtime_amt) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-[#dcc1ae] text-right whitespace-nowrap">
                {Number(r.pf_employee) + Number(r.esi_employee) > 0
                  ? inr(Number(r.pf_employee) + Number(r.esi_employee)) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-amber-400 text-right whitespace-nowrap">
                {Number(r.loan_deduct) + Number(r.advance_deduct) > 0
                  ? inr(Number(r.loan_deduct) + Number(r.advance_deduct)) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono text-amber-400 text-right whitespace-nowrap">
                {Number(r.total_deductions) ? inr(r.total_deductions) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono font-bold text-[#ffb87b] text-right whitespace-nowrap">
                {inr2(r.net_salary)}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No payslips in this run.
          </td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-[#282a2e]"><tr>
            <td className="px-3 py-3 text-[11px] font-bold text-[#dcc1ae] uppercase" colSpan={2}>Total</td>
            <td className="px-3 py-3 font-mono font-bold text-[#e2e2e8] text-right">{inr(t.earn)}</td>
            <td colSpan={3} />
            <td className="px-3 py-3 font-mono font-bold text-amber-400 text-right">{inr(t.ded)}</td>
            <td className="px-3 py-3 font-mono font-bold text-[#ffb87b] text-right">{inr(t.net)}</td>
          </tr></tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------- Salary Register ----------------
function SalaryReg({ rows }: { rows: any[] }) {
  const total = rows.reduce((n, r) => n + Number(r.gross_salary || 0), 0)
  const noLogin = rows.filter(r => !r.has_login).length

  return (
    <div>
      {noLogin > 0 && (
        <div className="card p-3 mb-4 bg-blue-500/5 border-blue-500/20 text-[13px]">
          <b className="text-blue-400">{noLogin} employee(s) have no login</b>
          <span className="text-[#dcc1ae]"> — they cannot see their own payslips.</span>
        </div>
      )}
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">
            Salary Register — {rows.length} employee(s), {inr(total)}/month
          </span>
          <div className="flex gap-2">
            <ExportButtons filename="salary-register" title="Salary Register" rows={rows}
              columns={[
                { header: 'Emp Code', get: (r: any) => r.emp_code || '—' },
                { header: 'Employee', get: (r: any) => r.full_name },
                { header: 'Designation', get: (r: any) => r.designation || '—' },
                { header: 'Department', get: (r: any) => r.department || '—' },
                { header: 'Project', get: (r: any) => r.project_name || '—' },
                { header: 'Join Date', get: (r: any) => r.join_date || '—' },
                { header: 'Basic', get: (r: any) => Number(r.basic_salary) },
                { header: 'HRA', get: (r: any) => Number(r.hra) },
                { header: 'Conveyance', get: (r: any) => Number(r.conveyance) },
                { header: 'Medical', get: (r: any) => Number(r.medical_allowance) },
                { header: 'Special', get: (r: any) => Number(r.special_allowance) },
                { header: 'Other', get: (r: any) => Number(r.other_allowance) },
                { header: 'GROSS', get: (r: any) => Number(r.gross_salary) },
                { header: 'PF', get: (r: any) => (r.pf_applicable ? 'Yes' : 'No') },
                { header: 'ESI', get: (r: any) => (r.esi_applicable ? 'Yes' : 'No') },
                { header: 'UAN', get: (r: any) => r.uan_no || '—' },
                { header: 'PAN', get: (r: any) => r.pan_no || '—' },
                { header: 'Bank', get: (r: any) => r.bank_name || '—' },
                { header: 'Account', get: (r: any) => r.bank_account || '—' },
                { header: 'IFSC', get: (r: any) => r.bank_ifsc || '—' },
                { header: 'Revisions', get: (r: any) => Number(r.revisions) },
                { header: 'Has Login', get: (r: any) => (r.has_login ? 'Yes' : 'NO') },
              ]} />
            <PrintButton />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Employee', 'Department', 'Basic', 'Allowances', 'Gross', 'Statutory', 'Login'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.employee_id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <div className="text-[#e2e2e8] font-semibold">{r.full_name}</div>
                  <div className="text-[10px] text-[#dcc1ae]/50">
                    {r.emp_code}{r.designation ? ` · ${r.designation}` : ''}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.department || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{inr(r.basic_salary)}</td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">
                  {inr(Number(r.gross_salary) - Number(r.basic_salary))}
                </td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right">{inr(r.gross_salary)}</td>
                <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae]">
                  {[r.pf_applicable && 'PF', r.esi_applicable && 'ESI', r.pt_applicable && 'PT']
                    .filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-4 py-2.5">
                  {r.has_login
                    ? <span className="text-emerald-400 text-[11px]">✓</span>
                    : <span className="text-blue-400 text-[11px]">none</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Salary History ----------------
function History({ rows, hasEmp }: { rows: any[]; hasEmp: boolean }) {
  if (!hasEmp) return <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">Select an employee above.</div>

  const total = rows.reduce((n, r) => n + Number(r.net_salary || 0), 0)
  const max = Math.max(1, ...rows.map(r => Number(r.net_salary || 0)))

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          {rows[0]?.employee_name ?? ''} — {rows.length} payslip(s), {inr(total)} total
        </span>
        <div className="flex gap-2">
          <ExportButtons filename="salary-history" title="Employee Salary History" rows={rows}
            columns={[
              { header: 'Month', get: (r: any) => r.month_label },
              { header: 'Payslip No.', get: (r: any) => r.payslip_no },
              { header: 'Paid Days', get: (r: any) => Number(r.paid_days) },
              { header: 'LOP Days', get: (r: any) => Number(r.lop_days) },
              { header: 'Gross', get: (r: any) => Number(r.gross_salary) },
              { header: 'Earned', get: (r: any) => Number(r.earned_gross) },
              { header: 'Overtime', get: (r: any) => Number(r.overtime_amt) },
              { header: 'Total Earnings', get: (r: any) => Number(r.total_earnings) },
              { header: 'Deductions', get: (r: any) => Number(r.total_deductions) },
              { header: 'NET', get: (r: any) => Number(r.net_salary) },
              { header: 'Status', get: (r: any) => r.status },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Month', 'Days', 'Earned', 'Overtime', 'Deductions', 'NET', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.payslip_no} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r.month_label}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae] whitespace-nowrap">
                {r.paid_days}
                {Number(r.lop_days) > 0 && <span className="text-red-400"> ({r.lop_days} LOP)</span>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{inr(r.earned_gross)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">
                {Number(r.overtime_amt) ? inr(r.overtime_amt) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-amber-400 text-right">
                {Number(r.total_deductions) ? inr(r.total_deductions) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right">{inr2(r.net_salary)}</td>
              <td className="px-4 py-2.5" style={{ minWidth: 90 }}>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#ff8f00]"
                    style={{ width: `${Number(r.net_salary) / max * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No payslips for this employee.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Department / Project ----------------
function Grouped({ rows, keyField, label }: { rows: any[]; keyField: string; label: string }) {
  const total = rows.reduce((n, r) => n + Number(r.total_cost || 0), 0)
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">
          {label}-wise Payroll — {inr(total)} total cost
        </span>
        <div className="flex gap-2">
          <ExportButtons filename={`payroll-by-${label.toLowerCase()}`} title={`Payroll by ${label}`} rows={rows}
            columns={[
              { header: label, get: (r: any) => r[keyField] },
              { header: 'Employees', get: (r: any) => Number(r.employees) },
              { header: 'Earned', get: (r: any) => Number(r.earned) },
              { header: 'Overtime', get: (r: any) => Number(r.overtime) },
              { header: 'Total Earnings', get: (r: any) => Number(r.total_earnings) },
              { header: 'Deductions', get: (r: any) => Number(r.deductions) },
              { header: 'Net Salary', get: (r: any) => Number(r.net_salary) },
              { header: 'Employer PF/ESI', get: (r: any) => Number(r.employer_cost) },
              { header: 'TOTAL COST', get: (r: any) => Number(r.total_cost) },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {[label, 'Staff', 'Earned', 'Overtime', 'Net Paid', 'Employer Cost', 'TOTAL COST', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{r[keyField]}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{r.employees}</td>
              <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{inr(r.earned)}</td>
              <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">
                {Number(r.overtime) ? inr(r.overtime) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{inr(r.net_salary)}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae] text-right">
                {Number(r.employer_cost) ? inr(r.employer_cost) : '—'}
              </td>
              <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right">{inr(r.total_cost)}</td>
              <td className="px-4 py-2.5" style={{ minWidth: 90 }}>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-[#ff8f00]"
                    style={{ width: `${Number(r.total_cost) / total * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Bank Advice ----------------
function BankAdvice({ rows }: { rows: any[] }) {
  const ready = rows.filter(r => r.readiness === 'Ready')
  const blocked = rows.filter(r => r.readiness !== 'Ready' && r.readiness !== 'Not a bank transfer')
  const total = ready.reduce((n, r) => n + Number(r.amount || 0), 0)

  return (
    <div>
      {blocked.length > 0 && (
        <div className="card p-3 mb-4 bg-red-500/5 border-red-500/25 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
          <div className="text-[13px]">
            <b className="text-red-400">{blocked.length} transfer(s) cannot be made</b>
            <span className="text-[#dcc1ae]"> — missing bank details. Fix them before uploading to the bank.</span>
          </div>
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">
            Bank Advice — {ready.length} transfer(s), {inr(total)}
          </span>
          <div className="flex gap-2">
            <ExportButtons filename="bank-advice" title="Payroll Bank Advice" rows={rows}
              columns={[
                { header: 'Emp Code', get: (r: any) => r.emp_code || '—' },
                { header: 'Beneficiary', get: (r: any) => r.account_holder },
                { header: 'Bank', get: (r: any) => r.bank_name || '—' },
                { header: 'Account Number', get: (r: any) => r.bank_account || '—' },
                { header: 'IFSC', get: (r: any) => r.bank_ifsc || '—' },
                { header: 'Amount', get: (r: any) => Number(r.amount) },
                { header: 'Reference', get: (r: any) => r.reference },
                { header: 'Mode', get: (r: any) => r.pay_mode },
                { header: 'Status', get: (r: any) => r.readiness },
              ]} />
            <PrintButton />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Beneficiary', 'Bank', 'Account', 'IFSC', 'Amount', 'Status'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map((r, i) => {
              const bad = r.readiness !== 'Ready' && r.readiness !== 'Not a bank transfer'
              return (
                <tr key={i} className={`hover:bg-white/[0.02] ${bad ? 'bg-red-500/[0.06]' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="text-[#e2e2e8] font-semibold">{r.account_holder}</div>
                    <div className="text-[10px] text-[#dcc1ae]/50">{r.emp_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.bank_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.bank_account || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{r.bank_ifsc || '—'}</td>
                  <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right whitespace-nowrap">
                    {inr2(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                      r.readiness === 'Ready' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : bad ? 'bg-red-500/10 text-red-400 border-red-500/25'
                        : 'bg-white/5 text-[#dcc1ae]/60 border-white/10'}`}>
                      {r.readiness}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------- Statutory ----------------
function Statutory({ rows }: { rows: any[] }) {
  const r = rows[0]
  if (!r) return <div className="card p-8 text-center text-[#dcc1ae]/60 text-sm">No payroll for this month.</div>

  return (
    <div>
      <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/20">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>gavel</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{inr(r.grand_total)} must be remitted for {r.month_label}</b>
            <p className="text-[#dcc1ae] mt-0.5">
              This is money you have deducted from staff, plus the employer's own contribution.
              It is not yours — it belongs to the PF office, ESIC and the tax department.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card title="Provident Fund" n={r.pf_employees}>
          <Line k="Employee share" v={inr2(r.pf_employee)} />
          <Line k="Employer share" v={inr2(r.pf_employer)} />
          <Total v={inr2(r.pf_total)} />
        </Card>
        <Card title="ESI" n={r.esi_employees}>
          <Line k="Employee share" v={inr2(r.esi_employee)} />
          <Line k="Employer share" v={inr2(r.esi_employer)} />
          <Total v={inr2(r.esi_total)} />
        </Card>
        <Card title="Professional Tax">
          <Total v={inr2(r.pt_total)} />
        </Card>
        <Card title="Income Tax (TDS)">
          <Total v={inr2(r.tds_total)} />
        </Card>
      </div>

      <div className="card p-4 mt-4 bg-[#ff8f00]/[0.06] border-[#ff8f00]/25 flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#dcc1ae] uppercase tracking-wider">Total to Remit</span>
        <span className="font-mono text-[24px] font-bold text-[#ffb87b]">{inr2(r.grand_total)}</span>
      </div>

      <div className="flex justify-end mt-3">
        <ExportButtons filename="statutory-due" title="Statutory Remittance" rows={rows}
          columns={[
            { header: 'Month', get: (r: any) => r.month_label },
            { header: 'PF (Employee)', get: (r: any) => Number(r.pf_employee) },
            { header: 'PF (Employer)', get: (r: any) => Number(r.pf_employer) },
            { header: 'PF Total', get: (r: any) => Number(r.pf_total) },
            { header: 'ESI (Employee)', get: (r: any) => Number(r.esi_employee) },
            { header: 'ESI (Employer)', get: (r: any) => Number(r.esi_employer) },
            { header: 'ESI Total', get: (r: any) => Number(r.esi_total) },
            { header: 'Professional Tax', get: (r: any) => Number(r.pt_total) },
            { header: 'TDS', get: (r: any) => Number(r.tds_total) },
            { header: 'GRAND TOTAL', get: (r: any) => Number(r.grand_total) },
          ]} />
        <PrintButton />
      </div>
    </div>
  )
}

// ---------------- Audit ----------------
function Audit({ rows }: { rows: any[] }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Payroll Audit Log</span>
        <div className="flex gap-2">
          <ExportButtons filename="payroll-audit" title="Payroll Audit Log" rows={rows}
            columns={[
              { header: 'When', get: (r: any) => new Date(r.created_at).toLocaleString('en-IN') },
              { header: 'Action', get: (r: any) => r.action_label },
              { header: 'Month', get: (r: any) => r.month_label || '—' },
              { header: 'Employee', get: (r: any) => r.employee_name || '—' },
              { header: 'User', get: (r: any) => r.actor_name || '—' },
              { header: 'Role', get: (r: any) => r.actor_role || '—' },
              { header: 'Detail', get: (r: any) => JSON.stringify(r.detail ?? {}) },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['When', 'Action', 'Month', 'User', 'Detail'].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 font-mono text-[11px] text-[#dcc1ae] whitespace-nowrap">
                {new Date(r.created_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </td>
              <td className="px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${
                  r.action.includes('approv') || r.action.includes('paid')
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>
                  {r.action_label}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{r.month_label || '—'}</td>
              <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                {r.actor_name || '—'}
                {r.actor_role && <div className="text-[10px] text-[#dcc1ae]/50">{r.actor_role}</div>}
              </td>
              <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae]/70 max-w-[280px] truncate">
                {r.detail ? JSON.stringify(r.detail).slice(0, 70) : '—'}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No audit entries.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Card({ title, n, children }: { title: string; n?: number; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{title}</span>
        {n !== undefined && <span className="text-[11px] text-[#dcc1ae]/50">{n} employee(s)</span>}
      </div>
      {children}
    </div>
  )
}
function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-[12px] text-[#dcc1ae]">{k}</span>
      <span className="font-mono text-[13px] text-[#e2e2e8]">{v}</span>
    </div>
  )
}
function Total({ v }: { v: string }) {
  return (
    <div className="flex justify-between py-1.5 mt-1 border-t border-white/[0.08]">
      <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total</span>
      <span className="font-mono text-[15px] font-bold text-[#ffb87b]">{v}</span>
    </div>
  )
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}