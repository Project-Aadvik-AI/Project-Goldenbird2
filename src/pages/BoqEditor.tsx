import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { computeFinalRate, computeAmount, breakdown, inr, round2, quotedRate, amountInWords, type BidType } from '../lib/boq'
import ExportButtons from '../components/ExportButtons'
import MeasurementSheet from '../components/MeasurementSheet'
import BoqImport from '../components/BoqImport'

type Boq = {
  id: string; boq_number: string | null; name: string; version: number
  status: string; project_id: string | null; notes: string | null
  start_date: string | null; monthly_target: number | null
}
type Item = {
  id: string; boq_id: string; sort_order: number | null
  category: string | null; package: string | null; item_code: string | null; description: string
  unit: string | null; quantity: number
  material_rate: number; labour_rate: number; equipment_rate: number
  overhead_pct: number; profit_pct: number; tax_pct: number
  final_rate: number; amount: number; completed_qty: number
}

const STATUSES = ['Draft', 'Approved', 'Locked']

export default function BoqEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [boq, setBoq] = useState<Boq | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Item | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [measuring, setMeasuring] = useState<Item | null>(null)
  const [showRevisions, setShowRevisions] = useState(false)
  const [showReviseForm, setShowReviseForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showOpening, setShowOpening] = useState(false)

  const locked = boq?.status === 'Locked'

  async function loadItems(boqId: string) {
    const { data } = await supabase.from('boq_items').select('*').eq('boq_id', boqId)
      .order('sort_order').order('created_at')
    setItems((data as Item[]) ?? [])
  }
  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const { data: b } = await supabase.from('boqs').select('*').eq('id', id).single()
      setBoq(b as Boq)
      await loadItems(id)
      setLoading(false)
    })()
  }, [id])

  const total = useMemo(() => round2(items.reduce((n, it) => n + Number(it.amount || 0), 0)), [items])
  const completedValue = useMemo(() => round2(items.reduce((n, it) => n + Number(it.completed_qty || 0) * Number(it.final_rate || 0), 0)), [items])

  async function setStatus(status: string) {
    if (!boq) return
    await supabase.from('boqs').update({ status }).eq('id', boq.id)
    setBoq({ ...boq, status })
  }
  async function delItem(itemId: string) {
    if (!confirm('Delete this item?')) return
    await supabase.from('boq_items').delete().eq('id', itemId)
    if (id) loadItems(id)
  }

  async function createRevision(reason: string) {
    if (!boq) return
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    // snapshot current items
    await supabase.from('boq_revisions').insert({
      org_id: prof?.org_id, boq_id: boq.id, version: boq.version,
      change_reason: reason, total_amount: total,
      items_snapshot: items,
      created_by: user?.id ?? null, created_by_name: profile?.full_name ?? null,
    })
    // bump version, back to Draft so the new version is editable
    const nextV = (boq.version || 1) + 1
    await supabase.from('boqs').update({ version: nextV, status: 'Draft' }).eq('id', boq.id)
    setBoq({ ...boq, version: nextV, status: 'Draft' })
    setShowReviseForm(false)
  }

  if (loading) return <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>
  if (!boq) return (
    <div className="p-8 text-center">
      <p className="text-[#dcc1ae]">BOQ not found.</p>
      <button className="btn btn-ghost mt-4" onClick={() => navigate('/boq')}>Back to BOQs</button>
    </div>
  )

  return (
    <div>
      <button onClick={() => navigate('/boq')} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#dcc1ae] hover:text-[#e2e2e8] uppercase tracking-wider mb-5 transition-colors">
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> All BOQs
      </button>

      {/* Header */}
      <div className="card p-6 mb-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">{boq.name}</h1>
              <span className="font-mono text-[12px] text-[#dcc1ae]">{boq.boq_number || '—'} · v{boq.version}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wider">Status</span>
              <select className="input" style={{ padding: '4px 10px', fontSize: '12px', width: 'auto' }} value={boq.status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              {locked && <span className="text-[11px] text-blue-400">🔒 Locked — items read-only</span>}
              <button className="text-[11px] font-bold uppercase tracking-wider text-[#dcc1ae] hover:text-[#e2e2e8] ml-2" onClick={() => setShowRevisions(true)}>History</button>
              {boq.status !== 'Draft' && (
                <button className="text-[11px] font-bold uppercase tracking-wider text-[#ffb87b] hover:text-[#ffc998]" onClick={() => setShowReviseForm(true)}>Create Revision</button>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide">Total BOQ Amount</div>
            <div className="font-mono text-[28px] font-bold text-[#e2e2e8]">{inr(total)}</div>
            <div className="text-[11px] text-[#dcc1ae]/60">{items.length} items</div>
          </div>
        </div>
      </div>

      {/* Bid adjustment */}
      {boq && <BidAdjustment total={total} />}

      {/* Work pacing target */}
      {boq && <WorkTarget boq={boq} totalValue={total} completedValue={completedValue} onSaved={(sd, mt) => setBoq({ ...boq, start_date: sd, monthly_target: mt })} />}

      {/* Items */}
      <div className="card overflow-hidden overflow-x-auto">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[#e2e2e8]">Items</span>
          <div className="flex items-center gap-2">
            <ExportButtons
              filename={`boq_${boq.boq_number || boq.name}`}
              title={`BOQ · ${boq.name}`}
              rows={items}
              columns={[
                { header: 'Category', get: r => r.category || '—' },
                { header: 'Item Code', get: r => r.item_code || '—' },
                { header: 'Description', get: r => r.description },
                { header: 'Unit', get: r => r.unit || '—' },
                { header: 'Quantity', get: r => r.quantity },
                { header: 'Material', get: r => r.material_rate },
                { header: 'Labour', get: r => r.labour_rate },
                { header: 'Equipment', get: r => r.equipment_rate },
                { header: 'Overhead %', get: r => r.overhead_pct },
                { header: 'Profit %', get: r => r.profit_pct },
                { header: 'Tax %', get: r => r.tax_pct },
                { header: 'Final Rate', get: r => r.final_rate },
                { header: 'Amount', get: r => r.amount },
              ]}
            />
            {!locked && (
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowImport(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload_file</span> Import Excel
              </button>
            )}
            {!locked && items.length > 0 && (
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowOpening(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>playlist_add_check</span> Opening Progress
              </button>
            )}
            {!locked && (
              <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => { setEditing(null); setShowForm(true) }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add Item
              </button>
            )}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#282a2e]"><tr>
            {['Code', 'Description', 'Unit', 'Qty', 'Material', 'Labour', 'Equip', 'OH%', 'Profit%', 'Tax%', 'Final Rate', 'Amount', ''].map(h => (
              <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {items.map(it => (
              <tr key={it.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{it.item_code || '—'}</td>
                <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[220px]">
                  <div className="truncate" title={it.description}>{it.description}</div>
                  {it.category && <div className="text-[10px] text-[#dcc1ae]/50">{it.category}</div>}
                </td>
                <td className="px-3 py-2.5 text-[#dcc1ae]">{it.unit || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{it.quantity}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{it.material_rate}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{it.labour_rate}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{it.equipment_rate}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae]/70 text-right">{it.overhead_pct}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae]/70 text-right">{it.profit_pct}</td>
                <td className="px-3 py-2.5 font-mono text-[#dcc1ae]/70 text-right">{it.tax_pct}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right font-semibold">{it.final_rate}</td>
                <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right font-semibold">{Number(it.amount).toLocaleString('en-IN')}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                  {!locked && <>
                    <button className="text-[#ffb87b] hover:text-[#ffc998] mr-2" title="Measurement sheet" onClick={() => setMeasuring(it)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>straighten</span></button>
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] mr-2" onClick={() => { setEditing(it); setShowForm(true) }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span></button>
                    <button className="text-red-400 hover:text-red-300" onClick={() => delItem(it.id)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
                  </>}
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={13} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No items yet — add your first line item.</td></tr>}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-white/10 bg-white/[0.02]">
                <td colSpan={11} className="px-3 py-3 text-right text-[12px] font-bold text-[#dcc1ae] uppercase tracking-wider">Total</td>
                <td className="px-3 py-3 font-mono text-[15px] text-[#e2e2e8] text-right font-bold">{Number(total).toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showForm && boq && (
        <ItemForm boqId={boq.id} editing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); if (id) loadItems(id) }} />
      )}
      {showImport && boq && <BoqImport boqId={boq.id} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); if (id) loadItems(id) }} />}
      {showOpening && boq && <OpeningProgress boqId={boq.id} projectId={boq.project_id} items={items} onClose={() => setShowOpening(false)} onDone={() => { setShowOpening(false); if (id) loadItems(id) }} />}
      {showRevisions && boq && <RevisionHistory boqId={boq.id} onClose={() => setShowRevisions(false)} />}
      {showReviseForm && boq && <ReviseForm currentVersion={boq.version} onClose={() => setShowReviseForm(false)} onConfirm={createRevision} />}
      {measuring && (
        <MeasurementSheet
          itemId={measuring.id}
          itemDesc={measuring.description}
          unit={measuring.unit}
          currentQty={measuring.quantity}
          canEdit={boq.status === 'Draft'}
          onClose={() => setMeasuring(null)}
          onApplied={() => { setMeasuring(null); if (id) loadItems(id) }}
        />
      )}
    </div>
  )
}

function ReviseForm({ currentVersion, onClose, onConfirm }: { currentVersion: number; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-md my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Create Revision v{currentVersion + 1}</h3>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5">
          <p className="text-[13px] text-[#dcc1ae] mb-3">This freezes the current version <span className="font-mono text-[#e2e2e8]">v{currentVersion}</span> into history, then unlocks a new <span className="font-mono text-[#e2e2e8]">v{currentVersion + 1}</span> (Draft) for editing. Nothing is deleted.</p>
          <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Change Reason *</span>
            <textarea className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this revision needed? (client variation, scope change…)" style={{ resize: 'vertical' }} />
          </label>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); await onConfirm(reason) }}>{busy ? 'Creating…' : 'Create Revision'}</button>
        </div>
      </div>
    </div>
  ), document.body)
}

type Rev = { id: string; version: number; change_reason: string | null; total_amount: number; created_by_name: string | null; created_at: string; items_snapshot: Item[] }
function RevisionHistory({ boqId, onClose }: { boqId: string; onClose: () => void }) {
  const [revs, setRevs] = useState<Rev[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boq_revisions').select('*').eq('boq_id', boqId).order('version', { ascending: false })
      setRevs((data as Rev[]) ?? []); setLoading(false)
    })()
  }, [boqId])
  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Revision History</h3>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {loading && <div className="text-[#dcc1ae] text-sm">Loading…</div>}
          {!loading && !revs.length && <div className="text-[#dcc1ae]/60 text-sm text-center py-6">No revisions yet. Each time you revise an approved BOQ, the prior version is frozen here.</div>}
          <div className="space-y-2">
            {revs.map(r => (
              <div key={r.id} className="rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="font-mono text-[13px] font-bold text-[#e2e2e8]">v{r.version}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[#e2e2e8] truncate">{r.change_reason || 'No reason given'}</div>
                    <div className="text-[10px] text-[#dcc1ae]/60">{r.created_by_name || 'Unknown'} · {new Date(r.created_at).toLocaleString('en-IN')} · {(r.items_snapshot?.length ?? 0)} items</div>
                  </div>
                  <span className="material-symbols-outlined text-[#dcc1ae]/50" style={{ fontSize: '18px' }}>{open === r.id ? 'expand_less' : 'expand_more'}</span>
                </button>
                {open === r.id && (
                  <div className="px-3 pb-3 overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead><tr className="text-[#dcc1ae]/60">
                        {['Description', 'Unit', 'Qty', 'Final Rate', 'Amount'].map(h => <th key={h} className="px-2 py-1 text-left font-semibold">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {(r.items_snapshot ?? []).map((it, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="px-2 py-1 text-[#e2e2e8]">{it.description}</td>
                            <td className="px-2 py-1 text-[#dcc1ae]">{it.unit || '—'}</td>
                            <td className="px-2 py-1 font-mono text-[#dcc1ae] text-right">{it.quantity}</td>
                            <td className="px-2 py-1 font-mono text-[#dcc1ae] text-right">{it.final_rate}</td>
                            <td className="px-2 py-1 font-mono text-[#e2e2e8] text-right">{Number(it.amount).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-right text-[12px] font-bold text-[#e2e2e8] mt-2">Total: ₹{Number(r.total_amount).toLocaleString('en-IN')}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ), document.body)
}

function OpeningProgress({ boqId, projectId, items, onClose, onDone }: { boqId: string; projectId: string | null; items: Item[]; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [remark, setRemark] = useState('Opening progress — work done before system start')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [phase, setPhase] = useState<'entry' | 'done'>('entry')
  const [count, setCount] = useState(0)

  const num = (v: string) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
  const filled = items.filter(i => num(qty[i.id]) > 0)

  async function createAndApprove() {
    if (!filled.length) { setErr('Enter a completed quantity for at least one item.'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { data: uinfo } = await supabase.auth.getUser()
    const uid = uinfo?.user?.id ?? null
    const nowIso = new Date().toISOString()
    // Create measurements already Approved (opening balance) so BOQ progress updates immediately via trigger.
    const payload = filled.map(i => ({
      org_id: prof?.org_id, project_id: projectId, boq_item_id: i.id,
      measurement_date: date, location: null, activity: 'Opening balance',
      nos: 1, length: num(qty[i.id]), width: 0, height: 0,
      measured_qty: round2(num(qty[i.id])), unit: i.unit,
      remarks: remark, status: 'Approved', approved_by: uid, approved_at: nowIso,
    }))
    for (let k = 0; k < payload.length; k += 100) {
      const chunk = payload.slice(k, k + 100)
      const { error } = await supabase.from('measurement_book').insert(chunk)
      if (error) { setErr('Failed: ' + error.message); setBusy(false); return }
    }
    setBusy(false); setCount(filled.length); setPhase('done')
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-3xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Opening Progress</h3>
            <p className="text-[11px] text-[#dcc1ae]/70 mt-0.5">Enter work already done before using the system. Recorded as approved opening measurements — updates BOQ progress instantly.</p>
          </div>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>

        {phase === 'done' ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '40px' }}>check_circle</span>
            <p className="text-[#e2e2e8] font-semibold mt-2">{count} item(s) updated with opening progress.</p>
            <p className="text-[13px] text-[#dcc1ae] mt-1">BOQ completed/remaining now reflects this. See the entries in Measurement Book (Approved · Opening balance).</p>
            <button className="btn btn-primary mt-4" onClick={onDone}>Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-white/5 flex flex-wrap items-end gap-3 flex-shrink-0">
              <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">As-of Date</span>
                <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></label>
              <label className="block flex-1 min-w-[220px]"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Remark</span>
                <input className="input w-full" value={remark} onChange={e => setRemark(e.target.value)} /></label>
              <div className="text-[12px] text-[#dcc1ae]"><span className="font-semibold text-[#e2e2e8]">{filled.length}</span> filled</div>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-[#282a2e] sticky top-0"><tr>
                  {['Item', 'Unit', 'Planned', 'Already Done'].map(h => <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map(it => (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-[#e2e2e8] max-w-[280px] truncate" title={it.description}>{it.description}</td>
                      <td className="px-3 py-2 text-[#dcc1ae]">{it.unit || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[#dcc1ae] text-right">{it.quantity}</td>
                      <td className="px-3 py-2">
                        <input className="input mono text-right" style={{ padding: '4px 8px', fontSize: '13px', width: 110 }} inputMode="decimal"
                          value={qty[it.id] ?? ''} onChange={e => setQty({ ...qty, [it.id]: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err && <div className="px-5 py-2 text-sm text-red-400 flex-shrink-0">{err}</div>}
            <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
              <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary flex-[2]" disabled={busy} onClick={createAndApprove}>{busy ? 'Saving…' : `Set Opening Progress for ${filled.length} item(s)`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body)
}

function BidAdjustment({ total }: { total: number }) {
  const [type, setType] = useState<BidType>('less')
  const [pctStr, setPctStr] = useState('')

  // validation
  const trimmed = pctStr.trim()
  const pct = trimmed === '' ? 0 : Number(trimmed)
  const invalid = trimmed !== '' && (!isFinite(pct) || pct < 0)
  const atPar = !invalid && pct === 0

  const rate = invalid ? null : quotedRate(total, type, pct)
  const diff = rate != null ? round2(rate - total) : 0

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>gavel</span>
        <span className="text-sm font-semibold text-[#e2e2e8]">Bid Adjustment</span>
        <span className="text-[11px] text-[#dcc1ae]/60">(tender quoted rate)</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="block">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Adjustment</span>
          <select className="input" value={type} onChange={e => setType(e.target.value as BidType)} style={{ minWidth: 130 }}>
            <option value="less">Less (−)</option>
            <option value="excess">Excess (+)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Percentage (%)</span>
          <input
            className="input mono"
            inputMode="decimal"
            value={pctStr}
            onChange={e => setPctStr(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0.00"
            style={{ width: 120 }}
          />
        </label>
        <div className="text-[12px] text-[#dcc1ae] pb-2">
          BOQ Total: <span className="font-mono text-[#e2e2e8]">{inr(total)}</span>
        </div>
      </div>

      {invalid && <div className="text-[13px] text-red-400 mb-3">Enter a valid non-negative percentage.</div>}

      {!invalid && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
          <div className="flex items-center gap-2 mb-2">
            {atPar
              ? <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">At Par (0%)</span>
              : <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase border ${type === 'less' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  {type === 'less' ? 'Less' : 'Excess'} {pct}%
                </span>}
            {!atPar && rate != null && (
              <span className={`text-[12px] font-mono ${type === 'less' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {type === 'less' ? '−' : '+'} {inr(Math.abs(diff))}
              </span>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <span className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wide">Quoted Rate (in figures)</span>
            <span className="font-mono text-[26px] font-bold text-[#e2e2e8]">{rate != null ? inr(rate) : '—'}</span>
          </div>
          {rate != null && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <span className="text-[11px] text-[#dcc1ae]/60 uppercase tracking-wide block mb-0.5">Quoted Rate (in words)</span>
              <span className="text-[13px] text-[#dcc1ae] italic">{amountInWords(rate)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function WorkTarget({ boq, totalValue, completedValue, onSaved }: { boq: Boq; totalValue: number; completedValue: number; onSaved: (startDate: string | null, monthlyTarget: number | null) => void }) {
  const [edit, setEdit] = useState(false)
  const [startDate, setStartDate] = useState(boq.start_date ?? '')
  const [monthlyTarget, setMonthlyTarget] = useState(boq.monthly_target != null ? String(boq.monthly_target) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const sd = startDate || null
    const mt = monthlyTarget ? Number(monthlyTarget) : null
    await supabase.from('boqs').update({ start_date: sd, monthly_target: mt }).eq('id', boq.id)
    setBusy(false); setEdit(false); onSaved(sd, mt)
  }

  const hasTarget = boq.monthly_target != null && boq.monthly_target > 0 && boq.start_date
  // Expected value by today = monthly_target × months elapsed (pro-rated by days)
  let expected = 0, monthsElapsed = 0
  if (hasTarget) {
    const start = new Date(boq.start_date as string)
    const now = new Date()
    const ms = now.getTime() - start.getTime()
    const days = Math.max(0, ms / (1000 * 60 * 60 * 24))
    monthsElapsed = days / 30.4375   // avg days per month
    expected = round2((boq.monthly_target as number) * monthsElapsed)
  }
  const expectedCapped = Math.min(expected, totalValue)
  const variance = round2(completedValue - expectedCapped)
  const onTrack = variance >= 0
  const pctOfTotal = totalValue ? round2(completedValue / totalValue * 100) : 0

  return (
    <div className="card p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-[#e2e2e8] flex items-center gap-2">
          <span className="material-symbols-outlined text-[#ffb87b]" style={{ fontSize: '18px' }}>speed</span> Work Pace Target
        </span>
        <button className="text-[11px] font-bold uppercase tracking-wider text-[#dcc1ae] hover:text-[#e2e2e8]" onClick={() => setEdit(v => !v)}>
          {edit ? 'Close' : (hasTarget ? 'Edit target' : 'Set target')}
        </button>
      </div>

      {edit && (
        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
          <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Start Date</span>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">Monthly Target (INR)</span>
            <input className="input mono" inputMode="numeric" value={monthlyTarget} onChange={e => setMonthlyTarget(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 10000000" style={{ width: 180 }} /></label>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Target'}</button>
        </div>
      )}

      {!hasTarget && !edit && (
        <div className="text-[13px] text-[#dcc1ae]">Set a start date and a monthly value target (e.g. ₹1 Cr/month) to track whether the project is on pace.</div>
      )}

      {hasTarget && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Monthly Target" value={inr(boq.monthly_target as number)} />
            <Stat label={`Expected by today (${monthsElapsed.toFixed(1)} mo)`} value={inr(expectedCapped)} />
            <Stat label="Completed (approved)" value={inr(completedValue)} accent="emerald" />
            <Stat label={onTrack ? 'Ahead by' : 'Behind by'} value={inr(Math.abs(variance))} accent={onTrack ? 'emerald' : 'red'} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden relative">
              <div className={`h-full ${onTrack ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pctOfTotal}%` }} />
              {totalValue > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: `${Math.min(100, totalValue ? expectedCapped / totalValue * 100 : 0)}%` }} title="Expected by today" />
              )}
            </div>
            <span className="font-mono text-[12px] text-[#dcc1ae] w-24 text-right">{pctOfTotal}% of {inr(totalValue)}</span>
          </div>
          <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold ${onTrack ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{onTrack ? 'trending_up' : 'trending_down'}</span>
            {onTrack ? 'On pace / ahead of target' : 'Behind target — need to catch up'}
          </div>
          <p className="text-[11px] text-[#dcc1ae]/50 mt-3">Completed value counts only approved measurements. The white line marks where you should be by today.</p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'red' }) {
  const c = accent === 'emerald' ? 'text-emerald-400' : accent === 'red' ? 'text-red-400' : 'text-[#e2e2e8]'
  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-mono text-[15px] font-bold ${c}`}>{value}</div>
    </div>
  )
}

function ItemForm({ boqId, editing, onClose, onSaved }: { boqId: string; editing: Item | null; onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState(editing?.category ?? '')
  const [pkg, setPkg] = useState(editing?.package ?? '')
  const [itemCode, setItemCode] = useState(editing?.item_code ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [unit, setUnit] = useState(editing?.unit ?? '')
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '')
  const [material, setMaterial] = useState(editing ? String(editing.material_rate) : '')
  const [labour, setLabour] = useState(editing ? String(editing.labour_rate) : '')
  const [equipment, setEquipment] = useState(editing ? String(editing.equipment_rate) : '')
  const [overhead, setOverhead] = useState(editing ? String(editing.overhead_pct) : '0')
  const [profit, setProfit] = useState(editing ? String(editing.profit_pct) : '0')
  const [tax, setTax] = useState(editing ? String(editing.tax_pct) : '0')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const inputs = {
    material_rate: +material || 0, labour_rate: +labour || 0, equipment_rate: +equipment || 0,
    overhead_pct: +overhead || 0, profit_pct: +profit || 0, tax_pct: +tax || 0,
  }
  const bd = breakdown(inputs)
  const finalRate = computeFinalRate(inputs)
  const amount = computeAmount(+quantity || 0, finalRate)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) { setErr('Description is required'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const payload = {
      category: category || null, package: pkg || null, item_code: itemCode || null,
      description, unit: unit || null, quantity: +quantity || 0,
      material_rate: inputs.material_rate, labour_rate: inputs.labour_rate, equipment_rate: inputs.equipment_rate,
      overhead_pct: inputs.overhead_pct, profit_pct: inputs.profit_pct, tax_pct: inputs.tax_pct,
      final_rate: finalRate, amount,
    }
    if (editing) {
      const { error } = await supabase.from('boq_items').update(payload).eq('id', editing.id)
      setBusy(false); if (error) { setErr(error.message); return }
    } else {
      const { error } = await supabase.from('boq_items').insert({ ...payload, org_id: prof?.org_id, boq_id: boqId })
      setBusy(false); if (error) { setErr(error.message); return }
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-2xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">{editing ? 'Edit Item' : 'Add Item'}</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <Lb label="Item Code"><input className="input mono" value={itemCode} onChange={e => setItemCode(e.target.value)} /></Lb>
            <Lb label="Category"><input className="input" value={category} onChange={e => setCategory(e.target.value)} placeholder="Earthwork" /></Lb>
            <Lb label="Package"><input className="input" value={pkg} onChange={e => setPkg(e.target.value)} /></Lb>
            <Lb label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder="cum, sqm, kg" /></Lb>
          </div>
          <Lb label="Description *"><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Excavation in ordinary soil…" /></Lb>

          <div className="mt-4 mb-2 text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Rate Build-up (per unit)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Lb label="Quantity"><input className="input mono" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Material Rate"><input className="input mono" inputMode="decimal" value={material} onChange={e => setMaterial(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Labour Rate"><input className="input mono" inputMode="decimal" value={labour} onChange={e => setLabour(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Equipment Rate"><input className="input mono" inputMode="decimal" value={equipment} onChange={e => setEquipment(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Overhead %"><input className="input mono" inputMode="decimal" value={overhead} onChange={e => setOverhead(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Profit %"><input className="input mono" inputMode="decimal" value={profit} onChange={e => setProfit(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Tax %"><input className="input mono" inputMode="decimal" value={tax} onChange={e => setTax(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
          </div>

          {/* Live breakdown */}
          <div className="mt-4 p-4 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 text-[12px]">
              <Row label="Direct (M+L+E)" value={inr(bd.base)} />
              <Row label={`Overhead (${inputs.overhead_pct}%)`} value={inr(bd.overhead)} />
              <Row label={`Profit (${inputs.profit_pct}%)`} value={inr(bd.profit)} />
              <Row label="Subtotal" value={inr(bd.subtotal)} />
              <Row label={`Tax (${inputs.tax_pct}%)`} value={inr(bd.tax)} />
              <Row label="Final Rate" value={inr(finalRate)} strong />
            </div>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[12px] text-[#dcc1ae]">Amount = {(+quantity || 0)} × {inr(finalRate)}</span>
              <span className="font-mono text-[18px] font-bold text-emerald-400">{inr(amount)}</span>
            </div>
          </div>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400 flex-shrink-0">{err}</div>}
        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Item'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#dcc1ae]/70">{label}</span>
      <span className={`font-mono ${strong ? 'text-[#e2e2e8] font-bold' : 'text-[#dcc1ae]'}`}>{value}</span>
    </div>
  )
}

function Lb({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}