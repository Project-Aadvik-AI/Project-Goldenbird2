import { useEffect, useMemo, useState, useRef } from 'react'
import { appAlert, appConfirm, appPrompt } from '../lib/dialogs'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/project'
import ExportButtons from '../components/ExportButtons'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const q = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

type BoqItem = {
  id: string; description: string; item_code: string | null; category: string | null
  unit: string | null; quantity: number; completed_qty: number
}
type Item = { id: string; item_code: string | null; name: string; unit_id: string | null }
type Norm = {
  id: string; boq_item_id: string | null; boq_item_code: string | null
  item_id: string; qty_per_unit: number; wastage_pct: number; remarks: string | null
}
type Wastage = {
  boq_item_id: string; boq_description: string; boq_code: string | null
  boq_schedule: string | null; boq_unit: string | null; executed_qty: number
  material_name: string; material_unit: string | null
  qty_per_unit: number; wastage_pct: number
  norm_qty: number; allowed_qty: number
  actual_qty: number; actual_value: number
  variance_qty: number; variance_pct: number; variance_value: number
  status: string
}

const STATUS_STYLE: Record<string, string> = {
  'Within Norm': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Within Allowance': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'OVER-CONSUMED': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Not Issued': 'bg-white/5 text-[#dcc1ae]/60 border-white/10',
}

type Tab = 'wastage' | 'norms'

export default function MaterialNorms() {
  const { isAdmin } = useAuth()
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const [tab, setTab] = useState<Tab>('wastage')
  const [norms, setNorms] = useState<Norm[]>([])
  const [wastage, setWastage] = useState<Wastage[]>([])
  const [boqItems, setBoqItems] = useState<BoqItem[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [units, setUnits] = useState<{ id: string; code: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Norm | null>(null)

  async function load() {
    const _p = activeProject?.id ?? null
    setLoading(true)
    // BOQ items for the active project
    let boqIds: string[] = []
    if (activeProject) {
      const { data: bq } = await supabase.from('boqs').select('id').eq('project_id', activeProject.id)
      boqIds = ((bq as any[]) ?? []).map(b => b.id)
    }

    const [{ data: n }, { data: w }, { data: bi }, { data: i }, { data: u }] = await Promise.all([
      supabase.from('inv_material_norms').select('*'),
      supabase.from('inv_wastage_analysis').select('*').order('variance_value', { ascending: false }),
      boqIds.length
        ? supabase.from('boq_items').select('id, description, item_code, category, unit, quantity, completed_qty')
            .in('boq_id', boqIds).order('sort_order')
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('inv_items').select('id, item_code, name, unit_id').eq('active', true).order('name'),
      supabase.from('inv_units').select('id, code'),
    ])

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setNorms((n as Norm[]) ?? [])
    setWastage((w as Wastage[]) ?? [])
    setBoqItems((bi as BoqItem[]) ?? [])
    setItems((i as Item[]) ?? [])
    setUnits((u as any[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  const boqOf = (id: string | null) => (id ? boqItems.find(b => b.id === id)?.description : null) || '—'
  const itemOf = (id: string) => items.find(i => i.id === id)?.name || '—'
  const unitOf = (itemId: string) => {
    const it = items.find(i => i.id === itemId)
    return units.find(u => u.id === it?.unit_id)?.code ?? ''
  }

  const summary = useMemo(() => {
    const over = wastage.filter(w => w.status === 'OVER-CONSUMED')
    return {
      tracked: wastage.length,
      over: over.length,
      lostValue: r2(over.reduce((n, w) => n + Math.max(0, Number(w.variance_value || 0)), 0)),
      consumed: r2(wastage.reduce((n, w) => n + Number(w.actual_value || 0), 0)),
    }
  }, [wastage])

  async function del(id: string) {
    if (!await appConfirm('Delete this norm?')) return
    await supabase.from('inv_material_norms').delete().eq('id', id)
    load()
  }

  if (!isAdmin) return <div className="p-8 text-center text-[#dcc1ae]">Material norms are restricted to administrators.</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Material Consumption &amp; Wastage</h1>
        <p className="text-sm text-[#dcc1ae] mt-0.5">
          Set how much material a BOQ item <i>should</i> consume, then compare it against what was actually issued.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <K label="Tracked Combinations" value={String(summary.tracked)} />
        <K label="Material Consumed" value={inr(summary.consumed)} />
        <K label="Over-Consumed Items" value={String(summary.over)} tone={summary.over ? 'red' : 'emerald'} />
        <K label="Value Lost to Wastage" value={inr(summary.lostValue)} tone={summary.lostValue ? 'red' : 'emerald'} />
      </div>

      <div className="flex gap-1 mb-4">
        {([['wastage', 'Wastage Analysis'], ['norms', `Material Norms (${norms.length})`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border ${
              tab === k ? 'bg-[#ff8f00]/10 text-[#ffb87b] border-[#ff8f00]/30'
                        : 'text-[#dcc1ae] border-white/[0.08] hover:bg-white/[0.03]'}`}>
            {label}
          </button>
        ))}
        {tab === 'norms' && (
          <button className="btn btn-primary ml-auto" onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Norm
          </button>
        )}
      </div>

      {loading ? <div className="card p-8 text-center text-[#dcc1ae] text-sm">Loading…</div> : tab === 'wastage' ? (
        <>
          {!norms.length && (
            <div className="card p-4 mb-4 bg-amber-500/5 border-amber-500/15 text-[13px] text-amber-400">
              No material norms set yet. Add them on the <b>Material Norms</b> tab —
              e.g. "PCC 1:4:8 consumes 3.4 Bag of cement per Cum" — and wastage will be calculated automatically.
            </div>
          )}

          <div className="card overflow-hidden overflow-x-auto">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e2e2e8]">Theoretical vs Actual Consumption</span>
              <ExportButtons filename="wastage-analysis" title="Wastage Analysis" rows={wastage}
                columns={[
                  { header: 'Schedule', get: (r: any) => r.boq_schedule || '—' },
                  { header: 'BOQ Item', get: (r: any) => r.boq_description },
                  { header: 'Executed Qty', get: (r: any) => Number(r.executed_qty) },
                  { header: 'BOQ Unit', get: (r: any) => r.boq_unit || '—' },
                  { header: 'Material', get: (r: any) => r.material_name },
                  { header: 'Norm (per unit)', get: (r: any) => Number(r.qty_per_unit) },
                  { header: 'Allowed Wastage %', get: (r: any) => Number(r.wastage_pct) },
                  { header: 'Theoretical Qty', get: (r: any) => Number(r.norm_qty) },
                  { header: 'Allowed Qty', get: (r: any) => Number(r.allowed_qty) },
                  { header: 'Actual Issued', get: (r: any) => Number(r.actual_qty) },
                  { header: 'Variance Qty', get: (r: any) => Number(r.variance_qty) },
                  { header: 'Variance %', get: (r: any) => Number(r.variance_pct) },
                  { header: 'Variance Value', get: (r: any) => Number(r.variance_value) },
                  { header: 'Status', get: (r: any) => r.status },
                ]} />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#282a2e]"><tr>
                {['BOQ Item', 'Executed', 'Material', 'Norm', 'Theoretical', 'Allowed', 'Actual', 'Variance', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.05]">
                {wastage.map((w, i) => {
                  const over = w.status === 'OVER-CONSUMED'
                  return (
                    <tr key={i} className={`hover:bg-white/[0.02] ${over ? 'bg-red-500/[0.06]' : ''}`}>
                      <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[220px]">
                        <div className="truncate font-semibold" title={w.boq_description}>{w.boq_description}</div>
                        {w.boq_schedule && <div className="text-[10px] text-[#dcc1ae]/50 truncate">{w.boq_schedule}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right whitespace-nowrap">
                        {q(w.executed_qty)} {w.boq_unit}
                      </td>
                      <td className="px-3 py-2.5 text-[#e2e2e8]">{w.material_name}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae] text-right whitespace-nowrap">
                        {q(w.qty_per_unit)}/{w.boq_unit}
                        {Number(w.wastage_pct) > 0 && <span className="text-[#dcc1ae]/50"> +{w.wastage_pct}%</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{q(w.norm_qty)}</td>
                      <td className="px-3 py-2.5 font-mono text-[#dcc1ae] text-right">{q(w.allowed_qty)}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#e2e2e8] text-right">{q(w.actual_qty)} {w.material_unit}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold text-right whitespace-nowrap ${
                        Number(w.variance_qty) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {Number(w.variance_qty) > 0 ? '+' : ''}{q(w.variance_qty)}
                        <div className="text-[10px] font-normal">
                          {Number(w.variance_value) !== 0 && inr(Math.abs(Number(w.variance_value)))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border whitespace-nowrap ${STATUS_STYLE[w.status] || ''}`}>
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {!wastage.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                  Nothing to analyse yet. You need: (1) a material norm, (2) executed BOQ quantity, and (3) a Material Issue tagged to that BOQ item.
                </td></tr>}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-[#dcc1ae]/50 mt-3">
            <b>Theoretical</b> = executed BOQ qty × norm. <b>Allowed</b> = theoretical + permitted wastage %.
            Anything above that is over-consumption — the material you paid for but cannot account for.
          </p>
        </>
      ) : (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-[#e2e2e8]">Material Norms</span>
            <p className="text-[11px] text-[#dcc1ae]/60 mt-0.5">
              How much material one unit of a BOQ item should consume.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['BOQ Item', 'Material', 'Qty per Unit', 'Allowed Wastage', 'Remarks', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {norms.map(n => (
                <tr key={n.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[#e2e2e8] max-w-[260px]">
                    <div className="truncate">{n.boq_item_id ? boqOf(n.boq_item_id) : `Any BOQ item coded "${n.boq_item_code}"`}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[#e2e2e8] font-semibold">{itemOf(n.item_id)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#e2e2e8] text-right whitespace-nowrap">
                    {q(n.qty_per_unit)} {unitOf(n.item_id)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">
                    {Number(n.wastage_pct) ? `${n.wastage_pct}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[#dcc1ae]">{n.remarks || '—'}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button className="text-[#dcc1ae] hover:text-[#e2e2e8] text-[11px] font-semibold uppercase mr-3"
                      onClick={() => { setEditing(n); setShowForm(true) }}>Edit</button>
                    <button className="text-red-400 hover:text-red-300 text-[11px] font-semibold uppercase"
                      onClick={() => del(n.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!norms.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">
                No norms yet. Example: "PCC 1:4:8" consumes <b>3.4 Bag</b> of cement per <b>Cum</b>.
              </td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <NormForm editing={editing} boqItems={boqItems} items={items} units={units}
        onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

// =====================================================================
//  NORM FORM
// =====================================================================
function NormForm({ editing, boqItems, items, units, onClose, onSaved }: {
  editing: Norm | null
  boqItems: BoqItem[]; items: Item[]; units: { id: string; code: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const [boqItemId, setBoqItemId] = useState(editing?.boq_item_id ?? '')
  const [itemId, setItemId] = useState(editing?.item_id ?? '')
  const [qtyPer, setQtyPer] = useState(editing ? String(editing.qty_per_unit) : '')
  const [wastage, setWastage] = useState(editing ? String(editing.wastage_pct) : '0')
  const [remarks, setRemarks] = useState(editing?.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const boq = boqItems.find(b => b.id === boqItemId)
  const mat = items.find(i => i.id === itemId)
  const matUnit = units.find(u => u.id === mat?.unit_id)?.code ?? ''

  // live preview
  const executed = Number(boq?.completed_qty || 0)
  const norm = executed * (Number(qtyPer) || 0)
  const allowed = norm * (1 + (Number(wastage) || 0) / 100)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!boqItemId) { setErr('Select the BOQ item.'); return }
    if (!itemId) { setErr('Select the material.'); return }
    if (!qtyPer || Number(qtyPer) <= 0) { setErr('Enter how much material one unit consumes.'); return }

    setBusy(true); setErr(null)
    const payload: any = {
      boq_item_id: boqItemId, item_id: itemId,
      qty_per_unit: Number(qtyPer), wastage_pct: Number(wastage) || 0,
      remarks: remarks || null,
    }
    const { error } = editing
      ? await supabase.from('inv_material_norms').update(payload).eq('id', editing.id)
      : await supabase.from('inv_material_norms').insert(payload)
    setBusy(false)
    if (error) {
      setErr(error.message.includes('duplicate')
        ? 'A norm already exists for this BOQ item and material.'
        : error.message)
      return
    }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-lg p-5 shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[92vh]">
        <h3 className="font-headline text-lg font-semibold text-[#e2e2e8] mb-1">
          {editing ? 'Edit Material Norm' : 'New Material Norm'}
        </h3>
        <p className="text-[12px] text-[#dcc1ae] mb-4">
          How much of a material one unit of this BOQ item should consume.
        </p>

        <div className="space-y-4">
          <F label="BOQ Item *">
            <select className="input" value={boqItemId} onChange={e => setBoqItemId(e.target.value)}>
              <option value="">— Select BOQ item —</option>
              {boqItems.map(b => (
                <option key={b.id} value={b.id}>
                  {b.description.slice(0, 70)}{b.description.length > 70 ? '…' : ''} ({b.unit})
                </option>
              ))}
            </select>
            {!boqItems.length && (
              <p className="text-[11px] text-amber-400/80 mt-1">
                No BOQ items on this project. Select a project with a BOQ first.
              </p>
            )}
          </F>

          <F label="Material *">
            <select className="input" value={itemId} onChange={e => setItemId(e.target.value)}>
              <option value="">— Select material —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </F>

          <div className="grid grid-cols-2 gap-4">
            <F label={`Qty per ${boq?.unit ?? 'unit'} *`}>
              <div className="flex items-center gap-2">
                <input className="input mono text-right" inputMode="decimal" value={qtyPer}
                  onChange={e => setQtyPer(e.target.value.replace(/[^\d.]/g, ''))} placeholder="3.4" />
                <span className="text-[12px] text-[#dcc1ae] whitespace-nowrap">{matUnit}</span>
              </div>
            </F>
            <F label="Allowed Wastage (%)">
              <input className="input mono text-right" inputMode="decimal" value={wastage}
                onChange={e => setWastage(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2" />
            </F>
          </div>

          {boq && mat && Number(qtyPer) > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
              <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wide mb-2">Preview</div>
              <div className="text-[12px] text-[#dcc1ae] space-y-1">
                <div>1 {boq.unit} of this BOQ item consumes <b className="text-[#e2e2e8]">{q(Number(qtyPer))} {matUnit}</b> of {mat.name}</div>
                {executed > 0 ? (
                  <>
                    <div className="pt-2 border-t border-white/[0.06]">
                      Executed so far: <b className="text-[#e2e2e8]">{q(executed)} {boq.unit}</b>
                    </div>
                    <div>Theoretical requirement: <b className="text-[#e2e2e8]">{q(r2(norm))} {matUnit}</b></div>
                    {Number(wastage) > 0 && (
                      <div>Allowed with {wastage}% wastage: <b className="text-amber-400">{q(r2(allowed))} {matUnit}</b></div>
                    )}
                  </>
                ) : (
                  <div className="text-[#dcc1ae]/50 pt-1">No executed quantity yet — wastage will show once work is measured.</div>
                )}
              </div>
            </div>
          )}

          <F label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="As per IS 456 / standard mix design" /></F>
        </div>

        {err && <div className="text-sm text-red-400 mt-3">{err}</div>}
        <div className="flex gap-2 mt-5">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Norm'}</button>
        </div>
      </form>
    </div>
  ), document.body)
}

function K({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'emerald' }) {
  const c = tone === 'red' ? 'text-red-400' : tone === 'emerald' ? 'text-emerald-400' : 'text-[#e2e2e8]'
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[#dcc1ae]/60 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-[18px] font-bold ${c}`}>{value}</div>
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}