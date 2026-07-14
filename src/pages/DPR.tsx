import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import ExportButtons from '../components/ExportButtons'
import { supabase } from '../lib/supabase'
import { useProject, NoProjectPrompt } from '../lib/project'
import { useAuth } from '../lib/auth'
import { uploadPrivate, makeObjectPath } from '../lib/storage'

type DprRow = {
  id: string; date: string; schedule: string; item: string; unit: string
  today_qty: number; cumulative_qty: number | null; boq_qty: number | null; remark: string | null
}
type BoqItem = { id: string; schedule: string; item: string; unit: string; boq_qty: number | null; code: string | null }

// Pull imported enterprise BOQ items for this project's BOQs, shaped for the DPR picker.
async function loadBoqItems(projectId: string): Promise<BoqItem[]> {
  const { data: boqs } = await supabase.from('boqs').select('id').eq('project_id', projectId)
  const ids = (boqs ?? []).map((b: { id: string }) => b.id)
  if (!ids.length) return []
  const { data: items } = await supabase.from('boq_items')
    .select('id, item_code, category, description, unit, quantity').in('boq_id', ids).order('sort_order')
  return ((items ?? []) as { item_code: string | null; category: string | null; description: string; unit: string | null; quantity: number }[])
    .map((it: any) => ({
      id: it.id,
      schedule: it.category || '',
      item: it.description,
      unit: it.unit || '',
      boq_qty: it.quantity ?? null,
      code: it.item_code,
    }))
}

export default function DPR() {
  const { activeProject } = useProject()

  // always holds the CURRENT project. A response for any other project
  // is stale and must be discarded.
  const _pRef = useRef<string | null>(activeProject?.id ?? null)
  _pRef.current = activeProject?.id ?? null

  const { can } = useAuth()
  const [dprRows, setDprRows] = useState<DprRow[]>([])
  const [boq, setBoq] = useState<BoqItem[]>([])
  const [mbMsg, setMbMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function sendToMB(r: DprRow) {
    setMbMsg(null)
    const match = boq.find(b => b.item.trim().toLowerCase() === r.item.trim().toLowerCase())
    if (!match) { setMbMsg(`Couldn't match "${r.item}" to a BOQ item. Open Measurement Book and add it manually.`); return }
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('measurement_book').insert({
      org_id: prof?.org_id, project_id: activeProject?.id ?? null, boq_item_id: match.id,
      measurement_date: r.date, location: r.schedule || null, activity: 'From DPR',
      nos: 1, length: Number(r.today_qty) || 0, width: 0, height: 0,
      measured_qty: Number(r.today_qty) || 0, unit: r.unit || match.unit || null,
      remarks: r.remark || 'Created from DPR entry', status: 'Draft',
    })
    if (error) { setMbMsg('Failed: ' + error.message); return }
    setMbMsg(`✓ Draft measurement created for "${r.item}" (${r.today_qty}). Go to Measurement Book to Submit → Verify → Approve.`)
  }

  async function load() {
    const _p = activeProject?.id ?? null
    if (!activeProject) { setDprRows([]); setBoq([]); setLoading(false); return }
    setLoading(true)
    const [{ data: dpr }, boqData] = await Promise.all([
      supabase.from('dpr').select('*').eq('project_id', activeProject.id).order('date', { ascending: false }).limit(300),
      loadBoqItems(activeProject.id),
    ])

    // ---- THE GUARD ----
    // Did the user switch project while we were waiting? If so, this
    // response is for a project they have left. Throw it away — otherwise
    // a slow response overwrites the new project's data, and the screen
    // looks perfectly correct while showing the wrong thing.
    if (_pRef.current !== _p) return

    setDprRows((dpr as DprRow[]) ?? [])
    setBoq((boqData as BoqItem[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [activeProject?.id])

  if (!activeProject) return <NoProjectPrompt />

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-[#e2e2e8]">Daily Progress (DPR)</h1>
          <p className="text-sm text-[#dcc1ae] mt-0.5">Daily BOQ progress against the schedule</p>
        </div>
        {can('dpr', 'add') && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
            Add Entry
          </button>
        )}
      </div>

        <div className="card overflow-hidden overflow-x-auto">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[#e2e2e8]">Work Progress</span>
            <ExportButtons
              filename="dpr_progress"
              title="Daily Progress Report"
              dateField="date"
              rows={dprRows}
              columns={[
                { header: 'Date', get: r => r.date },
                { header: 'Schedule', get: r => r.schedule },
                { header: 'Item', get: r => r.item },
                { header: 'Unit', get: r => r.unit },
                { header: 'Today Qty', get: r => r.today_qty },
                { header: 'Cumulative Qty', get: r => (r.cumulative_qty ?? '—') },
                { header: 'BoQ Qty', get: r => (r.boq_qty ?? '—') },
                { header: '% Done', get: r => (r.boq_qty ? ((Number(r.cumulative_qty || 0) / Number(r.boq_qty)) * 100).toFixed(1) + '%' : '—') },
                { header: 'Remark', get: r => r.remark || '—' },
              ]}
            />
          </div>
          {mbMsg && (
            <div className={`mx-4 mt-3 mb-1 text-[12px] px-3 py-2 rounded-lg border ${mbMsg.startsWith('✓') ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' : 'text-amber-400 bg-amber-500/5 border-amber-500/10'}`}>{mbMsg}</div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-[#282a2e]">
              <tr>
                {['Date','Schedule','Item','Unit','Today Qty','Cumulative','BoQ Qty','% Done','Remark',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {dprRows.map(r => {
                const pct = r.boq_qty && r.cumulative_qty ? Math.round((r.cumulative_qty / r.boq_qty) * 100) : null
                return (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-[13px] text-[#dcc1ae] whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.schedule}</td>
                    <td className="px-4 py-3 font-semibold text-[#e2e2e8]">{r.item}</td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.unit}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#e2e2e8]">{Number(r.today_qty).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-mono text-[#e2e2e8]">{r.cumulative_qty != null ? Number(r.cumulative_qty).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#dcc1ae]">{r.boq_qty != null ? Number(r.boq_qty).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-4 py-3">
                      {pct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full min-w-[40px]">
                            <div className="h-full bg-[#ff8f00] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-[#ffb87b]">{pct}%</span>
                        </div>
                      ) : <span className="text-[#dcc1ae]/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#dcc1ae]">{r.remark || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => sendToMB(r)} title="Create a Measurement Book draft from this entry"
                        className="text-[11px] font-bold uppercase tracking-wider text-[#ffb87b] hover:underline">→ MB</button>
                    </td>
                  </tr>
                )
              })}
              {!dprRows.length && !loading && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-[#dcc1ae]/60 text-sm">No DPR entries yet.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="p-4 text-[#dcc1ae] text-sm">Loading…</div>}
        </div>

      {showForm && (
        <DprForm projectId={activeProject.id} boq={boq} dprRows={dprRows} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
    </div>
  )
}

function DprForm({ projectId, boq, dprRows, onClose, onSaved }: { projectId: string; boq: BoqItem[]; dprRows: DprRow[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [schedule, setSchedule] = useState('')
  const [item, setItem] = useState('')
  const [unit, setUnit] = useState('')
  const [boqQty, setBoqQty] = useState<number | null>(null)
  const [todayQty, setTodayQty] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  function pickItem(b: BoqItem) {
    setItem(b.item); setUnit(b.unit); setBoqQty(b.boq_qty); setSchedule(b.schedule)
    setPickerOpen(false)
  }

  const cumulative = dprRows
    .filter(r => r.item.toLowerCase() === item.toLowerCase())
    .reduce((s, r) => s + Number(r.today_qty), 0) + (todayQty ? Number(todayQty) : 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!item.trim()) { setErr('Enter item'); return }
    if (!todayQty || Number(todayQty) <= 0) { setErr('Enter today qty'); return }
    setBusy(true); setErr(null)
    const { data: prof } = await supabase.from('profiles').select('org_id').single()
    const { error } = await supabase.from('dpr').insert({
      org_id: prof?.org_id, project_id: projectId,
      date, schedule: schedule || null,
      item: item.trim(), unit: unit || null,
      today_qty: Number(todayQty), cumulative_qty: cumulative,
      boq_qty: boqQty, remark: remark || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const schedules = [...new Set(boq.map(b => b.schedule))].sort()

  return createPortal((
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-0 lg:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={save}
        className="bg-[#1B1F2A] border border-white/[0.08] rounded-t-2xl lg:rounded-2xl w-full max-w-lg shadow-[0px_10px_30px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-[#e2e2e8]">Add DPR Entry</h3>
          <button type="button" className="text-[#dcc1ae] hover:text-white" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <L label="Date"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></L>
            <L label="Schedule">
              <input className="input" value={schedule} onChange={e => setSchedule(e.target.value)} list="sched-list" />
              <datalist id="sched-list">{schedules.map(s => <option key={s} value={s} />)}</datalist>
            </L>
            <L label="Item" className="col-span-2">
              <button type="button" onClick={() => setPickerOpen(true)}
                className="input w-full text-left flex items-center justify-between"
                style={{ minHeight: '2.6rem' }}>
                <span className={item ? 'text-[#e2e2e8]' : 'text-[#dcc1ae]/50'}>{item || 'Search & pick a BOQ item…'}</span>
                <span className="material-symbols-outlined text-[#dcc1ae]/60" style={{ fontSize: '18px' }}>search</span>
              </button>
            </L>
            <L label="Unit"><input className="input" value={unit} onChange={e => setUnit(e.target.value)} /></L>
            <L label="BoQ Qty"><input className="input" style={{ fontFamily: 'var(--font-mono)' }} value={boqQty ?? ''} onChange={e => setBoqQty(e.target.value ? Number(e.target.value) : null)} inputMode="decimal" /></L>
            <L label="Today Qty">
              <input className="input" style={{ fontFamily: 'var(--font-mono)' }} inputMode="decimal" value={todayQty} onChange={e => setTodayQty(e.target.value)} />
            </L>
            <L label="Cumulative (auto)">
              <div className="input font-mono text-[#ffb87b]">{cumulative > 0 ? cumulative.toLocaleString('en-IN') : '—'}</div>
            </L>
          </div>
          <L label="Remark"><input className="input" value={remark} onChange={e => setRemark(e.target.value)} /></L>
        </div>
        {err && <div className="px-5 pb-2 text-sm text-red-400">{err}</div>}
        <div className="p-5 pt-2 flex gap-3">
          <button type="button" className="btn btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save Entry'}</button>
        </div>
      </form>
      {pickerOpen && <ItemPicker boq={boq} onPick={pickItem} onClose={() => setPickerOpen(false)} />}
    </div>
  ), document.body)
}

function ItemPicker({ boq, onPick, onClose }: { boq: BoqItem[]; onPick: (b: BoqItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = query
    ? boq.filter(b => `${b.code ?? ''} ${b.item} ${b.schedule} ${b.unit}`.toLowerCase().includes(query))
    : boq
  return createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-[#1B1F2A] border border-white/[0.08] rounded-2xl w-full max-w-lg my-auto shadow-[0px_10px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-white/5 flex-shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#dcc1ae]/50 pointer-events-none" style={{ fontSize: '18px' }}>search</span>
            <input autoFocus className="input w-full" style={{ paddingLeft: '2.4rem' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search item / code / schedule…" />
          </div>
        </div>
        <div className="overflow-y-auto p-3 space-y-2">
          {!boq.length && <div className="text-center text-[#dcc1ae]/60 text-sm py-8">No BOQ items yet. Import your BOQ Excel first (Procurement → BOQ → Import Excel).</div>}
          {boq.length > 0 && !list.length && <div className="text-center text-[#dcc1ae]/60 text-sm py-8">No items match "{q}".</div>}
          {list.map((b, i) => (
            <button key={i} type="button" onClick={() => onPick(b)}
              className="w-full text-left p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:border-[#ffb87b]/40 hover:bg-white/[0.05] transition-colors">
              <div className="text-[13px] text-[#e2e2e8] leading-snug">
                {b.code && <span className="font-mono font-semibold text-[#ffb87b] mr-1.5">{b.code}</span>}
                {b.item}
              </div>
              <div className="text-[11px] text-[#dcc1ae]/60 mt-1">
                {b.schedule && <span>{b.schedule} · </span>}{b.unit || '—'}{b.boq_qty != null && <span> · BOQ {Number(b.boq_qty).toLocaleString('en-IN')}</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-white/5 flex-shrink-0">
          <button type="button" className="btn btn-ghost w-full" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  ), document.body)
}

function L({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block mb-3 col-span-1 ${className}`}>
      <span className="text-[11px] font-bold text-[#dcc1ae] uppercase tracking-wider block mb-1">{label}</span>
      {children}
    </label>
  )
}