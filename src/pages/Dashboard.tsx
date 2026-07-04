import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = { amount: number; date: string; payment_status: string }

export default function Dashboard() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('expenses').select('amount, date, payment_status').then(({ data }) => {
      setRows((data as Row[]) ?? []); setLoading(false)
    })
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0)
  const spendToday = rows.filter(r => r.date === today).reduce((a, r) => a + Number(r.amount || 0), 0)
  const credit = rows.filter(r => (r.payment_status || '').toLowerCase().includes('credit')).reduce((a, r) => a + Number(r.amount || 0), 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Construction Command Center</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Real-time operational overview · {today}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Spend" value={inr(total)} sub="All time" accent="kpi-emerald" valueClass="text-emerald-400" icon="account_balance_wallet" iconClass="text-emerald-400" />
        <KpiCard label="Spent Today" value={inr(spendToday)} sub={`${rows.filter(r => r.date === today).length} transactions`} accent="kpi-sky" valueClass="text-sky-400" icon="today" iconClass="text-sky-400" />
        <KpiCard label="On Credit / Payable" value={inr(credit)} sub="Pending payment" accent="kpi-purple" valueClass="text-purple-400" icon="credit_score" iconClass="text-purple-400" />
        <KpiCard label="Total Entries" value={String(rows.length)} sub="Expense records" accent="kpi-amber" valueClass="text-[#ffb87b]" icon="receipt_long" iconClass="text-[#ffb87b]" />
      </div>

      <div className="card p-5 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-[#ff8f00]/10 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#ff8f00]/10 flex items-center justify-center text-[#ffb87b]">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div>
            <div className="font-headline font-semibold text-[#e2e2e8]">AI Site Brief</div>
            <div className="text-[10px] text-[#dcc1ae]/70">Insights powered by Claude</div>
          </div>
        </div>
        <p className="text-sm text-[#dcc1ae]">
          Navigate to <span className="text-[#ffb87b] font-semibold">AI Site Brief</span> in the sidebar to generate today's summary — expenses, machine status, stock levels, and 3 actionable recommendations from your live data.
        </p>
      </div>

      {loading && <div className="text-[#dcc1ae] text-sm mt-4">Loading…</div>}
    </div>
  )
}

function KpiCard({ label, value, sub, accent, valueClass, icon, iconClass }: {
  label: string; value: string; sub: string
  accent: string; valueClass: string; icon: string; iconClass: string
}) {
  return (
    <div className={`card ${accent} p-4 h-28 flex flex-col justify-between relative overflow-hidden group cursor-default`}>
      <div className="flex justify-between items-start z-10">
        <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider leading-tight">{label}</span>
        <span className={`material-symbols-outlined opacity-60 ${iconClass}`} style={{ fontSize: '20px' }}>{icon}</span>
      </div>
      <div className="z-10">
        <div className={`font-mono text-[22px] font-bold leading-none ${valueClass}`}>{value}</div>
        <div className="text-[10px] text-[#dcc1ae]/60 mt-1">{sub}</div>
      </div>
      <div className="absolute -right-3 -bottom-3 opacity-[0.06] group-hover:opacity-[0.12] transition-opacity pointer-events-none">
        <span className={`material-symbols-outlined ${iconClass}`} style={{ fontSize: '72px', fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
    </div>
  )
}

function inr(n: number) { return '₹ ' + Math.round(n).toLocaleString('en-IN') }