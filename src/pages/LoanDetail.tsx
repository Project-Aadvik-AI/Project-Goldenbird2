import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { logLoanAudit } from '../lib/loanAudit'
import LoanForm, { LoanRow } from '../components/LoanForm'

type Payment = { id: string; paid_date: string; amount: number; principal_paid: number | null; interest_paid: number | null; mode: string | null; reference: string | null; paid_by: string | null; remarks: string | null }
type Doc = { id: string; doc_type: string | null; title: string | null; file: string | null; issue_date: string | null; expiry_date: string | null }
type Audit = { id: string; action: string; field: string | null; old_value: string | null; new_value: string | null; user_name: string | null; created_at: string }
type AssetLite = { id: string; name: string; category: string | null }

const FREQ_STEP: Record<string, number> = { 'Monthly': 1, 'Quarterly': 3, 'Half-Yearly': 6, 'Yearly': 12 }
const inr = (n: number) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addMonths(d: string, n: number) { const x = new Date(d + 'T00:00:00'); x.setMonth(x.getMonth() + n); return iso(x) }

export default function LoanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can, isAdmin, profile } = useAuth()
  const { projects } = useProject()

  const [loan, setLoan] = useState<LoanRow | null>(null)
  const [pays, setPays] = useState<Payment[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [assets, setAssets] = useState<AssetLite[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [showDoc, setShowDoc] = useState(false)

  const canEdit = isAdmin || can('credit', 'edit')

  async function load() {
    if (!id) return
    setLoading(true)
    const [{ data: l }, { data: p }, { data: d }, { data: a }, { data: as }] = await Promise.all([
      supabase.from('asset_loans').select('*').eq('id', id).single(),
      supabase.from('asset_loan_payments').select('id, paid_date, amount, principal_paid, interest_paid, mode, reference, paid_by, remarks').eq('loan_id', id).order('paid_date', { ascending: true }),
      supabase.from('loan_documents').select('id, doc_type, title, file, issue_date, expiry_date').eq('loan_id', id).order('created_at', { ascending: false }),
      supabase.from('loan_audit_log').select('id, action, field, old_value, new_value, user_name, created_at').eq('loan_id', id).order('created_at', { ascending: false }).limit(200),
      supabase.from('assets').select('id, name, category'),
    ])
    setLoan((l as LoanRow) ?? null)
    setPays((p as Payment[]) ?? [])
    setDocs((d as Doc[]) ?? [])
    setAudit((a as Audit[]) ?? [])
    setAssets((as as AssetLite[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [id])

  const asset = useMemo(() => loan?.asset_id ? assets.find(a => a.id === loan.asset_id) : null, [loan, assets])
  const projectName = useMemo(() => loan?.project_id ? (projects.find(p => p.id === loan.project_id)?.name ?? '—') : '—', [loan, projects])

  // Outstanding summary + running balances for the EMI/payment table.
  const summary = useMemo(() => {
    const principal = Number(loan?.loan_amount || 0)
    const totalPaid = pays.reduce((s, p) => s + Number(p.amount || 0), 0)
    const interestPaid = pays.reduce((s, p) => s + Number(p.interest_paid || 0), 0)
    const outstanding = Math.max(0, Math.round((principal - totalPaid) * 100) / 100)
    const emi = Number(loan?.emi_amount || 0)
    const remaining = emi > 0 ? Math.ceil(outstanding / emi) : (loan?.tenure_months ? Math.max(0, loan.tenure_months - pays.length) : null)
    let nextDue: string | null = null
    if (loan && loan.status === 'Active' && loan.start_date) {
      const step = FREQ_STEP[loan.emi_frequency || 'Monthly'] || 1
      nextDue = addMonths(loan.start_date, (pays.length + 1) * step)
    }
    // running balance per payment (ascending)
    let bal = principal
    const rows = pays.map((p, i) => {
      const reduce = Number(p.principal_paid ?? p.amount ?? 0)
      bal = Math.max(0, Math.round((bal - reduce) * 100) / 100)
      return { ...p, emiNo: i + 1, balance: bal }
    })
    return { principal, totalPaid, interestPaid, outstanding, remaining, nextDue, rows }
  }, [loan, pays])

  if (loading && !loan) return <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-2)' }}>Loading loan…</div>
  if (!loan) return <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-2)' }}>Loan not found. <button className="text-[#ffb87b] underline ml-1" onClick={() => navigate('/credit')}>Back to Credit Management</button></div>

  const name = loan.loan_name || loan.finance_company || asset?.name || loan.loan_no || 'Loan'

  return (
    <div>
      <button className="text-[13px] mb-3 inline-flex items-center gap-1 no-print" style={{ color: 'var(--text-2)' }} onClick={() => navigate('/credit')}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> Credit Management
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-headline text-2xl font-semibold" style={{ color: 'var(--text)' }}>{name}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>
            <span className="font-mono">{loan.loan_no || '—'}</span> · {loan.category || '—'} · {loan.loan_type || '—'} ·
            <span className="ml-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider"
              style={loan.status === 'Active' ? { color: '#34d399', borderColor: 'rgba(52,211,153,0.3)' } : { color: 'var(--text-2)', borderColor: 'var(--line)' }}>{loan.status}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          {canEdit && <button className="btn btn-ghost" onClick={() => setShowPay(true)}><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span> Record EMI</button>}
          {canEdit && <button className="btn btn-ghost" onClick={() => setShowEdit(true)}><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span> Edit</button>}
        </div>
      </div>

      {/* Outstanding summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <MiniK label="Original Amount" value={inr(summary.principal)} />
        <MiniK label="Total EMI Paid" value={inr(summary.totalPaid)} tone="#34d399" />
        <MiniK label="Interest Paid" value={inr(summary.interestPaid)} />
        <MiniK label="Outstanding" value={inr(summary.outstanding)} tone={summary.outstanding > 0 ? '#ffb87b' : '#34d399'} />
        <MiniK label="Remaining EMIs" value={summary.remaining != null ? String(summary.remaining) : '—'} />
        <MiniK label="Next EMI Due" value={summary.nextDue || '—'} />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Loan &amp; Bank Details</h3>
          <Row label="Lender / Bank" value={loan.finance_company || '—'} />
          <Row label="Account Number" value={loan.account_no || '—'} mono />
          <Row label="Principal" value={inr(loan.loan_amount || 0)} />
          <Row label="Interest Rate" value={loan.interest_rate != null ? `${loan.interest_rate}%` : '—'} />
          <Row label="EMI" value={`${inr(loan.emi_amount || 0)} / ${loan.emi_frequency || 'Monthly'}`} />
          <Row label="Tenure" value={loan.tenure_months ? `${loan.tenure_months} months` : '—'} />
          <Row label="Period" value={`${loan.start_date || '—'} → ${loan.end_date || '—'}`} mono />
          <Row label="Processing Fees" value={loan.processing_fees != null ? inr(loan.processing_fees) : '—'} />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Linked &amp; Insurance</h3>
          <Row label="Linked Asset" value={asset ? (
            <button className="text-[#ffb87b] hover:underline" onClick={() => navigate(`/assets/${asset.id}`)}>{asset.name}{asset.category ? ` · ${asset.category}` : ''}</button>
          ) : '—'} />
          <Row label="Linked Project" value={projectName} />
          <Row label="Insurance Provider" value={loan.insurance_provider || '—'} />
          <Row label="Insurance Policy" value={loan.insurance_policy_no || '—'} mono />
          <Row label="Insurance Expiry" value={loan.insurance_expiry || '—'} mono />
          <Row label="Remarks" value={loan.remarks || '—'} />
        </div>
      </div>

      {/* EMI / Payment history */}
      <div className="card overflow-hidden overflow-x-auto mb-5">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>EMI &amp; Payment History · {pays.length}</span>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#282a2e]"><tr>
            {['EMI No', 'Paid Date', 'Amount', 'Principal', 'Interest', 'Outstanding', 'Mode', 'Reference', 'Paid By', 'Remarks'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--faint)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {summary.rows.slice().reverse().map(r => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-2)' }}>{r.emiNo}</td>
                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-2)' }}>{r.paid_date}</td>
                <td className="px-3 py-1.5 font-mono font-bold" style={{ color: 'var(--text)' }}>{inr(r.amount)}</td>
                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-2)' }}>{r.principal_paid != null ? inr(r.principal_paid) : '—'}</td>
                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-2)' }}>{r.interest_paid != null ? inr(r.interest_paid) : '—'}</td>
                <td className="px-3 py-1.5 font-mono" style={{ color: '#ffb87b' }}>{inr(r.balance)}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.mode || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.reference || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.paid_by || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.remarks || '—'}</td>
              </tr>
            ))}
            {!pays.length && <tr><td colSpan={10} className="px-3 py-8 text-center" style={{ color: 'var(--faint)' }}>No EMI payments recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Documents */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Documents · {docs.length}</span>
          {canEdit && <button className="btn btn-ghost no-print" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowDoc(true)}>+ Upload</button>}
        </div>
        <div className="p-4">
          {docs.length ? (
            <div className="divide-y divide-white/[0.05]">
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between py-2 text-[13px]">
                  <div>
                    <span style={{ color: 'var(--text)' }}>{d.title || d.doc_type || 'Document'}</span>
                    {d.doc_type && <span className="ml-2 text-[11px]" style={{ color: 'var(--faint)' }}>{d.doc_type}</span>}
                    {d.expiry_date && <span className="ml-2 text-[11px]" style={{ color: 'var(--faint)' }}>exp {d.expiry_date}</span>}
                  </div>
                  {d.file ? <PrivateLink bucket="asset-docs" path={d.file} className="text-[#ffb87b] text-xs font-semibold uppercase hover:underline">Open</PrivateLink> : <span style={{ color: 'var(--faint)' }}>—</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-[13px]" style={{ color: 'var(--faint)' }}>No documents uploaded.</p>}
        </div>
      </div>

      {/* Audit trail */}
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Audit Trail · {audit.length}</span>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#282a2e]"><tr>
            {['Date & Time', 'User', 'Action', 'Field', 'Old', 'New'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--faint)' }}>{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {audit.map(a => (
              <tr key={a.id}>
                <td className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{new Date(a.created_at).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text)' }}>{a.user_name || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text)' }}>{a.action}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{a.field || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{a.old_value || '—'}</td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{a.new_value || '—'}</td>
              </tr>
            ))}
            {!audit.length && <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: 'var(--faint)' }}>No history yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {showEdit && (
        <LoanForm existing={loan}
          projects={projects.map(p => ({ id: p.id, label: p.name }))}
          assets={assets.map(a => ({ id: a.id, label: `${a.name}${a.category ? ' · ' + a.category : ''}` }))}
          onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load() }} />
      )}
      {showPay && <PayForm loanId={loan.id} emi={Number(loan.emi_amount || 0)} orgId={profile?.org_id ?? null} actor={{ id: profile?.id ?? null, name: profile?.full_name ?? null }} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); load() }} />}
      {showDoc && <DocForm loanId={loan.id} orgId={profile?.org_id ?? null} actor={{ id: profile?.id ?? null, name: profile?.full_name ?? null }} onClose={() => setShowDoc(false)} onSaved={() => { setShowDoc(false); load() }} />}
    </div>
  )
}

/* ── Record EMI payment ── */
function PayForm({ loanId, emi, orgId, actor, onClose, onSaved }: { loanId: string; emi: number; orgId: string | null; actor: { id: string | null; name: string | null }; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(iso(new Date()))
  const [amount, setAmount] = useState(emi ? String(emi) : '')
  const [principal, setPrincipal] = useState('')
  const [interest, setInterest] = useState('')
  const [mode, setMode] = useState('Bank Transfer')
  const [reference, setReference] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setErr('Enter the EMI amount.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('asset_loan_payments').insert({
      org_id: orgId, loan_id: loanId, paid_date: date, amount: Number(amount),
      principal_paid: principal ? Number(principal) : null, interest_paid: interest ? Number(interest) : null,
      mode, reference: reference.trim() || null, paid_by: paidBy.trim() || null, remarks: remarks.trim() || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await logLoanAudit(loanId, 'EMI Paid', { field: 'Amount', newValue: amount, actor, orgId })
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Record EMI Payment</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <DL label="Paid Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></DL>
          <DL label="Amount (₹)"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Principal (₹)"><input className="input mono" inputMode="decimal" value={principal} onChange={e => setPrincipal(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Interest (₹)"><input className="input mono" inputMode="decimal" value={interest} onChange={e => setInterest(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Mode"><select className="input" value={mode} onChange={e => setMode(e.target.value)}>{['Bank Transfer', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash', 'Auto Debit'].map(m => <option key={m}>{m}</option>)}</select></DL>
          <DL label="Reference"><input className="input" value={reference} onChange={e => setReference(e.target.value)} /></DL>
          <DL label="Paid By"><input className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)} /></DL>
          <DL label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></DL>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Payment'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

/* ── Upload document ── */
function DocForm({ loanId, orgId, actor, onClose, onSaved }: { loanId: string; orgId: string | null; actor: { id: string | null; name: string | null }; onClose: () => void; onSaved: () => void }) {
  const [docType, setDocType] = useState('Sanction Letter')
  const [title, setTitle] = useState('')
  const [expiry, setExpiry] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    let path: string | null = null
    if (file) {
      const p = makeObjectPath(orgId, file, `loans/${loanId}`)
      const { path: stored, error: upErr } = await uploadPrivate('asset-docs', p, file)
      if (upErr) { setErr(upErr); setBusy(false); return }
      path = stored ?? null
    }
    const { error } = await supabase.from('loan_documents').insert({
      org_id: orgId, loan_id: loanId, doc_type: docType, title: title.trim() || docType,
      file: path, expiry_date: expiry || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    await logLoanAudit(loanId, 'Document Added', { field: 'Document', newValue: title || docType, actor, orgId })
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Upload Loan Document</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <DL label="Type"><select className="input" value={docType} onChange={e => setDocType(e.target.value)}>{['Sanction Letter', 'Loan Agreement', 'Insurance Policy', 'RC / Finance', 'Statement', 'NOC', 'Other'].map(t => <option key={t}>{t}</option>)}</select></DL>
          <DL label="Expiry (optional)"><input type="date" className="input" value={expiry} onChange={e => setExpiry(e.target.value)} /></DL>
          <DL label="Title" className="col-span-2"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HDFC sanction letter" /></DL>
          <DL label="File" className="col-span-2"><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className="input" onChange={e => setFile(e.target.files?.[0] ?? null)} /></DL>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Document'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function MiniK({ label, value, tone = 'var(--text)' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--faint)' }}>{label}</div>
      <div className="font-mono text-[16px] font-bold leading-tight" style={{ color: tone }}>{value}</div>
    </div>
  )
}
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px]" style={{ color: 'var(--faint)' }}>{label}</span>
      <span className={`text-[13px] text-right ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
function DL({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}