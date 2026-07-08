import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { round2, inr } from '../lib/boq'

type Boq = { id: string; name: string; boq_number: string | null; monthly_target: number | null }

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const to = new Date(y, m, 0).toISOString().slice(0, 10) // last day of month
  return { from, to }
}

export default function MonthlyPerformance() {
  const [boqs, setBoqs] = useState<Boq[]>([])
  const [boqId, setBoqId] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(false)
  const [workDone, setWorkDone] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [labour, setLabour] = useState(0)
  const [material, setMaterial] = useState(0)
  const [machineDays, setMachineDays] = useState(0)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boqs').select('id,name,boq_number,monthly_target').order('created_at', { ascending: false })
      const list = (data as Boq[]) ?? []
      setBoqs(list); if (list.length && !boqId) setBoqId(list[0].id)
    })()
  }, [])

  async function load() {
    setLoading(true)
    const { from, to } = monthRange(month)

    // WORK DONE = approved measurements in month × final_rate
    let wd = 0
    if (boqId) {
      const { data: items } = await supabase.from('boq_items').select('id, final_rate').eq('boq_id', boqId)
      const rateById: Record<string, number> = {}
      for (const it of (items ?? []) as { id: string; final_rate: number }[]) rateById[it.id] = Number(it.final_rate || 0)
      const ids = Object.keys(rateById)
      if (ids.length) {
        const { data: mb } = await supabase.from('measurement_book')
          .select('boq_item_id, measured_qty, measurement_date, status')
          .in('boq_item_id', ids).eq('status', 'Approved')
          .gte('measurement_date', from).lte('measurement_date', to)
        for (const r of (mb ?? []) as { boq_item_id: string; measured_qty: number }[]) {
          wd += Number(r.measured_qty || 0) * (rateById[r.boq_item_id] || 0)
        }
      }
    }
    setWorkDone(round2(wd))

    // COSTS by month (date range)
    const [exp, lab, sto, mac] = await Promise.all([
      supabase.from('expenses').select('amount').gte('date', from).lte('date', to),
      supabase.from('labour_attendance').select('wage').gte('date', from).lte('date', to),
      supabase.from('store_ledger').select('value, direction').gte('date', from).lte('date', to),
      supabase.from('machine_status').select('status').gte('date', from).lte('date', to),
    ])
    setExpenses(round2((exp.data ?? []).reduce((n, r: { amount: number }) => n + Number(r.amount || 0), 0)))
    setLabour(round2((lab.data ?? []).reduce((n, r: { wage: number }) => n + Number(r.wage || 0), 0)))
    setMaterial(round2((sto.data ?? [])
      .filter((r: { direction: string }) => (r.direction || '').toUpperCase() === 'IN')
      .reduce((n, r: { value: number }) => n + Number(r.value || 0), 0)))
    setMachineDays((mac.data ?? []).filter((r: { status: string }) => (r.status || '').toLowerCase() === 'running').length)
    setLoading(false)
  }
  useEffect(() => { if (boqId) load() }, [boqId, month])

  const boq = boqs.find(b => b.id === boqId)
  const target = boq?.monthly_target ?? 0
  const totalCost = round2(expenses + labour + material)
  const workVsTarget = round2(workDone - target)
  const workVsCost = round2(workDone - totalCost)     // value produced minus money spent
  const targetPct = target ? round2(workDone / target * 100) : 0

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  }, [month])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Monthly Performance</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Target vs work done vs money spent · {monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)} style={{ minWidth: 160 }}>
            {!boqs.length && <option value="">No BOQs</option>}
            {boqs.map(b => <option key={b.id} value={b.id}>{b.boq_number ? `${b.boq_number} · ` : ''}{b.name}</option>)}
          </select>
          <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>

      {loading && <div className="card p-6 text-[#dcc1ae] text-sm">Calculating…</div>}

      {!loading && (
        <>
          {/* Headline: target vs work done */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <Big label="Monthly Target" value={target ? inr(target) : 'Not set'} sub={target ? '' : 'Set it on the BOQ page'} />
            <Big label="Work Done (approved)" value={inr(workDone)} accent="emerald" sub={target ? `${targetPct}% of target` : ''} />
            <Big label="Money Spent" value={inr(totalCost)} accent="amber" sub="Expenses + Labour + Material" />
          </div>

          {/* Verdicts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <Verdict
              ok={workVsTarget >= 0}
              okText={`Ahead of target by ${inr(Math.abs(workVsTarget))}`}
              badText={`Behind target by ${inr(Math.abs(workVsTarget))}`}
              disabled={!target}
            />
            <Verdict
              ok={workVsCost >= 0}
              okText={`Work value exceeds cost by ${inr(Math.abs(workVsCost))}`}
              badText={`Cost exceeds work value by ${inr(Math.abs(workVsCost))}`}
            />
          </div>

          {/* Cost breakdown */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">Cost Breakdown · {monthLabel}</span></div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.05]">
                <Line label="Expenses" value={expenses} icon="receipt_long" />
                <Line label="Labour (wages)" value={labour} icon="engineering" />
                <Line label="Material (received)" value={material} icon="inventory_2" />
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 text-[13px] font-bold text-[#e2e2e8] uppercase tracking-wide">Total Money Spent</td>
                  <td className="px-4 py-3 font-mono text-[16px] font-bold text-amber-400 text-right">{inr(totalCost)}</td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-white/5 text-[11px] text-[#dcc1ae]/60">
              Machines ran on {machineDays} day-entries this month. (No machine cost is calculated — the machine log has no rate/cost field. Add machine hire rates later to include it.)
            </div>
          </div>

          <p className="text-[11px] text-[#dcc1ae]/50 mt-4">
            Work Done counts only <span className="text-emerald-400">approved</span> measurements dated in {monthLabel}. Costs are summed from Expenses, Labour and Material records dated in the month.
          </p>
        </>
      )}
    </div>
  )
}

function Big({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'emerald' | 'amber' }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-5">
      <div className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`font-mono text-[26px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/60 mt-1">{sub}</div>}
    </div>
  )
}

function Verdict({ ok, okText, badText, disabled }: { ok: boolean; okText: string; badText: string; disabled?: boolean }) {
  if (disabled) return <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[13px] text-[#dcc1ae]/60">Set a monthly target to compare.</div>
  return (
    <div className={`p-4 rounded-xl border flex items-center gap-3 ${ok ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
      <span className={`material-symbols-outlined ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? 'check_circle' : 'warning'}</span>
      <span className={`text-[13px] font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{ok ? okText : badText}</span>
    </div>
  )
}

function Line({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-4 py-3 text-[#dcc1ae] flex items-center gap-2">
        <span className="material-symbols-outlined text-[#dcc1ae]/60" style={{ fontSize: '18px' }}>{icon}</span>{label}
      </td>
      <td className="px-4 py-3 font-mono text-[#e2e2e8] text-right">{inr(value)}</td>
    </tr>
  )
}