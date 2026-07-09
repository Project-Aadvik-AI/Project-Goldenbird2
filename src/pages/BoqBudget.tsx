import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { round2, inr } from '../lib/boq'
import ExportButtons from '../components/ExportButtons'

type Boq = { id: string; name: string; boq_number: string | null; project_id: string | null }
type Item = { category: string | null; amount: number }

export default function BoqBudget() {
  const { activeProject } = useProject()
  const [boqs, setBoqs] = useState<Boq[]>([])
  const [boqId, setBoqId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)

  // actual cost (project-wide)
  const [expenses, setExpenses] = useState(0)
  const [labour, setLabour] = useState(0)
  const [material, setMaterial] = useState(0)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boqs').select('id,name,boq_number,project_id').order('created_at', { ascending: false })
      const list = (data as Boq[]) ?? []
      setBoqs(list); if (list.length && !boqId) setBoqId(list[0].id)
    })()
  }, [])

  async function load(id: string) {
    if (!id) return
    setLoading(true)
    // BUDGET: BOQ items grouped by schedule (category)
    const { data: its } = await supabase.from('boq_items').select('category, amount').eq('boq_id', id)
    setItems((its as Item[]) ?? [])

    // ACTUAL: project-wide expenses + labour + material (store IN)
    const pid = activeProject?.id
    if (pid) {
      const [exp, lab, sto] = await Promise.all([
        supabase.from('expenses').select('amount').eq('project_id', pid),
        supabase.from('labour_attendance').select('wage').eq('project_id', pid),
        supabase.from('store_ledger').select('value, direction').eq('project_id', pid),
      ])
      setExpenses(round2((exp.data ?? []).reduce((n, r: { amount: number }) => n + Number(r.amount || 0), 0)))
      setLabour(round2((lab.data ?? []).reduce((n, r: { wage: number }) => n + Number(r.wage || 0), 0)))
      setMaterial(round2((sto.data ?? [])
        .filter((r: { direction: string }) => (r.direction || '').toUpperCase() === 'IN')
        .reduce((n, r: { value: number }) => n + Number(r.value || 0), 0)))
    } else { setExpenses(0); setLabour(0); setMaterial(0) }
    setLoading(false)
  }
  useEffect(() => { load(boqId) }, [boqId, activeProject?.id])

  // schedule-wise budget
  const schedules = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of items) {
      const key = (it.category && it.category.trim()) ? it.category.trim() : 'Ungrouped'
      map.set(key, round2((map.get(key) ?? 0) + Number(it.amount || 0)))
    }
    return [...map.entries()].map(([schedule, budget]) => ({ schedule, budget }))
      .sort((a, b) => b.budget - a.budget)
  }, [items])

  const totalBudget = useMemo(() => round2(schedules.reduce((n, s) => n + s.budget, 0)), [schedules])
  const totalActual = round2(expenses + labour + material)
  const variance = round2(totalBudget - totalActual)  // positive = under budget (saved)
  const usedPct = totalBudget ? round2(totalActual / totalBudget * 100) : 0

  const boq = boqs.find(b => b.id === boqId)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">BOQ Budget</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Schedule-wise planned budget vs actual project cost</p>
        </div>
        <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)} style={{ minWidth: 200 }}>
          {!boqs.length && <option value="">No BOQs</option>}
          {boqs.map(b => <option key={b.id} value={b.id}>{b.boq_number ? `${b.boq_number} · ` : ''}{b.name}</option>)}
        </select>
      </div>

      {loading && <div className="card p-6 text-[#dcc1ae] text-sm">Loading…</div>}

      {!loading && boq && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <Kpi label="Total Budget (BOQ)" value={inr(totalBudget)} />
            <Kpi label="Actual Cost (spent)" value={inr(totalActual)} accent="amber" sub={`${usedPct}% of budget`} />
            <Kpi label={variance >= 0 ? 'Under budget by' : 'Over budget by'} value={inr(Math.abs(variance))} accent={variance >= 0 ? 'emerald' : 'red'} />
          </div>

          {/* Budget usage bar */}
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#e2e2e8]">Budget Utilisation</span>
              <span className="font-mono text-[13px] text-[#dcc1ae]">{usedPct}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full ${usedPct > 100 ? 'bg-red-500' : usedPct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, usedPct)}%` }} />
            </div>
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ${variance >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{variance >= 0 ? 'savings' : 'warning'}</span>
              {variance >= 0 ? `On budget — ${inr(Math.abs(variance))} remaining` : `Over budget by ${inr(Math.abs(variance))}`}
            </div>
          </div>

          {/* Schedule-wise budget */}
          <div className="card overflow-hidden overflow-x-auto mb-5">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#e2e2e8]">Schedule-wise Budget</span>
              <ExportButtons
                filename={`boq_budget_${boq.boq_number || boq.name}`}
                title={`BOQ Budget · ${boq.name}`}
                rows={schedules}
                columns={[
                  { header: 'Schedule', get: r => r.schedule },
                  { header: 'Budget', get: r => r.budget },
                  { header: '% of Total', get: r => totalBudget ? round2(r.budget / totalBudget * 100) : 0 },
                ]}
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['Schedule', 'Budget', '% of Total', 'Share'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {schedules.map(s => {
                  const pct = totalBudget ? round2(s.budget / totalBudget * 100) : 0
                  return (
                    <tr key={s.schedule} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#e2e2e8] max-w-[280px] truncate" title={s.schedule}>{s.schedule}</td>
                      <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{inr(s.budget)}</td>
                      <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{pct}%</td>
                      <td className="px-4 py-2.5">
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden min-w-[80px]"><div className="h-full bg-[#ffb87b]" style={{ width: `${pct}%` }} /></div>
                      </td>
                    </tr>
                  )
                })}
                {!schedules.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No items in this BOQ.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-white/10 bg-white/[0.02]">
                  <td className="px-4 py-3 text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wider">Total Budget</td>
                  <td className="px-4 py-3 font-mono text-[15px] text-[#e2e2e8] text-right font-bold">{inr(totalBudget)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Actual cost breakdown */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">Actual Cost (this project)</span></div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.05]">
                <CostLine label="Expenses" value={expenses} icon="receipt_long" />
                <CostLine label="Labour (wages)" value={labour} icon="engineering" />
                <CostLine label="Material (store received)" value={material} icon="inventory_2" />
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 text-[13px] font-bold text-[#e2e2e8] uppercase tracking-wide">Total Actual</td>
                  <td className="px-4 py-3 font-mono text-[16px] font-bold text-amber-400 text-right">{inr(totalActual)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-[#dcc1ae]/50 mt-4">
            Budget = BOQ item amounts grouped by schedule. Actual = all Expenses + Labour wages + Material received for this project.
            Actual is project-wide (not yet split by schedule). To split actual per schedule, a schedule tag on expenses can be added later.
          </p>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: 'emerald' | 'amber' | 'red'; sub?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' : accent === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-5">
      <div className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`font-mono text-[24px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/60 mt-1">{sub}</div>}
    </div>
  )
}
function CostLine({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="px-4 py-3 text-[#dcc1ae] flex items-center gap-2">
        <span className="material-symbols-outlined text-[#dcc1ae]/60" style={{ fontSize: '18px' }}>{icon}</span>{label}
      </td>
      <td className="px-4 py-3 font-mono text-[#e2e2e8] text-right">{inr(value)}</td>
    </tr>
  )
}