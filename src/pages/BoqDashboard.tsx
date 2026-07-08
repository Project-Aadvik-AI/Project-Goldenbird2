import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { round2, inr } from '../lib/boq'

type Boq = { id: string; name: string; boq_number: string | null; status: string; version: number; monthly_target: number | null }
type Item = { id: string; description: string; unit: string | null; quantity: number; completed_qty: number; final_rate: number; amount: number }
type Bill = { id: string; gross: number; net_payable: number; status: string; bill_no: string | null }

export default function BoqDashboard() {
  const navigate = useNavigate()
  const [boqs, setBoqs] = useState<Boq[]>([])
  const [boqId, setBoqId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boqs').select('id,name,boq_number,status,version,monthly_target').order('created_at', { ascending: false })
      const list = (data as Boq[]) ?? []
      setBoqs(list); if (list.length && !boqId) setBoqId(list[0].id)
    })()
  }, [])

  async function load(id: string) {
    if (!id) return
    setLoading(true)
    const { data: its } = await supabase.from('boq_items').select('id,description,unit,quantity,completed_qty,final_rate,amount').eq('boq_id', id).order('sort_order')
    setItems((its as Item[]) ?? [])
    const { data: bl } = await supabase.from('ra_bills').select('id,gross,net_payable,status,bill_no').eq('boq_id', id)
    setBills((bl as Bill[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load(boqId) }, [boqId])

  const boq = boqs.find(b => b.id === boqId)

  const stats = useMemo(() => {
    const totalValue = round2(items.reduce((n, i) => n + Number(i.amount || 0), 0))
    const completedValue = round2(items.reduce((n, i) => n + Number(i.completed_qty || 0) * Number(i.final_rate || 0), 0))
    const remainingValue = round2(totalValue - completedValue)
    const pct = totalValue ? round2(completedValue / totalValue * 100) : 0
    const billedGross = round2(bills.filter(b => b.status !== 'Cancelled').reduce((n, b) => n + Number(b.gross || 0), 0))
    const unbilledCertified = round2(Math.max(0, completedValue - billedGross))
    const netBilled = round2(bills.filter(b => b.status !== 'Cancelled').reduce((n, b) => n + Number(b.net_payable || 0), 0))
    return { totalValue, completedValue, remainingValue, pct, billedGross, unbilledCertified, netBilled }
  }, [items, bills])

  const topItems = useMemo(() => [...items].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5), [items])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">BOQ Dashboard</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Value, progress & billing at a glance{boq ? ` · ${boq.status} · v${boq.version}` : ''}</p>
        </div>
        <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)} style={{ minWidth: 200 }}>
          {!boqs.length && <option value="">No BOQs</option>}
          {boqs.map(b => <option key={b.id} value={b.id}>{b.boq_number ? `${b.boq_number} · ` : ''}{b.name}</option>)}
        </select>
      </div>

      {loading && <div className="card p-6 text-[#dcc1ae] text-sm">Loading…</div>}

      {!loading && boq && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <Kpi label="Total BOQ Value" value={inr(stats.totalValue)} />
            <Kpi label="Completed (approved)" value={inr(stats.completedValue)} accent="emerald" sub={`${stats.pct}% done`} />
            <Kpi label="Remaining Value" value={inr(stats.remainingValue)} />
            <Kpi label="Net Billed" value={inr(stats.netBilled)} accent="blue" sub={`${bills.filter(b => b.status !== 'Cancelled').length} RA bills`} />
          </div>

          {/* Progress bar */}
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#e2e2e8]">Overall Completion</span>
              <span className="font-mono text-[13px] text-[#dcc1ae]">{stats.pct}%</span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${stats.pct}%` }} /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <MiniStat label="Certified work" value={inr(stats.completedValue)} />
              <MiniStat label="Billed (gross)" value={inr(stats.billedGross)} />
              <MiniStat label="Unbilled certified" value={inr(stats.unbilledCertified)} accent={stats.unbilledCertified > 0 ? 'amber' : undefined} />
            </div>
            {stats.unbilledCertified > 0 && (
              <div className="mt-3 text-[12px] text-amber-400/90 flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
                {inr(stats.unbilledCertified)} of approved work is not yet billed — <button className="underline" onClick={() => navigate('/billing')}>create an RA bill</button>.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top items */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">Top Items by Value</span></div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/[0.05]">
                  {topItems.map(it => (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-[#e2e2e8] max-w-[220px] truncate" title={it.description}>{it.description}</td>
                      <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{inr(Number(it.amount))}</td>
                    </tr>
                  ))}
                  {!topItems.length && <tr><td className="px-4 py-6 text-center text-[#dcc1ae]/60 text-sm">No items.</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Item progress */}
            <div className="card overflow-hidden overflow-x-auto">
              <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">Item Progress</span></div>
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e]"><tr>
                  {['Item', 'Planned', 'Done', '%'].map(h => <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map(it => {
                    const pct = it.quantity ? Math.min(100, round2(Number(it.completed_qty) / Number(it.quantity) * 100)) : 0
                    return (
                      <tr key={it.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[160px] truncate" title={it.description}>{it.description}</td>
                        <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{it.quantity}</td>
                        <td className="px-3 py-2.5 font-mono text-emerald-400 text-right">{it.completed_qty}</td>
                        <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{pct}%</td>
                      </tr>
                    )
                  })}
                  {!items.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-[#dcc1ae]/60 text-sm">No items.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: 'emerald' | 'blue'; sub?: string }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'blue' ? 'text-blue-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-4">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`font-mono text-[20px] font-bold ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#dcc1ae]/60 mt-1">{sub}</div>}
    </div>
  )
}
function MiniStat({ label, value, accent }: { label: string; value: string; accent?: 'amber' }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`font-mono text-[14px] font-bold ${accent === 'amber' ? 'text-amber-400' : 'text-[#e2e2e8]'}`}>{value}</div>
    </div>
  )
}