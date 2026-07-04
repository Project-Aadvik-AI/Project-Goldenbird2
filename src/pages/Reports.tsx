import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type StockItem = { item: string; unit: string; balance: number; in_qty: number; out_qty: number }
type Creditor = { vendor: string; total: number; count: number }
type PersonBalance = { person: string; advances: number; expenses: number; net: number }
type OpenPR = { id: string; date: string; pr_no: string | null; material: string; vendor: string | null; needed_by: string | null }

export default function Reports() {
  const [stock, setStock] = useState<StockItem[]>([])
  const [creditors, setCreditors] = useState<Creditor[]>([])
  const [balances, setBalances] = useState<PersonBalance[]>([])
  const [openPRs, setOpenPRs] = useState<OpenPR[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: ledger }, { data: expenses }, { data: advances }, { data: prs }] = await Promise.all([
        supabase.from('store_ledger').select('item, unit, direction, qty'),
        supabase.from('expenses').select('vendor, amount, payment_status, paid_by'),
        supabase.from('advances').select('person, amount'),
        supabase.from('purchase_requests').select('id, date, pr_no, material, vendor, needed_by').eq('status', 'Open'),
      ])

      const stockMap: Record<string, StockItem> = {}
      for (const r of (ledger ?? []) as { item: string; unit: string; direction: string; qty: number }[]) {
        if (!stockMap[r.item]) stockMap[r.item] = { item: r.item, unit: r.unit, in_qty: 0, out_qty: 0, balance: 0 }
        if (r.direction === 'IN') stockMap[r.item].in_qty += Number(r.qty)
        else stockMap[r.item].out_qty += Number(r.qty)
        stockMap[r.item].balance = stockMap[r.item].in_qty - stockMap[r.item].out_qty
      }
      setStock(Object.values(stockMap).sort((a, b) => a.item.localeCompare(b.item)))

      const credMap: Record<string, Creditor> = {}
      for (const e of (expenses ?? []) as { vendor: string | null; amount: number; payment_status: string }[]) {
        if (!e.payment_status?.toLowerCase().includes('credit')) continue
        const v = e.vendor || 'Unknown'
        if (!credMap[v]) credMap[v] = { vendor: v, total: 0, count: 0 }
        credMap[v].total += Number(e.amount)
        credMap[v].count++
      }
      setCreditors(Object.values(credMap).sort((a, b) => b.total - a.total))

      const personMap: Record<string, PersonBalance> = {}
      for (const a of (advances ?? []) as { person: string | null; amount: number }[]) {
        const p = a.person || 'Unknown'
        if (!personMap[p]) personMap[p] = { person: p, advances: 0, expenses: 0, net: 0 }
        personMap[p].advances += Number(a.amount)
      }
      for (const e of (expenses ?? []) as { paid_by: string | null; amount: number; payment_status: string }[]) {
        if (e.payment_status?.toLowerCase().includes('credit')) continue
        const p = e.paid_by || 'Unknown'
        if (!personMap[p]) personMap[p] = { person: p, advances: 0, expenses: 0, net: 0 }
        personMap[p].expenses += Number(e.amount)
      }
      for (const v of Object.values(personMap)) v.net = v.advances - v.expenses
      setBalances(Object.values(personMap).sort((a, b) => b.net - a.net))

      setOpenPRs((prs as OpenPR[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-4 text-[#dcc1ae] text-sm">Loading reports…</div>

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Reports</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">Stock, creditors, cash balances, and open PRs</p>
      </div>

      <section>
        <div className="text-sm font-semibold text-[#e2e2e8] mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>inventory_2</span>
          Stock on Hand
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Item','Unit','IN','OUT','Balance'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {stock.map(s => (
                <tr key={s.item} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{s.item}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{s.unit}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400">{s.in_qty.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-mono text-amber-400">{s.out_qty.toLocaleString('en-IN')}</td>
                  <td className={`px-4 py-3 font-mono font-bold ${s.balance <= 0 ? 'text-red-400' : 'text-[#ffb87b]'}`}>
                    {s.balance.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {!stock.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No stock entries.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-sm font-semibold text-[#e2e2e8] mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-400" style={{ fontSize: '18px' }}>credit_score</span>
          Creditors (Unpaid)
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Vendor','Entries','Amount Due'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {creditors.map(c => (
                <tr key={c.vendor} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{c.vendor}</td>
                  <td className="px-4 py-3 font-mono text-[#dcc1ae]">{c.count}</td>
                  <td className="px-4 py-3 font-mono font-bold text-red-400">₹{Math.round(c.total).toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {!creditors.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No unpaid entries.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-sm font-semibold text-[#e2e2e8] mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sky-400" style={{ fontSize: '18px' }}>account_balance_wallet</span>
          Per-Person Cash Balances
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Person','Advances Received','Expenses Paid','Balance'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {balances.map(b => (
                <tr key={b.person} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{b.person}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400">₹{Math.round(b.advances).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-mono text-amber-400">₹{Math.round(b.expenses).toLocaleString('en-IN')}</td>
                  <td className={`px-4 py-3 font-mono font-bold ${b.net < 0 ? 'text-red-400' : 'text-[#ffb87b]'}`}>
                    ₹{Math.round(b.net).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {!balances.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No data.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="text-sm font-semibold text-[#e2e2e8] mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400" style={{ fontSize: '18px' }}>shopping_cart</span>
          Open Purchase Requests
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Date','PR No','Material','Vendor','Needed By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {openPRs.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.pr_no || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.material}</td>
                  <td className="px-4 py-3 text-[#dcc1ae]">{r.vendor || '—'}</td>
                  <td className="px-4 py-3 font-mono">
                    {r.needed_by
                      ? <span className={r.needed_by < today ? 'text-red-400' : 'text-[#dcc1ae]'}>{r.needed_by}</span>
                      : <span className="text-[#dcc1ae]/40">—</span>}
                  </td>
                </tr>
              ))}
              {!openPRs.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No open PRs.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}