import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import { useWorkspace } from '../lib/workspace'
import ExportButtons from '../components/ExportButtons'
import PrintButton from '../components/PrintButton'
import LoanForm, { LoanRow, LOAN_CATEGORIES } from '../components/LoanForm'

type Payment = { id: string; loan_id: string; paid_date: string; amount: number; principal_paid: number | null; interest_paid: number | null; mode: string | null; reference: string | null }
type AssetLite = { id: string; name: string; category: string | null }
type DocLite = { loan_id: string; title: string | null; expiry_date: string | null }

const FREQ_STEP: Record<string, number> = { 'Monthly': 1, 'Quarterly': 3, 'Half-Yearly': 6, 'Yearly': 12 }
const CATS = ['All', ...LOAN_CATEGORIES]

const iso = (d: Date) => d.toISOString().slice(0, 10)
function addMonths(d: string, n: number) { const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + n); return iso(x) }
function daysUntil(d: string | null): number | null { if (!d) return null; return Math.round((new Date(d + 'T00:00:00').getTime() - new Date(iso(new Date()) + 'T00:00:00').getTime()) / 86400000) }
const inr = (n: number) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')

export default function CreditManagement() {
  const { can, isAdmin } = useAuth()
  const { projects, activeProject } = useProject()
  const { inHeadOffice } = useWorkspace()
  const navigate = useNavigate()

  const [loans, setLoans] = useState<LoanRow[]>([])
  const [pays, setPays] = useState<Payment[]>([])
  const [assets, setAssets] = useState<AssetLite[]>([])
  const [docs, setDocs] = useState<DocLite[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('All')
  const [report, setReport] = useState('register')
  const [showForm, setShowForm] = useState(false)

  const pRef = useRef<string | null>(activeProject?.id ?? null)
  pRef.current = activeProject?.id ?? null
  const canCreate = isAdmin || can('credit', 'create')

  async function load() {
    const p = activeProject?.id ?? null
    setLoading(true)
    let lq = supabase.from('asset_loans').select('*').order('created_at', { ascending: false })
    if (activeProject) lq = lq.eq('project_id', activeProject.id)
    const [{ data: ln }, { data: as }] = await Promise.all([
      lq,
      supabase.from('assets').select('id, name, category'),
    ])
    if (pRef.current !== p) return
    const loanRows = (ln as LoanRow[]) ?? []
    setLoans(loanRows)
    setAssets((as as AssetLite[]) ?? [])

    const ids = loanRows.map(l => l.id)
    if (ids.length) {
      const [{ data: pp }, { data: dd }] = await Promise.all([
        supabase.from('asset_loan_payments').select('id, loan_id, paid_date, amount, principal_paid, interest_paid, mode, reference').in('loan_id', ids),
        supabase.from('loan_documents').select('loan_id, title, expiry_date').in('loan_id', ids).not('expiry_date', 'is', null),
      ])
      setPays((pp as Payment[]) ?? [])
      setDocs((dd as DocLite[]) ?? [])
    } else { setPays([]); setDocs([]) }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [activeProject?.id])

  // Live refresh on any loan / payment change.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => load(), 400) }
    const ch = supabase.channel('credit-mgmt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_loans' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asset_loan_payments' }, bump)
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
    /* eslint-disable-next-line */
  }, [activeProject?.id])

  const assetMap = useMemo(() => { const m = new Map<string, AssetLite>(); for (const a of assets) m.set(a.id, a); return m }, [assets])
  const projMap = useMemo(() => { const m = new Map<string, string>(); for (const p of projects) m.set(p.id, p.name); return m }, [projects])
  const paidByLoan = useMemo(() => { const m = new Map<string, number>(); for (const p of pays) m.set(p.loan_id, (m.get(p.loan_id) ?? 0) + Number(p.amount || 0)); return m }, [pays])
  const countByLoan = useMemo(() => { const m = new Map<string, number>(); for (const p of pays) m.set(p.loan_id, (m.get(p.loan_id) ?? 0) + 1); return m }, [pays])

  // Category for a loan: use the stored one, else infer from the linked asset.
  function categoryOf(l: LoanRow): string {
    if (l.category) return l.category
    const a = l.asset_id ? assetMap.get(l.asset_id) : null
    if (a?.category === 'Vehicle') return 'Vehicle Loans'
    if (a?.category === 'Machinery' || a?.category === 'Equipment') return 'Machine & Equipment Loans'
    return 'Other Loans'
  }
  const nameOf = (l: LoanRow) => l.loan_name || l.finance_company || (l.asset_id ? assetMap.get(l.asset_id)?.name : null) || l.loan_no || 'Loan'
  const outstandingOf = (l: LoanRow) => Math.max(0, Math.round((Number(l.loan_amount || 0) - (paidByLoan.get(l.id) ?? 0)) * 100) / 100)
  function nextDueOf(l: LoanRow): string | null {
    if (l.status !== 'Active' || !l.start_date) return null
    const step = FREQ_STEP[l.emi_frequency || 'Monthly'] || 1
    return addMonths(l.start_date, ((countByLoan.get(l.id) ?? 0) + 1) * step)
  }
  const isOverdue = (l: LoanRow) => { const nd = nextDueOf(l); return !!nd && nd < iso(new Date()) }

  const scoped = useMemo(() => cat === 'All' ? loans : loans.filter(l => categoryOf(l) === cat), [loans, cat, assetMap])

  const cards = useMemo(() => {
    const thisMonth = iso(new Date()).slice(0, 7)
    let active = 0, outstanding = 0, dueThisMonth = 0, overdue = 0, closed = 0
    let paid = 0
    for (const l of scoped) {
      paid += paidByLoan.get(l.id) ?? 0
      if (l.status === 'Active') {
        active++
        outstanding += outstandingOf(l)
        const nd = nextDueOf(l)
        if (nd && nd.slice(0, 7) === thisMonth) dueThisMonth += Number(l.emi_amount || 0)
        if (isOverdue(l)) overdue++
      } else closed++
    }
    return { active, outstanding, dueThisMonth, paid, overdue, closed }
  }, [scoped, paidByLoan, countByLoan])

  const alerts = useMemo(() => {
    const out: { tone: 'red' | 'amber'; icon: string; text: string; id: string }[] = []
    const today = iso(new Date())
    for (const l of scoped) {
      if (l.status === 'Active') {
        const nd = nextDueOf(l)
        if (nd && nd < today) out.push({ tone: 'red', icon: 'error', text: `EMI overdue — ${nameOf(l)} (due ${nd}, ${inr(l.emi_amount || 0)}).`, id: l.id })
        else if (nd) { const du = daysUntil(nd); if (du != null && du <= 7) out.push({ tone: 'amber', icon: 'schedule', text: `EMI due in ${du}d — ${nameOf(l)} (${inr(l.emi_amount || 0)}).`, id: l.id }) }
        const ec = daysUntil(l.end_date); if (ec != null && ec >= 0 && ec <= 30) out.push({ tone: 'amber', icon: 'event', text: `Loan closing soon — ${nameOf(l)} ends ${l.end_date}.`, id: l.id })
        const ie = daysUntil(l.insurance_expiry); if (ie != null && ie >= 0 && ie <= 30) out.push({ tone: 'amber', icon: 'verified_user', text: `Insurance expiring — ${nameOf(l)} on ${l.insurance_expiry}.`, id: l.id })
      }
    }
    const scopedIds = new Set(scoped.map(l => l.id))
    for (const d of docs) {
      if (!scopedIds.has(d.loan_id)) continue
      const de = daysUntil(d.expiry_date); if (de != null && de >= 0 && de <= 30) {
        const l = loans.find(x => x.id === d.loan_id)
        out.push({ tone: 'amber', icon: 'description', text: `Document expiring — ${d.title || 'document'}${l ? ' · ' + nameOf(l) : ''} on ${d.expiry_date}.`, id: d.loan_id })
      }
    }
    return out
  }, [scoped, docs, loans, countByLoan])

  // ── Reports ──
  const reportDef = useMemo(() => {
    const money = (n: number) => Math.round(Number(n || 0))
    const loanBase = (l: LoanRow) => ({ code: l.loan_no || '—', name: nameOf(l), category: categoryOf(l), lender: l.finance_company || '—' })
    const defs: Record<string, { title: string; file: string; rows: any[]; cols: { header: string; get: (r: any) => string | number }[]; dateField?: string }> = {
      register: {
        title: 'Loan Register', file: 'loan_register',
        rows: scoped.map(l => ({ ...loanBase(l), type: l.loan_type || '—', principal: money(l.loan_amount || 0), rate: l.interest_rate ?? '—', emi: money(l.emi_amount || 0), outstanding: outstandingOf(l), start: l.start_date || '—', end: l.end_date || '—', status: l.status, project: l.project_id ? (projMap.get(l.project_id) || '—') : '—' })),
        cols: [{ header: 'Loan No', get: r => r.code }, { header: 'Name', get: r => r.name }, { header: 'Category', get: r => r.category }, { header: 'Type', get: r => r.type }, { header: 'Lender', get: r => r.lender }, { header: 'Principal (INR)', get: r => r.principal }, { header: 'Rate %', get: r => r.rate }, { header: 'EMI (INR)', get: r => r.emi }, { header: 'Outstanding (INR)', get: r => r.outstanding }, { header: 'Start', get: r => r.start }, { header: 'End', get: r => r.end }, { header: 'Project', get: r => r.project }, { header: 'Status', get: r => r.status }],
      },
      emi: {
        title: 'EMI Register', file: 'emi_register', dateField: 'date',
        rows: pays.filter(p => scoped.some(l => l.id === p.loan_id)).sort((a, b) => (a.paid_date < b.paid_date ? 1 : -1)).map(p => { const l = loans.find(x => x.id === p.loan_id)!; return { date: p.paid_date, loan: l ? nameOf(l) : '—', code: l?.loan_no || '—', amount: money(p.amount), principal: money(p.principal_paid || 0), interest: money(p.interest_paid || 0), mode: p.mode || '—', ref: p.reference || '—' } }),
        cols: [{ header: 'Date', get: r => r.date }, { header: 'Loan No', get: r => r.code }, { header: 'Loan', get: r => r.loan }, { header: 'Amount (INR)', get: r => r.amount }, { header: 'Principal (INR)', get: r => r.principal }, { header: 'Interest (INR)', get: r => r.interest }, { header: 'Mode', get: r => r.mode }, { header: 'Reference', get: r => r.ref }],
      },
      outstanding: {
        title: 'Outstanding Loans', file: 'outstanding_loans',
        rows: scoped.filter(l => outstandingOf(l) > 0).map(l => ({ ...loanBase(l), principal: money(l.loan_amount || 0), paid: money(paidByLoan.get(l.id) ?? 0), outstanding: outstandingOf(l), status: l.status })),
        cols: [{ header: 'Loan No', get: r => r.code }, { header: 'Name', get: r => r.name }, { header: 'Category', get: r => r.category }, { header: 'Lender', get: r => r.lender }, { header: 'Principal (INR)', get: r => r.principal }, { header: 'Paid (INR)', get: r => r.paid }, { header: 'Outstanding (INR)', get: r => r.outstanding }, { header: 'Status', get: r => r.status }],
      },
      interest: {
        title: 'Interest Paid Report', file: 'interest_paid',
        rows: scoped.map(l => { const ps = pays.filter(p => p.loan_id === l.id); const interest = ps.reduce((s, p) => s + Number(p.interest_paid || 0), 0); const principal = ps.reduce((s, p) => s + Number(p.principal_paid || 0), 0); return { ...loanBase(l), interest: money(interest), principal: money(principal), total: money(interest + principal) } }).filter(r => r.total > 0),
        cols: [{ header: 'Loan No', get: r => r.code }, { header: 'Name', get: r => r.name }, { header: 'Lender', get: r => r.lender }, { header: 'Principal Paid (INR)', get: r => r.principal }, { header: 'Interest Paid (INR)', get: r => r.interest }, { header: 'Total Paid (INR)', get: r => r.total }],
      },
    }
    // Monthly EMI report (current month)
    const thisMonth = iso(new Date()).slice(0, 7)
    defs.monthly = {
      title: `Monthly EMI Report — ${thisMonth}`, file: 'monthly_emi', dateField: 'date',
      rows: pays.filter(p => p.paid_date.slice(0, 7) === thisMonth && scoped.some(l => l.id === p.loan_id)).map(p => { const l = loans.find(x => x.id === p.loan_id); return { date: p.paid_date, code: l?.loan_no || '—', loan: l ? nameOf(l) : '—', amount: money(p.amount), mode: p.mode || '—' } }),
      cols: [{ header: 'Date', get: r => r.date }, { header: 'Loan No', get: r => r.code }, { header: 'Loan', get: r => r.loan }, { header: 'Amount (INR)', get: r => r.amount }, { header: 'Mode', get: r => r.mode }],
    }
    // Category-specific registers reuse the register shape but pre-filtered.
    const byCat = (c: string) => scoped.filter(l => categoryOf(l) === c)
    for (const [key, c, label] of [['vehicle', 'Vehicle Loans', 'Vehicle Loan Report'], ['machine', 'Machine & Equipment Loans', 'Machine Loan Report'], ['site', 'Site Loans', 'Site Loan Report']] as const) {
      defs[key] = {
        title: label, file: key + '_loan_report',
        rows: byCat(c).map(l => ({ ...loanBase(l), asset: l.asset_id ? (assetMap.get(l.asset_id)?.name || '—') : '—', principal: money(l.loan_amount || 0), emi: money(l.emi_amount || 0), outstanding: outstandingOf(l), status: l.status })),
        cols: [{ header: 'Loan No', get: r => r.code }, { header: 'Name', get: r => r.name }, { header: 'Asset', get: r => r.asset }, { header: 'Lender', get: r => r.lender }, { header: 'Principal (INR)', get: r => r.principal }, { header: 'EMI (INR)', get: r => r.emi }, { header: 'Outstanding (INR)', get: r => r.outstanding }, { header: 'Status', get: r => r.status }],
      }
    }
    return defs
  }, [scoped, pays, loans, assetMap, projMap, paidByLoan, countByLoan])

  const activeReport = reportDef[report]
  const projectOpts = projects.map(p => ({ id: p.id, label: p.name }))
  const assetOpts = assets.map(a => ({ id: a.id, label: `${a.name}${a.category ? ' · ' + a.category : ''}` }))

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>Credit Management</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            {activeProject ? activeProject.name : 'All projects'} · every company loan, EMI &amp; outstanding
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <PrintButton title="Credit Management" />
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Loan
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 flex-wrap mb-5 no-print">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors`}
            style={cat === c
              ? { background: 'var(--accent)', color: '#0B0B0C', borderColor: 'var(--accent)' }
              : { color: 'var(--text-2)', borderColor: 'var(--line)' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.slice(0, 12).map((a, i) => (
            <button key={i} onClick={() => navigate(`/credit/${a.id}`)} className="w-full text-left flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-[13px]"
              style={{ borderColor: a.tone === 'red' ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)', background: a.tone === 'red' ? 'rgba(248,113,113,0.07)' : 'rgba(251,191,36,0.07)', color: a.tone === 'red' ? '#f87171' : '#f59e0b' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{a.icon}</span>
              <span>{a.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <Card label="Active Loans" value={cards.active} accent="#ff8f00" />
        <Card label="Total Outstanding" value={inr(cards.outstanding)} accent="#f87171" small />
        <Card label="EMI Due This Month" value={inr(cards.dueThisMonth)} accent="#f59e0b" small />
        <Card label="Total EMI Paid" value={inr(cards.paid)} accent="#34d399" small />
        <Card label="Overdue EMIs" value={cards.overdue} accent="#f87171" />
        <Card label="Closed Loans" value={cards.closed} accent="#38bdf8" />
      </div>

      {/* Loans table */}
      <div className="card overflow-hidden overflow-x-auto mb-5">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{cat} · {scoped.length} loan{scoped.length === 1 ? '' : 's'}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>{['Loan No', 'Name', 'Category', 'Lender', 'Principal', 'Outstanding', 'EMI', 'Next Due', 'Status'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--faint)' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {scoped.map(l => {
              const nd = nextDueOf(l); const over = isOverdue(l)
              return (
                <tr key={l.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/credit/${l.id}`)}>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: 'var(--text-2)' }}>{l.loan_no || '—'}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>{nameOf(l)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{categoryOf(l)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{l.finance_company || '—'}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--text)' }}>{inr(l.loan_amount || 0)}</td>
                  <td className="px-4 py-3 font-mono font-bold" style={{ color: outstandingOf(l) > 0 ? '#ffb87b' : '#34d399' }}>{inr(outstandingOf(l))}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-2)' }}>{inr(l.emi_amount || 0)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: over ? '#f87171' : 'var(--text-2)' }}>{nd || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
                      style={l.status === 'Active' ? { color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' } : { color: 'var(--text-2)', borderColor: 'var(--line)' }}>{l.status}</span>
                  </td>
                </tr>
              )
            })}
            {!scoped.length && !loading && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm" style={{ color: 'var(--faint)' }}>No loans in this category yet.</td></tr>}
          </tbody>
        </table>
        {loading && <div className="p-4 text-sm" style={{ color: 'var(--text-2)' }}>Loading…</div>}
      </div>

      {/* Reports */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Reports</span>
          <div className="flex items-center gap-2 flex-wrap no-print">
            <select className="input" style={{ minWidth: 200 }} value={report} onChange={e => setReport(e.target.value)}>
              <option value="register">Loan Register</option>
              <option value="emi">EMI Register</option>
              <option value="outstanding">Outstanding Loans</option>
              <option value="vehicle">Vehicle Loan Report</option>
              <option value="machine">Machine Loan Report</option>
              <option value="site">Site Loan Report</option>
              <option value="monthly">Monthly EMI Report</option>
              <option value="interest">Interest Paid Report</option>
            </select>
            <ExportButtons filename={activeReport.file} title={activeReport.title} rows={activeReport.rows} columns={activeReport.cols as any} dateField={(activeReport as any).dateField} />
          </div>
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text)' }}>{activeReport.title}</div>
          <table className="w-full text-[12px]">
            <thead><tr>{activeReport.cols.map(c => <th key={c.header} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border-b" style={{ color: 'var(--faint)', borderColor: 'var(--line)' }}>{c.header}</th>)}</tr></thead>
            <tbody>
              {activeReport.rows.slice(0, 50).map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>{activeReport.cols.map(c => <td key={c.header} className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--text)' }}>{c.get(r)}</td>)}</tr>
              ))}
              {!activeReport.rows.length && <tr><td colSpan={activeReport.cols.length} className="px-3 py-8 text-center" style={{ color: 'var(--faint)' }}>No data for this report.</td></tr>}
            </tbody>
          </table>
          {activeReport.rows.length > 50 && <div className="text-[11px] mt-2" style={{ color: 'var(--faint)' }}>Showing first 50 rows · export for the full report.</div>}
        </div>
      </div>

      {showForm && <LoanForm projects={projectOpts} assets={assetOpts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function Card({ label, value, accent, small }: { label: string; value: string | number; accent: string; small?: boolean }) {
  return (
    <div className="card p-3.5 flex flex-col justify-between min-h-[86px]" style={{ borderLeft: `2px solid ${accent}` }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{label}</span>
      <div className={`font-mono font-bold leading-none ${small ? 'text-[19px]' : 'text-[26px]'}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}