import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PrivateLink } from '../components/PrivateFile'
import { uploadPrivate, makeObjectPath } from '../lib/storage'

type Adv = { amount: number | null; spent_amount: number | null; settled: boolean; returned_amount?: number | null }
type Exp = { id: string; date: string; amount: number; expense_type: string | null; vendor: string | null; bill_photo: string | null; approval_status: string | null; rejection_reason: string | null }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default function MyImprest() {
  const { user } = useAuth()
  const [empId, setEmpId] = useState<string | null>(null)
  const [advs, setAdvs] = useState<Adv[]>([])
  const [exps, setExps] = useState<Exp[]>([])
  const [loading, setLoading] = useState(true)
  const [notLinked, setNotLinked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    (async () => {
      if (!user) return
      // find this login's employee record (by profile_id, else email)
      let emp: { id: string } | null = null
      const { data: byProfile } = await supabase.from('employees').select('id').eq('profile_id', user.id).limit(1)
      if (byProfile && byProfile.length) emp = byProfile[0] as any
      if (!emp) {
        const { data: au } = await supabase.auth.getUser()
        const em = au?.user?.email
        if (em) {
          const { data: byEmail } = await supabase.from('employees').select('id').ilike('email', em).limit(1)
          if (byEmail && byEmail.length) emp = byEmail[0] as any
        }
      }
      if (!emp) { setNotLinked(true); setLoading(false); return }
      setEmpId(emp.id)
      const [{ data: a }, { data: e }] = await Promise.all([
        supabase.from('advances').select('amount, spent_amount, settled, returned_amount').eq('employee_id', emp.id),
        supabase.from('expenses').select('id,date,amount,expense_type,vendor,bill_photo,approval_status,rejection_reason').eq('imprest_employee_id', emp.id).order('date', { ascending: false }),
      ])
      setAdvs((a as Adv[]) ?? [])
      setExps((e as Exp[]) ?? [])
      setLoading(false)
    })()
  }, [user?.id, reloadKey])

  if (loading) return <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div>
  if (notLinked) return (
    <div className="p-8 text-center">
      <h1 className="font-headline text-xl text-[#e2e2e8] mb-2">My Imprest</h1>
      <p className="text-[#dcc1ae] text-sm">Your login isn't linked to an employee record yet. Ask your admin to create your employee profile / login.</p>
    </div>
  )

  const given = round2(advs.filter(a => !a.settled).reduce((n, a) => n + Number(a.amount || 0), 0))
  const approved = round2(exps.filter(e => (e.approval_status ?? 'Approved') === 'Approved').reduce((n, e) => n + Number(e.amount || 0), 0))
  const pending = round2(exps.filter(e => e.approval_status === 'Pending').reduce((n, e) => n + Number(e.amount || 0), 0))
  // Utilized = approved imprest bills only (single source of truth). Cash returned is tracked via settlement.
  const returned = round2(advs.reduce((n, a) => n + Number((a as any).returned_amount || 0), 0))
  const utilized = round2(approved + returned)
  const balance = round2(given - utilized)

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">My Imprest</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Your company advance, bills, and remaining balance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Imprest Received" value={`₹${given.toLocaleString('en-IN')}`} />
        <Kpi label="Utilized (approved)" value={`₹${utilized.toLocaleString('en-IN')}`} accent="amber" />
        <Kpi label="Pending Approval" value={`₹${pending.toLocaleString('en-IN')}`} />
        <Kpi label="Remaining Balance" value={`₹${Math.abs(balance).toLocaleString('en-IN')}`} accent={balance > 0 ? 'emerald' : undefined} />
      </div>

      {empId && !showForm && (
        <button className="btn btn-primary mb-4" onClick={() => setShowForm(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>receipt_long</span> Submit a Bill
        </button>
      )}
      {empId && showForm && <SubmitBillForm employeeId={empId} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setReloadKey(k => k + 1) }} />}

      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">My Bills</span></div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Date', 'Type', 'Vendor', 'Amount', 'Status', 'Bill'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {exps.map(e => {
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
                  <td className="px-4 py-2.5">{e.bill_photo ? <PrivateLink bucket="expense-bills" path={e.bill_photo} className="btn btn-ghost">View</PrivateLink> : '—'}</td>
                </tr>
              )
            })}
            {!exps.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No imprest bills yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#dcc1ae]/50 mt-4">Only approved bills reduce your balance. Rejected bills show the reason — submit a corrected bill via the Expenses page.</p>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-4">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[20px] font-bold ${c}`}>{value}</div>
    </div>
  )
}


function SubmitBillForm({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('Material')
  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [desc, setDesc] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!amount || Number(amount) <= 0) { setErr('Enter the amount you spent.'); return }
    if (!file) { setErr('A bill/invoice is required.'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    // find the employee's default project (optional)
    const { data: emp } = await supabase.from('employees').select('project_id, org_id').eq('id', employeeId).maybeSingle()
    const orgForPath = prof?.org_id ?? (emp as any)?.org_id ?? 'org'
    const path = makeObjectPath(orgForPath, file, 'bills')
    const { path: stored, error: upErr } = await uploadPrivate('expense-bills', path, file)
    if (upErr) { setErr('Upload failed: ' + upErr); setBusy(false); return }
    // org_id is auto-filled by the DB trigger (set_org_id) from current_org(); we omit it here
    const { error } = await supabase.from('expenses').insert({
      project_id: (emp as any)?.project_id ?? null,
      date, expense_type: type, amount: Number(amount), vendor: vendor || null,
      payment_status: 'Paid', remark: desc || null, bill_photo: stored ?? null,
      imprest_employee_id: employeeId, approval_status: 'Pending',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#e2e2e8]">Submit a Bill (against your imprest)</span>
        <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <L label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></L>
        <L label="Category"><select className="input" value={type} onChange={e => setType(e.target.value)}><option>Material</option><option>Labour</option><option>Fuel</option><option>Transport</option><option>Food</option><option>Other</option></select></L>
        <L label="Amount (INR)"><input className="input mono" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} /></L>
        <L label="Vendor"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Shop name" /></L>
        <L label="Description"><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What was it for" /></L>
        <L label="Bill / Invoice (required)">
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="btn btn-ghost w-full" style={{ fontSize: '12px' }} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>attach_file</span>{file ? file.name.slice(0, 16) : 'Attach bill'}
          </button>
        </L>
      </div>
      {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
      <div className="flex gap-2 mt-3">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary flex-[2]" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
      </div>
      <p className="text-[11px] text-[#dcc1ae]/50 mt-2">Your bill will be marked Pending. Once your admin approves it, your imprest balance reduces.</p>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}