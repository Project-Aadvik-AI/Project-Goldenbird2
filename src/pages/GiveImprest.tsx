import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Emp = { id: string; full_name: string; emp_code: string | null; department: string | null }
type Row = { employee_id: string; amount: number | null; spent_amount: number | null; settled: boolean }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export default function GiveImprest() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [emps, setEmps] = useState<Emp[]>([])
  const [advs, setAdvs] = useState<Row[]>([])
  const [approvedByEmp, setApprovedByEmp] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // form state
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Emp | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState('Cash')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: e }, { data: a }, { data: iexp }] = await Promise.all([
      supabase.from('employees').select('id, full_name, emp_code, department').order('full_name'),
      supabase.from('advances').select('employee_id, amount, spent_amount, settled'),
      supabase.from('expenses').select('imprest_employee_id, amount, approval_status'),
    ])
    setEmps((e as Emp[]) ?? [])
    setAdvs((a as Row[]) ?? [])
    const appr: Record<string, number> = {}
    for (const x of (iexp as any[]) ?? []) {
      if (!x.imprest_employee_id) continue
      if ((x.approval_status ?? 'Approved') !== 'Approved') continue
      appr[x.imprest_employee_id] = round2((appr[x.imprest_employee_id] ?? 0) + Number(x.amount || 0))
    }
    setApprovedByEmp(appr)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // outstanding per employee = given − approved bills (unsettled advances only)
  const outstanding = useMemo(() => {
    const given: Record<string, number> = {}
    for (const a of advs) {
      if (a.settled) continue
      given[a.employee_id] = round2((given[a.employee_id] ?? 0) + Number(a.amount || 0))
    }
    const out: Record<string, number> = {}
    for (const id of new Set([...Object.keys(given), ...Object.keys(approvedByEmp)])) {
      out[id] = round2((given[id] ?? 0) - (approvedByEmp[id] ?? 0))
    }
    return out
  }, [advs, approvedByEmp])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return emps.filter(e =>
      e.full_name.toLowerCase().includes(q) || (e.emp_code ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, emps])

  const withOutstanding = useMemo(() =>
    emps.map(e => ({ ...e, out: outstanding[e.id] ?? 0 }))
      .filter(e => e.out > 0.009)
      .sort((a, b) => b.out - a.out), [emps, outstanding])

  async function give() {
    if (!picked) { setErr('Search and select an employee first.'); return }
    if (!amount || Number(amount) <= 0) { setErr('Enter the amount.'); return }
    setBusy(true); setErr(null); setMsg(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').maybeSingle()
    const { error } = await supabase.from('advances').insert({
      org_id: prof?.org_id, employee_id: picked.id, person: picked.full_name, date,
      amount: Number(amount), spent_amount: null,
      purpose: purpose || null, payment_mode: mode || null, status: 'Pending',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(`₹${Number(amount).toLocaleString('en-IN')} imprest given to ${picked.full_name}. It now shows in their profile, My Imprest, and reports.`)
    setAmount(''); setPurpose(''); setPicked(null); setSearch('')
    load()
  }

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Only admins can give imprest.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Give Imprest</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Search any employee and issue an advance. It updates everywhere automatically — their profile, My Imprest, salary report, and the imprest report.</p>
      </div>

      <div className="card p-5 mb-6">
        <label className="block mb-3">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Search Employee (name or ID)</span>
          <input className="input w-full" value={search} onChange={e => { setSearch(e.target.value); setPicked(null) }} placeholder="Type a name or Employee ID…" />
        </label>

        {!picked && results.length > 0 && (
          <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.05] mb-3 overflow-hidden">
            {results.map(e => (
              <button key={e.id} className="w-full text-left px-3 py-2 hover:bg-white/[0.04] flex items-center justify-between" onClick={() => { setPicked(e); setSearch(e.full_name) }}>
                <span className="text-[#e2e2e8] text-sm">{e.full_name} <span className="text-[#dcc1ae]/50 font-mono text-[11px] ml-1">{e.emp_code || ''}</span></span>
                {outstanding[e.id] > 0.009 && <span className="text-[11px] text-amber-400">₹{outstanding[e.id].toLocaleString('en-IN')} outstanding</span>}
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '18px' }}>person_check</span>
            <span className="text-[#e2e2e8]">Selected: <b>{picked.full_name}</b> <span className="font-mono text-[11px] text-[#dcc1ae]/60">{picked.emp_code}</span></span>
            {outstanding[picked.id] > 0.009 && <span className="text-[11px] text-amber-400 ml-2">Already ₹{outstanding[picked.id].toLocaleString('en-IN')} outstanding</span>}
            <button className="ml-auto text-[#dcc1ae] hover:text-white text-[12px]" onClick={() => { setPicked(null); setSearch('') }}>Change</button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <L label="Amount (INR)"><input className="input mono" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="10000" /></L>
          <L label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></L>
          <L label="Payment Mode"><select className="input" value={mode} onChange={e => setMode(e.target.value)}><option>Cash</option><option>Bank</option><option>UPI</option><option>Cheque</option></select></L>
          <L label="Purpose"><input className="input" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Site expenses" /></L>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        {msg && <div className="text-sm text-emerald-400 mt-3">{msg}</div>}
        <button className="btn btn-primary mt-4" disabled={busy || !picked} onClick={give}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>payments</span>{busy ? 'Giving…' : 'Give Imprest'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#e2e2e8]">Outstanding Imprest</span>
          <span className="text-[11px] text-[#dcc1ae]/60">{withOutstanding.length} employee(s)</span>
        </div>
        {loading ? <div className="p-6 text-[#dcc1ae] text-sm">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Code', 'Employee', 'Department', 'Outstanding', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {withOutstanding.map(e => (
                <tr key={e.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{e.emp_code || '—'}</td>
                  <td className="px-4 py-2.5 text-[#e2e2e8]">{e.full_name}</td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{e.department || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-amber-400 font-bold">₹{e.out.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button className="text-[#ffb87b] text-[12px] font-semibold uppercase hover:underline" onClick={() => navigate(`/employees/${e.id}`)}>Manage</button>
                  </td>
                </tr>
              ))}
              {!withOutstanding.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No outstanding imprest. Everyone is settled.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}