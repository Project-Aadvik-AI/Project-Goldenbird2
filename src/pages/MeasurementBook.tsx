import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useProject } from '../lib/project'
import { useAuth } from '../lib/auth'
import { lineQty, round2, inr } from '../lib/boq'
import ExportButtons from '../components/ExportButtons'

type Boq = { id: string; name: string; boq_number: string | null; status: string }
type BoqItem = { id: string; description: string; unit: string | null; quantity: number; completed_qty: number; final_rate: number }
type MB = {
  id: string; boq_item_id: string; mb_number: string | null; location: string | null; activity: string | null
  measurement_date: string; nos: number; length: number; width: number; height: number
  measured_qty: number; unit: string | null; engineer: string | null; contractor: string | null
  status: string; remarks: string | null; approved_at: string | null; created_at: string
}

const STATUS_FLOW = ['Draft', 'Submitted', 'Verified', 'Approved', 'Rejected']
const STATUS_CLS: Record<string, string> = {
  Draft: 'bg-white/5 text-[#dcc1ae] border-white/10',
  Submitted: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Verified: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  Approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export default function MeasurementBook() {
  const { activeProject } = useProject()
  const { isAdmin, user } = useAuth()
  const [boqs, setBoqs] = useState<Boq[]>([])
  const [boqId, setBoqId] = useState('')
  const [items, setItems] = useState<BoqItem[]>([])
  const [entries, setEntries] = useState<MB[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('boqs').select('id,name,boq_number,status').order('created_at', { ascending: false })
      const list = (data as Boq[]) ?? []
      setBoqs(list)
      if (list.length && !boqId) setBoqId(list[0].id)
    })()
  }, [])

  async function loadForBoq(id: string) {
    if (!id) return
    setLoading(true)
    const { data: its } = await supabase.from('boq_items').select('id,description,unit,quantity,completed_qty,final_rate').eq('boq_id', id).order('sort_order')
    const itemList = (its as BoqItem[]) ?? []
    setItems(itemList)
    if (itemList.length) {
      const { data: mb } = await supabase.from('measurement_book').select('*')
        .in('boq_item_id', itemList.map(i => i.id)).order('measurement_date', { ascending: false })
      setEntries((mb as MB[]) ?? [])
    } else setEntries([])
    setLoading(false)
  }
  useEffect(() => { loadForBoq(boqId) }, [boqId])

  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])

  async function setStatus(mb: MB, status: string) {
    const patch: Record<string, unknown> = { status }
    if (status === 'Approved') { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString() }
    await supabase.from('measurement_book').update(patch).eq('id', mb.id)
    loadForBoq(boqId)   // completed_qty auto-updates via DB trigger; reload to reflect
  }
  async function del(id: string) {
    if (!confirm('Delete this measurement?')) return
    await supabase.from('measurement_book').delete().eq('id', id)
    loadForBoq(boqId)
  }

  const selectedBoq = boqs.find(b => b.id === boqId)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Measurement Book</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Certified site measurements · only <span className="text-emerald-400">Approved</span> entries update BOQ progress</p>
        </div>
        <div className="flex gap-2">
          <select className="input" value={boqId} onChange={e => setBoqId(e.target.value)} style={{ minWidth: 200 }}>
            {!boqs.length && <option value="">No BOQs yet</option>}
            {boqs.map(b => <option key={b.id} value={b.id}>{b.boq_number ? `${b.boq_number} · ` : ''}{b.name}</option>)}
          </select>
          {boqId && items.length > 0 && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New Measurement
            </button>
          )}
        </div>
      </div>

      {!boqs.length && <div className="card p-8 text-center text-[#dcc1ae]/60">Create a BOQ first (Procurement → BOQ), then record measurements against its items here.</div>}
      {boqId && !items.length && !loading && <div className="card p-8 text-center text-[#dcc1ae]/60">This BOQ has no items yet. Add items to it first.</div>}

      {/* Progress summary per item */}
      {items.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto mb-5">
          <div className="px-4 py-3 border-b border-white/5"><span className="text-sm font-semibold text-[#e2e2e8]">BOQ Progress (from approved measurements)</span></div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Item', 'Unit', 'Planned', 'Completed', 'Remaining', '% Done'].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {items.map(it => {
                const remaining = round2(Number(it.quantity) - Number(it.completed_qty))
                const pct = it.quantity ? Math.min(100, round2(Number(it.completed_qty) / Number(it.quantity) * 100)) : 0
                return (
                  <tr key={it.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-[#e2e2e8] max-w-[260px] truncate" title={it.description}>{it.description}</td>
                    <td className="px-4 py-2.5 text-[#dcc1ae]">{it.unit || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{it.quantity}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">{it.completed_qty}</td>
                    <td className="px-4 py-2.5 font-mono text-[#dcc1ae] text-right">{remaining}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden min-w-[60px]"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                        <span className="font-mono text-[11px] text-[#dcc1ae] w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Measurement entries */}
      {items.length > 0 && (
        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[#e2e2e8]">Measurements · {entries.length}</span>
            <ExportButtons
              filename={`measurement_book_${selectedBoq?.boq_number || selectedBoq?.name || 'boq'}`}
              title={`Measurement Book · ${selectedBoq?.name || ''}`}
              dateField="measurement_date"
              rows={entries}
              columns={[
                { header: 'Date', get: r => r.measurement_date },
                { header: 'Item', get: r => itemById[r.boq_item_id]?.description || '—' },
                { header: 'Location', get: r => r.location || '—' },
                { header: 'Activity', get: r => r.activity || '—' },
                { header: 'Nos', get: r => r.nos },
                { header: 'L', get: r => r.length },
                { header: 'W', get: r => r.width },
                { header: 'H', get: r => r.height },
                { header: 'Measured Qty', get: r => r.measured_qty },
                { header: 'Unit', get: r => r.unit || '—' },
                { header: 'Engineer', get: r => r.engineer || '—' },
                { header: 'Status', get: r => r.status },
              ]}
            />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]"><tr>
              {['Date', 'Item', 'Location', 'Nos×L×W×H', 'Qty', 'Engineer', 'Status', 'Actions'].map(h => <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.05]">
              {entries.map(mb => {
                const it = itemById[mb.boq_item_id]
                return (
                  <tr key={mb.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#dcc1ae]">{mb.measurement_date}</td>
                    <td className="px-3 py-2.5 text-[#e2e2e8] max-w-[180px] truncate" title={it?.description}>{it?.description || '—'}</td>
                    <td className="px-3 py-2.5 text-[#dcc1ae]">{mb.location || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#dcc1ae]">{mb.nos}×{mb.length || '–'}×{mb.width || '–'}×{mb.height || '–'}</td>
                    <td className="px-3 py-2.5 font-mono text-[#e2e2e8] text-right font-semibold">{mb.measured_qty}</td>
                    <td className="px-3 py-2.5 text-[#dcc1ae]">{mb.engineer || '—'}</td>
                    <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_CLS[mb.status]}`}>{mb.status}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <WorkflowActions mb={mb} isAdmin={isAdmin} onSet={setStatus} onDelete={del} />
                    </td>
                  </tr>
                )
              })}
              {!entries.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-[#dcc1ae]/60 text-sm">No measurements recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <MBForm items={items} projectId={activeProject?.id ?? null} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadForBoq(boqId) }} />
      )}
    </div>
  )
}

function WorkflowActions({ mb, isAdmin, onSet, onDelete }: { mb: MB; isAdmin: boolean; onSet: (mb: MB, s: string) => void; onDelete: (id: string) => void }) {
  // Draft -> Submitted (anyone). Submitted -> Verified -> Approved / Rejected (admin/engineer only).
  const btn = (label: string, s: string, cls: string) => (
    <button className={`text-[11px] font-bold uppercase hover:underline mr-2 ${cls}`} onClick={() => onSet(mb, s)}>{label}</button>
  )
  return (
    <div className="flex items-center">
      {mb.status === 'Draft' && btn('Submit', 'Submitted', 'text-blue-400')}
      {mb.status === 'Submitted' && isAdmin && btn('Verify', 'Verified', 'text-violet-400')}
      {mb.status === 'Verified' && isAdmin && btn('Approve', 'Approved', 'text-emerald-400')}
      {(mb.status === 'Submitted' || mb.status === 'Verified') && isAdmin && btn('Reject', 'Rejected', 'text-red-400')}
      {mb.status === 'Approved' && isAdmin && btn('Un-approve', 'Verified', 'text-amber-400')}
      {mb.status === 'Rejected' && btn('Reopen', 'Draft', 'text-[#dcc1ae]')}
      {(mb.status === 'Draft' || mb.status === 'Rejected') && (
        <button className="text-red-400 hover:text-red-300" onClick={() => onDelete(mb.id)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span></button>
      )}
    </div>
  )
}

function MBForm({ items, projectId, onClose, onSaved }: { items: BoqItem[]; projectId: string | null; onClose: () => void; onSaved: () => void }) {
  const [boqItemId, setBoqItemId] = useState(items[0]?.id ?? '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [activity, setActivity] = useState('')
  const [nos, setNos] = useState('1')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [engineer, setEngineer] = useState('')
  const [contractor, setContractor] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const item = items.find(i => i.id === boqItemId)
  const num = (v: string) => { const n = parseFloat(v); return isFinite(n) ? n : 0 }
  const qty = lineQty(num(nos), num(length), num(width), num(height))

  async function save() {
    if (!boqItemId) { setErr('Select a BOQ item'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('measurement_book').insert({
      org_id: prof?.org_id, project_id: projectId, boq_item_id: boqItemId,
      measurement_date: date, location: location || null, activity: activity || null,
      nos: num(nos) || 1, length: num(length), width: num(width), height: num(height),
      measured_qty: qty, unit: item?.unit ?? null, engineer: engineer || null,
      contractor: contractor || null, remarks: remarks || null, status: 'Draft',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-xl my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">New Measurement</h3>
          <button className="text-[#dcc1ae] hover:text-white" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="p-5 overflow-y-auto">
          <Lb label="BOQ Item *">
            <select className="input" value={boqItemId} onChange={e => setBoqItemId(e.target.value)}>
              {items.map(i => <option key={i.id} value={i.id}>{i.description}{i.unit ? ` (${i.unit})` : ''}</option>)}
            </select>
          </Lb>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Lb label="Date"><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></Lb>
            <Lb label="Location"><input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="Chainage / Grid" /></Lb>
            <Lb label="Activity"><input className="input" value={activity} onChange={e => setActivity(e.target.value)} placeholder="Excavation…" /></Lb>
            <Lb label="Engineer"><input className="input" value={engineer} onChange={e => setEngineer(e.target.value)} /></Lb>
          </div>
          <div className="mt-4 mb-2 text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider">Measurement (Nos × L × W × H)</div>
          <div className="grid grid-cols-4 gap-3">
            <Lb label="Nos"><input className="input mono" inputMode="decimal" value={nos} onChange={e => setNos(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Length"><input className="input mono" inputMode="decimal" value={length} onChange={e => setLength(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Width"><input className="input mono" inputMode="decimal" value={width} onChange={e => setWidth(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
            <Lb label="Height"><input className="input mono" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value.replace(/[^\d.]/g, ''))} /></Lb>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-between">
            <span className="text-[12px] text-[#dcc1ae]">Measured Quantity</span>
            <span className="font-mono text-[18px] font-bold text-emerald-400">{qty}{item?.unit ? ` ${item.unit}` : ''}</span>
          </div>
          <div className="mt-3"><Lb label="Contractor"><input className="input" value={contractor} onChange={e => setContractor(e.target.value)} /></Lb></div>
          <div className="mt-3"><Lb label="Remarks"><input className="input" value={remarks} onChange={e => setRemarks(e.target.value)} /></Lb></div>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400 flex-shrink-0">{err}</div>}
        <div className="p-5 pt-3 flex gap-3 border-t border-white/5 flex-shrink-0">
          <button className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save as Draft'}</button>
        </div>
      </div>
    </div>
  ), document.body)
}

function Lb({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>{children}</label>
}