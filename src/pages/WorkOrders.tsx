import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'
import { ContractBalance } from '../components/ContractBalance'

type Vendor = { id: string; name: string; gstin?: string | null; address?: string | null }
type PR = { id: string; pr_no: string | null; material: string; qty: number | null; unit: string | null; vendor: string | null; status: string; date: string }

type WO = {
  id: string
  project_id: string | null
  wo_no: string | null
  wo_type: string
  vendor_id: string | null
  vendor: string | null
  title: string | null
  description: string | null
  amount: number | null
  start_date: string | null
  end_date: string | null
  terms: string | null
  status: string
  pr_id: string | null
  file: string | null
  created_at: string
}

type WOItem = {
  id: string
  work_order_id: string
  description: string | null
  unit: string | null
  qty: number | null
  rate: number | null
  amount: number
}

const TYPES = ['Work', 'Supply', 'Service']
const STATUSES = ['Draft', 'Issued', 'In Progress', 'Completed', 'Cancelled']

const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-white/5 text-[#dcc1ae] border-white/10',
  Issued: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'In Progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function WorkOrders() {
  const { activeProject } = useProject()
  const { can, isAdmin } = useAuth()
  const [rows, setRows] = useState<WO[]>([])
  const [items, setItems] = useState<Record<string, WOItem[]>>({})
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [approvedPRs, setApprovedPRs] = useState<PR[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [seedFromPR, setSeedFromPR] = useState<PR | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const canAdd = can('work_orders', 'add') || can('purchase', 'add') || isAdmin

  async function load() {
    if (!activeProject) { setRows([]); setLoading(false); return }
    setLoading(true)
    const [{ data: wo }, { data: v }, { data: prs }] = await Promise.all([
      supabase.from('work_orders').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
      supabase.from('m_vendors').select('id, name, gstin, address').order('name'),
      supabase.from('purchase_requests').select('id, pr_no, material, qty, unit, vendor, status, date').eq('project_id', activeProject.id).in('status', ['Approved', 'Ordered']).order('date', { ascending: false }),
    ])
    const list = (wo as WO[]) ?? []
    setRows(list)
    setVendors((v as Vendor[]) ?? [])
    setApprovedPRs((prs as PR[]) ?? [])
    if (list.length) {
      const ids = list.map(r => r.id)
      const { data: it } = await supabase.from('work_order_items').select('*').in('work_order_id', ids)
      const byWo: Record<string, WOItem[]> = {}
      for (const row of (it as WOItem[]) ?? []) {
        (byWo[row.work_order_id] ??= []).push(row)
      }
      setItems(byWo)
    } else {
      setItems({})
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  async function setStatus(id: string, status: string) {
    await supabase.from('work_orders').update({ status }).eq('id', id)
    load()
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Work Orders</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Issue vendor work orders with line items and printable PDFs</p>
        </div>
        {canAdd && (
          <button className="btn btn-primary" onClick={() => { setSeedFromPR(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Work Order
          </button>
        )}
      </div>

      {canAdd && approvedPRs.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">Create WO from an approved PR</div>
          <div className="flex flex-wrap gap-2">
            {approvedPRs.slice(0, 6).map(pr => (
              <button key={pr.id} className="text-left rounded-lg bg-white/[0.03] border border-white/[0.08] hover:border-[#ff8f00]/40 p-3 transition-colors"
                onClick={() => { setSeedFromPR(pr); setShowForm(true) }}>
                <div className="text-[12px] font-mono text-[#ffb87b]">{pr.pr_no || '—'}</div>
                <div className="text-[13px] text-[#e2e2e8] max-w-[220px] truncate">{pr.material}</div>
                <div className="text-[10px] text-[#dcc1ae]/60">{pr.qty} {pr.unit || ''} · {pr.vendor || '—'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]">
            <tr>
              {['WO No', 'Type', 'Title', 'Vendor', 'Amount', 'Start', 'End', 'Status', 'File', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(r => {
              const vName = r.vendor || vendors.find(v => v.id === r.vendor_id)?.name || '—'
              const itemList = items[r.id] ?? []
              const totalAmount = r.amount ?? itemList.reduce((s, i) => s + Number(i.amount || 0), 0)
              const isOpen = expanded === r.id
              const canEdit = can('work_orders', 'edit') || can('purchase', 'edit') || isAdmin
              return (
                <Fragment key={r.id}>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#e2e2e8]">{r.wo_no || '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.wo_type}</td>
                    <td className="px-4 py-3 text-[#e2e2e8] max-w-[220px] truncate">{r.title || '—'}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{vName}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">₹{Number(totalAmount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{r.start_date || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#dcc1ae]">{r.end_date || '—'}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select className="input" style={{ padding: '4px 6px', fontSize: '11px', minWidth: 110 }}
                          value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
                          {STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_STYLES[r.status] || ''}`}>{r.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.file
                        ? <a href={r.file} target="_blank" rel="noreferrer" className="text-[#ffb87b] hover:underline text-xs">Open</a>
                        : <span className="text-[#dcc1ae]/40">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button className="text-[#ffb87b] text-xs font-semibold uppercase tracking-wider hover:underline mr-3" onClick={() => setExpanded(isOpen ? null : r.id)}>
                        {isOpen ? 'Hide' : 'Items'}
                      </button>
                      <button className="text-[#dcc1ae] text-xs font-semibold uppercase tracking-wider hover:underline" onClick={() => printWO(r, itemList, vendors)}>Print</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-black/20">
                      <td colSpan={10} className="px-6 py-3">
                        {/* the running contract position — every figure from the DB */}
                        <div className="mb-4">
                          <ContractBalance woId={r.id} />
                        </div>

                        <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-2">Line Items</div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#dcc1ae]/60 text-[10px] uppercase tracking-wider">
                              <th className="text-left py-1">#</th>
                              <th className="text-left py-1">Description</th>
                              <th className="text-left py-1">Unit</th>
                              <th className="text-right py-1">Qty</th>
                              <th className="text-right py-1">Rate</th>
                              <th className="text-right py-1">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itemList.map((it, i) => (
                              <tr key={it.id}>
                                <td className="py-1 text-[#dcc1ae]">{i + 1}</td>
                                <td className="py-1 text-[#e2e2e8]">{it.description || '—'}</td>
                                <td className="py-1 text-[#dcc1ae]">{it.unit || '—'}</td>
                                <td className="py-1 text-right font-mono text-[#dcc1ae]">{Number(it.qty || 0).toLocaleString('en-IN')}</td>
                                <td className="py-1 text-right font-mono text-[#dcc1ae]">₹{Number(it.rate || 0).toLocaleString('en-IN')}</td>
                                <td className="py-1 text-right font-mono text-[#e2e2e8]">₹{Number(it.amount || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                            {!itemList.length && <tr><td colSpan={6} className="py-2 text-center text-[#dcc1ae]/50">No line items.</td></tr>}
                          </tbody>
                        </table>
                        {r.terms && <div className="mt-3 text-[11px] text-[#dcc1ae]/80"><strong>Terms:</strong> {r.terms}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No work orders yet.</td></tr>
            )}
          </tbody>
        </table>
        {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
      </div>

      {showForm && (
        <WOForm
          seedFromPR={seedFromPR}
          projectId={activeProject.id}
          vendors={vendors}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

type Draft = { description: string; unit: string; qty: string; rate: string }

function WOForm({ seedFromPR, projectId, vendors, onClose, onSaved }: {
  seedFromPR: PR | null; projectId: string; vendors: Vendor[]
  onClose: () => void; onSaved: () => void
}) {
  const [woNo, setWoNo] = useState('')
  const [woType, setWoType] = useState('Work')
  const [vendorId, setVendorId] = useState<string>('')
  const [vendorFree, setVendorFree] = useState(seedFromPR?.vendor ?? '')
  const [title, setTitle] = useState(seedFromPR ? `PR ${seedFromPR.pr_no ?? ''}: ${seedFromPR.material}`.trim() : '')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [terms, setTerms] = useState('')
  const [status, setStatus] = useState('Draft')
  // contract terms — these drive the running-billing checks
  const [contractValue, setContractValue] = useState('')
  const [retentionPct, setRetentionPct] = useState('')
  const [tdsPct, setTdsPct] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [scope, setScope] = useState('')
  const [partyId, setPartyId] = useState('')
  const [parties, setParties] = useState<{ id: string; name: string; vendor_code: string | null }[]>([])

  // the real vendor master
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('acc_parties')
        .select('id, name, vendor_code')
        .in('party_type', ['Vendor', 'Both'])
        .eq('status', 'Active')
        .order('name')
      setParties((data as any[]) ?? [])
    })()
  }, [])
  const [drafts, setDrafts] = useState<Draft[]>(seedFromPR
    ? [{ description: seedFromPR.material, unit: seedFromPR.unit ?? '', qty: String(seedFromPR.qty ?? ''), rate: '' }]
    : [{ description: '', unit: '', qty: '', rate: '' }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function updateDraft(i: number, field: keyof Draft, val: string) {
    setDrafts(cur => cur.map((d, idx) => idx === i ? { ...d, [field]: val } : d))
  }
  function addRow() { setDrafts(cur => [...cur, { description: '', unit: '', qty: '', rate: '' }]) }
  function removeRow(i: number) { setDrafts(cur => cur.filter((_, idx) => idx !== i)) }

  const total = drafts.reduce((s, d) => s + (Number(d.qty || 0) * Number(d.rate || 0)), 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setErr('Title required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const orgId = prof?.org_id
    const { data: inserted, error } = await supabase.from('work_orders').insert({
      org_id: orgId, project_id: projectId,
      wo_no: woNo || null, wo_type: woType,
      vendor_id: vendorId || null,
      party_id: partyId || null,                        // the REAL vendor master
      vendor: partyId
        ? (parties.find(p => p.id === partyId)?.name ?? vendorFree)
        : (vendorFree || null),
      title, description: description || null,
      amount: total || null,
      // the contract value is the MAXIMUM billable — defaults to the line total
      contract_value: Number(contractValue) || total || null,
      retention_pct: Number(retentionPct) || 0,
      tds_pct: Number(tdsPct) || 0,
      payment_terms: paymentTerms || null,
      scope_of_work: scope || null,
      start_date: startDate || null, end_date: endDate || null,
      terms: terms || null, status,
      pr_id: seedFromPR?.id ?? null,
    }).select('id').single()
    if (error) { setErr(error.message); setBusy(false); return }
    const woId = (inserted as any).id
    const items = drafts.filter(d => d.description.trim() || Number(d.qty) > 0).map(d => ({
      org_id: orgId, work_order_id: woId,
      description: d.description || null, unit: d.unit || null,
      qty: Number(d.qty || 0) || null, rate: Number(d.rate || 0) || null,
    }))
    if (items.length) {
      const { error: itErr } = await supabase.from('work_order_items').insert(items)
      if (itErr) { setErr(itErr.message); setBusy(false); return }
    }
    setBusy(false)
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-3xl shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1B1F2A] z-10">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">New Work Order</h3>
            {seedFromPR && <p className="text-[11px] text-[#ffb87b] mt-0.5">From PR {seedFromPR.pr_no || seedFromPR.id.slice(0, 8)}</p>}
          </div>
          <button type="button" className="text-[#dcc1ae]" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 border-b border-white/5">
          <div className="grid grid-cols-2 gap-3">
            <L label="WO No"><input className="input mono" value={woNo} onChange={e => setWoNo(e.target.value)} placeholder="WO/2026/001" /></L>
            <L label="Type">
              <select className="input" value={woType} onChange={e => setWoType(e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </L>
            <L label="Vendor *">
              <select className="input" value={partyId}
                onChange={e => {
                  setPartyId(e.target.value)
                  const p = parties.find(x => x.id === e.target.value)
                  if (p) setVendorFree(p.name)
                }}>
                <option value="">— select vendor —</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.vendor_code ? ` (${p.vendor_code})` : ''}
                  </option>
                ))}
              </select>
              {!parties.length && (
                <p className="text-[11px] text-amber-400/80 mt-1">
                  No vendors. Add them on the Vendors page.
                </p>
              )}
            </L>
            <L label="Start Date"><input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></L>
            <L label="End Date"><input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></L>
            <L label="Status">
              <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </L>

            {/* ---- CONTRACT TERMS: these drive the running-billing checks ---- */}
            <div className="sm:col-span-2 lg:col-span-3 pt-3 mt-1 border-t border-white/[0.06]">
              <div className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider mb-3">
                Contract Terms
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <L label="Contract Value (₹)">
                  <input className="input mono text-right" inputMode="decimal" value={contractValue}
                    onChange={e => setContractValue(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder={total ? String(total) : '10,00,000'} />
                </L>
                <L label="Retention %">
                  <input className="input mono text-right" inputMode="decimal" value={retentionPct}
                    onChange={e => setRetentionPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="5" />
                </L>
                <L label="TDS %">
                  <input className="input mono text-right" inputMode="decimal" value={tdsPct}
                    onChange={e => setTdsPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2" />
                </L>
                <L label="Payment Terms">
                  <input className="input" value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)} placeholder="30 days from approval" />
                </L>
              </div>
              <p className="text-[11px] text-[#dcc1ae]/60 mt-2">
                The <b>contract value is the maximum billable</b> against this work order — the database
                refuses any bill that would exceed it. Leave blank to use the line-item total
                {total ? ` (₹${Number(total).toLocaleString('en-IN')})` : ''}.
                Retention and TDS are deducted automatically from each bill.
              </p>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <L label="Scope of Work">
                <textarea className="input" rows={2} value={scope} onChange={e => setScope(e.target.value)}
                  placeholder="What exactly is this vendor contracted to do?" />
              </L>
            </div>
          </div>
          <L label="Title *"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></L>
          <L label="Description"><textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} /></L>
        </div>

        <div className="p-5 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Line Items</h4>
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={addRow}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span> Add row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#dcc1ae]/60 text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1">Description</th>
                  <th className="text-left py-1 w-16">Unit</th>
                  <th className="text-right py-1 w-20">Qty</th>
                  <th className="text-right py-1 w-24">Rate</th>
                  <th className="text-right py-1 w-28">Amount</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={i}>
                    <td><input className="input" value={d.description} onChange={e => updateDraft(i, 'description', e.target.value)} /></td>
                    <td><input className="input" value={d.unit} onChange={e => updateDraft(i, 'unit', e.target.value)} /></td>
                    <td><input className="input mono text-right" inputMode="decimal" value={d.qty} onChange={e => updateDraft(i, 'qty', e.target.value)} /></td>
                    <td><input className="input mono text-right" inputMode="decimal" value={d.rate} onChange={e => updateDraft(i, 'rate', e.target.value)} /></td>
                    <td className="text-right font-mono text-[#e2e2e8] px-2">₹{(Number(d.qty || 0) * Number(d.rate || 0)).toLocaleString('en-IN')}</td>
                    <td>
                      {drafts.length > 1 && (
                        <button type="button" className="text-red-400" onClick={() => removeRow(i)}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right pt-3 text-[11px] font-bold text-[#dcc1ae] uppercase">Total</td>
                  <td className="text-right pt-3 font-mono text-[#ffb87b] font-bold text-sm">₹{total.toLocaleString('en-IN')}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="p-5">
          <L label="Terms & Conditions"><textarea className="input" rows={2} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment on completion, retention 5%, …" /></L>
        </div>

        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3 sticky bottom-0 bg-[#1B1F2A] border-t border-white/5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Work Order'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

async function printWO(wo: WO, items: WOItem[], vendors: Vendor[]) {
  const vendor = vendors.find(v => v.id === wo.vendor_id)
  const vName = wo.vendor || vendor?.name || '—'
  const gstin = vendor?.gstin ? ` · GSTIN ${vendor.gstin}` : ''
  const address = vendor?.address || ''
  const total = wo.amount ?? items.reduce((s, i) => s + Number(i.amount || 0), 0)

  const w = window.open('', '_blank')
  if (!w) return
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>WO ${wo.wo_no || wo.id.slice(0, 8)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:12px}
      h1{font-size:22px;margin:0} .muted{color:#666}
      .head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:14px 0}
      .grid div{font-size:12px} .grid strong{display:block;text-transform:uppercase;font-size:10px;color:#666;letter-spacing:1px;margin-bottom:2px}
      table{border-collapse:collapse;width:100%;margin-top:14px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:11px}
      th{background:#f4f4f4;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.5px}
      .num{text-align:right;font-family:monospace}
      .total{background:#f9f9f9;font-weight:700}
      .sig{display:flex;justify-content:space-between;margin-top:60px;font-size:11px}
      .sig div{width:32%;border-top:1px solid #333;padding-top:6px;text-align:center}
      @media print{@page{size:A4}}
    </style></head><body>
    <div class="head">
      <div>
        <h1>WORK ORDER</h1>
        <div class="muted">${escapeHtml(wo.wo_type)} · ${escapeHtml(wo.status)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:monospace;font-size:14px;font-weight:700">${escapeHtml(wo.wo_no || '—')}</div>
        <div class="muted">${escapeHtml((wo.start_date || '')+' to '+(wo.end_date || ''))}</div>
      </div>
    </div>
    <div class="grid">
      <div><strong>To (Vendor)</strong>${escapeHtml(vName)}${gstin}<br/>${escapeHtml(address)}</div>
      <div><strong>Title</strong>${escapeHtml(wo.title || '—')}</div>
    </div>
    ${wo.description ? `<div style="margin:8px 0"><strong style="text-transform:uppercase;font-size:10px;color:#666">Description</strong><br/>${escapeHtml(wo.description).replace(/\n/g, '<br/>')}</div>` : ''}
    <table>
      <thead><tr><th>#</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${items.map((it, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(it.description || '')}</td>
          <td>${escapeHtml(it.unit || '')}</td>
          <td class="num">${Number(it.qty || 0).toLocaleString('en-IN')}</td>
          <td class="num">${Number(it.rate || 0).toLocaleString('en-IN')}</td>
          <td class="num">₹${Number(it.amount || 0).toLocaleString('en-IN')}</td>
        </tr>`).join('')}
        <tr class="total"><td colspan="5" class="num">Total</td><td class="num">₹${Number(total || 0).toLocaleString('en-IN')}</td></tr>
      </tbody>
    </table>
    ${wo.terms ? `<div style="margin-top:16px"><strong style="text-transform:uppercase;font-size:10px;color:#666">Terms & Conditions</strong><br/>${escapeHtml(wo.terms).replace(/\n/g, '<br/>')}</div>` : ''}
    <div class="sig"><div>Prepared by</div><div>Approved by</div><div>Vendor Acknowledgement</div></div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`
  w.document.write(html); w.document.close()
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}