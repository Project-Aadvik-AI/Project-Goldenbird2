import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { round2, inr } from '../lib/boq'
import ExportButtons from '../components/ExportButtons'

type RaBill = {
  id: string; boq_id: string; bill_no: string | null; bill_seq: number; from_date: string | null; to_date: string
  retention_pct: number; gst_pct: number; gross: number; gst_amount: number; retention_amount: number
  net_payable: number; status: string; remark: string | null
}
type Line = {
  id: string; description: string | null; unit: string | null; rate: number
  cumulative_qty: number; previous_qty: number; this_qty: number; this_amount: number
}

export default function BillingDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, user } = useAuth()
  const [bill, setBill] = useState<RaBill | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!id) return
    setLoading(true)
    const { data: b } = await supabase.from('ra_bills').select('*').eq('id', id).single()
    setBill(b as RaBill)
    const { data: l } = await supabase.from('ra_bill_items').select('*').eq('ra_bill_id', id).order('created_at')
    setLines((l as Line[]) ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  async function recalcWith(retPct: number, gstPct: number) {
    if (!bill) return
    const gross = round2(lines.reduce((n, l) => n + Number(l.this_amount || 0), 0))
    const gst = round2(gross * gstPct / 100)
    const retention = round2(gross * retPct / 100)
    const net = round2(gross + gst - retention)
    await supabase.from('ra_bills').update({ retention_pct: retPct, gst_pct: gstPct, gross, gst_amount: gst, retention_amount: retention, net_payable: net }).eq('id', bill.id)
    load()
  }
  async function setStatus(status: string) {
    if (!bill) return
    const patch: Record<string, unknown> = { status }
    if (status === 'Approved') { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString() }
    await supabase.from('ra_bills').update(patch).eq('id', bill.id)
    load()
  }
  async function del() {
    if (!bill || !confirm('Delete this draft bill?')) return
    await supabase.from('ra_bills').delete().eq('id', bill.id)
    navigate('/billing')
  }

  if (loading) return <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>
  if (!bill) return <div className="p-8 text-center"><p className="text-[#dcc1ae]">Bill not found.</p><button className="btn btn-ghost mt-4" onClick={() => navigate('/billing')}>Back</button></div>

  const isDraft = bill.status === 'Draft'
  const cumulativeGross = round2(lines.reduce((n, l) => n + Number(l.cumulative_qty) * Number(l.rate), 0))
  const previousGross = round2(lines.reduce((n, l) => n + Number(l.previous_qty) * Number(l.rate), 0))

  return (
    <div>
      <button onClick={() => navigate('/billing')} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#dcc1ae] hover:text-[#e2e2e8] uppercase tracking-wider mb-5">
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> All RA Bills
      </button>

      <div className="card p-6 mb-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{bill.bill_no}</h1>
              <span className="font-mono text-[12px] text-[#dcc1ae]">RA Bill #{bill.bill_seq} · {bill.to_date}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${bill.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : bill.status === 'Paid' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-[#dcc1ae] border-white/10'}`}>{bill.status}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {isDraft && isAdmin && <button className="btn btn-primary" onClick={() => setStatus('Approved')}>Approve Bill</button>}
            {bill.status === 'Approved' && isAdmin && <button className="btn btn-primary" onClick={() => setStatus('Paid')}>Mark Paid</button>}
            {bill.status === 'Approved' && isAdmin && <button className="btn btn-ghost" onClick={() => setStatus('Draft')}>Reopen</button>}
            {isDraft && <button className="btn btn-ghost" onClick={del}>Delete</button>}
          </div>
        </div>

        {/* Running-account summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Sum label="Work done to date" value={inr(cumulativeGross)} />
          <Sum label="Previously billed" value={inr(previousGross)} />
          <Sum label="This bill (gross)" value={inr(bill.gross)} accent="emerald" />
          <Sum label="Net payable" value={inr(bill.net_payable)} accent="emerald" big />
        </div>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden overflow-x-auto mb-5">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">Bill Items</span>
          <ExportButtons
            filename={`${bill.bill_no || 'ra_bill'}`}
            title={`${bill.bill_no} · RA Bill`}
            rows={lines}
            columns={[
              { header: 'Description', get: r => r.description || '—' },
              { header: 'Unit', get: r => r.unit || '—' },
              { header: 'Rate', get: r => r.rate },
              { header: 'Cumulative Qty', get: r => r.cumulative_qty },
              { header: 'Previous Qty', get: r => r.previous_qty },
              { header: 'This Bill Qty', get: r => r.this_qty },
              { header: 'This Amount', get: r => r.this_amount },
            ]}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Description', 'Unit', 'Rate', 'Cumulative', 'Previous', 'This Bill', 'Amount'].map(h => <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {lines.map(l => (
              <tr key={l.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[240px] truncate" title={l.description || ''}>{l.description}</td>
                <td className="px-3 py-2.5 text-[#dcc1ae]">{l.unit || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{l.rate}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{l.cumulative_qty}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae]/60 text-right">{l.previous_qty}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right font-semibold">{l.this_qty}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right font-semibold">{inr(l.this_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bill totals */}
      <div className="card p-5 max-w-md ml-auto">
        <Row label={`Gross (this bill)`} value={inr(bill.gross)} />
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[13px] text-[#dcc1ae] flex items-center gap-2">GST
            {isDraft ? <input className="input mono" style={{ padding: '2px 6px', fontSize: '12px', width: 56 }} value={bill.gst_pct} onChange={e => setBill({ ...bill, gst_pct: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} onBlur={() => recalcWith(bill.retention_pct, bill.gst_pct)} /> : <span className="font-mono">{bill.gst_pct}</span>}%
          </span>
          <span className="font-mono text-[13px] text-[#e2e2e8]">+ {inr(bill.gst_amount)}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-white/5">
          <span className="text-[13px] text-[#dcc1ae] flex items-center gap-2">Retention
            {isDraft ? <input className="input mono" style={{ padding: '2px 6px', fontSize: '12px', width: 56 }} value={bill.retention_pct} onChange={e => setBill({ ...bill, retention_pct: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} onBlur={() => recalcWith(bill.retention_pct, bill.gst_pct)} /> : <span className="font-mono">{bill.retention_pct}</span>}%
          </span>
          <span className="font-mono text-[13px] text-red-400">− {inr(bill.retention_amount)}</span>
        </div>
        <div className="flex items-center justify-between pt-3">
          <span className="text-[14px] font-bold text-[#e2e2e8] uppercase tracking-wide">Net Payable</span>
          <span className="font-mono text-[22px] font-bold text-emerald-400">{inr(bill.net_payable)}</span>
        </div>
        {isDraft && <p className="text-[11px] text-[#dcc1ae]/50 mt-3">Editing GST/Retention % recalculates instantly. Approve to lock this bill; its quantities then count as "previously billed" for the next RA bill.</p>}
      </div>
    </div>
  )
}

function Sum({ label, value, accent, big }: { label: string; value: string; accent?: 'emerald'; big?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-mono ${big ? 'text-[18px]' : 'text-[15px]'} font-bold ${accent === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'}`}>{value}</div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-2 border-b border-white/5"><span className="text-[13px] text-[#dcc1ae]">{label}</span><span className="font-mono text-[13px] text-[#e2e2e8]">{value}</span></div>
}