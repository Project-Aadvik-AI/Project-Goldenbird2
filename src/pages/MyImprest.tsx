import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PrivateLink } from '../components/PrivateFile'

type Adv = { amount: number | null; spent_amount: number | null; settled: boolean }
type Exp = { id: string; date: string; amount: number; expense_type: string | null; vendor: string | null; bill_photo: string | null; approval_status: string | null; rejection_reason: string | null }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default function MyImprest() {
  const { user } = useAuth()
  const [empId, setEmpId] = useState<string | null>(null)
  const [advs, setAdvs] = useState<Adv[]>([])
  const [exps, setExps] = useState<Exp[]>([])
  const [loading, setLoading] = useState(true)
  const [notLinked, setNotLinked] = useState(false)

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
        supabase.from('advances').select('amount, spent_amount, settled').eq('employee_id', emp.id),
        supabase.from('expenses').select('id,date,amount,expense_type,vendor,bill_photo,approval_status,rejection_reason').eq('imprest_employee_id', emp.id).order('date', { ascending: false }),
      ])
      setAdvs((a as Adv[]) ?? [])
      setExps((e as Exp[]) ?? [])
      setLoading(false)
    })()
  }, [user?.id])

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
  const manualSpent = round2(advs.filter(a => !a.settled).reduce((n, a) => n + Number(a.spent_amount || 0), 0))
  const utilized = round2(approved + manualSpent)
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