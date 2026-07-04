import { useState } from 'react'
import { supabase } from '../lib/supabase'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined

type BriefData = {
  expenses: { date: string; expense_type: string; amount: number; payment_status: string; vendor: string | null }[]
  machines: { machine: string; status: string; reason: string | null }[]
  stock: { item: string; unit: string; balance: number }[]
  openPRs: { material: string; needed_by: string | null; vendor: string | null }[]
}

export default function AIBrief() {
  const [brief, setBrief] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function generate() {
    setLoading(true); setErr(null); setBrief(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const week = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

      const [{ data: expenses }, { data: machines }, { data: ledger }, { data: prs }] = await Promise.all([
        supabase.from('expenses').select('date, expense_type, amount, payment_status, vendor').gte('date', week),
        supabase.from('machine_status').select('machine, status, reason').eq('date', today),
        supabase.from('store_ledger').select('item, unit, direction, qty'),
        supabase.from('purchase_requests').select('material, needed_by, vendor').eq('status', 'Open'),
      ])

      const stockMap: Record<string, { item: string; unit: string; in_qty: number; out_qty: number }> = {}
      for (const r of (ledger ?? []) as { item: string; unit: string; direction: string; qty: number }[]) {
        if (!stockMap[r.item]) stockMap[r.item] = { item: r.item, unit: r.unit, in_qty: 0, out_qty: 0 }
        if (r.direction === 'IN') stockMap[r.item].in_qty += Number(r.qty)
        else stockMap[r.item].out_qty += Number(r.qty)
      }
      const stock = Object.values(stockMap).map(s => ({ item: s.item, unit: s.unit, balance: s.in_qty - s.out_qty }))

      const briefData: BriefData = {
        expenses: (expenses ?? []) as BriefData['expenses'],
        machines: (machines ?? []) as BriefData['machines'],
        stock,
        openPRs: (prs ?? []) as BriefData['openPRs'],
      }

      const prompt = buildPrompt(briefData, today)

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`API error ${res.status}: ${body}`)
      }
      const json = await res.json() as { content: { type: string; text: string }[] }
      const text = json.content.find(c => c.type === 'text')?.text ?? '(no response)'
      setBrief(text)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  if (!API_KEY) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">AI Site Brief</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Insights powered by Claude</p>
        </div>
        <div className="card p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#ff8f00]/10 flex items-center justify-center text-[#ffb87b] mx-auto mb-4">
            <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div className="font-semibold text-[#e2e2e8] mb-2">Anthropic API key not configured</div>
          <p className="text-sm text-[#dcc1ae]/70">
            Add <code className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-[#ffb87b]">VITE_ANTHROPIC_API_KEY=sk-ant-...</code> to your <code className="font-mono">.env</code> file and restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">AI Site Brief</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Insights powered by Claude</p>
        </div>
        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
          {loading ? 'Generating…' : 'Generate Brief'}
        </button>
      </div>

      <div className="card p-4 mb-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-[#dcc1ae]/60 flex-shrink-0" style={{ fontSize: '18px' }}>info</span>
        <p className="text-sm text-[#dcc1ae]/70">
          Reads last 7 days of expenses, today's machine status, current stock, and open purchase requests — then generates a site summary with flagged issues and 3 actionable recommendations.
        </p>
      </div>

      {err && (
        <div className="card p-4 text-red-400 text-sm mb-4 flex items-start gap-2">
          <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '18px' }}>error</span>
          {err}
        </div>
      )}

      {brief && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
            <span className="text-[11px] font-bold text-[#ffb87b] uppercase tracking-wider">
              AI Brief · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono text-[#c8ccd8]">{brief}</pre>
        </div>
      )}

      {!brief && !loading && !err && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ff8f00]/10 flex items-center justify-center text-[#ffb87b] mx-auto mb-4">
            <span className="material-symbols-outlined" style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div className="font-semibold text-[#e2e2e8] mb-1">Ready to generate</div>
          <div className="text-sm text-[#dcc1ae]/60">Click "Generate Brief" to get today's AI site summary.</div>
        </div>
      )}

      {loading && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ff8f00]/10 flex items-center justify-center text-[#ffb87b] mx-auto mb-4 animate-pulse">
            <span className="material-symbols-outlined" style={{ fontSize: '36px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div className="text-sm text-[#dcc1ae]">Analysing site data…</div>
        </div>
      )}
    </div>
  )
}

function buildPrompt(data: BriefData, today: string): string {
  const totalSpend = data.expenses.reduce((s, e) => s + Number(e.amount), 0)
  const creditAmt = data.expenses.filter(e => e.payment_status?.toLowerCase().includes('credit')).reduce((s, e) => s + Number(e.amount), 0)
  const breakdowns = data.machines.filter(m => m.status === 'Breakdown')
  const lowStock = data.stock.filter(s => s.balance <= 0)
  const overdueP = data.openPRs.filter(p => p.needed_by && p.needed_by < today)

  return `You are an AI assistant for a construction site manager (NALCO Damanjodi railway-siding project, contract value ₹33.55 cr, under RITES supervision).

Today is ${today}. Here is the live site data:

EXPENSES (last 7 days):
- Total spend: ₹${Math.round(totalSpend).toLocaleString('en-IN')}
- On credit (unpaid): ₹${Math.round(creditAmt).toLocaleString('en-IN')}
- Entries: ${data.expenses.length}

MACHINE STATUS (today, ${data.machines.length} entries):
${data.machines.map(m => `- ${m.machine}: ${m.status}${m.reason ? ' — ' + m.reason : ''}`).join('\n') || '- No entries today'}

BREAKDOWNS: ${breakdowns.length > 0 ? breakdowns.map(m => m.machine + (m.reason ? ' (' + m.reason + ')' : '')).join(', ') : 'None'}

STOCK ON HAND:
${data.stock.map(s => `- ${s.item}: ${s.balance} ${s.unit}`).join('\n') || '- No stock entries'}

LOW/ZERO STOCK: ${lowStock.length > 0 ? lowStock.map(s => s.item).join(', ') : 'None'}

OPEN PURCHASE REQUESTS: ${data.openPRs.length}
${overdueP.length > 0 ? 'OVERDUE PRs: ' + overdueP.map(p => p.material).join(', ') : 'No overdue PRs'}

Write a concise daily site brief (under 300 words) with:
1. SITE STATUS: 2-3 sentence summary of overall site health
2. ⚠️ ISSUES: Bullet list of flagged problems (breakdowns, zero stock, unpaid amounts, overdue PRs)
3. ✅ RECOMMENDATIONS: Exactly 3 specific, actionable items for the site manager to act on today

Be direct and practical. Use Indian construction site context.`
}