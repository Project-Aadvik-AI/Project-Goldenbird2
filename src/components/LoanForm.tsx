import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { logLoanAudit, logLoanDiff } from '../lib/loanAudit'

// One form for BOTH create and edit. Writes to the existing `asset_loans`
// table (the app's canonical loan table). loan_no auto-numbers via a DB
// default, and outstanding is computed elsewhere (loan_amount − Σ payments),
// so neither is entered here.

export type LoanRow = {
  id: string; loan_no: string | null; category: string | null; loan_type: string | null
  loan_name: string | null; finance_company: string | null; account_no: string | null
  project_id: string | null; asset_id: string | null
  loan_amount: number | null; interest_rate: number | null; emi_amount: number | null
  emi_frequency: string | null; emi_day: number | null; tenure_months: number | null
  start_date: string | null; end_date: string | null; processing_fees: number | null
  insurance_provider: string | null; insurance_policy_no: string | null; insurance_expiry: string | null
  remarks: string | null; status: string
}

export const LOAN_CATEGORIES = ['Site Loans', 'Vehicle Loans', 'Machine & Equipment Loans', 'Office Loans', 'Other Loans']
export const LOAN_TYPES = ['Term Loan', 'Vehicle Loan', 'Equipment Loan', 'Machinery Loan', 'Working Capital Loan', 'Other']
const FREQ = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']
const STATUSES = ['Active', 'Closed', 'Foreclosed']

type Opt = { id: string; label: string }

function addMonths(d: string, n: number): string {
  const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + n)
  return x.toISOString().slice(0, 10)
}

export default function LoanForm({
  existing, prefill, projects, assets, onClose, onSaved,
}: {
  existing?: LoanRow | null
  prefill?: { asset_id?: string; project_id?: string; category?: string }
  projects: Opt[]
  assets: Opt[]
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const e = existing
  const [category, setCategory] = useState(e?.category ?? prefill?.category ?? 'Site Loans')
  const [loanType, setLoanType] = useState(e?.loan_type ?? 'Term Loan')
  const [name, setName] = useState(e?.loan_name ?? '')
  const [lender, setLender] = useState(e?.finance_company ?? '')
  const [account, setAccount] = useState(e?.account_no ?? '')
  const [projectId, setProjectId] = useState(e?.project_id ?? prefill?.project_id ?? '')
  const [assetId, setAssetId] = useState(e?.asset_id ?? prefill?.asset_id ?? '')
  const [principal, setPrincipal] = useState(e?.loan_amount != null ? String(e.loan_amount) : '')
  const [rate, setRate] = useState(e?.interest_rate != null ? String(e.interest_rate) : '')
  const [emi, setEmi] = useState(e?.emi_amount != null ? String(e.emi_amount) : '')
  const [freq, setFreq] = useState(e?.emi_frequency ?? 'Monthly')
  const [tenure, setTenure] = useState(e?.tenure_months != null ? String(e.tenure_months) : '')
  const [start, setStart] = useState(e?.start_date ?? '')
  const [end, setEnd] = useState(e?.end_date ?? '')
  const [fees, setFees] = useState(e?.processing_fees != null ? String(e.processing_fees) : '')
  const [insProvider, setInsProvider] = useState(e?.insurance_provider ?? '')
  const [insPolicy, setInsPolicy] = useState(e?.insurance_policy_no ?? '')
  const [insExpiry, setInsExpiry] = useState(e?.insurance_expiry ?? '')
  const [remarks, setRemarks] = useState(e?.remarks ?? '')
  const [status, setStatus] = useState(e?.status ?? 'Active')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const num = (s: string) => (s ? Number(s) : null)

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (!name.trim() && !lender.trim()) { setErr('Enter a loan name or lender.'); return }
    setBusy(true); setErr(null)

    // Auto end date from start + tenure when not given.
    let endDate = end || null
    if (!endDate && start && tenure && Number(tenure) > 0) endDate = addMonths(start, Number(tenure))

    const payload: Record<string, unknown> = {
      category, loan_type: loanType, loan_name: name.trim() || null,
      finance_company: lender.trim() || null, account_no: account.trim() || null,
      project_id: projectId || null, asset_id: assetId || null,
      loan_amount: num(principal) ?? 0, interest_rate: num(rate), emi_amount: num(emi) ?? 0,
      emi_frequency: freq, tenure_months: num(tenure),
      start_date: start || null, end_date: endDate, processing_fees: num(fees),
      insurance_provider: insProvider.trim() || null, insurance_policy_no: insPolicy.trim() || null,
      insurance_expiry: insExpiry || null, remarks: remarks.trim() || null, status,
    }

    const actor = { id: profile?.id ?? null, name: profile?.full_name ?? null }
    const orgId = profile?.org_id ?? null

    if (e) {
      const { error } = await supabase.from('asset_loans').update(payload).eq('id', e.id)
      if (error) { setErr(error.message); setBusy(false); return }
      // Audit every changed field.
      const before: Record<string, unknown> = {
        category: e.category, loan_type: e.loan_type, loan_name: e.loan_name, finance_company: e.finance_company,
        account_no: e.account_no, project_id: e.project_id, asset_id: e.asset_id, loan_amount: e.loan_amount,
        interest_rate: e.interest_rate, emi_amount: e.emi_amount, emi_frequency: e.emi_frequency,
        tenure_months: e.tenure_months, start_date: e.start_date, end_date: e.end_date, processing_fees: e.processing_fees,
        insurance_provider: e.insurance_provider, insurance_policy_no: e.insurance_policy_no, insurance_expiry: e.insurance_expiry,
        remarks: e.remarks, status: e.status,
      }
      const labels: Record<string, string> = {
        category: 'Category', loan_type: 'Loan Type', loan_name: 'Loan Name', finance_company: 'Lender',
        account_no: 'Account No', project_id: 'Project', asset_id: 'Linked Asset', loan_amount: 'Principal',
        interest_rate: 'Interest Rate', emi_amount: 'EMI', emi_frequency: 'EMI Frequency', tenure_months: 'Tenure',
        start_date: 'Start Date', end_date: 'End Date', processing_fees: 'Processing Fees',
        insurance_provider: 'Insurance Provider', insurance_policy_no: 'Insurance Policy', insurance_expiry: 'Insurance Expiry',
        remarks: 'Remarks', status: 'Status',
      }
      if (String(before.status ?? '') !== String(status)) {
        await logLoanAudit(e.id, 'Status Changed', { field: 'Status', oldValue: before.status, newValue: status, actor, orgId })
      }
      await logLoanDiff(e.id, before, { ...payload }, labels, actor, orgId)
    } else {
      const { data: created, error } = await supabase.from('asset_loans')
        .insert({ ...payload, org_id: orgId }).select('id').single()
      if (error) { setErr(error.message); setBusy(false); return }
      const newId = (created as { id: string })?.id
      if (newId) await logLoanAudit(newId, 'Created', { actor, orgId })
    }
    setBusy(false); onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={ev => ev.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{e ? 'Edit Loan' : 'Add Loan'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <F label="Loan Category"><select className="input" value={category} onChange={ev => setCategory(ev.target.value)}>{LOAN_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></F>
            <F label="Loan Type"><select className="input" value={loanType} onChange={ev => setLoanType(ev.target.value)}>{LOAN_TYPES.map(c => <option key={c}>{c}</option>)}</select></F>
            <F label="Loan Name" className="col-span-2"><input className="input" value={name} onChange={ev => setName(ev.target.value)} placeholder="e.g. Tata Hitachi Excavator Loan" /></F>
            <F label="Lender / Bank"><input className="input" value={lender} onChange={ev => setLender(ev.target.value)} /></F>
            <F label="Loan Account Number"><input className="input" value={account} onChange={ev => setAccount(ev.target.value)} /></F>
            <F label="Linked Project (optional)">
              <select className="input" value={projectId} onChange={ev => setProjectId(ev.target.value)}>
                <option value="">— None —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </F>
            <F label="Linked Vehicle / Machine (optional)">
              <select className="input" value={assetId} onChange={ev => setAssetId(ev.target.value)}>
                <option value="">— None —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </F>
            <F label="Principal Amount (₹)"><input className="input mono" inputMode="decimal" value={principal} onChange={ev => setPrincipal(ev.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="Interest Rate (% p.a.)"><input className="input mono" inputMode="decimal" value={rate} onChange={ev => setRate(ev.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="EMI Amount (₹)"><input className="input mono" inputMode="decimal" value={emi} onChange={ev => setEmi(ev.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="EMI Frequency"><select className="input" value={freq} onChange={ev => setFreq(ev.target.value)}>{FREQ.map(f => <option key={f}>{f}</option>)}</select></F>
            <F label="Tenure (months)"><input className="input mono" inputMode="numeric" value={tenure} onChange={ev => setTenure(ev.target.value.replace(/[^\d]/g, ''))} /></F>
            <F label="Processing Fees (₹)"><input className="input mono" inputMode="decimal" value={fees} onChange={ev => setFees(ev.target.value.replace(/[^\d.]/g, ''))} /></F>
            <F label="Start Date"><input type="date" className="input" value={start} onChange={ev => setStart(ev.target.value)} /></F>
            <F label="End Date (auto if blank)"><input type="date" className="input" value={end} onChange={ev => setEnd(ev.target.value)} /></F>
            <F label="Insurance Provider"><input className="input" value={insProvider} onChange={ev => setInsProvider(ev.target.value)} /></F>
            <F label="Insurance Policy No"><input className="input" value={insPolicy} onChange={ev => setInsPolicy(ev.target.value)} /></F>
            <F label="Insurance Expiry"><input type="date" className="input" value={insExpiry} onChange={ev => setInsExpiry(ev.target.value)} /></F>
            <F label="Status"><select className="input" value={status} onChange={ev => setStatus(ev.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></F>
            <F label="Remarks" className="col-span-2"><input className="input" value={remarks} onChange={ev => setRemarks(ev.target.value)} /></F>
          </div>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : (e ? 'Save Changes' : 'Create Loan')}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function F({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}