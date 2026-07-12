import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { round2, inr } from '../lib/boq'
import ExportButtons from '../components/ExportButtons'

type RaBill = {
  id: string; boq_id: string; bill_no: string | null; bill_seq: number; from_date: string | null; to_date: string
  retention_pct: number; gst_pct: number; gross: number; gst_amount: number; retention_amount: number
  net_payable: number; status: string; remark: string | null
  // Phase 2 (finance)
  party_id?: string | null; tax_rate_id?: string | null
  cgst_amount?: number; sgst_amount?: number; igst_amount?: number
  deductions_total?: number; voucher_id?: string | null
}
type Party = { id: string; name: string; party_type: string }
type TaxRate = { id: string; name: string; total_rate: number; cgst_rate: number; sgst_rate: number; igst_rate: number }
type DedType = { id: string; name: string; calc_mode: string; default_rate: number; rate_editable: boolean; ledger_id: string | null }
type BillDed = {
  id: string; bill_id: string; deduction_id: string | null; name: string
  calc_mode: string; rate: number; base_amount: number; amount: number
  ledger_id: string | null; remarks: string | null; line_no: number
}
type Line = {
  id: string; description: string | null; unit: string | null; rate: number
  cumulative_qty: number; previous_qty: number; this_qty: number; this_amount: number
}

export default function BillingDetail() {
  const { activeProject } = useProject()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, user } = useAuth()
  const [bill, setBill] = useState<RaBill | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [adjustments, setAdjustments] = useState<{ schedule: string; adj_type: string; pct: number }[]>([])
  const [loading, setLoading] = useState(true)
  // finance
  const [parties, setParties] = useState<Party[]>([])
  const [taxes, setTaxes] = useState<TaxRate[]>([])
  const [dedTypes, setDedTypes] = useState<DedType[]>([])
  const [billDeds, setBillDeds] = useState<BillDed[]>([])
  const [posting, setPosting] = useState(false)
  const [accReady, setAccReady] = useState(true)

  async function load() {
    if (!id) return
    setLoading(true)
    const { data: b } = await supabase.from('ra_bills').select('*').eq('id', id).single()
    setBill(b as RaBill)
    const { data: l } = await supabase.from('ra_bill_items').select('*').eq('ra_bill_id', id).order('created_at')
    setLines((l as Line[]) ?? [])
    if (b) {
      const { data: adj } = await supabase.from('boq_bid_adjustments').select('schedule, adj_type, pct').eq('boq_id', (b as RaBill).boq_id)
      setAdjustments(((adj ?? []) as any[]).filter(a => Number(a.pct) > 0))
    }
    // finance masters + this bill's deduction lines
    const [{ data: pty }, { data: tx }, { data: dt }, { data: bd }] = await Promise.all([
      supabase.from('acc_parties').select('id, name, party_type').eq('active', true).order('name'),
      supabase.from('acc_tax_rates').select('*').eq('active', true).order('total_rate', { ascending: false }),
      supabase.from('acc_deduction_types').select('*').eq('active', true).order('sort_order'),
      supabase.from('ra_bill_deductions').select('*').eq('bill_id', id).order('line_no'),
    ])
    setParties((pty as Party[]) ?? [])
    setTaxes((tx as TaxRate[]) ?? [])
    setDedTypes((dt as DedType[]) ?? [])
    setBillDeds((bd as BillDed[]) ?? [])
    setAccReady(((dt as any[]) ?? []).length > 0)
    setLoading(false)
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

  // ---------- FINANCE: gross → tax → unlimited deductions → net ----------
  const gross = round2(lines.reduce((n, l) => n + Number(l.this_amount || 0), 0))
  const tax = taxes.find(t => t.id === bill?.tax_rate_id) ?? null
  const cgstAmt = tax ? round2(gross * tax.cgst_rate / 100) : 0
  const sgstAmt = tax ? round2(gross * tax.sgst_rate / 100) : 0
  const igstAmt = tax ? round2(gross * tax.igst_rate / 100) : 0
  const taxTotal = round2(cgstAmt + sgstAmt + igstAmt)
  const invoiceTotal = round2(gross + taxTotal)
  const dedTotal = round2(billDeds.reduce((n, d) => n + Number(d.amount || 0), 0))
  const netPayable = round2(invoiceTotal - dedTotal)

  async function saveTotals(patch: Record<string, unknown> = {}) {
    if (!bill) return
    await supabase.from('ra_bills').update({
      gross, cgst_amount: cgstAmt, sgst_amount: sgstAmt, igst_amount: igstAmt,
      gst_amount: taxTotal, deductions_total: dedTotal, net_payable: netPayable,
      ...patch,
    }).eq('id', bill.id)
    load()
  }

  async function setParty(pid: string) { await saveTotals({ party_id: pid || null }) }
  async function setTax(tid: string) {
    if (!bill) return
    const t = taxes.find(x => x.id === tid) ?? null
    const c = t ? round2(gross * t.cgst_rate / 100) : 0
    const sg = t ? round2(gross * t.sgst_rate / 100) : 0
    const ig = t ? round2(gross * t.igst_rate / 100) : 0
    const tt = round2(c + sg + ig)
    await supabase.from('ra_bills').update({
      tax_rate_id: tid || null, gross,
      cgst_amount: c, sgst_amount: sg, igst_amount: ig, gst_amount: tt,
      gst_pct: t?.total_rate ?? 0,
      deductions_total: dedTotal, net_payable: round2(gross + tt - dedTotal),
    }).eq('id', bill.id)
    load()
  }

  // add a deduction line from the master
  async function addDeduction(typeId: string) {
    if (!bill || !typeId) return
    const t = dedTypes.find(d => d.id === typeId)
    if (!t) return
    const amount = t.calc_mode === 'percent'
      ? round2(gross * Number(t.default_rate) / 100)
      : round2(Number(t.default_rate))
    await supabase.from('ra_bill_deductions').insert({
      bill_id: bill.id, deduction_id: t.id, name: t.name,
      calc_mode: t.calc_mode, rate: t.default_rate,
      base_amount: t.calc_mode === 'percent' ? gross : 0,
      amount, ledger_id: t.ledger_id, line_no: billDeds.length + 1,
    })
    load()
  }

  async function updateDeduction(d: BillDed, patch: Partial<BillDed>) {
    const next = { ...d, ...patch }
    const amount = next.calc_mode === 'percent'
      ? round2(gross * Number(next.rate || 0) / 100)
      : round2(Number(next.rate || 0))
    await supabase.from('ra_bill_deductions').update({
      rate: Number(next.rate || 0), calc_mode: next.calc_mode,
      base_amount: next.calc_mode === 'percent' ? gross : 0,
      amount, remarks: next.remarks ?? null,
    }).eq('id', d.id)
    load()
  }

  async function removeDeduction(dId: string) {
    await supabase.from('ra_bill_deductions').delete().eq('id', dId)
    load()
  }

  // POST TO ACCOUNTS — creates a balanced Draft voucher
  async function postToAccounts() {
    if (!bill) return
    if (!bill.party_id) { alert('Select the client (party) first — the voucher needs a ledger to debit.'); return }
    await saveTotals()   // make sure stored figures match what is on screen
    setPosting(true)
    const { data, error } = await supabase.rpc('acc_post_ra_bill', { p_bill: bill.id })
    setPosting(false)
    if (error) { alert('Could not post to accounts:\n\n' + error.message); return }
    alert('Posted to accounts as a DRAFT voucher.\n\nReview and post it in Accounting → Vouchers.')
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

      {adjustments.length > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '16px' }}>gavel</span>
            <span className="text-[13px] font-semibold text-[#e2e2e8]">Saved Bid Adjustment (from BOQ)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {adjustments.map(a => (
              <span key={a.schedule} className={`px-2.5 py-1 rounded-md text-[11px] border ${a.adj_type === 'less' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                {a.schedule}: {a.adj_type === 'less' ? 'Less' : 'Excess'} {a.pct}%
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[#dcc1ae]/50 mt-2">Reference only — this bill uses actual approved rates. Apply the quoted adjustment separately if your contract bills at quoted rates.</p>
        </div>
      )}

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

      {/* ---------- FINANCE: party, tax, deductions, net ---------- */}
      {!accReady && (
        <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/15 text-[13px] text-amber-400">
          Accounting is not set up yet. Go to <b>Head Office → Accounting</b> and create the Chart of Accounts
          to enable configurable deductions and posting to the books.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Deductions */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#e2e2e8]">Deductions</span>
            <span className="text-[11px] text-[#dcc1ae]/60">{billDeds.length} line(s) · − {inr(dedTotal)}</span>
          </div>

          {isDraft && accReady && (
            <div className="px-4 py-3 border-b border-white/5">
              <select className="input" style={{ fontSize: '13px' }} value=""
                onChange={e => { addDeduction(e.target.value); e.currentTarget.value = '' }}>
                <option value="">+ Add a deduction…</option>
                {dedTypes.filter(t => !billDeds.some(b => b.deduction_id === t.id)).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.calc_mode === 'percent' ? `${t.default_rate}%` : inr(t.default_rate)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Deduction', 'Mode', 'Rate', 'Amount', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {billDeds.map(d => (
                <tr key={d.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-[#e2e2e8]">{d.name}</td>
                  <td className="px-3 py-2">
                    {isDraft ? (
                      <select className="input" style={{ padding: '3px 6px', fontSize: '11px', width: 84 }}
                        value={d.calc_mode} onChange={e => updateDeduction(d, { calc_mode: e.target.value })}>
                        <option value="percent">%</option>
                        <option value="fixed">Flat ₹</option>
                      </select>
                    ) : <span className="text-[#dcc1ae] text-[12px]">{d.calc_mode === 'percent' ? '%' : 'Flat'}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isDraft ? (
                      <input className="input mono text-right" style={{ padding: '3px 6px', fontSize: '12px', width: 80 }}
                        defaultValue={d.rate}
                        onBlur={e => updateDeduction(d, { rate: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} />
                    ) : <span className="font-mono text-[#dcc1ae]">{d.rate}{d.calc_mode === 'percent' ? '%' : ''}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-red-400 text-right whitespace-nowrap">− {inr(d.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    {isDraft && (
                      <button className="text-red-400 hover:text-red-300" onClick={() => removeDeduction(d.id)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!billDeds.length && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[#dcc1ae]/50 text-[12px]">
                  No deductions. {isDraft && accReady ? 'Add them from the dropdown above (TDS, retention, security deposit…).' : ''}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="card p-5">
          {accReady && (
            <div className="grid grid-cols-1 gap-3 mb-4 pb-4 border-b border-white/[0.06]">
              <label className="block">
                <span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">Client (Party)</span>
                <select className="input" disabled={!isDraft} value={bill.party_id ?? ''} onChange={e => setParty(e.target.value)}>
                  <option value="">— Select client —</option>
                  {parties.filter(p => p.party_type !== 'Vendor').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-[#dcc1ae]/70 uppercase tracking-wider block mb-1">GST Rate</span>
                <select className="input" disabled={!isDraft} value={bill.tax_rate_id ?? ''} onChange={e => setTax(e.target.value)}>
                  <option value="">— No GST —</option>
                  {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
          )}

          <Row label="Gross (this bill)" value={inr(gross)} />
          {cgstAmt > 0 && <Row label={`CGST (${tax?.cgst_rate}%)`} value={'+ ' + inr(cgstAmt)} />}
          {sgstAmt > 0 && <Row label={`SGST (${tax?.sgst_rate}%)`} value={'+ ' + inr(sgstAmt)} />}
          {igstAmt > 0 && <Row label={`IGST (${tax?.igst_rate}%)`} value={'+ ' + inr(igstAmt)} />}
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-[13px] font-semibold text-[#dcc1ae]">Invoice Total</span>
            <span className="font-mono text-[13px] font-bold text-[#e2e2e8]">{inr(invoiceTotal)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-[13px] text-[#dcc1ae]">Total Deductions</span>
            <span className="font-mono text-[13px] text-red-400">− {inr(dedTotal)}</span>
          </div>
          <div className="flex items-center justify-between pt-3">
            <span className="text-[14px] font-bold text-[#e2e2e8] uppercase tracking-wide">Net Payable</span>
            <span className="font-mono text-[22px] font-bold text-emerald-400">{inr(netPayable)}</span>
          </div>

          {/* post to accounts */}
          {accReady && isAdmin && bill.status === 'Approved' && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              {bill.voucher_id ? (
                <div className="text-[12px] text-emerald-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
                  Posted to accounts. Review it in Accounting → Vouchers.
                </div>
              ) : (
                <>
                  <button className="btn btn-primary w-full" disabled={posting || !bill.party_id} onClick={postToAccounts}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_balance</span>
                    {posting ? 'Posting…' : 'Post to Accounts'}
                  </button>
                  <p className="text-[11px] text-[#dcc1ae]/50 mt-2">
                    Creates a balanced <b>Draft</b> Sales voucher: Dr client + Dr each deduction ledger,
                    Cr Contract Revenue + Cr output GST. Your accountant reviews and posts it.
                  </p>
                </>
              )}
            </div>
          )}

          {isDraft && <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
            Gross → GST → deductions → net. Approve to lock this bill; its quantities then count as "previously billed".
          </p>}
        </div>
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