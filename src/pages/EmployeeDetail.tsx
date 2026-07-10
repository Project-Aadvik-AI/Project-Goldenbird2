import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateImage, PrivateLink } from '../components/PrivateFile'
import ExportButtons from '../components/ExportButtons'

type Employee = {
  id: string; emp_code: string | null; full_name: string; designation: string | null
  department: string | null; phone: string | null; email: string | null; address: string | null
  aadhaar: string | null; emergency_contact: string | null; emergency_phone: string | null
  qualification: string | null; monthly_salary: number | null; join_date: string | null
  exit_date: string | null; status: string; project_id: string | null; photo: string | null
}
type Att = { id: string; date: string; status: string; hours: number | null; remark: string | null }
type Task = { id: string; title: string; priority: string; status: string; due_date: string | null; created_at: string }
type EmpDoc = { id: string; doc_type: string | null; title: string | null; file: string | null; expiry_date: string | null }
type Payment = { id: string; date: string; pay_type: string; amount: number; mode: string | null; period: string | null; remark: string | null }
type Advance = {
  id: string; date: string; amount: number | null; purpose: string | null; spent_amount: number | null
  proof: string | null; status: string | null; remark: string | null; verified_at: string | null
}

type Tab = 'attendance' | 'tasks' | 'documents' | 'payments' | 'advances'

const PAY_TYPES = ['Salary', 'Bonus', 'Reimbursement', 'Deduction']
const MODES = ['Cash', 'Bank', 'UPI', 'Cheque']

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, user } = useAuth()
  const [emp, setEmp] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('attendance')

  const [att, setAtt] = useState<Att[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskLinked, setTaskLinked] = useState(true)
  const [docs, setDocs] = useState<EmpDoc[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [advances, setAdvances] = useState<Advance[]>([])
  const [imprestExpenses, setImprestExpenses] = useState<{ id: string; date: string; amount: number; expense_type: string | null; remark: string | null; vendor: string | null; bill_photo: string | null; approval_status: string | null; rejection_reason: string | null }[]>([])

  async function loadPayments(eid: string) {
    const { data } = await supabase.from('employee_payments').select('id,date,pay_type,amount,mode,period,remark')
      .eq('employee_id', eid).order('date', { ascending: false }).limit(300)
    setPayments((data as Payment[]) ?? [])
  }
  async function loadAdvances(eid: string) {
    const { data } = await supabase.from('advances').select('id,date,amount,purpose,spent_amount,proof,status,remark,verified_at')
      .eq('employee_id', eid).order('date', { ascending: false }).limit(300)
    setAdvances((data as Advance[]) ?? [])
  }

  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data: e } = await supabase.from('employees').select('*').eq('id', id).single()
      if (!alive) return
      setEmp(e as Employee)
      const { data: a } = await supabase.from('attendance').select('id,date,status,hours,remark')
        .eq('employee_id', id).order('date', { ascending: false }).limit(400)
      if (alive) setAtt((a as Att[]) ?? [])
      if (e) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name')
        const name = (e as Employee).full_name.trim().toLowerCase()
        const ids = (profs ?? []).filter(p => (p.full_name ?? '').trim().toLowerCase() === name).map(p => p.id)
        if (ids.length) {
          const { data: t } = await supabase.from('tasks').select('id,title,priority,status,due_date,created_at')
            .in('assigned_to', ids).order('created_at', { ascending: false }).limit(200)
          if (alive) { setTasks((t as Task[]) ?? []); setTaskLinked(true) }
        } else if (alive) { setTasks([]); setTaskLinked(false) }
      }
      const { data: d } = await supabase.from('employee_documents').select('id,doc_type,title,file,expiry_date')
        .eq('employee_id', id).order('created_at', { ascending: false })
      if (alive) setDocs((d as EmpDoc[]) ?? [])
      await loadPayments(id)
      await loadAdvances(id)
      const { data: iex } = await supabase.from('expenses').select('id,date,amount,expense_type,remark,vendor,bill_photo,approval_status,rejection_reason')
        .eq('imprest_employee_id', id).order('date', { ascending: false }).limit(300)
      if (alive) setImprestExpenses((iex as any[]) ?? [])
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [id])

  const summary = useMemo(() => {
    const s: Record<string, number> = {}
    for (const a of att) s[a.status] = (s[a.status] ?? 0) + 1
    return s
  }, [att])

  const paidTotal = useMemo(() => payments.filter(p => p.pay_type !== 'Deduction').reduce((n, p) => n + Number(p.amount || 0), 0), [payments])
  const advGiven = useMemo(() =>
    advances.filter(a => a.status !== 'Rejected').reduce((n, a) => n + Number(a.amount || 0), 0), [advances])
  const imprestApproved = useMemo(() => imprestExpenses.filter(e => (e.approval_status ?? 'Approved') === 'Approved'), [imprestExpenses])
  const imprestPending = useMemo(() => imprestExpenses.filter(e => e.approval_status === 'Pending'), [imprestExpenses])
  const imprestRejected = useMemo(() => imprestExpenses.filter(e => e.approval_status === 'Rejected'), [imprestExpenses])
  const imprestSpent = useMemo(() =>
    imprestApproved.reduce((n, e) => n + Number(e.amount || 0), 0), [imprestApproved])
  const imprestPendingTotal = useMemo(() => imprestPending.reduce((n, e) => n + Number(e.amount || 0), 0), [imprestPending])
  const advTotalSpent = Math.round((imprestSpent) * 100) / 100
  const advOutstanding = Math.round((advGiven - advTotalSpent) * 100) / 100

  async function returnRemainingCash() {
    if (advOutstanding <= 0 || !emp) { alert('Nothing outstanding to return.'); return }
    if (!confirm(`Record ₹${advOutstanding.toLocaleString('en-IN')} returned as cash and mark these advances settled?`)) return
    // apply the returned amount to oldest advances' spent_amount (FIFO), and mark settled where cleared
    const { data: advs } = await supabase.from('advances').select('id, amount, spent_amount, status')
      .eq('employee_id', emp.id).neq('status', 'Rejected').order('date', { ascending: true })
    let left = advOutstanding
    for (const a of (advs ?? []) as any[]) {
      if (left <= 0) break
      const remaining = Number(a.amount || 0) - Number(a.spent_amount || 0)
      if (remaining <= 0) continue
      const take = Math.min(remaining, left)
      await supabase.from('advances').update({
        returned_amount: Math.round(((Number(a.spent_amount || 0)) ) * 0 + take * 100) / 100,
        spent_amount: Math.round((Number(a.spent_amount || 0) + take) * 100) / 100,
        settled: (remaining - take) <= 0.009, settled_at: new Date().toISOString(),
      }).eq('id', a.id)
      left = Math.round((left - take) * 100) / 100
    }
    loadAdvances(emp.id)
  }

  async function approveImprestExpense(id: string) {
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('expenses').update({ approval_status: 'Approved', approved_by: u?.user?.id ?? null, approved_at: new Date().toISOString(), rejection_reason: null }).eq('id', id)
    if (emp) { const { data: iex } = await supabase.from('expenses').select('id,date,amount,expense_type,remark,vendor,bill_photo,approval_status,rejection_reason').eq('imprest_employee_id', emp.id).order('date', { ascending: false }).limit(300); setImprestExpenses((iex as any[]) ?? []) }
  }
  async function rejectImprestExpense(id: string) {
    const reason = prompt('Rejection reason (the employee will see this):')
    if (reason === null) return
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('expenses').update({ approval_status: 'Rejected', approved_by: u?.user?.id ?? null, approved_at: new Date().toISOString(), rejection_reason: reason || 'Rejected' }).eq('id', id)
    if (emp) { const { data: iex } = await supabase.from('expenses').select('id,date,amount,expense_type,remark,vendor,bill_photo,approval_status,rejection_reason').eq('imprest_employee_id', emp.id).order('date', { ascending: false }).limit(300); setImprestExpenses((iex as any[]) ?? []) }
  }

  if (loading) return <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>
  if (!emp) return (
    <div className="p-8 text-center">
      <p className="text-[#dcc1ae]">Employee not found.</p>
      <button className="btn btn-ghost mt-4" onClick={() => navigate('/employees')}>Back to Employees</button>
    </div>
  )

  return (
    <div>
      <button onClick={() => navigate('/employees')} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#dcc1ae] hover:text-[#e2e2e8] uppercase tracking-wider mb-5 transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> All Employees
      </button>

      {/* Profile header */}
      <div className="card p-6 mb-5">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            {emp.photo
              ? <PrivateImage bucket="employee-docs" path={emp.photo} alt={emp.full_name} className="w-full h-full object-cover" />
              : <span className="text-2xl font-semibold text-[#dcc1ae]">{emp.full_name.slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{emp.full_name}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-[#dcc1ae] border border-white/10'}`}>{emp.status}</span>
            </div>
            <div className="text-[13px] text-[#dcc1ae] mt-1 font-mono">{emp.emp_code || '—'} · {emp.designation || 'No designation'} · {emp.department || '—'}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 mt-5">
              <Info label="Phone" value={emp.phone} mono />
              <Info label="Email" value={emp.email} />
              <Info label="Aadhaar" value={emp.aadhaar} mono />
              <Info label="Qualification" value={emp.qualification} />
              <Info label="Monthly Salary" value={emp.monthly_salary != null ? `₹${Number(emp.monthly_salary).toLocaleString('en-IN')}` : null} mono />
              <Info label="Join Date" value={emp.join_date} mono />
              <Info label="Emergency Contact" value={emp.emergency_contact} />
              <Info label="Emergency Phone" value={emp.emergency_phone} mono />
              <Info label="Address" value={emp.address} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-white/5 overflow-x-auto">
        {([['attendance', 'Attendance'], ['tasks', 'Tasks'], ['payments', 'Payments'], ['advances', 'Site Advances'], ['documents', 'Documents']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === k ? 'text-[#e2e2e8] border-[#ffb87b]' : 'text-[#dcc1ae]/60 border-transparent hover:text-[#dcc1ae]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Attendance */}
      {tab === 'attendance' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[16px] font-bold text-[#e2e2e8]">{v}</span>
                <span className="text-[11px] text-[#dcc1ae]/70 ml-1.5 uppercase tracking-wide">{k}</span>
              </div>
            ))}
            {!att.length && <div className="text-[#dcc1ae]/60 text-sm py-2">No attendance records yet.</div>}
          </div>
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#e2e2e8]">Attendance History</span>
              <ExportButtons
                filename={`attendance_${emp.emp_code || emp.full_name}`}
                title={`Attendance · ${emp.full_name}`}
                dateField="date"
                rows={att}
                columns={[
                  { header: 'Date', get: r => r.date },
                  { header: 'Status', get: r => r.status },
                  { header: 'Hours', get: r => (r.hours ?? '—') },
                  { header: 'Remark', get: r => r.remark || '—' },
                ]}
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Date', 'Status', 'Hours', 'Remark'].map(h => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {att.map(a => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae]">{a.date}</td>
                    <td className="px-4 py-3 text-[#e2e2e8]">{a.status}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{a.hours ?? '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{a.remark || '—'}</td>
                  </tr>
                ))}
                {!att.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No records.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="card overflow-hidden overflow-x-auto">
          {!taskLinked && (
            <div className="px-4 py-3 text-[12px] text-amber-400/90 bg-amber-500/5 border-b border-amber-500/10">
              This employee isn't linked to an app-login account, so no tasks are matched. Tasks are matched by matching the employee's name to a user account.
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Task', 'Priority', 'Status', 'Due', 'Created'].map(h => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {tasks.map(t => (
                <tr key={t.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[#e2e2e8] font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{t.priority}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.status === 'Done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-[#dcc1ae] border border-white/10'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae]">{t.due_date || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]/70">{t.created_at.slice(0, 10)}</td>
                </tr>
              ))}
              {!tasks.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No tasks.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments */}
      {tab === 'payments' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <span className="text-[16px] font-bold text-emerald-400">₹{paidTotal.toLocaleString('en-IN')}</span>
              <span className="text-[11px] text-[#dcc1ae]/70 ml-1.5 uppercase tracking-wide">Total Paid</span>
            </div>
          </div>
          {isAdmin && emp && <PayrollPanel empId={emp.id} monthlySalary={emp.monthly_salary} attendance={att} advanceOutstanding={advOutstanding} onRecorded={() => { loadPayments(emp.id); loadAdvances(emp.id) }} />}
          {isAdmin && emp && <PaymentForm employeeId={emp.id} onSaved={() => loadPayments(emp.id)} />}
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#e2e2e8]">Payment History</span>
              <ExportButtons
                filename={`payments_${emp.emp_code || emp.full_name}`}
                title={`Payments · ${emp.full_name}`}
                dateField="date"
                rows={payments}
                columns={[
                  { header: 'Date', get: r => r.date },
                  { header: 'Type', get: r => r.pay_type },
                  { header: 'Amount (INR)', get: r => Number(r.amount) },
                  { header: 'Mode', get: r => r.mode || '—' },
                  { header: 'Period', get: r => r.period || '—' },
                  { header: 'Remark', get: r => r.remark || '—' },
                ]}
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Date', 'Type', 'Amount', 'Mode', 'Period', 'Remark'].map(h => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae]">{p.date}</td>
                    <td className="px-4 py-3 text-[#e2e2e8]">{p.pay_type}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${p.pay_type === 'Deduction' ? 'text-red-400' : 'text-[#e2e2e8]'}`}>{p.pay_type === 'Deduction' ? '−' : ''}₹{Number(p.amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{p.mode || '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{p.period || '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{p.remark || '—'}</td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No payments recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Site Advances */}
      {tab === 'advances' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-0.5">Advance Given</div>
              <div className="text-[16px] font-mono font-bold text-[#e2e2e8]">₹{advGiven.toLocaleString('en-IN')}</div>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-0.5">Spent (bills)</div>
              <div className="text-[16px] font-mono font-bold text-[#dcc1ae]">₹{advTotalSpent.toLocaleString('en-IN')}</div>
            </div>
            <div className={`px-3 py-2.5 rounded-lg border ${advOutstanding > 0 ? 'bg-amber-500/5 border-amber-500/15' : 'bg-emerald-500/5 border-emerald-500/15'}`}>
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-0.5">{advOutstanding > 0 ? 'Balance (to recover)' : advOutstanding < 0 ? 'Overspent' : 'Settled'}</div>
              <div className={`text-[16px] font-mono font-bold ${advOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>₹{Math.abs(advOutstanding).toLocaleString('en-IN')}</div>
            </div>
          </div>
          {advOutstanding > 0 && (
            <div className="mb-3">
              <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: '12px' }} onClick={returnRemainingCash}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>payments</span> Record cash returned &amp; settle (₹{advOutstanding.toLocaleString('en-IN')})
              </button>
            </div>
          )}
          {imprestExpenses.length > 0 && (
            <div className="card overflow-hidden overflow-x-auto mb-4">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-sm font-semibold text-[#e2e2e8]">Imprest Expenses (bills)</span>
                <span className="text-[11px] text-[#dcc1ae]/60">Approved ₹{imprestSpent.toLocaleString('en-IN')}{imprestPendingTotal > 0 ? ` · Pending ₹${imprestPendingTotal.toLocaleString('en-IN')}` : ''} · {imprestExpenses.length} bill(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e]"><tr>
                  {['Date', 'Type', 'Vendor', 'Amount', 'Status', 'Bill', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {imprestExpenses.map(e => {
                    const st = e.approval_status ?? 'Approved'
                    return (
                    <tr key={e.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{e.date}</td>
                      <td className="px-4 py-2.5 text-[#e2e2e8]">{e.expense_type || '—'}</td>
                      <td className="px-4 py-2.5 text-[#dcc1ae]">{e.vendor || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">₹{Number(e.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${st === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : st === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{st}</span>
                        {st === 'Rejected' && e.rejection_reason && <div className="text-[10px] text-red-400/70 mt-0.5">{e.rejection_reason}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.bill_photo
                          ? <PrivateLink bucket="expense-bills" path={e.bill_photo} className="btn btn-ghost">View bill</PrivateLink>
                          : <span className="text-[11px] text-amber-400/70">no bill</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        {isAdmin && st === 'Pending' && (
                          <>
                            <button className="text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold uppercase mr-2" onClick={() => approveImprestExpense(e.id)}>Approve</button>
                            <button className="text-red-400 hover:text-red-300 text-[11px] font-semibold uppercase" onClick={() => rejectImprestExpense(e.id)}>Reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
          {emp && <AdvanceForm employeeId={emp.id} personName={emp.full_name} onSaved={() => loadAdvances(emp.id)} />}
          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#e2e2e8]">Advances & Spend</span>
              <ExportButtons
                filename={`advances_${emp.emp_code || emp.full_name}`}
                title={`Site Advances · ${emp.full_name}`}
                dateField="date"
                rows={advances}
                columns={[
                  { header: 'Date', get: r => r.date },
                  { header: 'Given (INR)', get: r => (r.amount ?? '—') },
                  { header: 'Spent (INR)', get: r => (r.spent_amount ?? '—') },
                  { header: 'Purpose', get: r => r.purpose || '—' },
                  { header: 'Status', get: r => r.status || 'Pending' },
                ]}
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Date', 'Given', 'Spent', 'Purpose', 'Proof', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {advances.map(a => (
                  <tr key={a.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae]">{a.date}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{a.amount != null ? `₹${Number(a.amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{a.spent_amount != null ? `₹${Number(a.spent_amount).toLocaleString('en-IN')}` : '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{a.purpose || '—'}</td>
                    <td className="px-4 py-3">{a.proof ? <PrivateLink bucket="employee-docs" path={a.proof} className="btn btn-ghost" >View</PrivateLink> : <span className="text-[#dcc1ae]/50">—</span>}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isAdmin && (a.status ?? 'Pending') === 'Pending' && (
                        <div className="flex gap-2">
                          <button className="text-emerald-400 text-[11px] font-bold uppercase hover:underline" onClick={() => verify(a.id, 'Verified')}>Verify</button>
                          <button className="text-red-400 text-[11px] font-bold uppercase hover:underline" onClick={() => verify(a.id, 'Rejected')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!advances.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No advances yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="card p-5">
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">On file · {docs.length}</div>
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '20px' }}>description</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#e2e2e8] truncate">{d.title || d.doc_type || 'Untitled'}</div>
                  <div className="text-[10px] text-[#dcc1ae]/60">{d.doc_type}{d.expiry_date ? ` · Expires ${d.expiry_date}` : ''}</div>
                </div>
                {d.file && <PrivateLink bucket="employee-docs" path={d.file} className="btn btn-ghost">Open</PrivateLink>}
              </div>
            ))}
            {!docs.length && <div className="text-[#dcc1ae]/60 text-sm py-4 text-center">No documents. Add them from the Employees list → Docs.</div>}
          </div>
        </div>
      )}
    </div>
  )

  async function verify(advId: string, status: 'Verified' | 'Rejected') {
    await supabase.from('advances').update({
      status, verified_by: user?.id ?? null, verified_at: new Date().toISOString(),
    }).eq('id', advId)
    if (emp) loadAdvances(emp.id)
  }
}

function PayrollPanel({ empId, monthlySalary, attendance, advanceOutstanding, onRecorded }: { empId: string; monthlySalary: number | null; attendance: { date: string; status: string }[]; advanceOutstanding: number; onRecorded: () => void }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (monthlySalary == null) {
    return (
      <div className="card p-4 mb-4 text-[13px] text-[#dcc1ae]">
        Set a <span className="text-[#e2e2e8] font-semibold">Monthly Salary</span> on this employee (Edit) to auto-calculate payroll from attendance.
      </div>
    )
  }

  if (!open) return (
    <button className="btn btn-ghost mb-4" onClick={() => setOpen(true)}>
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>calculate</span> Payroll from Attendance
    </button>
  )

  const inMonth = attendance.filter(a => a.date.startsWith(month))
  const c = (st: string) => inMonth.filter(a => a.status === st).length
  const present = c('Present'), half = c('Half Day'), absent = c('Absent')
  const leave = c('Leave'), holiday = c('Holiday'), weekoff = c('Week Off')
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const perDay = monthlySalary / daysInMonth
  // Earned-based: pay ONLY for Present (+ half of Half-day). Unmarked/Absent/Leave/Holiday/WeekOff = not paid.
  const paidDays = present + half * 0.5
  const grossNet = Math.round(perDay * paidDays)
  const monthLabel = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  // Advance recovery: recover up to whichever is smaller (outstanding vs this salary)
  const [recover, setRecover] = useState(true)
  const recoverable = Math.max(0, Math.min(advanceOutstanding, grossNet))
  const recoverAmt = recover ? recoverable : 0
  const net = Math.round(grossNet - recoverAmt)

  async function record() {
    setBusy(true); setMsg(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const today = new Date().toISOString().slice(0, 10)
    // 1) salary payment (net of recovery)
    const { error } = await supabase.from('employee_payments').insert({
      org_id: prof?.org_id, employee_id: empId, date: today,
      pay_type: 'Salary', amount: net, mode: 'Bank', period: monthLabel,
      remark: `Auto payroll · ${present}P / ${half}HD · paid ${paidDays} days × ₹${Math.round(perDay).toLocaleString('en-IN')}/day` + (recoverAmt > 0 ? ` · advance recovered ₹${recoverAmt.toLocaleString('en-IN')}` : ''),
    })
    if (error) { setBusy(false); setMsg(error.message); return }
    // 2) if recovering, record it against the oldest outstanding advances (spent_amount) so the ledger clears
    if (recoverAmt > 0) {
      const { data: advs } = await supabase.from('advances').select('id, amount, spent_amount, status')
        .eq('employee_id', empId).neq('status', 'Rejected').order('date', { ascending: true })
      let left = recoverAmt
      for (const a of (advs ?? []) as any[]) {
        if (left <= 0) break
        const remaining = Number(a.amount || 0) - Number(a.spent_amount || 0)
        if (remaining <= 0) continue
        const take = Math.min(remaining, left)
        await supabase.from('advances').update({ spent_amount: Math.round((Number(a.spent_amount || 0) + take) * 100) / 100 }).eq('id', a.id)
        left = Math.round((left - take) * 100) / 100
      }
    }
    setBusy(false)
    setMsg(recoverAmt > 0 ? `Recorded ✓ (₹${recoverAmt.toLocaleString('en-IN')} advance recovered)` : 'Recorded ✓')
    onRecorded()
  }

  const chip = (label: string, val: number, cls = 'text-[#dcc1ae]') => (
    <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-center">
      <div className={`text-[15px] font-bold ${cls}`}>{val}</div>
      <div className="text-[9px] text-[#dcc1ae]/60 uppercase tracking-wide">{label}</div>
    </div>
  )

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#e2e2e8] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>calculate</span> Payroll from Attendance
        </span>
        <button className="text-[#dcc1ae] hover:text-white" onClick={() => { setOpen(false); setMsg(null) }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="block">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Month</span>
          <input type="month" className="input" value={month} onChange={e => { setMonth(e.target.value); setMsg(null) }} />
        </label>
        <div className="text-[12px] text-[#dcc1ae]">
          Monthly salary <span className="font-mono text-[#e2e2e8]">₹{monthlySalary.toLocaleString('en-IN')}</span>
          {' · '}per-day <span className="font-mono text-[#e2e2e8]">₹{Math.round(perDay).toLocaleString('en-IN')}</span>
          {' · '}{daysInMonth} days
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {chip('Present', present, 'text-emerald-400')}
        {chip('Half Day', half, 'text-amber-400')}
        {chip('Absent', absent, 'text-red-400')}
        {chip('Leave', leave)}
        {chip('Holiday', holiday)}
        {chip('Week Off', weekoff)}
      </div>

      {inMonth.length === 0 && (
        <div className="text-[12px] text-amber-400/90 mb-3">No attendance marked for {monthLabel}. Mark Present days to calculate salary — currently net is ₹0.</div>
      )}

      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] mb-3">
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-[#dcc1ae]">
            Paid days: <span className="font-mono text-emerald-400">{paidDays}</span>
            <span className="text-[#dcc1ae]/50"> × ₹{Math.round(perDay).toLocaleString('en-IN')}/day</span>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide">Earned salary</div>
            <div className="font-mono text-[15px] font-bold text-[#e2e2e8]">₹{grossNet.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {advanceOutstanding > 0 && grossNet > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5">
            <div className="text-[11px] text-amber-400 mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>warning</span>
              This employee has ₹{advanceOutstanding.toLocaleString('en-IN')} unsettled advance. Recover it here, or settle first in Site Advances.
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-[12px] text-amber-400">
              <input type="checkbox" className="accent-amber-500" checked={recover} onChange={e => setRecover(e.target.checked)} />
              Recover pending advance (₹{advanceOutstanding.toLocaleString('en-IN')} outstanding)
              <span className="ml-auto font-mono">− ₹{recoverAmt.toLocaleString('en-IN')}</span>
            </label>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wide">Net to pay {recoverAmt > 0 ? '(after recovery)' : ''}</div>
          <div className="font-mono text-[20px] font-bold text-emerald-400">₹{net.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {msg && <div className={`text-sm mb-2 ${msg.includes('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</div>}
      <button className="btn btn-primary w-full" disabled={busy || !!msg?.includes('✓')} onClick={record}>
        {busy ? 'Recording…' : `Record Salary Payment for ${monthLabel}`}
      </button>
    </div>
  )
}

function PaymentForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [payType, setPayType] = useState('Salary')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('Bank')
  const [period, setPeriod] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!amount) { setErr('Enter an amount'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('employee_payments').insert({
      org_id: prof?.org_id, employee_id: employeeId, date, pay_type: payType,
      amount: Number(amount), mode, period: period || null, remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAmount(''); setPeriod(''); setRemark(''); setOpen(false); onSaved()
  }

  if (!open) return (
    <button className="btn btn-primary mb-4" onClick={() => setOpen(true)}>
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Record Payment
    </button>
  )
  return (
    <div className="card p-4 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <F label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
        <F label="Type"><select className="input" value={payType} onChange={e => setPayType(e.target.value)}>{PAY_TYPES.map(t => <option key={t}>{t}</option>)}</select></F>
        <F label="Amount (INR)"><input className="input mono" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} /></F>
        <F label="Mode"><select className="input" value={mode} onChange={e => setMode(e.target.value)}>{MODES.map(m => <option key={m}>{m}</option>)}</select></F>
        <F label="Period"><input className="input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="July 2026" /></F>
        <F label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></F>
      </div>
      {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
      <div className="flex gap-2 mt-3">
        <button className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Payment'}</button>
      </div>
    </div>
  )
}

function AdvanceForm({ employeeId, personName, onSaved }: { employeeId: string; personName: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [spent, setSpent] = useState('')
  const [purpose, setPurpose] = useState('')
  const [paymentMode, setPaymentMode] = useState('Cash')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    if (!amount && !spent) { setErr('Enter the amount given or spent'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    let proofPath: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, `advances/${employeeId}`)
      const { path: stored, error: upErr } = await uploadPrivate('employee-docs', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      proofPath = stored ?? null
    }
    const { error } = await supabase.from('advances').insert({
      org_id: prof?.org_id, employee_id: employeeId, person: personName, date,
      amount: amount ? Number(amount) : null, spent_amount: spent ? Number(spent) : null,
      purpose: purpose || null, payment_mode: paymentMode || null, proof: proofPath, status: 'Pending',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAmount(''); setSpent(''); setPurpose(''); setPaymentMode('Cash'); setFile(null); setOpen(false); onSaved()
  }

  if (!open) return (
    <button className="btn btn-primary mb-4" onClick={() => setOpen(true)}>
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Submit Advance / Spend
    </button>
  )
  return (
    <div className="card p-4 mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <F label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></F>
        <F label="Amount Given (INR)"><input className="input mono" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} /></F>
        <F label="Amount Spent (INR)"><input className="input mono" inputMode="numeric" value={spent} onChange={e => setSpent(e.target.value.replace(/\D/g, ''))} /></F>
        <F label="Purpose"><input className="input" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Diesel, tools…" /></F>
        <F label="Payment Mode">
          <select className="input" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
            <option>Cash</option><option>Bank</option><option>UPI</option><option>Cheque</option>
          </select>
        </F>
        <F label="Proof (bill/photo)">
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>{file ? file.name.slice(0, 16) : 'Attach'}
          </button>
        </F>
      </div>
      {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
      <div className="flex gap-2 mt-3">
        <button className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Submitting…' : 'Submit'}</button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'Pending'
  const cls = s === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : s === 'Rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cls}`}>{s}</span>
}

function Info({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-[#dcc1ae]/60 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[13px] text-[#e2e2e8] ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}