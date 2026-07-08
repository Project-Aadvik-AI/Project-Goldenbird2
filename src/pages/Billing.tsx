import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { round2, inr } from '../lib/boq'

type Boq = { id: string; name: string; boq_number: string | null; retention_pct: number | null; gst_pct: number | null }
type RaBill = {
  id: string; boq_id: string; bill_no: string | null; bill_seq: number; to_date: string
  gross: number; gst_amount: number; retention_amount: number; net_payable: number; status: string
}

const STATUS_CLS: Record<string, string> = {
  Draft: 'bg-white/5 text-[#dcc1ae] border-white/10',
  Approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Paid: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function Billing() {
  const navigate = useNavigate()
  const [boqs, setBoqs] = useState<Boq[]>([])
  const [boqId, setBoqId] = useState('')
  const [bills, setBills] = useState<RaBill[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boqs').select('id,name,boq_number,retention_pct,gst_pct').order('created_at', { ascending: false })
      const list = (data as Boq[]) ?? []
      setBoqs(list); if (list.length && !boqId) setBoqId(list[0].id)
    })()
  }, [])

  async function loadBills(id: string) {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('ra_bills').select('*').eq('boq_id', id).order('bill_seq', { ascending: false })
    setBills((data as RaBill[]) ?? []); setLoading(false)
  }
  useEffect(() => { loadBills(boqId) }, [boqId])

  const boq = boqs.find(b => b.id === boqId)

  // Create the next RA bill: pull cumulative approved qty per item, subtract previously-billed, compute amounts.
  async function createBill() {
    if (!boq) return
    setCreating(true); setErr(null)
    try {
      const { data: prof } = await supabase.from('profiles').select('org_id').single()

      // 1) BOQ items (rate + description)
      const { data: items } = await supabase.from('boq_items').select('id, description, unit, final_rate').eq('boq_id', boq.id)
      const itemList = (items ?? []) as { id: string; description: string; unit: string | null; final_rate: number }[]
      if (!itemList.length) { setErr('This BOQ has no items.'); setCreating(false); return }
      const ids = itemList.map(i => i.id)

      // 2) cumulative APPROVED measured qty per item (the enforced rule: approved MB only)
      const { data: mb } = await supabase.from('measurement_book')
        .select('boq_item_id, measured_qty, status').in('boq_item_id', ids).eq('status', 'Approved')
      const cumById: Record<string, number> = {}
      for (const r of (mb ?? []) as { boq_item_id: string; measured_qty: number }[]) {
        cumById[r.boq_item_id] = round2((cumById[r.boq_item_id] || 0) + Number(r.measured_qty || 0))
      }

      // 3) previously billed qty per item (from earlier NON-cancelled RA bills of this BOQ)
      const { data: prevBills } = await supabase.from('ra_bills').select('id, status').eq('boq_id', boq.id).neq('status', 'Cancelled')
      const prevBillIds = (prevBills ?? []).map((b: { id: string }) => b.id)
      const prevById: Record<string, number> = {}
      if (prevBillIds.length) {
        const { data: prevItems } = await supabase.from('ra_bill_items').select('boq_item_id, this_qty').in('ra_bill_id', prevBillIds)
        for (const r of (prevItems ?? []) as { boq_item_id: string; this_qty: number }[]) {
          prevById[r.boq_item_id] = round2((prevById[r.boq_item_id] || 0) + Number(r.this_qty || 0))
        }
      }

      // 4) build lines: this = cumulative − previous (never negative)
      const lines = itemList.map(it => {
        const cumulative = cumById[it.id] || 0
        const previous = prevById[it.id] || 0
        const thisQty = round2(Math.max(0, cumulative - previous))
        const rate = Number(it.final_rate || 0)
        return {
          boq_item_id: it.id, description: it.description, unit: it.unit, rate,
          cumulative_qty: cumulative, previous_qty: previous, this_qty: thisQty,
          this_amount: round2(thisQty * rate),
        }
      })
      const billable = lines.filter(l => l.this_qty > 0)
      if (!billable.length) { setErr('Nothing new to bill — no approved quantity beyond what was already billed.'); setCreating(false); return }

      // 5) totals
      const gross = round2(billable.reduce((n, l) => n + l.this_amount, 0))
      const retPct = boq.retention_pct ?? 5
      const gstPct = boq.gst_pct ?? 18
      const gst = round2(gross * gstPct / 100)
      const retention = round2(gross * retPct / 100)
      const net = round2(gross + gst - retention)
      const seq = (bills[0]?.bill_seq ?? 0) + 1

      // 6) insert header
      const { data: hdr, error: hErr } = await supabase.from('ra_bills').insert({
        org_id: prof?.org_id, boq_id: boq.id, bill_no: `RA-${String(seq).padStart(2, '0')}`, bill_seq: seq,
        to_date: new Date().toISOString().slice(0, 10), retention_pct: retPct, gst_pct: gstPct,
        gross, gst_amount: gst, retention_amount: retention, net_payable: net, status: 'Draft',
      }).select('id').single()
      if (hErr) { setErr(hErr.message); setCreating(false); return }
      const billId = (hdr as { id: string }).id

      // 7) insert lines
      const { error: lErr } = await supabase.from('ra_bill_items').insert(
        billable.map(l => ({ org_id: prof?.org_id, ra_bill_id: billId, ...l }))
      )
      if (lErr) { setErr(lErr.message); setCreating(false); return }

      setCreating(false)
      navigate(`/billing/${billId}`)
    } catch (e) {
      setErr(String(e)); setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">RA Billing</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Running-account bills from <span className="text-emerald-400">approved</span> measurements · retention & GST</p>
        </div>
        <div className="flex gap-2">
          <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)} style={{ minWidth: 180 }}>
            {!boqs.length && <option value="">No BOQs</option>}
            {boqs.map(b => <option key={b.id} value={b.id}>{b.boq_number ? `${b.boq_number} · ` : ''}{b.name}</option>)}
          </select>
          {boqId && <button className="btn btn-primary" disabled={creating} onClick={createBill}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>{creating ? 'Creating…' : 'Create RA Bill'}
          </button>}
        </div>
      </div>

      {err && <div className="card p-3 mb-4 text-sm text-red-400 border border-red-500/20">{err}</div>}

      {boq && (
        <div className="text-[12px] text-[#dcc1ae] mb-4">Defaults for this BOQ — Retention <span className="font-mono text-[#e2e2e8]">{boq.retention_pct ?? 5}%</span> · GST <span className="font-mono text-[#e2e2e8]">{boq.gst_pct ?? 18}%</span> (editable on each bill)</div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Bill No.', 'Date', 'Gross', 'GST', 'Retention', 'Net Payable', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {bills.map(b => (
              <tr key={b.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/billing/${b.id}`)}>
                <td className="px-4 py-3 font-mono text-[#e2e2e8] font-semibold">{b.bill_no}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{b.to_date}</td>
                <td className="px-4 py-3 font-mono text-[#dcc1ae] text-right">{inr(b.gross)}</td>
                <td className="px-4 py-3 font-mono text-[#dcc1ae] text-right">{inr(b.gst_amount)}</td>
                <td className="px-4 py-3 font-mono text-red-400/80 text-right">− {inr(b.retention_amount)}</td>
                <td className="px-4 py-3 font-mono text-[#e2e2e8] text-right font-semibold">{inr(b.net_payable)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_CLS[b.status]}`}>{b.status}</span></td>
                <td className="px-4 py-3 text-right"><span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '18px' }}>chevron_right</span></td>
              </tr>
            ))}
            {!bills.length && !loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No RA bills yet. Click "Create RA Bill" to bill approved work.</td></tr>}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>
    </div>
  )
}