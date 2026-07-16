import { useEffect, useRef, useState } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import ExportButtons from '../components/ExportButtons'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import ExpenseImport from '../components/ExpenseImport'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'
import { PrivateImage } from '../components/PrivateFile'

type Expense = {
  id: string; date: string; expense_type: string; amount: number
  vendor: string | null; payment_status: string; paid_by: string | null; remark: string | null
  bill_photo: string | null
}

const TYPES = ['Salary', 'Repair', 'Fooding', 'Material', 'Fuel', 'Transport', 'Other']

export default function Expenses() {
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const { can } = useAuth()
  const [rows, setRows] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)

  async function postToAccounts(expenseId: string) {
    const { error } = await supabase.rpc('acc_post_expense', { p_expense: expenseId, p_pay_ledger: null })
    if (error) { appAlert('Could not post:\n\n' + error.message); return }
    appAlert('Posted to accounts as a DRAFT voucher (Dr expense / Cr cash).\nReview it in Accounting → Vouchers.')
    load()
  }

  async function load() {
    const _p = activeProject?.id ?? null
    if (!activeProject) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('expenses').select('*')
      .eq('project_id', activeProject.id)
      .order('date', { ascending: false }).limit(200)

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setRows((data as Expense[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Daily Expenses</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Track and manage all site expenditures</p>
        </div>
        {can('expenses', 'add') && (
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setShowImport(true)}><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span> Import Excel</button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> Add Expense
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">Recent Transactions</span>
          <ExportButtons
            filename="expenses"
            title="Daily Expenses"
            dateField="date"
            rows={rows}
            columns={[
              { header: 'Date', get: r => r.date },
              { header: 'Type', get: r => r.expense_type },
              { header: 'Amount (INR)', get: r => Number(r.amount) },
              { header: 'Vendor', get: r => r.vendor || '—' },
              { header: 'Payment Status', get: r => r.payment_status },
              { header: 'Paid By', get: r => r.paid_by || '—' },
              { header: 'Bill Attached', get: r => (r.bill_photo ? 'Yes' : 'No') },
              { header: 'Remark', get: r => r.remark || '—' },
            ]}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['Date', 'Type', 'Amount', 'Vendor', 'Status', 'Bill', 'Remark'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                <td className="px-4 py-3 text-[#e2e2e8]">{r.expense_type}</td>
                <td className="px-4 py-3 font-mono font-semibold text-[#e2e2e8] whitespace-nowrap">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-[#dcc1ae]">{r.vendor || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${(r.payment_status || '').toLowerCase().includes('credit') ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                    {r.payment_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.bill_photo
                    ? <PrivateImage bucket="expense-bills" path={r.bill_photo} alt="bill" className="h-8 w-10 object-cover rounded" />
                    : <span className="text-[#dcc1ae]/40">—</span>}
                </td>
                <td className="px-4 py-3 text-[#dcc1ae] max-w-[200px] truncate">{r.remark || '—'}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No expenses yet — add your first.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && <ExpenseForm projectId={activeProject.id} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {showImport && <ExpenseImport projectId={activeProject.id} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />}
    </div>
  )
}

function ExpenseForm({ projectId, onClose, onSaved }: { projectId: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('Material')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [status, setStatus] = useState('Paid')
  const [paidBy, setPaidBy] = useState('')
  const [remark, setRemark] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [imprestEmp, setImprestEmp] = useState('')
  const [emps, setEmps] = useState<{ id: string; full_name: string; emp_code: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('employees').select('id, full_name, emp_code').eq('status', 'Active').order('full_name')
      setEmps((data as any[]) ?? [])
    })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setErr('Enter an amount'); return }
    setBusy(true); setErr(null)

    // Imprest expenses require a bill and go through approval
    if (imprestEmp && !file) { setErr('A bill/invoice is required for staff imprest expenses.'); return }
    const { data: prof } = await supabase.from('profiles').select('org_id').single()

    let billPhotoPath: string | null = null
    if (file) {
      const path = makeObjectPath(prof?.org_id, file, 'bills')
      const { path: stored, error: upErr } = await uploadPrivate('expense-bills', path, file)
      if (upErr) { setErr('Photo upload failed: ' + upErr); setBusy(false); return }
      billPhotoPath = stored ?? null
    }

    const { error } = await supabase.from('expenses').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, expense_type: type, amount: Number(amount),
      vendor: vendor || null, payment_status: status, paid_by: status === 'Paid' ? (paidBy || null) : null,
      remark: remark || null, bill_photo: billPhotoPath,
      imprest_employee_id: imprestEmp || null,
      approval_status: imprestEmp ? 'Pending' : 'Approved',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add Expense</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white transition-colors" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Type">
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="Amount (₹)"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></L>
            <L label="Vendor"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></L>
            <L label="Payment">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                <option>Paid</option><option>Credit</option>
              </select>
            </L>
            {status === 'Paid' && <L label="Paid by"><input className="input" value={paidBy} onChange={e => setPaidBy(e.target.value)} /></L>}
            <L label="Bill Photo">
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>
                {file ? file.name.slice(0, 14) : 'Attach bill'}
              </button>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
          <L label="Imprest of (staff advance)">
            <select className="input" value={imprestEmp} onChange={e => setImprestEmp(e.target.value)}>
              <option value="">— Not from staff advance —</option>
              {emps.map(em => <option key={em.id} value={em.id}>{em.emp_code ? `${em.emp_code} · ` : ''}{em.full_name}</option>)}
            </select>
          </L>
          {imprestEmp && <p className="text-[11px] text-[#dcc1ae]/60 -mt-2 mb-2">Ye kharcha us staff ke advance/imprest se adjust hoga (unka balance kam ho jayega).</p>}
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Expense'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 col-span-1">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}