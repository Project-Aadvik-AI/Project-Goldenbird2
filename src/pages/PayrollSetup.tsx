import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const inr2 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Emp = {
  employee_id: string; emp_code: string | null; full_name: string
  designation: string | null; department: string | null
  project_name: string | null; status: string; salary_type: string
  basic_salary: number; hra: number; conveyance: number
  medical_allowance: number; special_allowance: number; other_allowance: number
  gross_salary: number; daily_rate: number
  pf_applicable: boolean; esi_applicable: boolean; pt_applicable: boolean
  uan_no: string | null; pf_no: string | null; esi_no: string | null; pan_no: string | null
  bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
  pay_mode: string
  salary_configured: boolean; bank_configured: boolean
  revision_count: number; last_revised: string | null
}
type Stat = {
  id: string; code: string; name: string
  employee_pct: number; employer_pct: number; applies_to: string
  wage_ceiling: number | null; eligibility_max: number | null
  fixed_amount: number | null
  effective_from: string; active: boolean; notes: string | null
}

type Tab = 'employees' | 'statutory'

export default function PayrollSetup() {
  const { isAdmin, can } = useAuth()
  const [tab, setTab] = useState<Tab>('employees')
  const [emps, setEmps] = useState<Emp[]>([])
  const [stats, setStats] = useState<Stat[]>([])
  const [unlinked, setUnlinked] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Emp | null>(null)
  const [editStat, setEditStat] = useState<Stat | null>(null)
  const [showStatForm, setShowStatForm] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    const [e, s, u] = await Promise.all([
      supabase.from('employee_salary_master').select('*').eq('status', 'Active').order('full_name'),
      supabase.from('payroll_statutory').select('*').order('code'),
      supabase.from('employees_without_login').select('*').order('full_name'),
    ])
    setEmps((e.data as Emp[]) ?? [])
    setStats((s.data as Stat[]) ?? [])
    setUnlinked((u.data as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return emps
    return emps.filter(e =>
      `${e.full_name} ${e.emp_code ?? ''} ${e.department ?? ''} ${e.designation ?? ''}`
        .toLowerCase().includes(s))
  }, [emps, q])

  const kpi = useMemo(() => ({
    total: emps.length,
    configured: emps.filter(e => e.salary_configured).length,
    noSalary: emps.filter(e => !e.salary_configured).length,
    noBank: emps.filter(e => e.salary_configured && !e.bank_configured).length,
    monthlyCost: emps.reduce((n, e) => n + Number(e.gross_salary || 0), 0),
  }), [emps])

  if (!isAdmin && !can('payroll', 'view')) {
    return <div className="p-8 text-center text-[#dcc1ae]">
      Salary information is restricted to HR and Head Office.
    </div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Payroll Setup</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Salary structures, and the statutory rates your accountant owns.
        </p>
      </div>

      {/* the honest warning */}
      {stats.length === 0 && (
        <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '20px' }}>gavel</span>
            <div className="text-[13px]">
              <b className="text-amber-400">No statutory rates are configured.</b>
              <p className="text-[#dcc1ae] mt-1">
                PF, ESI, PT and TDS rates have <b>deliberately not been pre-filled</b>. Statutory rates
                change, and a wrong TDS calculation is your liability with the tax department — not
                something an ERP should guess.
              </p>
              <p className="text-[#dcc1ae] mt-1">
                <b className="text-[#e2e2e8]">Your accountant should enter them on the Statutory tab.</b>{' '}
                The system will then do the arithmetic exactly as they specify.
              </p>
            </div>
          </div>
        </div>
      )}

      {unlinked.length > 0 && (
        <div className="card p-4 mb-4 bg-blue-500/5 border-blue-500/25">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-blue-400" style={{ fontSize: '20px' }}>link_off</span>
            <div className="flex-1">
              <b className="text-blue-400 text-[13px]">
                {unlinked.length} employee(s) have no login linked
              </b>
              <p className="text-[12px] text-[#dcc1ae] mt-1">
                They <b>cannot see their own payslips</b> — the system has no way to know which
                employee record belongs to which login.
              </p>
              <div className="mt-2 space-y-1.5">
                {unlinked.slice(0, 8).map(u => (
                  <div key={u.employee_id} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-[#e2e2e8]">
                      {u.full_name}
                      {u.email && <span className="text-[#dcc1ae]/50"> · {u.email}</span>}
                    </span>
                    {u.suggested_profile_id ? (
                      <button className="text-emerald-400 text-[11px] font-semibold uppercase hover:underline whitespace-nowrap"
                        onClick={async () => {
                          const { error } = await supabase.rpc('link_employee_login', {
                            p_emp: u.employee_id, p_profile: u.suggested_profile_id,
                          })
                          if (error) { alert(error.message); return }
                          load()
                        }}>
                        Link to {u.suggested_profile_name}
                      </button>
                    ) : (
                      <span className="text-[#dcc1ae]/40 text-[11px] whitespace-nowrap">
                        no matching login
                      </span>
                    )}
                  </div>
                ))}
                {unlinked.length > 8 && (
                  <p className="text-[11px] text-[#dcc1ae]/50">…and {unlinked.length - 8} more.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {kpi.noSalary > 0 && (
        <div className="card p-3 mb-4 bg-red-500/5 border-red-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
          <div className="text-[13px]">
            <b className="text-red-400">{kpi.noSalary} employee(s) have no salary set</b>
            <span className="text-[#dcc1ae]"> — they cannot be paid until you set one.</span>
          </div>
        </div>
      )}
      {kpi.noBank > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>account_balance</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{kpi.noBank} employee(s) have a salary but no bank details</b>
            <span className="text-[#dcc1ae]"> — a bank transfer will fail.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Active Employees" value={String(kpi.total)} />
        <K label="Salary Configured" value={`${kpi.configured} / ${kpi.total}`}
          tone={kpi.configured === kpi.total ? 'emerald' : 'amber'} />
        <K label="Monthly Salary Cost" value={inr(kpi.monthlyCost)} />
        <K label="Statutory Rates Set" value={String(stats.filter(s => s.active).length)}
          tone={stats.length ? 'emerald' : 'red'} />
      </div>

      <div className="flex gap-1 mb-4 flex-wrap items-center">
        {([['employees', `Salary Structures (${emps.length})`],
           ['statutory', `Statutory Rates (${stats.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        {tab === 'employees' && (
          <input className="input ml-2" style={{ maxWidth: 200, padding: '6px 10px', fontSize: '13px' }}
            value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…" />
        )}
        {tab === 'statutory' && (
          <button className="btn btn-primary ml-auto" onClick={() => { setEditStat(null); setShowStatForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Rate
          </button>
        )}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : (
        <>
          {tab === 'employees' && <Employees rows={filtered} onEdit={setEditing} />}
          {tab === 'statutory' && <Statutory rows={stats}
            onEdit={s => { setEditStat(s); setShowStatForm(true) }} onChanged={load} />}
        </>
      )}

      {editing && <SalaryForm e={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }} />}
      {showStatForm && <StatForm s={editStat} onClose={() => setShowStatForm(false)}
        onSaved={() => { setShowStatForm(false); load() }} />}
    </div>
  )
}

// ---------------- Employees ----------------
function Employees({ rows, onEdit }: { rows: Emp[]; onEdit: (e: Emp) => void }) {
  return (
    <div className="card overflow-hidden overflow-x-auto">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-semibold text-[#e2e2e8]">Salary Structures</span>
        <div className="flex gap-2">
          <ExportButtons filename="salary-master" title="Employee Salary Master" rows={rows}
            columns={[
              { header: 'Code', get: (r: any) => r.emp_code || '—' },
              { header: 'Employee', get: (r: any) => r.full_name },
              { header: 'Department', get: (r: any) => r.department || '—' },
              { header: 'Designation', get: (r: any) => r.designation || '—' },
              { header: 'Project', get: (r: any) => r.project_name || '—' },
              { header: 'Basic', get: (r: any) => Number(r.basic_salary) },
              { header: 'HRA', get: (r: any) => Number(r.hra) },
              { header: 'Conveyance', get: (r: any) => Number(r.conveyance) },
              { header: 'Medical', get: (r: any) => Number(r.medical_allowance) },
              { header: 'Special', get: (r: any) => Number(r.special_allowance) },
              { header: 'Other', get: (r: any) => Number(r.other_allowance) },
              { header: 'Gross', get: (r: any) => Number(r.gross_salary) },
              { header: 'PF', get: (r: any) => (r.pf_applicable ? 'Yes' : 'No') },
              { header: 'ESI', get: (r: any) => (r.esi_applicable ? 'Yes' : 'No') },
              { header: 'UAN', get: (r: any) => r.uan_no || '—' },
              { header: 'Bank', get: (r: any) => r.bank_name || '—' },
              { header: 'Account', get: (r: any) => r.bank_account || '—' },
              { header: 'IFSC', get: (r: any) => r.bank_ifsc || '—' },
            ]} />
          <PrintButton />
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#282a2e]"><tr>
          {['Employee', 'Department', 'Basic', 'Allowances', 'Gross', 'Statutory', 'Bank', ''].map(h => (
            <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(e => {
            const allowances = Number(e.gross_salary) - Number(e.basic_salary)
            return (
              <tr key={e.employee_id}
                className={`hover:bg-white/[0.02] ${!e.salary_configured ? 'bg-red-500/[0.05]' : ''}`}>
                <td className="px-4 py-2.5">
                  <div className="text-[#e2e2e8] font-semibold">{e.full_name}</div>
                  <div className="text-[10px] font-mono text-[#dcc1ae]/50">
                    {e.emp_code}{e.designation ? ` · ${e.designation}` : ''}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                  {e.department || '—'}
                  {e.project_name && <div className="text-[10px] text-[#dcc1ae]/50">{e.project_name}</div>}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                  {Number(e.basic_salary) ? inr(e.basic_salary) : (
                    <span className="text-red-400 text-[11px]">not set</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                  {allowances > 0 ? inr(allowances) : '—'}
                </td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#ffb87b] text-right whitespace-nowrap">
                  {Number(e.gross_salary) ? inr(e.gross_salary) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {e.pf_applicable && <Chip>PF</Chip>}
                    {e.esi_applicable && <Chip>ESI</Chip>}
                    {e.pt_applicable && <Chip>PT</Chip>}
                    {!e.pf_applicable && !e.esi_applicable && !e.pt_applicable && (
                      <span className="text-[#dcc1ae]/30 text-[11px]">none</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {e.bank_configured ? (
                    <div className="text-[11px] text-[#dcc1ae]">
                      {e.bank_name}
                      <div className="text-[10px] font-mono text-[#dcc1ae]/50">
                        ···{(e.bank_account ?? '').slice(-4)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-amber-400 text-[11px]">not set</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline"
                    onClick={() => onEdit(e)}>
                    {e.salary_configured ? 'Edit' : 'Set Salary'}
                  </button>
                  {e.revision_count > 0 && (
                    <div className="text-[9px] text-[#dcc1ae]/40">{e.revision_count} revision(s)</div>
                  )}
                </td>
              </tr>
            )
          })}
          {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
            No employees.
          </td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------- Statutory ----------------
function Statutory({ rows, onEdit, onChanged }: {
  rows: Stat[]; onEdit: (s: Stat) => void; onChanged: () => void
}) {
  async function toggle(s: Stat) {
    await supabase.from('payroll_statutory').update({ active: !s.active }).eq('id', s.id)
    onChanged()
  }

  return (
    <div>
      <div className="card p-4 mb-4 bg-white/[0.02]">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[#dcc1ae]" style={{ fontSize: '18px' }}>info</span>
          <div className="text-[12px] text-[#dcc1ae]">
            <b className="text-[#e2e2e8]">These rates are yours to set, and yours to keep correct.</b>
            <p className="mt-1">
              The system does the arithmetic exactly as you specify here. It does not know, and will not
              guess, the current PF ceiling or ESI threshold — those change, and getting them wrong is a
              statutory liability. Your accountant should confirm every figure against the current rules.
            </p>
            <p className="mt-1">
              Each rate has an <b>effective-from date</b>, so changing one does not retrospectively alter
              payslips you have already issued.
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Code', 'Name', 'Employee %', 'Employer %', 'Applies To', 'Ceiling / Limit', 'From', 'Status', ''].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(s => (
              <tr key={s.id} className={`hover:bg-white/[0.02] ${!s.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase border bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/25">
                    {s.code}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[#e2e2e8]">{s.name}</td>
                <td className="px-4 py-2.5 font-mono font-bold text-[#e2e2e8] text-right">
                  {Number(s.employee_pct) ? `${s.employee_pct}%` : (s.fixed_amount ? inr(s.fixed_amount) : '—')}
                </td>
                <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">
                  {Number(s.employer_pct) ? `${s.employer_pct}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">{s.applies_to}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                  {s.wage_ceiling ? <>cap {inr(s.wage_ceiling)}</> : null}
                  {s.eligibility_max ? <div>only if ≤ {inr(s.eligibility_max)}</div> : null}
                  {!s.wage_ceiling && !s.eligibility_max && '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{s.effective_from}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    s.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                             : 'bg-white/5 text-[#dcc1ae]/50 border-white/10'}`}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button className="text-[#ffb87b] text-[11px] font-semibold uppercase hover:underline mr-2"
                    onClick={() => onEdit(s)}>Edit</button>
                  <button className="text-[#dcc1ae] text-[11px] font-semibold uppercase hover:underline"
                    onClick={() => toggle(s)}>{s.active ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-12 text-center">
              <span className="material-symbols-outlined text-amber-400/60" style={{ fontSize: '32px' }}>gavel</span>
              <p className="text-[14px] text-[#e2e2e8] font-semibold mt-2">No statutory rates configured</p>
              <p className="text-[12px] text-[#dcc1ae] mt-1 max-w-md mx-auto">
                Payroll will still run, but no PF, ESI or TDS will be deducted. Add the rates your
                accountant confirms.
              </p>
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =====================================================================
//  SALARY FORM
// =====================================================================
function SalaryForm({ e, onClose, onSaved }: { e: Emp; onClose: () => void; onSaved: () => void }) {
  const [basic, setBasic] = useState(String(e.basic_salary || ''))
  const [hra, setHra] = useState(String(e.hra || ''))
  const [conv, setConv] = useState(String(e.conveyance || ''))
  const [med, setMed] = useState(String(e.medical_allowance || ''))
  const [spec, setSpec] = useState(String(e.special_allowance || ''))
  const [other, setOther] = useState(String(e.other_allowance || ''))
  const [effective, setEffective] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')

  const [pf, setPf] = useState(e.pf_applicable)
  const [esi, setEsi] = useState(e.esi_applicable)
  const [pt, setPt] = useState(e.pt_applicable)
  const [uan, setUan] = useState(e.uan_no ?? '')
  const [pfNo, setPfNo] = useState(e.pf_no ?? '')
  const [esiNo, setEsiNo] = useState(e.esi_no ?? '')
  const [pan, setPan] = useState(e.pan_no ?? '')

  const [bankName, setBankName] = useState(e.bank_name ?? '')
  const [bankAcc, setBankAcc] = useState(e.bank_account ?? '')
  const [ifsc, setIfsc] = useState(e.bank_ifsc ?? '')
  const [payMode, setPayMode] = useState(e.pay_mode ?? 'Bank')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const gross = ['basic', 'hra', 'conv', 'med', 'spec', 'other']
    .map((_, i) => Number([basic, hra, conv, med, spec, other][i]) || 0)
    .reduce((a, b) => a + b, 0)

  const isRevision = Number(e.basic_salary) > 0 && gross !== Number(e.gross_salary)

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (Number(basic) <= 0) { setErr('Basic salary is required.'); return }
    if (isRevision && !reason.trim()) {
      setErr('This changes an existing salary — give a reason for the revision.'); return
    }

    setBusy(true); setErr(null)

    // the salary structure goes through revise_salary, so history is kept
    const { error: rErr } = await supabase.rpc('revise_salary', {
      p_emp: e.employee_id, p_effective: effective,
      p_basic: Number(basic) || 0, p_hra: Number(hra) || 0,
      p_conveyance: Number(conv) || 0, p_medical: Number(med) || 0,
      p_special: Number(spec) || 0, p_other: Number(other) || 0,
      p_daily: 0, p_reason: reason || 'Initial salary structure',
    })
    if (rErr) { setErr(rErr.message); setBusy(false); return }

    // the rest is plain employee data
    const { error } = await supabase.from('employees').update({
      pf_applicable: pf, esi_applicable: esi, pt_applicable: pt,
      uan_no: uan || null, pf_no: pfNo || null, esi_no: esiNo || null,
      pan_no: pan || null,
      bank_name: bankName || null, bank_account: bankAcc || null,
      bank_ifsc: ifsc || null, pay_mode: payMode,
    }).eq('id', e.employee_id)

    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={ev => ev.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{e.full_name}</h3>
            <p className="text-[12px] text-[#dcc1ae]">
              {e.emp_code}{e.designation ? ` · ${e.designation}` : ''}{e.department ? ` · ${e.department}` : ''}
            </p>
          </div>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* earnings */}
          <div>
            <Sec>Monthly Earnings</Sec>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <F label="Basic Salary *">
                <input className="input mono text-right" inputMode="decimal" value={basic}
                  onChange={ev => setBasic(ev.target.value.replace(/[^\d.]/g, ''))} autoFocus />
              </F>
              <F label="HRA">
                <input className="input mono text-right" inputMode="decimal" value={hra}
                  onChange={ev => setHra(ev.target.value.replace(/[^\d.]/g, ''))} />
              </F>
              <F label="Conveyance">
                <input className="input mono text-right" inputMode="decimal" value={conv}
                  onChange={ev => setConv(ev.target.value.replace(/[^\d.]/g, ''))} />
              </F>
              <F label="Medical">
                <input className="input mono text-right" inputMode="decimal" value={med}
                  onChange={ev => setMed(ev.target.value.replace(/[^\d.]/g, ''))} />
              </F>
              <F label="Special Allowance">
                <input className="input mono text-right" inputMode="decimal" value={spec}
                  onChange={ev => setSpec(ev.target.value.replace(/[^\d.]/g, ''))} />
              </F>
              <F label="Other Allowance">
                <input className="input mono text-right" inputMode="decimal" value={other}
                  onChange={ev => setOther(ev.target.value.replace(/[^\d.]/g, ''))} />
              </F>
            </div>

            <div className="mt-3 rounded-lg bg-[#ff8f00]/[0.06] border border-[#ff8f00]/20 p-3 flex items-center justify-between">
              <span className="text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wider">Gross Monthly</span>
              <span className="font-mono text-[20px] font-bold text-[#ffb87b]">{inr2(gross)}</span>
            </div>
          </div>

          {/* effective from */}
          <div className="grid grid-cols-2 gap-4">
            <F label="Effective From *">
              <input type="date" className="input" value={effective}
                onChange={ev => setEffective(ev.target.value)} />
            </F>
            <F label={isRevision ? 'Reason for Revision *' : 'Reason'}>
              <input className="input" value={reason} onChange={ev => setReason(ev.target.value)}
                placeholder={isRevision ? 'Annual increment, promotion…' : 'Initial structure'} />
            </F>
          </div>

          {isRevision && (
            <div className="card p-3 bg-blue-500/5 border-blue-500/20 text-[12px] text-blue-400">
              <b>This is a revision.</b> The old structure ({inr2(e.gross_salary)}) is kept in history —
              payslips already issued will not silently recompute at the new rate.
            </div>
          )}

          {/* statutory */}
          <div>
            <Sec>Statutory</Sec>
            <div className="flex flex-wrap gap-4 mb-3">
              <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
                <input type="checkbox" className="accent-[#ff8f00]" checked={pf}
                  onChange={ev => setPf(ev.target.checked)} /> PF applicable
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
                <input type="checkbox" className="accent-[#ff8f00]" checked={esi}
                  onChange={ev => setEsi(ev.target.checked)} /> ESI applicable
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#dcc1ae] cursor-pointer">
                <input type="checkbox" className="accent-[#ff8f00]" checked={pt}
                  onChange={ev => setPt(ev.target.checked)} /> Professional Tax
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <F label="UAN"><input className="input mono" value={uan} onChange={ev => setUan(ev.target.value)} /></F>
              <F label="PF Number"><input className="input mono" value={pfNo} onChange={ev => setPfNo(ev.target.value)} /></F>
              <F label="ESI Number"><input className="input mono" value={esiNo} onChange={ev => setEsiNo(ev.target.value)} /></F>
              <F label="PAN"><input className="input mono" value={pan} maxLength={10}
                onChange={ev => setPan(ev.target.value.toUpperCase())} /></F>
            </div>
          </div>

          {/* bank */}
          <div>
            <Sec>Bank &amp; Payment</Sec>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <F label="Bank Name"><input className="input" value={bankName} onChange={ev => setBankName(ev.target.value)} /></F>
              <F label="Account Number"><input className="input mono" value={bankAcc} onChange={ev => setBankAcc(ev.target.value)} /></F>
              <F label="IFSC"><input className="input mono" value={ifsc} maxLength={11}
                onChange={ev => setIfsc(ev.target.value.toUpperCase())} /></F>
              <F label="Pay Mode">
                <select className="input" value={payMode} onChange={ev => setPayMode(ev.target.value)}>
                  {['Bank', 'Cash', 'UPI', 'Cheque'].map(m => <option key={m}>{m}</option>)}
                </select>
              </F>
            </div>
          </div>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : isRevision ? 'Save Revision' : 'Save Salary Structure'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

// =====================================================================
//  STATUTORY RATE FORM
// =====================================================================
function StatForm({ s, onClose, onSaved }: { s: Stat | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(s?.code ?? 'PF')
  const [name, setName] = useState(s?.name ?? '')
  const [empPct, setEmpPct] = useState(String(s?.employee_pct ?? ''))
  const [erPct, setErPct] = useState(String(s?.employer_pct ?? ''))
  const [appliesTo, setAppliesTo] = useState(s?.applies_to ?? 'Basic')
  const [ceiling, setCeiling] = useState(String(s?.wage_ceiling ?? ''))
  const [eligMax, setEligMax] = useState(String(s?.eligibility_max ?? ''))
  const [fixed, setFixed] = useState(String(s?.fixed_amount ?? ''))
  const [effective, setEffective] = useState(s?.effective_from ?? new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState(s?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // guidance ONLY — not pre-filled, and clearly marked as needing confirmation
  const HINT: Record<string, string> = {
    PF: 'Commonly 12% employee + 12% employer on Basic, capped at a wage ceiling. CONFIRM the current rate and ceiling.',
    ESI: 'Commonly ~0.75% employee + ~3.25% employer on Gross, only below an eligibility threshold. CONFIRM current figures.',
    PT: 'Professional Tax is a state-specific flat slab. Enter the amount for YOUR state.',
    TDS: 'Income tax depends on the employee\'s regime, declarations and slab. Enter a flat % only if your accountant is deducting one.',
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Give it a name.'); return }
    setBusy(true); setErr(null)

    const { data: u } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles')
      .select('org_id').eq('id', u?.user?.id ?? '').maybeSingle()

    const payload = {
      code, name: name.trim(),
      employee_pct: Number(empPct) || 0,
      employer_pct: Number(erPct) || 0,
      applies_to: appliesTo,
      wage_ceiling: Number(ceiling) || null,
      eligibility_max: Number(eligMax) || null,
      fixed_amount: Number(fixed) || null,
      effective_from: effective,
      notes: notes || null,
      active: true,
    }

    const { error } = s
      ? await supabase.from('payroll_statutory').update(payload).eq('id', s.id)
      : await supabase.from('payroll_statutory').insert({
          ...payload, org_id: prof?.org_id, created_by: u?.user?.id,
        })

    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">
          {s ? `Edit ${s.code}` : 'Add a Statutory Rate'}
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Code *">
              <select className="input" value={code} onChange={e => {
                setCode(e.target.value)
                if (!name) setName(e.target.value)
              }}>
                {['PF', 'ESI', 'PT', 'TDS', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </F>
            <F label="Name *">
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Provident Fund" />
            </F>
          </div>

          {HINT[code] && (
            <div className="card p-2.5 bg-amber-500/5 border-amber-500/20 text-[11px] text-amber-400/90">
              {HINT[code]}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <F label="Employee %">
              <input className="input mono text-right" inputMode="decimal" value={empPct}
                onChange={e => setEmpPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
            </F>
            <F label="Employer %">
              <input className="input mono text-right" inputMode="decimal" value={erPct}
                onChange={e => setErPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
            </F>
          </div>

          <F label="Applies To">
            <select className="input" value={appliesTo} onChange={e => setAppliesTo(e.target.value)}>
              {['Basic', 'Gross', 'Basic+DA', 'Net'].map(a => <option key={a}>{a}</option>)}
            </select>
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label="Wage Ceiling">
              <input className="input mono text-right" inputMode="decimal" value={ceiling}
                onChange={e => setCeiling(e.target.value.replace(/[^\d.]/g, ''))} />
              <p className="text-[10px] text-[#dcc1ae]/50 mt-1">Contribution capped at this wage</p>
            </F>
            <F label="Eligibility Max">
              <input className="input mono text-right" inputMode="decimal" value={eligMax}
                onChange={e => setEligMax(e.target.value.replace(/[^\d.]/g, ''))} />
              <p className="text-[10px] text-[#dcc1ae]/50 mt-1">Only applies below this gross</p>
            </F>
          </div>

          <F label="Fixed Amount (for flat slabs like PT)">
            <input className="input mono text-right" inputMode="decimal" value={fixed}
              onChange={e => setFixed(e.target.value.replace(/[^\d.]/g, ''))} />
          </F>

          <F label="Effective From *">
            <input type="date" className="input" value={effective}
              onChange={e => setEffective(e.target.value)} />
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
              Payslips already issued are not affected.
            </p>
          </F>

          <F label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>
            {busy ? 'Saving…' : 'Save Rate'}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Sec({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3 pb-1.5 border-b border-white/[0.06]">{children}</div>
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border bg-blue-500/10 text-blue-400 border-blue-500/20">{children}</span>
}
function K({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' | 'red' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400'
    : tone === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
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