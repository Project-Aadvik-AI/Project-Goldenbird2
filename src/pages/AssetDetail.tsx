import { useEffect, useMemo, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import { type Asset, inr } from './Assets'

export type AssetDoc = {
  id: string; asset_id: string; doc_type: string; title: string | null
  file: string | null; issue_date: string | null; expiry_date: string | null; remarks: string | null
}

export const DOC_TYPES = ['Insurance', 'RC Book', 'PUC Certificate', 'Fitness Certificate', 'Permit',
  'Warranty', 'Invoice / Bill', 'Service Record', 'User Manual', 'Image', 'Other']

// days until expiry; negative = expired
export function daysToExpiry(d: string | null): number | null {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(d); exp.setHours(0, 0, 0, 0)
  return Math.round((exp.getTime() - today.getTime()) / 86400000)
}
export function expiryState(d: string | null): { label: string; cls: string } {
  const n = daysToExpiry(d)
  if (n === null) return { label: 'No expiry', cls: 'bg-white/5 text-[#dcc1ae]/60 border-white/10' }
  if (n < 0) return { label: `Expired ${Math.abs(n)}d ago`, cls: 'bg-red-500/10 text-red-400 border-red-500/20' }
  if (n <= 30) return { label: `Expires in ${n}d`, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
  return { label: `Valid · ${n}d left`, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
}

export type Maint = {
  id: string; date: string; service_type: string | null; description: string | null
  vendor: string | null; cost: number | null; odometer: number | null
  next_service_date: string | null; next_service_odometer: number | null
}
export type Loan = {
  id: string; finance_company: string | null; loan_amount: number; emi_amount: number
  emi_frequency: string | null; emi_day: number | null; start_date: string | null; end_date: string | null
  interest_rate: number | null; status: string; remarks: string | null
}
export type LoanPay = { id: string; paid_date: string; amount: number; reference: string | null; remarks: string | null }

type Assignment = {
  id: string; employee_id: string | null; project_id: string | null
  from_date: string; to_date: string | null; note: string | null; created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  'Available': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Assigned': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Under Maintenance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Scrap': 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects } = useProject()
  const { can, isAdmin } = useAuth()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([])
  const [history, setHistory] = useState<Assignment[]>([])
  const [docs, setDocs] = useState<AssetDoc[]>([])
  const [showDoc, setShowDoc] = useState(false)
  const [maint, setMaint] = useState<Maint[]>([])
  const [showMaint, setShowMaint] = useState(false)
  const [loan, setLoan] = useState<Loan | null>(null)
  const [loanPays, setLoanPays] = useState<LoanPay[]>([])
  const [showLoan, setShowLoan] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const [{ data: a }, { data: e }, { data: h }, { data: d }, { data: m }, { data: ln }] = await Promise.all([
        supabase.from('assets').select('*').eq('id', id).maybeSingle(),
        supabase.from('employees').select('id, full_name'),
        supabase.from('asset_assignments').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
        supabase.from('asset_documents').select('*').eq('asset_id', id).order('expiry_date', { ascending: true, nullsFirst: false }),
        supabase.from('asset_maintenance').select('*').eq('asset_id', id).order('date', { ascending: false }),
        supabase.from('asset_loans').select('*').eq('asset_id', id).limit(1),
      ])
      if (!alive) return
      setAsset((a as Asset) ?? null)
      setEmps((e as any[]) ?? [])
      setHistory((h as Assignment[]) ?? [])
      setDocs((d as AssetDoc[]) ?? [])
      setMaint((m as Maint[]) ?? [])
      const theLoan = ((ln as Loan[]) ?? [])[0] ?? null
      setLoan(theLoan)
      if (theLoan) {
        const { data: lp } = await supabase.from('asset_loan_payments').select('*').eq('loan_id', theLoan.id).order('paid_date', { ascending: false })
        setLoanPays((lp as LoanPay[]) ?? [])
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [id])

  async function reloadDocs() {
    if (!id) return
    const { data } = await supabase.from('asset_documents').select('*').eq('asset_id', id).order('expiry_date', { ascending: true, nullsFirst: false })
    setDocs((data as AssetDoc[]) ?? [])
  }
  async function reloadMaint() {
    if (!id) return
    const { data } = await supabase.from('asset_maintenance').select('*').eq('asset_id', id).order('date', { ascending: false })
    setMaint((data as Maint[]) ?? [])
  }
  async function reloadLoan() {
    if (!id) return
    const { data: ln } = await supabase.from('asset_loans').select('*').eq('asset_id', id).limit(1)
    const theLoan = ((ln as Loan[]) ?? [])[0] ?? null
    setLoan(theLoan)
    if (theLoan) {
      const { data: lp } = await supabase.from('asset_loan_payments').select('*').eq('loan_id', theLoan.id).order('paid_date', { ascending: false })
      setLoanPays((lp as LoanPay[]) ?? [])
    } else setLoanPays([])
  }

  async function deleteDoc(docId: string) {
    if (!await appConfirm('Delete this document?')) return
    await supabase.from('asset_documents').delete().eq('id', docId)
    reloadDocs()
  }

  const nameOfEmp = (eid: string | null) => (eid ? emps.find(e => e.id === eid)?.full_name : null) || '—'
  const nameOfProj = (pid: string | null) => (pid ? projects.find(p => p.id === pid)?.name : null) || '—'

  const ageYears = useMemo(() => {
    if (!asset?.purchase_date) return null
    const d = new Date(asset.purchase_date)
    const yrs = (Date.now() - d.getTime()) / (365.25 * 86400000)
    return Math.round(yrs * 10) / 10
  }, [asset])

  if (loading) return <div className="p-8 text-[#dcc1ae] text-sm">Loading…</div>
  if (!asset) return (
    <div className="p-8 text-center">
      <p className="text-[#dcc1ae]">Asset not found.</p>
      <button className="btn btn-primary mt-4" onClick={() => navigate('/assets')}>Back to Assets</button>
    </div>
  )

  return (
    <div>
      <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[13px] mb-4 flex items-center gap-1" onClick={() => navigate('/assets')}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> All Assets
      </button>

      {/* Header */}
      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-[#ff8f00]/10 border border-[#ff8f00]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '28px' }}>
              {asset.category === 'Vehicle' ? 'local_shipping' : asset.category === 'IT / Laptop' ? 'laptop_mac' : 'construction'}
            </span>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{asset.name}</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLE[asset.status] || ''}`}>{asset.status}</span>
              {asset.archived && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-white/5 text-[#dcc1ae]/60 border-white/10">Archived</span>}
            </div>
            <div className="text-[13px] text-[#dcc1ae] mt-0.5">
              <span className="font-mono">{asset.asset_code || '—'}</span> · {asset.category || 'Uncategorised'}
              {asset.company_branch ? ` · ${asset.company_branch}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Purchase Cost</div>
            <div className="font-mono text-[22px] font-bold text-[#e2e2e8]">{asset.purchase_cost ? inr(asset.purchase_cost) : '—'}</div>
            {ageYears != null && <div className="text-[11px] text-[#dcc1ae]/60">{ageYears} yrs old</div>}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[#e2e2e8] mb-3">Asset Information</h3>
          <Row label="Asset ID" value={asset.asset_code || '—'} mono />
          <Row label="Category" value={asset.category || '—'} />
          <Row label="Company / Branch" value={asset.company_branch || '—'} />
          <Row label="Vendor / Supplier" value={asset.vendor || '—'} />
          <Row label="Purchase Date" value={asset.purchase_date || '—'} mono />
          <Row label="Purchase Cost" value={asset.purchase_cost ? inr(asset.purchase_cost) : '—'} mono />
          <Row label="Location" value={asset.location || '—'} />
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-[#e2e2e8] mb-3">Current Assignment</h3>
          <Row label="Assigned Employee" value={nameOfEmp(asset.assigned_employee_id)} />
          <Row label="Project / Site" value={nameOfProj(asset.project_id)} />
          <Row label="Status" value={asset.status} />
          {asset.remarks && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">Remarks</div>
              <div className="text-[13px] text-[#dcc1ae]">{asset.remarks}</div>
            </div>
          )}
        </div>
      </div>

      {/* Assignment history */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Assignment History</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{history.length} record(s)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Employee', 'Project / Site', 'From', 'To', 'Note'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {history.map(h => (
              <tr key={h.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 text-[#e2e2e8]">{nameOfEmp(h.employee_id)}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{nameOfProj(h.project_id)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{h.from_date}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{h.to_date || <span className="text-emerald-400">Current</span>}</td>
                <td className="px-4 py-2.5 text-[#dcc1ae]">{h.note || '—'}</td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No assignment history yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Vehicle / Machine details */}
      {(asset.category === 'Vehicle' || asset.category === 'Machinery') && (asset as any).vehicle_number !== undefined && (
        <div className="card p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>local_shipping</span>
            <h3 className="text-sm font-semibold text-[#e2e2e8]">Vehicle / Machine Details</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <Row label="Registration No." value={(asset as any).vehicle_number || '—'} mono />
              <Row label="Make & Model" value={(asset as any).make_model || '—'} />
              <Row label="Type" value={(asset as any).vehicle_type || '—'} />
            </div>
            <div>
              <Row label="Chassis No." value={(asset as any).chassis_number || '—'} mono />
              <Row label="Engine No." value={(asset as any).engine_number || '—'} mono />
              <Row label="Odometer / Hours" value={(asset as any).odometer != null ? `${Number((asset as any).odometer).toLocaleString('en-IN')}${(asset as any).odometer_updated ? ` (as of ${(asset as any).odometer_updated})` : ''}` : '—'} mono />
            </div>
          </div>
        </div>
      )}

      {/* Loan / EMI */}
      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>account_balance</span>
            <h3 className="text-sm font-semibold text-[#e2e2e8]">Loan / Finance</h3>
          </div>
          {can('machines', 'create') && (
            <div className="flex gap-2">
              {loan && <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowPay(true)}>+ Record EMI</button>}
              <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowLoan(true)}>{loan ? 'Edit Loan' : 'Add Loan'}</button>
            </div>
          )}
        </div>
        {!loan ? (
          <p className="text-[13px] text-[#dcc1ae]/60">No loan on this asset (owned outright). Click "Add Loan" if it is financed.</p>
        ) : (() => {
          const paid = loanPays.reduce((n, p) => n + Number(p.amount || 0), 0)
          const outstanding = Math.max(0, Math.round((Number(loan.loan_amount || 0) - paid) * 100) / 100)
          const pct = loan.loan_amount ? Math.min(100, Math.round(paid / Number(loan.loan_amount) * 100)) : 0
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <MiniK label="Loan Amount" value={inr(loan.loan_amount)} />
                <MiniK label="EMI" value={`${inr(loan.emi_amount)} / ${loan.emi_frequency || 'Monthly'}`} />
                <MiniK label="Paid" value={inr(paid)} tone="emerald" />
                <MiniK label="Outstanding" value={inr(outstanding)} tone={outstanding > 0 ? 'amber' : 'emerald'} />
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-3">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mb-3">
                <div>
                  <Row label="Finance Company" value={loan.finance_company || '—'} />
                  <Row label="Interest Rate" value={loan.interest_rate != null ? `${loan.interest_rate}%` : '—'} />
                </div>
                <div>
                  <Row label="Loan Period" value={`${loan.start_date || '—'} → ${loan.end_date || '—'}`} mono />
                  <Row label="Status" value={loan.status} />
                </div>
              </div>
              {loanPays.length > 0 && (
                <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                  <div className="px-3 py-2 bg-[#282a2e] text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">EMI Payment History · {loanPays.length}</div>
                  <table className="w-full text-[12px]">
                    <tbody className="divide-y divide-white/[0.05]">
                      {loanPays.map(p => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-mono text-[#dcc1ae]">{p.paid_date}</td>
                          <td className="px-3 py-2 font-mono text-[#e2e2e8] text-right">{inr(p.amount)}</td>
                          <td className="px-3 py-2 text-[#dcc1ae]">{p.reference || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Maintenance history */}
      <div className="card overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Maintenance &amp; Service History</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#dcc1ae]/60">
              {maint.length} record(s) · Total {inr(maint.reduce((n, m) => n + Number(m.cost || 0), 0))}
            </span>
            {can('machines', 'create') && (
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowMaint(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>build</span> Add Service
              </button>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Type', 'Description', 'Vendor', 'Odometer', 'Cost', 'Next Service'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {maint.map(m => {
              const dueSoon = m.next_service_date && daysToExpiry(m.next_service_date) !== null && (daysToExpiry(m.next_service_date) as number) <= 15
              return (
                <tr key={m.id} className={`hover:bg-white/[0.02] ${dueSoon ? 'bg-amber-500/[0.05]' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{m.date}</td>
                  <td className="px-4 py-2.5 text-[#e2e2e8]">{m.service_type || '—'}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae] max-w-[220px] truncate" title={m.description || ''}>{m.description || '—'}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{m.vendor || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{m.odometer != null ? Number(m.odometer).toLocaleString('en-IN') : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right">{m.cost ? inr(m.cost) : '—'}</td>
                  <td className={`px-4 py-2.5 font-mono text-[12px] ${dueSoon ? 'text-amber-400 font-bold' : 'text-[#dcc1ae]'}`}>
                    {m.next_service_date || '—'}{dueSoon ? ' · DUE' : ''}
                  </td>
                </tr>
              )
            })}
            {!maint.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No service records yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Expiry alerts */}
      {(() => {
        const expired = docs.filter(d => { const n = daysToExpiry(d.expiry_date); return n !== null && n < 0 })
        const soon = docs.filter(d => { const n = daysToExpiry(d.expiry_date); return n !== null && n >= 0 && n <= 30 })
        if (!expired.length && !soon.length) return null
        return (
          <div className="mb-5 space-y-2">
            {expired.length > 0 && (
              <div className="card p-3 bg-red-500/5 border-red-500/15 flex items-start gap-2">
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
                <div className="text-[13px]">
                  <b className="text-red-400">{expired.length} document(s) EXPIRED:</b>{' '}
                  <span className="text-[#dcc1ae]">{expired.map(d => `${d.doc_type} (${d.expiry_date})`).join(', ')}</span>
                </div>
              </div>
            )}
            {soon.length > 0 && (
              <div className="card p-3 bg-amber-500/5 border-amber-500/15 flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
                <div className="text-[13px]">
                  <b className="text-amber-400">{soon.length} expiring within 30 days:</b>{' '}
                  <span className="text-[#dcc1ae]">{soon.map(d => `${d.doc_type} (${daysToExpiry(d.expiry_date)}d)`).join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Documents */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Documents</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#dcc1ae]/60">{docs.length} file(s)</span>
            {can('machines', 'create') && (
              <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setShowDoc(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>upload_file</span> Upload
              </button>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Type', 'Title', 'Issue Date', 'Expiry Date', 'Status', 'File', ''].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {docs.map(d => {
              const st = expiryState(d.expiry_date)
              return (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-medium">{d.doc_type}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{d.title || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{d.issue_date || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{d.expiry_date || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {d.file ? <PrivateLink bucket="asset-docs" path={d.file} className="btn btn-ghost">View</PrivateLink> : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isAdmin && <button className="text-red-400 hover:text-red-300" onClick={() => deleteDoc(d.id)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>}
                  </td>
                </tr>
              )
            })}
            {!docs.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No documents yet. Upload RC, insurance, PUC, fitness, permit, warranty and more — expiry is tracked automatically.</td></tr>}
          </tbody>
        </table>
      </div>

      {showDoc && asset && <DocForm assetId={asset.id} onClose={() => setShowDoc(false)} onSaved={() => { setShowDoc(false); reloadDocs() }} />}
      {showMaint && asset && <MaintForm assetId={asset.id} onClose={() => setShowMaint(false)} onSaved={() => { setShowMaint(false); reloadMaint() }} />}
      {showLoan && asset && <LoanForm assetId={asset.id} existing={loan} onClose={() => setShowLoan(false)} onSaved={() => { setShowLoan(false); reloadLoan() }} />}
      {showPay && loan && <PayForm loanId={loan.id} emi={loan.emi_amount} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); reloadLoan() }} />}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-[#dcc1ae]/70">{label}</span>
      <span className={`text-[13px] text-[#e2e2e8] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}


// ---------------- Upload document ----------------
function DocForm({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [docType, setDocType] = useState('Insurance')
  const [title, setTitle] = useState('')
  const [issue, setIssue] = useState('')
  const [expiry, setExpiry] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    let path: string | null = null
    if (file) {
      const p = makeObjectPath(prof?.org_id, file, 'assets')
      const { path: stored, error: upErr } = await uploadPrivate('asset-docs', p, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      path = stored ?? null
    }
    const { error } = await supabase.from('asset_documents').insert({
      org_id: prof?.org_id, asset_id: assetId, doc_type: docType,
      title: title || null, file: path, issue_date: issue || null,
      expiry_date: expiry || null, remarks: remarks || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Upload Document</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DL label="Document Type *">
            <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </DL>
          <DL label="Title / Number"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Policy no., cert no…" /></DL>
          <DL label="Issue Date"><input type="date" className="input" value={issue} onChange={e => setIssue(e.target.value)} /></DL>
          <DL label="Expiry Date"><input type="date" className="input" value={expiry} onChange={e => setExpiry(e.target.value)} /></DL>
          <div className="sm:col-span-2">
            <DL label="File (PDF or image)">
              <input type="file" accept="image/*,.pdf" className="input" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </DL>
          </div>
          <div className="sm:col-span-2">
            <DL label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></DL>
          </div>
        </div>
        <p className="px-5 text-[11px] text-[#dcc1ae]/50">Leave Expiry blank for documents that never expire (invoice, manual, images). Expiry is tracked automatically and alerts show 30 days before.</p>
        {err && <div className="px-5 pt-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2 mt-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Uploading…' : 'Save Document'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}


// ---------------- Maintenance form ----------------
function MaintForm({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('Routine Service')
  const [desc, setDesc] = useState('')
  const [vendor, setVendor] = useState('')
  const [cost, setCost] = useState('')
  const [odo, setOdo] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { error } = await supabase.from('asset_maintenance').insert({
      org_id: prof?.org_id, asset_id: assetId, date, service_type: type,
      description: desc || null, vendor: vendor || null,
      cost: cost ? Number(cost) : 0, odometer: odo ? Number(odo) : null,
      next_service_date: nextDate || null,
    })
    // keep the asset's odometer up to date
    if (odo) await supabase.from('assets').update({ odometer: Number(odo), odometer_updated: date }).eq('id', assetId)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Add Service Record</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DL label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></DL>
          <DL label="Service Type">
            <select className="input" value={type} onChange={e => setType(e.target.value)}>
              {['Routine Service', 'Repair', 'Breakdown', 'Oil Change', 'Tyre', 'Overhaul', 'Other'].map(t => <option key={t}>{t}</option>)}
            </select>
          </DL>
          <div className="sm:col-span-2"><DL label="Description"><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What was done" /></DL></div>
          <DL label="Vendor / Garage"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></DL>
          <DL label="Cost (INR)"><input className="input mono" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Odometer / Hours"><input className="input mono" inputMode="decimal" value={odo} onChange={e => setOdo(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Next Service Due"><input type="date" className="input" value={nextDate} onChange={e => setNextDate(e.target.value)} /></DL>
        </div>
        {err && <div className="px-5 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Service'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// ---------------- Loan form ----------------
function LoanForm({ assetId, existing, onClose, onSaved }: { assetId: string; existing: Loan | null; onClose: () => void; onSaved: () => void }) {
  const [company, setCompany] = useState(existing?.finance_company ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.loan_amount) : '')
  const [emi, setEmi] = useState(existing ? String(existing.emi_amount) : '')
  const [freq, setFreq] = useState(existing?.emi_frequency ?? 'Monthly')
  const [start, setStart] = useState(existing?.start_date ?? '')
  const [end, setEnd] = useState(existing?.end_date ?? '')
  const [rate, setRate] = useState(existing?.interest_rate != null ? String(existing.interest_rate) : '')
  const [status, setStatus] = useState(existing?.status ?? 'Active')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const payload = {
      finance_company: company || null, loan_amount: amount ? Number(amount) : 0,
      emi_amount: emi ? Number(emi) : 0, emi_frequency: freq,
      start_date: start || null, end_date: end || null,
      interest_rate: rate ? Number(rate) : null, status,
    }
    const { error } = existing
      ? await supabase.from('asset_loans').update(payload).eq('id', existing.id)
      : await supabase.from('asset_loans').insert({ ...payload, org_id: prof?.org_id, asset_id: assetId })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{existing ? 'Edit Loan' : 'Add Loan'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><DL label="Finance Company / Bank"><input className="input" value={company} onChange={e => setCompany(e.target.value)} placeholder="HDFC Bank, Sundaram Finance…" /></DL></div>
          <DL label="Loan Amount (INR)"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="EMI Amount (INR)"><input className="input mono" inputMode="decimal" value={emi} onChange={e => setEmi(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="EMI Frequency">
            <select className="input" value={freq} onChange={e => setFreq(e.target.value)}><option>Monthly</option><option>Quarterly</option></select>
          </DL>
          <DL label="Interest Rate (%)"><input className="input mono" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Loan Start"><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></DL>
          <DL label="Loan End"><input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} /></DL>
          <DL label="Status">
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}><option>Active</option><option>Closed</option><option>Foreclosed</option></select>
          </DL>
        </div>
        {err && <div className="px-5 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Loan'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

// ---------------- EMI payment form ----------------
function PayForm({ loanId, emi, onClose, onSaved }: { loanId: string; emi: number; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(String(emi || ''))
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { error } = await supabase.from('asset_loan_payments').insert({
      org_id: prof?.org_id, loan_id: loanId, paid_date: date,
      amount: amount ? Number(amount) : 0, reference: ref || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-sm p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-4">Record EMI Payment</h3>
        <div className="space-y-3">
          <DL label="Payment Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></DL>
          <DL label="Amount (INR)"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></DL>
          <DL label="Reference / UTR"><input className="input" value={ref} onChange={e => setRef(e.target.value)} /></DL>
        </div>
        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Record Payment'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function MiniK({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`font-mono text-[14px] font-bold ${c}`}>{value}</div>
    </div>
  )
}