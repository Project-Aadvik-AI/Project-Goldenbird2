import { useEffect, useMemo, useState, useRef } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateLink } from '../components/PrivateFile'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr0 = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type Bill = {
  bill_id: string; bill_no: string | null; bill_date: string
  amount: number; gst_amount: number | null; total_amount: number
  stage: string; file: string | null; remark: string | null
  voucher_id: string | null
  project_id: string | null; project_name: string | null
  party_id: string | null; vendor_name: string | null; vendor_code: string | null
  wo_id: string | null; wo_no: string | null; wo_title: string | null
  age_days: number; next_stages: string[]
  last_action_at: string | null; last_action_by: string | null; step_count: number
}
type Vendor = { id: string; name: string; vendor_code: string | null }
type WO = { id: string; wo_no: string | null; title: string | null; amount: number }
type Tax = { id: string; name: string; total_rate: number }
type Step = {
  id: string; from_stage: string | null; to_stage: string; comment: string | null
  created_at: string; profiles: { full_name: string } | null
}

// the real pipeline, in order
const PIPELINE = ['Submitted', 'Site Verified', 'Approved', 'Sent to Finance', 'Paid']

const STAGE_STYLE: Record<string, string> = {
  'Submitted': 'bg-white/5 text-[#dcc1ae] border-white/10',
  'Site Verified': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Approved': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Sent to Finance': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Paid': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'On Hold': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function VendorBills() {
  const { can, isAdmin } = useAuth()
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const [rows, setRows] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [open, setOpen] = useState<Bill | null>(null)
  const [fStage, setFStage] = useState('')
  const [q, setQ] = useState('')

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    const { data } = await supabase.from('vendor_bill_pipeline').select('*')
      .eq('project_id', activeProject?.id ?? '')
      .order('bill_date', { ascending: false })

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((data as Bill[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const filtered = useMemo(() => rows.filter(b => {
    if (fStage && b.stage !== fStage) return false
    const s = q.trim().toLowerCase()
    if (s && !`${b.bill_no ?? ''} ${b.vendor_name ?? ''} ${b.wo_no ?? ''}`.toLowerCase().includes(s)) return false
    return true
  }), [rows, fStage, q])

  const kpi = useMemo(() => {
    const at = (st: string) => rows.filter(b => b.stage === st)
    const sum = (bs: Bill[]) => bs.reduce((n, b) => n + Number(b.total_amount || 0), 0)
    return {
      pending: at('Submitted').length + at('Site Verified').length,
      pendingValue: sum([...at('Submitted'), ...at('Site Verified')]),
      approved: at('Approved').length + at('Sent to Finance').length,
      approvedValue: sum([...at('Approved'), ...at('Sent to Finance')]),
      paid: at('Paid').length,
      paidValue: sum(at('Paid')),
      stuck: rows.filter(b => b.stage !== 'Paid' && b.stage !== 'Rejected' && b.age_days > 30).length,
    }
  }, [rows])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Vendor Bills</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">
            Submitted → Site Verified → Approved → Sent to Finance → Paid.
            Every step records who moved it, when, and why.
          </p>
        </div>
        {can('vendor_bills', 'create') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span> Upload Bill
          </button>
        )}
      </div>

      {kpi.stuck > 0 && (
        <div className="card p-3 mb-4 bg-amber-500/5 border-amber-500/20 flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>schedule</span>
          <div className="text-[13px]">
            <b className="text-amber-400">{kpi.stuck} bill(s) have been in the pipeline over 30 days</b>
            <span className="text-[#dcc1ae]"> — vendors are waiting.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Awaiting Approval" value={String(kpi.pending)} sub={inr0(kpi.pendingValue)}
          tone={kpi.pending ? 'amber' : undefined} />
        <K label="Approved" value={String(kpi.approved)} sub={inr0(kpi.approvedValue)} tone="blue" />
        <K label="Paid" value={String(kpi.paid)} sub={inr0(kpi.paidValue)} tone="emerald" />
        <K label="Total Bills" value={String(rows.length)} />
      </div>

      {/* the pipeline, as a strip */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button onClick={() => setFStage('')}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
            !fStage ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                    : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
          All ({rows.length})
        </button>
        {[...PIPELINE, 'On Hold', 'Rejected'].map(st => {
          const n = rows.filter(b => b.stage === st).length
          return (
            <button key={st} onClick={() => setFStage(fStage === st ? '' : st)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${
                fStage === st ? STAGE_STYLE[st]
                  : `text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03] ${!n ? 'opacity-40' : ''}`}`}>
              {st} ({n})
            </button>
          )
        })}
        <input className="input ml-auto" style={{ maxWidth: 200, padding: '6px 10px', fontSize: '13px' }}
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search bill, vendor, WO…" />
        <ExportButtons filename="vendor-bills" title="Vendor Bills" rows={filtered}
          columns={[
            { header: 'Bill No.', get: (r: any) => r.bill_no || '—' },
            { header: 'Date', get: (r: any) => r.bill_date },
            { header: 'Vendor', get: (r: any) => r.vendor_name || '—' },
            { header: 'Work Order', get: (r: any) => r.wo_no || '—' },
            { header: 'Amount', get: (r: any) => Number(r.amount) },
            { header: 'GST', get: (r: any) => Number(r.gst_amount || 0) },
            { header: 'Total', get: (r: any) => Number(r.total_amount) },
            { header: 'Stage', get: (r: any) => r.stage },
            { header: 'Age (days)', get: (r: any) => r.age_days },
            { header: 'Last Action By', get: (r: any) => r.last_action_by || '—' },
            { header: 'In Books', get: (r: any) => (r.voucher_id ? 'Yes' : 'No') },
          ]} />
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Bill No.', 'Vendor', 'Work Order', 'Amount', 'Age', 'Stage', 'Last Action', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map(b => {
                const stuck = b.stage !== 'Paid' && b.stage !== 'Rejected' && b.age_days > 30
                return (
                  <tr key={b.bill_id}
                    className={`hover:bg-white/[0.02] cursor-pointer ${stuck ? 'bg-amber-500/[0.04]' : ''}`}
                    onClick={() => setOpen(b)}>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[12px] text-[#e2e2e8] font-semibold">{b.bill_no || '—'}</div>
                      <div className="text-[10px] text-[#dcc1ae]/60">{b.bill_date}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-[#e2e2e8]">{b.vendor_name || '—'}</div>
                      {b.vendor_code && <div className="text-[10px] font-mono text-[#dcc1ae]/50">{b.vendor_code}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-[#dcc1ae]">
                      {b.wo_no || '—'}
                      {b.wo_title && <div className="text-[10px] text-[#dcc1ae]/50 truncate max-w-[140px]">{b.wo_title}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-[#e2e2e8]">{inr(b.total_amount)}</div>
                      {Number(b.gst_amount) > 0 && (
                        <div className="text-[10px] text-[#dcc1ae]/50">incl. GST {inr0(b.gst_amount!)}</div>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 font-mono text-right ${b.age_days > 60 ? 'text-red-400 font-bold' : b.age_days > 30 ? 'text-amber-400' : 'text-[#dcc1ae]'}`}>
                      {b.age_days}d
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STAGE_STYLE[b.stage] ?? ''}`}>
                        {b.stage}
                      </span>
                      {b.voucher_id && (
                        <div className="text-[9px] text-emerald-400/70 mt-0.5 uppercase">in books</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-[#dcc1ae]">
                      {b.last_action_by ?? '—'}
                      {b.last_action_at && (
                        <div className="text-[10px] text-[#dcc1ae]/50">
                          {new Date(b.last_action_at).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="material-symbols-outlined text-[#dcc1ae]/40" style={{ fontSize: '18px' }}>chevron_right</span>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-[#dcc1ae]/60 text-sm">
                No bills. Click "Upload Bill" to add one.
              </td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <BillForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {open && <BillDetail b={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load() }} />}
    </div>
  )
}

// =====================================================================
//  BILL DETAIL + APPROVAL ACTIONS
// =====================================================================
function BillDetail({ b, onClose, onChanged }: { b: Bill; onClose: () => void; onChanged: () => void }) {
  const { isAdmin } = useAuth()
  const [steps, setSteps] = useState<Step[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bill_approvals')
        .select('*, profiles(full_name)')
        .eq('bill_id', b.bill_id).order('created_at')
      setSteps((data as any[]) ?? [])
    })()
  }, [b.bill_id])

  async function move(stage: string) {
    if (['Rejected', 'On Hold'].includes(stage) && !comment.trim()) {
      setErr(`A reason is required to ${stage.toLowerCase()} this bill.`); return
    }
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('move_bill_stage', {
      p_bill: b.bill_id, p_to_stage: stage, p_comment: comment || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  async function postToBooks() {
    if (!await appConfirm(
      `Post ${b.bill_no ?? 'this bill'} to the accounts?\n\n` +
      `A draft Purchase voucher will be created:\n` +
      `  Dr Material Consumed + Input GST\n` +
      `  Cr ${b.vendor_name}\n\n` +
      `Review and post it in Accounting.`
    )) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('post_vendor_bill_to_accounts', { p_bill: b.bill_id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    appAlert('Draft voucher created. Review it in Accounting → Vouchers, then Post.')
    onChanged()
  }

  const stageIdx = PIPELINE.indexOf(b.stage)

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">{b.bill_no || 'Bill'}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STAGE_STYLE[b.stage] ?? ''}`}>
                {b.stage}
              </span>
            </div>
            <p className="text-[12px] text-[#dcc1ae] mt-0.5">
              {b.vendor_name} · {b.bill_date} · <b className="text-[#e2e2e8]">{inr(b.total_amount)}</b>
              {b.wo_no && ` · ${b.wo_no}`}
            </p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5">
          {/* the pipeline as a progress strip */}
          <div className="flex items-center gap-1 mb-5">
            {PIPELINE.map((st, i) => {
              const done = stageIdx >= 0 && i <= stageIdx
              const isNow = st === b.stage
              return (
                <div key={st} className="flex-1 flex items-center gap-1">
                  <div className={`flex-1 text-center px-1 py-1.5 rounded text-[10px] font-bold uppercase border ${
                    isNow ? STAGE_STYLE[st]
                    : done ? 'bg-emerald-500/[0.06] text-emerald-400/70 border-emerald-500/15'
                    : 'bg-white/[0.02] text-[#dcc1ae]/30 border-white/[0.05]'}`}>
                    {st}
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <span className={`material-symbols-outlined ${done ? 'text-emerald-400/40' : 'text-[#dcc1ae]/20'}`}
                      style={{ fontSize: '14px' }}>chevron_right</span>
                  )}
                </div>
              )
            })}
          </div>

          {['On Hold', 'Rejected'].includes(b.stage) && (
            <div className={`card p-3 mb-4 ${b.stage === 'Rejected' ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <div className={`text-[12px] ${b.stage === 'Rejected' ? 'text-red-400' : 'text-amber-400'}`}>
                <b>{b.stage}.</b> {steps[steps.length - 1]?.comment ?? ''}
              </div>
            </div>
          )}

          {/* amounts */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Amt label="Bill Amount" v={inr(b.amount)} />
            <Amt label="GST" v={Number(b.gst_amount) ? inr(b.gst_amount!) : '—'} />
            <Amt label="Total" v={inr(b.total_amount)} bold />
          </div>

          {b.file && (
            <div className="mb-4">
              <PrivateLink bucket="vendor-bills" path={b.file}
                className="btn btn-ghost inline-flex" >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span>
                View the bill
              </PrivateLink>
            </div>
          )}

          {/* actions */}
          {isAdmin && b.next_stages?.length > 0 && (
            <div className="pt-4 border-t border-white/[0.06]">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">Move this bill</div>
              <input className="input mb-2" value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Comment (required to reject or hold)" />
              <div className="flex flex-wrap gap-2">
                {b.next_stages.map(st => (
                  <button key={st} disabled={busy} onClick={() => move(st)}
                    className={`btn ${['Rejected', 'On Hold'].includes(st) ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ padding: '7px 14px', fontSize: '12px' }}>
                    {st}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* post to accounts */}
          {isAdmin && !b.voucher_id && ['Approved', 'Sent to Finance', 'Paid'].includes(b.stage) && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <button className="btn btn-ghost w-full" disabled={busy} onClick={postToBooks}>
                <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>account_balance</span>
                Post to Accounts
              </button>
              <p className="text-[11px] text-[#dcc1ae]/50 mt-1.5">
                Creates a balanced draft Purchase voucher — Dr expense + input GST, Cr the vendor.
              </p>
            </div>
          )}
          {b.voucher_id && (
            <div className="mt-4 text-[12px] text-emerald-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
              This bill is in the books.
            </div>
          )}

          {err && <div className="text-sm text-red-400 mt-3">{err}</div>}

          {/* approval history */}
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">Approval History</div>
            <div className="relative pl-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.08]" />
              {steps.map(st => (
                <div key={st.id} className="relative pb-4 last:pb-0">
                  <div className={`absolute -left-5 top-1 h-3 w-3 rounded-full border-2 ${
                    st.to_stage === 'Rejected' ? 'bg-[#1B1F2A] border-red-400'
                      : st.to_stage === 'Paid' ? 'bg-[#1B1F2A] border-emerald-400'
                      : 'bg-[#1B1F2A] border-[#ff8f00]/50'}`} />
                  <div className="text-[13px] text-[#e2e2e8]">
                    {st.from_stage ? `${st.from_stage} → ` : ''}<b>{st.to_stage}</b>
                  </div>
                  <div className="text-[11px] text-[#dcc1ae]/60">
                    {st.profiles?.full_name ?? 'Someone'} · {new Date(st.created_at).toLocaleString('en-IN')}
                  </div>
                  {st.comment && <div className="text-[12px] text-[#dcc1ae] mt-0.5 italic">"{st.comment}"</div>}
                </div>
              ))}
              {!steps.length && <div className="text-[12px] text-[#dcc1ae]/50">No actions yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

// =====================================================================
//  UPLOAD A BILL
// =====================================================================
function BillForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { activeProject } = useProject()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [wos, setWos] = useState<WO[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])

  const [partyId, setPartyId] = useState('')
  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10))
  const [woId, setWoId] = useState('')
  const [amount, setAmount] = useState('')
  const [taxId, setTaxId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [supporting, setSupporting] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // what is still billable against the chosen work order
  const [bal, setBal] = useState<{
    contract_value: number; already_billed: number; remaining: number
    can_bill: boolean; reason: string | null
  } | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: w }, { data: t }] = await Promise.all([
        supabase.from('acc_parties').select('id, name, vendor_code')
          .in('party_type', ['Vendor', 'Both']).eq('status', 'Active').order('name'),
        supabase.from('work_orders').select('id, wo_no, title, amount')
          .eq('project_id', activeProject?.id ?? '').order('created_at', { ascending: false }),
        supabase.from('acc_tax_rates').select('id, name, total_rate').eq('active', true)
          .order('total_rate', { ascending: false }),
      ])
      setVendors((v as Vendor[]) ?? [])
      setWos((w as WO[]) ?? [])
      setTaxes((t as Tax[]) ?? [])
    })()
  }, [])

  // ask the DATABASE what is left — never compute it in the browser
  useEffect(() => {
    if (!woId) { setBal(null); return }
    (async () => {
      const { data } = await supabase.rpc('wo_remaining_value', { p_wo: woId })
      setBal((data as any[])?.[0] ?? null)
    })()
  }, [woId])

  const tax = taxes.find(t => t.id === taxId)
  const base = Number(amount) || 0
  const gst = tax ? r2(base * Number(tax.total_rate) / 100) : 0
  const total = r2(base + gst)

  // would this bill blow the contract?
  const overBy = bal && total > 0 ? r2(total - Number(bal.remaining)) : 0
  const exceeds = !!bal && overBy > 0.01

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!partyId) { setErr('Select the vendor.'); return }
    if (!billNo.trim()) { setErr('Enter the bill number.'); return }
    if (base <= 0) { setErr('Enter the bill amount.'); return }
    if (bal && !bal.can_bill) { setErr(bal.reason ?? 'Cannot bill against this work order.'); return }
    if (exceeds) {
      setErr(`Bill amount exceeds the remaining contract value by ${inr(overBy)}.`); return
    }

    setBusy(true); setErr(null)
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', uid!).maybeSingle()

    let filePath: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, 'vendor-bills')
      const { path: stored, error: upErr } = await uploadPrivate('vendor-bills', path, file)
      if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
      filePath = stored ?? null
    }

    const vendorName = vendors.find(v => v.id === partyId)?.name ?? null

    const { data: created, error } = await supabase.from('vendor_bills').insert({
      org_id: prof?.org_id,
      project_id: activeProject?.id ?? null,
      party_id: partyId,
      vendor: vendorName,              // keep the old text column populated
      bill_no: billNo.trim(),
      bill_date: billDate,
      amount: base,
      gst_amount: gst || null,
      tax_rate_id: taxId || null,
      wo_id: woId || null,
      file: filePath,
      remark: remarks || null,
      stage: 'Submitted',
    }).select('id').single()

    if (error) { setErr(error.message); setBusy(false); return }

    // the invoice and every supporting document
    const billId = (created as any)?.id
    if (billId) {
      const all: { f: File; isInvoice: boolean }[] = [
        ...(file ? [{ f: file, isInvoice: true }] : []),
        ...supporting.map(f => ({ f, isInvoice: false })),
      ]
      for (const { f, isInvoice } of all) {
        const p = makeObjectPath(prof?.org_id, f, 'vendor-bills')
        const { path: stored, error: e2 } = await uploadPrivate('vendor-bills', p, f)
        if (e2) continue
        await supabase.from('bill_attachments').insert({
          org_id: prof?.org_id, bill_id: billId,
          file_path: stored ?? null, file_name: f.name,
          mime_type: f.type, file_size: f.size,
          is_invoice: isInvoice, uploaded_by: uid,
        })
      }
    }

    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-xl my-6 shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-headline text-lg font-semibold text-[#e2e2e8]">Upload Vendor Bill</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <F label="Vendor *">
                <select className="input" value={partyId} onChange={e => setPartyId(e.target.value)}>
                  <option value="">— Select vendor —</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}{v.vendor_code ? ` (${v.vendor_code})` : ''}</option>
                  ))}
                </select>
                {!vendors.length && (
                  <p className="text-[11px] text-amber-400/80 mt-1">
                    No vendors. Add them on the Vendors page.
                  </p>
                )}
              </F>
            </div>
            <F label="Vendor Code">
              <input className="input mono" readOnly
                value={vendors.find(v => v.id === partyId)?.vendor_code ?? ''}
                placeholder="auto"
                style={{ opacity: 0.7, cursor: 'not-allowed' }} />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <F label="Bill Number *">
              <input className="input" value={billNo} onChange={e => setBillNo(e.target.value)} />
            </F>
            <F label="Bill Date *">
              <input type="date" className="input" value={billDate} onChange={e => setBillDate(e.target.value)} />
            </F>
          </div>

          <F label="Against Work Order">
            <select className="input" value={woId} onChange={e => setWoId(e.target.value)}>
              <option value="">— Not linked —</option>
              {wos.map(w => (
                <option key={w.id} value={w.id}>
                  {w.wo_no ?? 'WO'} — {(w.title ?? '').slice(0, 40)} (₹{Number(w.amount || 0).toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </F>

          {/* the contract position, straight from the database */}
          {bal && (
            <div className={`rounded-lg border p-3 ${
              !bal.can_bill ? 'bg-red-500/5 border-red-500/20'
                : 'bg-white/[0.03] border-white/[0.06]'}`}>
              {!bal.can_bill ? (
                <div className="text-[12px] text-red-400">
                  <b>Cannot bill against this work order.</b> {bal.reason}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Contract</div>
                      <div className="font-mono text-[13px] text-[#e2e2e8] mt-0.5">{inr(bal.contract_value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Already Billed</div>
                      <div className="font-mono text-[13px] text-[#dcc1ae] mt-0.5">{inr(bal.already_billed)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">Remaining</div>
                      <div className="font-mono text-[13px] font-bold text-emerald-400 mt-0.5">{inr(bal.remaining)}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2.5">
                    <div className="h-full rounded-full bg-[#ff8f00]"
                      style={{ width: `${Math.min(100, Number(bal.already_billed) / Math.max(1, Number(bal.contract_value)) * 100)}%` }} />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <F label="Bill Amount (before GST) *">
              <input className="input mono text-right" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            </F>
            <F label="GST Rate">
              <select className="input" value={taxId} onChange={e => setTaxId(e.target.value)}>
                <option value="">— No GST —</option>
                {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </F>
          </div>

          {exceeds && (
            <div className="card p-3 bg-red-500/10 border-red-500/25">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>error</span>
                <div className="text-[12px]">
                  <b className="text-red-400">
                    Bill amount exceeds the remaining contract value by {inr(overBy)}.
                  </b>
                  <div className="text-[#dcc1ae] mt-0.5">
                    Remaining: {inr(Number(bal!.remaining))} · This bill: {inr(total)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {base > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
              <Line k="Bill Amount" v={inr(base)} />
              {tax && <Line k={`GST (${tax.total_rate}%)`} v={'+ ' + inr(gst)} />}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/[0.08]">
                <span className="text-[12px] font-bold text-[#e2e2e8] uppercase">Total</span>
                <span className="font-mono text-[16px] font-bold text-[#ffb87b]">{inr(total)}</span>
              </div>
            </div>
          )}

          <F label="Invoice PDF *">
            <input type="file" className="input" accept=".pdf,image/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </F>

          <F label="Supporting Documents">
            <input type="file" multiple className="input" accept=".pdf,image/*,.xlsx,.xls"
              onChange={e => setSupporting(Array.from(e.target.files ?? []))} />
            {supporting.length > 0 && (
              <p className="text-[11px] text-[#dcc1ae]/60 mt-1">
                {supporting.length} file(s): {supporting.map(f => f.name).join(', ')}
              </p>
            )}
            <p className="text-[11px] text-[#dcc1ae]/50 mt-1">
              Measurement sheets, delivery challans, site photos…
            </p>
          </F>

          <F label="Remarks">
            <input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </F>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy || exceeds || (!!bal && !bal.can_bill)}>
            {busy ? 'Uploading…' : 'Submit Bill'}
          </button>
        </div>
        <p className="px-5 pb-4 text-[11px] text-[#dcc1ae]/50">
          The bill enters the pipeline at <b>Submitted</b> and moves through Site Verified → Approved →
          Sent to Finance → Paid. Every step is recorded.
        </p>
      </form>
    </div>
  ), document.body)
}

function Amt({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-[15px] mt-0.5 ${bold ? 'font-bold text-[#ffb87b]' : 'text-[#e2e2e8]'}`}>{v}</div>
    </div>
  )
}
function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] text-[#dcc1ae]">{k}</span>
      <span className="font-mono text-[13px] text-[#e2e2e8]">{v}</span>
    </div>
  )
}
function K({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'amber' | 'blue' | 'emerald'
}) {
  const c = tone === 'amber' ? 'text-amber-400' : tone === 'blue' ? 'text-blue-400'
    : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
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